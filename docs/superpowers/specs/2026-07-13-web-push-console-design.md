# Web Push (Browser Console) — Design Spec

**Date:** 2026-07-13 · **Status:** Approved for planning · **Owner:** Aaron Groshong
**Sub-project C3** of the installer-dashboard enhancement program ([[certificate-v2-dashboard-program]]).

---

## 1. Goal

Deliver **web push notifications to installers' phone browsers today** (no native app), via the Push API + a service worker + VAPID. Installers enable notifications from the console, verify with a self-test, and receive pushes on four events: a new booking in their market, the day-of roster, a held certificate, and the monthly OTT-report-due reminder.

## 2. Why web push (not the existing FCM path)

The repo already has an **FCM** backend (`lib/push.js`, `push-register.js`, a `book-background` trigger) but it's **inert** — FCM delivers to the **native Capacitor app**, which isn't shipped, so no device tokens exist. Web push is a **separate, browser-native channel** that works on the live console now. It's built alongside (not replacing) the dormant FCM path. **iOS caveat (accepted):** iOS delivers web push only when the console is *Added to Home Screen* (installed PWA); Android Chrome works in-browser.

## 3. Scope

**In:** VAPID keys; a service worker; a `web-push`-based send lib; subscribe + self-test endpoints; the console enable/test UI; the roster exposing the VAPID public key; four non-blocking send triggers.

**Out:** replacing/removing the FCM path (left dormant); a notification-preferences UI (all-or-nothing per installer for v1); web push to customers (installers only); rich/actionable notifications beyond title/body/tap-to-open.

## 4. Components — the channel

### 4.1 Dependency + keys
- Add **`web-push`** to `package.json` (handles RFC 8291 payload encryption, RFC 8292 VAPID JWT, and 404/410 handling — not hand-rolled).
- **VAPID keypair** generated once (`web-push generate-vapid-keys`). Owner env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (secret), `VAPID_SUBJECT` (`mailto:info@tunedyota.com`).

### 4.2 `site/sw.js` (new service worker)
- `push` → `showNotification(data.title || "Tuned Yota", { body, data:{url}, icon:"/icon-192.png", badge:"/icon-192.png" })`.
- `notificationclick` → focus an existing console window matching `data.url` or `clients.openWindow(url)` (default `/installer.html`).

### 4.3 `netlify/functions/lib/webpush.js` (new, testable)
- `sendWebPush(installerKey, { title, body, url }, deps)` — lists that installer's subscriptions from the **"Web Push Subs"** Airtable table, sends each via `web-push.sendNotification(sub, JSON.stringify({title,body,url}))` with VAPID set from env; on a `404`/`410` (expired) **deletes** that subscription record (cleanup); counts `{ sent, failed }`; never throws (mirrors `lib/push.js` `sendPush`).
- Injectable deps: `env`, `fetchImpl`, `listSubs`, `del` (delete record), `send` (the web-push sender) — so tests need no network/library/Airtable.

### 4.4 `netlify/functions/push-subscribe.js` (new, auth)
- `resolveInstaller` → 401 if unresolved. Body `{ subscription }` (a `PushSubscription` JSON). Upsert into "Web Push Subs" (dedup by `Endpoint = subscription.endpoint`): store `Installer`, `Endpoint`, `Subscription` (full JSON string). `processSubscribe(body, deps)` pure core + thin handler.

### 4.5 `netlify/functions/push-test.js` (new, auth)
- `resolveInstaller` → 401. Calls `sendWebPush(key, { title:"Tuned Yota", body:"✅ Notifications are on.", url:"/installer.html" })`; returns `{ ok, sent }`. Lets each installer confirm delivery immediately.

### 4.6 `netlify/functions/installer-roster.js` (modify)
- Return top-level `vapidPublicKey: (env.VAPID_PUBLIC_KEY || "").trim()` so the console can subscribe and hide the feature when unconfigured.

