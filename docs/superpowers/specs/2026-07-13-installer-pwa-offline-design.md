# Installer Console PWA / Offline Hardening — Design Spec

**Date:** 2026-07-13 · **Status:** Approved for planning · **Owner:** Aaron Groshong
**Sub-project C4** of the installer-dashboard enhancement program ([[certificate-v2-dashboard-program]]).

---

## 1. Goal

Make the Installer Console (`/installer.html`) work through **thin or absent cell signal** at events: the app opens offline showing the day's cached roster, and close-outs **and** walk-ins entered offline are queued locally and auto-synced when signal returns — so a paying customer's tune is never lost to a dropped POST.

## 2. Why / context

Events have intermittent signal. The console loads fine at the start of the day but individual write POSTs (`installer-closeout`, `installer-walkin`) can fail mid-event, and a hard reload with no signal white-screens the app. **Close-outs are idempotent server-side** (the `Certificate Sent` gate + a keyed update to an existing record), so replaying them is safe. **Walk-ins are creations**, so their replay needs a client-supplied idempotency key to avoid duplicates.

## 3. Scope

**In:** a dedicated installer PWA manifest (installed app opens to the console); service-worker shell caching (stale-while-revalidate); a localStorage roster cache with an offline banner; a testable offline op-queue for close-outs + walk-ins with optimistic UI; enqueue-on-network-failure; flush on reconnect/load/manual + Background Sync where supported; walk-in dedupe via a `Client Key` column; a warn-before-losing-unsynced-work guard.