### 4.7 `site/installer.html` (modify)
- Store `STATE.vapidPublicKey` from the roster. When present, show a **"🔔 Enable notifications"** header link. On tap (user gesture): `navigator.serviceWorker.register("/sw.js")` → `Notification.requestPermission()` → `reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey: <VAPID public, base64url→Uint8Array> })` → POST the subscription to `push-subscribe`. On success, swap the link to **"🔔 Notifications on · Send test"** (the test calls `push-test`). Include the base64url→Uint8Array helper. iOS hint text: *"On iPhone, add this page to your Home Screen first."* Feature hidden entirely when `vapidPublicKey` is empty or the browser lacks `PushManager`.

### 4.8 Airtable — new **"Web Push Subs"** table (owner)
- Columns: `Installer` (text), `Endpoint` (text — dedup key), `Subscription` (long text — the JSON).

## 5. Components — the four triggers

Each adds a single **non-blocking** `sendWebPush(installerKey, msg)` call at an existing point (a failure is logged, never blocks the host action — same discipline as the existing FCM `sendPush` in `book-background`):

| # | Event | Hook | Recipient | Message |
|---|-------|------|-----------|---------|
| 1 | New public booking | `book-background.js` (beside the existing FCM `sendPush`) | assigned installer | `New booking` / `<name> · <city> <date>` |
| 2 | Day-of roster | `event-reminders.js` (its 0-day bucket, per-event per-installer) | that event's installer | `Today: <city>` / `<N> bookings` |
| 3 | Certificate held (blank calibration) | `certificate-dispatch.js` (the `held` branch) | owning installer | `Certificate on hold` / `Set the OTT calibration for <name>` |
| 4 | Monthly report due | `ott-report-reminder.js` (5th-of-month job) | admin(s) (`INSTALLER_ADMINS`) | `OTT report due by the 7th` / `Submit <month>'s commission report` |

Triggers no-op safely when web push is unconfigured or the installer has no subscriptions (`sendWebPush` returns `{sent:0,failed:0}`).

## 6. Data flow

Install: enable → subscribe → sub stored in "Web Push Subs". Deliver: an event fires → the hook calls `sendWebPush(installerKey, msg)` → web-push encrypts + POSTs to each of that installer's push endpoints → the service worker shows the notification → tap opens the console.

## 7. Error handling

- No VAPID env / no subscriptions → every `sendWebPush` no-ops (`{sent:0,failed:0}`); triggers unaffected; the enable button hidden (no VAPID public key on the roster).
- Expired subscription (404/410) → deleted from Airtable so it isn't retried.
- Permission denied / unsupported browser → the enable flow surfaces a message; nothing else breaks.
- Send failure on one endpoint → counted, logged, other endpoints still attempted; the host action (booking, reminder, dispatch) is never blocked.

## 8. Testing

- **`lib/webpush.js`:** no subs → `{sent:0,failed:0}`, no send calls; sends one per sub with the right payload; a 410 result deletes that sub; a send failure is counted not thrown. Injected `listSubs`/`send`/`del`.
- **`push-subscribe.js`:** missing subscription → error; new endpoint → created (Installer/Endpoint/Subscription); existing endpoint → updated (no dup); 401 without token.
- **`push-test.js`:** 401 without token; with token → calls `sendWebPush` for the caller and returns `{ok, sent}`.
- **`installer-roster.js`:** exposes `vapidPublicKey` from env (set → value; unset → "").
- **Each trigger hook:** with an injected `push`, the host function calls it with the correct installer key + message on the right event, and a `push` throw doesn't break the host (non-blocking).
- **Console + SW:** subscribe flow + self-test verified in-browser / live (web push needs HTTPS + a real endpoint, so the **self-test button is the end-to-end check post-ship**).
- Full suite green before ship.

## 9. Owner inputs / rollout

1. `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` in Netlify env (keys generated during build; the private key is a secret — set via clipboard, never echoed to chat).
2. New Airtable **"Web Push Subs"** table (`Installer`, `Endpoint`, `Subscription`).
- Rollout: build behind tests → owner sets env + table → `ship` (this touches `site/` — run `build:seo` only if a page's SEO inputs changed; `sw.js`/`installer.html` aren't indexed, so likely not, but run `npm test` which guards SEO drift; confirm branch, push, verify) → on the live console (installed as a PWA on iPhone; in-browser on Android): tap **Enable notifications**, then **Send test** → confirm the notification arrives; then confirm a real booking fires push to the assigned installer.