**Out:** offline editing of past/synced records; conflict resolution beyond last-write + idempotency (a queued op simply replays); caching the `/.netlify/functions/*` API responses other than the roster snapshot; queuing reads (VIN decode, certificate/signature views stay online-only — they're non-critical and non-destructive); a separate offline UI for admins beyond what the normal feed shows; push changes (the existing push path is untouched).

## 4. Architecture

Two subsystems, built in two phases under this one spec.

### Phase A — Offline availability (read path)

**A1. Dedicated installer manifest.** New `site/installer.webmanifest`: `name` "Tuned Yota Installer", `short_name` "TY Installer", `start_url` `/installer.html`, `scope` `/installer.html`, `display` `standalone`, `background_color`/`theme_color` matching the site, reusing the existing `/icon-192.png` + `/icon-512.png`. In `installer.html`, change the `<link rel="manifest">` to point at `/installer.webmanifest` (the public `site.webmanifest` stays as the site-wide manifest for every other page). So an installed console launches to the roster, not the homepage.

**A2. Service-worker shell cache.** Extend `site/sw.js` (keep the existing `push`/`notificationclick` handlers unchanged):
- A `CACHE_VERSION` constant (e.g. `"ty-console-v1"`) — bump it whenever the shell asset list changes.
- `install`: `caches.open(CACHE_VERSION)` then precache the shell: `["/installer.html", "/commission-tally.js", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"]`. `self.skipWaiting()`.
- `activate`: delete any cache whose key ≠ `CACHE_VERSION`; `self.clients.claim()`.
- `fetch`: only handle **same-origin GET**. **Never** touch `/.netlify/functions/*` (return without calling `respondWith` → default network). For the shell (navigation requests to `/installer.html` and the precached assets): **stale-while-revalidate** — respond from cache immediately if present, and in the background fetch + update the cache; if not cached, go to network and cache the result. All other requests: pass through to network.

**A3. Roster cache (localStorage).** `load()` becomes network-first with cache fallback:
- Try `fetch('/.netlify/functions/installer-roster')`. On success: parse, render, and write the JSON to `localStorage['ty_roster_cache']` (with a `savedAt` timestamp). Clear any offline banner.
- On **network failure** (fetch throws): read `ty_roster_cache`; if present, render it behind a persistent banner **"⚠ Offline — showing your last synced roster (saved <relative time>)."**; if absent, show the existing "Could not load roster" empty state.
- 401 handling is unchanged (drop token + reload).

### Phase B — Offline writes (the queue)

**B1. `site/offline-queue.js` (new, testable, dual browser/Node export like `site/commission-tally.js`).** A pure module holding the queue logic, no DOM/network:
- `loadQueue(storage)` / `saveQueue(storage, ops)` — read/write the `ty_pending_ops` array from an injected storage (localStorage in the browser; a fake in tests).
- `makeOp(type, body)` — returns `{ clientKey, type, body, ts }` with a client-generated `clientKey` (a UUID; use `crypto.randomUUID` when available, else a fallback).
- `shouldQueue(error, status)` — the rule: queue when it was a **network failure** (fetch threw / no `status`) or a `>=500`; do **NOT** queue a `4xx` (won't succeed on retry).
- `nextFlushResult(status)` — classify a replay response: `"remove"` (2xx), `"stop-auth"` (401), `"retry-later"` (network error / 5xx), `"drop"` (other 4xx — a poison op; remove it and surface, so it can't block the rest).
- No timers/DOM here — the console wires these to `fetch`, `localStorage`, and events.

**B2. Enqueue-on-failure (front-end, `installer.html`).**
- `closeout(id, extra)` and the walk-in submit wrap their `fetch` in try/catch. On a response, if `shouldQueue` says not to queue and it's an error, surface it (current behavior). If the fetch **throws** (offline) or `shouldQueue` is true: build an op (`makeOp('closeout'|'walkin', body)`), push to the queue, update `STATE` optimistically (a close-out marks the booking `Completed` + `pendingSync=true`; a walk-in inserts a synthetic booking card tagged `pendingSync`), show **"Saved — will sync when you're back online."**, and register a Background Sync if available.
- Walk-in ops include the op's `clientKey` in the POST body as `clientKey` (both on the first attempt and on replay), so the server can dedupe.

**B3. Walk-in dedupe (`netlify/functions/installer-walkin.js`).**
- Accept an optional `clientKey`. Before creating, if `clientKey` is present, query Bookings for an existing record with that `Client Key`; if found, return it (status `created`/`duplicate`, no second row).
- On create, write `clientKey` to the **`Client Key`** field via the existing **tolerant create** so an absent column is dropped (feature still works pre-setup, minus dedupe).
- Close-outs are unchanged — idempotent already.

**B4. Flush (`installer.html`).** `flushQueue()` replays ops oldest-first, one at a time:
- Re-POST to the matching endpoint with the stored body (walk-in includes `clientKey`).
- Map the outcome through `nextFlushResult`: `remove` → drop the op + clear that item's `pendingSync`; `drop` → remove + `fail(...)` a message; `stop-auth` → stop, keep the queue, drop token + prompt re-login; `retry-later` → stop the flush, leave the queue for the next trigger.
- After a flush that emptied (or changed) the queue, refresh the header badge; a subsequent `load()` replaces optimistic state with server truth.
- **Triggers:** `window.addEventListener('online', flushQueue)`; a call at the end of every successful `load()`; a manual header control; and, where supported, the Background Sync API — `registration.sync.register('ty-flush')` on enqueue, plus a `sync` handler in `sw.js` that notifies open clients to flush (the client does the authed replay, since the token lives in the page). iOS Safari lacks Background Sync, so the foreground triggers are the guaranteed path.

**B5. Safety UI.**
- Header shows **"⏳ N pending sync"** whenever the queue is non-empty; tapping it runs `flushQueue()`.
- Pending booking cards carry a small **"⏳ pending"** tag until synced.
- A `beforeunload` handler and an intercept on the **Log out** link **warn** when unsynced ops exist ("You have N unsynced close-outs/walk-ins — stay on this page until they sync"), so the queue is never silently discarded.

## 5. Data flow

Read: `load()` → network roster (cache to localStorage) OR, offline, cached roster + banner; the SW serves the shell from cache so the page opens with no signal. Write: submit → network OK (normal) OR network fail → `offline-queue` op + optimistic UI + "will sync"; on reconnect/load/manual/Background-Sync → `flushQueue` replays (walk-ins deduped by `Client Key`) → server truth on next `load()`.

## 6. Error handling / edge cases

- **iOS:** SW + Cache API supported in Safari; **Background Sync is not** → foreground flush (online/load/manual) is primary; Add-to-Home-Screen recommended for reliability. Document in the playbook.
- **Cache invalidation:** bump `CACHE_VERSION` on shell changes; `activate` clears old caches; deploy = push serves fresh `sw.js`, so browsers adopt the new SW.
- **Certificate timing:** an offline close-out's cert emails only when the queue flushes online — the close-out toast states this.
- **Token expiry mid-flush:** 401 → stop, keep queue, prompt re-login; flush resumes after re-auth.
- **Poison op:** a replay returning a non-401 4xx is removed and surfaced so it can't block the rest of the queue (queued ops are only ever network-deferred, so this is rare).
- **`Client Key` column absent (pre-setup):** walk-in create still works (tolerant drop); dedupe is inactive, so only the rare "server committed but ack dropped, then replayed" case could duplicate — resolved once the column is added.
- **Quota:** payloads are small (a signature data URL ~10 KB); a day's queue is far under the localStorage limit.

## 7. Testing

- **`site/offline-queue.js`:** `makeOp` shape + unique `clientKey`; `shouldQueue` (network error → true, 500 → true, 400/403 → false); `nextFlushResult` (200→remove, 401→stop-auth, network→retry-later, 404/400→drop); `loadQueue`/`saveQueue` round-trip through a fake storage.
- **`installer-walkin.js`:** with a `clientKey` matching an existing booking → returns it, no create; with a new `clientKey` → creates and writes `Client Key` (tolerant); without a `clientKey` → creates as today.
- **Front-end / SW (manual + live):** app opens offline from cache; roster banner on offline load; a close-out with the network off → "will sync" + pending badge; reconnect → auto-flush → booking synced + cert sent; a walk-in offline → queued, replay doesn't duplicate; logout warns with unsynced ops; installed app launches to the console.
- Full suite green before ship.

## 8. Owner inputs / rollout

1. Add Airtable **Bookings** column **`Client Key`** (Single line text) — walk-in dedupe. Close-outs need nothing.
- Rollout: build Phase A then B behind tests → owner adds the column → `ship` (touches `site/` + a function; `installer.html`/`sw.js`/manifest aren't indexed pages, so no `build:seo`, but `npm test` must pass) → verify live: install to Home Screen and confirm it opens to the console; toggle airplane mode and confirm the app opens with the cached roster; close out + log a walk-in offline, then reconnect and confirm both sync (and no duplicate walk-in). Until the `Client Key` column exists the queue still functions (dedupe inactive).
