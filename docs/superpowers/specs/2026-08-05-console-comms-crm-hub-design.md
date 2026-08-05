# Console Communications & CRM Hub — Design

Date: 2026-08-05
Status: Approved (brainstormed with owner), pending implementation plan

## Overview

Upgrade the installer console from a single escalation-only Chats inbox into a
full **client communications & CRM hub**. Four pillars, built in phases, each
independently shippable, all reusing existing Airtable tables (Chat Sessions,
Priority List, Clients, Bookings) and the existing Customer 360 view — minimal
schema churn.

The trigger: Facebook DMs were invisible in the console (escalation-only filter),
and "completing" a chat closed it and made it vanish. The fix that surfaces live
FB/IG threads already shipped (commit f2ff6b8); this design builds the durable
UX on top of it.

## Goals

1. **One inbox, all channels** — Facebook, Instagram, SMS, web widget — with a
   focused per-source view and completed chats that stay reachable.
2. **Find any client by any field** — an iPhone-Contacts-style directory over the
   whole book of business, dropping into the existing Customer 360.
3. **Never drop a promise** — manual communication nudges ("reach out in 3 weeks",
   "a week before he's in town") that surface when due.
4. **Know the client** — a purchases & ownership history on the client card so
   installers personalize and build trust.

## Non-goals (YAGNI)

- No new messaging channels (email threading, WhatsApp) in this work.
- No server-side full-text search engine — client-side index is enough at shop scale.
- No automated purchase reconciliation/refunds — the manual log + existing
  bookings/payments are the sources.
- No changes to how outbound Meta delivery / the 24h window works.

## Existing pieces this builds on

- `netlify/functions/lib/chat-admin.js` — `listSessions` (escalated + live FB/IG,
  mine/unassigned), `installerReply`, `closeSession`.
- `netlify/functions/lib/chat-store.js` — session persistence; ids prefixed
  `fb:` / `ig:` / `sms:`, else web/`default`.
- `netlify/functions/customer-view.js` + console **Customer 360** — per-person
  timeline (bookings, leads, chats, calls), opened by tapping a name.
- `netlify/functions/lib/leads.js` — Priority List model with `Next Follow-up`,
  `Follow-up Message`, `Last Contact`; `setFollowup` / `followupSent` actions;
  `dueLeads`.
- `netlify/functions/lead-followups.js` — morning sweep that web-pushes each
  installer their due/overdue count, deep-linking `/installer.html#leads`.
- `netlify/functions/client-garage.js` — per-client vehicles (make/model/year),
  built so parts fitment can attach later.
- `netlify/functions/record-payment.js` — EPG payment records (SKU, item, amount,
  vehicle) → lead pipeline.
- `netlify/functions/lib/routing.js` — city → installer/market (territory).
- `site/installer.html` — console SPA: `renderChats`, `chatApi`, per-tab search.

---

## Pillar 1 — Unified multi-channel inbox

### Server (`chat-admin.js` / `listSessions`)

- **Channel tag.** Each returned session gains a derived `channel` field:
  `facebook` (`fb:`), `instagram` (`ig:`), `text` (`sms:`), else `web`. Derived
  from the Session ID prefix, falling back to `Page Context`. The UI stops
  guessing the badge from the id.
- **View param.** `op:list` accepts an optional `view`:
  - `open` (default) — escalated + live FB/IG threads, mine/unassigned, all
    sources. Feeds the primary list.
  - a specific channel (`facebook` / `instagram` / `text` / `web`) — open threads
    for that channel only (uncapped).
  - `completed` — `Status="closed"` threads (mine/unassigned), newest first,
    bounded to a recent window (e.g. last 60 days / 50 rows).
- The 10-item cap for the primary list is applied client-side (server returns
  newest-first; primary shows the top 10 open).

### Console (`renderChats`)

- **Primary** = top 10 open threads, newest first, mixed sources. Each row:
  channel badge (📘 📸 📱 💬), name/vehicle, relative time, `•esc` marker.
- **Source dropdown**: All / Facebook / Instagram / Text / Web / **Completed**.
  Selecting a channel re-queries with that `view`; Completed shows closed threads
  that are **reopenable** (a completed thread that gets a new inbound message
  re-mints a live session per existing meta-dm logic).
- Completing a chat still closes it; it now lands under **Completed**, not gone.

### Tests

- `listSessions` channel derivation for each prefix.
- `view=open` excludes closed; `view=completed` returns only closed; a channel
  view scopes to that prefix; all honor mine/unassigned scoping.

---

## Pillar 2 — CRM Contacts directory (iPhone-style)

### Server (new `netlify/functions/contacts.js`, installer-authed)

- Reads **Clients + Priority List (leads) + Bookings**; dedupes into one person
  by normalized **phone → email → name+vehicle** (normalization mirrors the
  lead-merge keys already in `leads.js`).
- Returns a lightweight **index** (one row per person), NOT full histories:
  `{ personKey, firstName, lastName, displayName, phone, email, vehicle,
     modelYear, city, territory, sources: {clientId?, leadIds[], bookingIds[]},
     lastActivity }`.
- `territory` derived from `city` via `routing.js` (the covering installer/market).
- Client-side strategy (chosen): the console loads this index **once** and does
  all search/sort/filter in the browser. No per-keystroke server calls.

### Console (new Contacts view)

- Alphabetized list (sort toggle: last name / first name).
- **Search** matches any field: name / phone / email / vehicle / city.
- **Filter chips**: territory (installer/market) and truck model.
- Tap a contact → existing **Customer 360** overlay (`customer-view.js`), which
  shows their full comms timeline + (Pillar 4) purchases.
- Reachable from the console header search icon / a Contacts entry point.

### Tests

- Dedup collapses the same person across Clients/Leads/Bookings by phone, then
  email, then name+vehicle.
- Territory derivation from city; unknown city → "Unassigned".
- Index row shape is lightweight (no transcripts/histories inlined).

---

## Pillar 3 — Communication nudges

### Data

- Reuses Priority List **`Next Follow-up`** (date) + **`Follow-up Message`**.
- Setting a nudge from a chat/contact **with no lead record** auto-creates one
  (harvest-style, mirroring `chat-harvest`) so the reminder has a home and shows
  in the existing due-leads sweep.

### Set UX (from a conversation AND a contact card / Customer 360)

- A "Set reminder" control offering:
  - Quick-picks: **in 1wk / 2wk / 1mo / 2mo**.
  - A date picker.
  - A **"remind me __ before [date]"** helper — the browser computes the reminder
    date = event date − lead time (covers "in town in 2 months, ping a week
    prior"). Only the computed reminder date + note are stored; the event date is
    written into the note for context.
- Writes through the existing `setFollowup` action, extended to be reachable from
  chat/contact context (not just the Leads tab).

### Surfacing

- A **"Reminders due"** section in the console (reuses `dueLeads` for today +
  overdue): shows the note + client + one-tap to open their conversation / message
  them.
- The existing morning `lead-followups` push already fires; deep-link it to the
  reminders surface.

### Tests

- Quick-pick and "before a date" date math (pure function, timezone-aware to
  America/Chicago like the rest of the console).
- setFollowup reachable from a chat/contact; auto-creates a lead when none exists;
  idempotent (no duplicate lead on repeat).
- Due/overdue grouping surfaces the note.

---

## Pillar 4 — Purchases & Ownership on the client card

### Approach (chosen): extend Customer 360 + a small manual log

Do **not** duplicate bookings/payments into a new ledger. Instead, the client
card's Customer 360 gains a **"Purchases & Ownership"** section that MERGES three
sources at read time:

1. **Tunes** — from **Bookings** (e.g. "OTT tune — 2022 Tacoma — May 2022",
   installer, cert link if present). Auto.
2. **Online purchases** — from **payment records** (`record-payment` data: SKU,
   item name, amount, vehicle). Auto; Magnuson today, Banks/AMSOIL as those go
   online.
3. **Manual purchases** — a new lightweight **`Purchases`** Airtable table for
   in-person items with no digital trail: AMSOIL Preferred Customer signup,
   Banks/Magnuson parts sold at the shop, etc.

### New `Purchases` table (manual entries only)

Fields: `Person Key` (or client/lead link), `Date`, `Category`
(`OTT Tune` | `AMSOIL` | `Banks` | `Magnuson` | `Other`), `Item` (free text —
e.g. "PedalMonster", "Signature Series 0W-20 ×2", "Preferred Customer
membership"), `Amount` (optional), `Vehicle` (optional), `Installer`, `Notes`.
An `AMSOIL PC` boolean-ish is expressed via Category=AMSOIL + Item="Preferred
Customer membership".

### Server

- Extend `customer-view.js` to also pull the person's payment records + `Purchases`
  rows and return a merged, date-sorted `purchases[]` alongside the existing 360
  data.
- New write path: `installer-add-purchase` (installer-authed) → appends a
  `Purchases` row. Small, mirrors `installer-client-note.js`.

### Console

- Customer 360 renders a **Purchases & Ownership** panel: chronological list with
  a category icon, item, vehicle, date, amount (if known), source badge
  (auto/manual).
- **"Add purchase"** control: category pick-list + item + date + optional
  amount/vehicle → `installer-add-purchase`.

### Tests

- `customer-view` merges bookings-tunes + payments + manual purchases, date-sorted,
  deduped where a payment and a manual entry describe the same sale (by txn/SKU +
  date).
- `installer-add-purchase` validates category, writes a row, is installer-authed.

---

## Data model summary

- **Reused unchanged:** Chat Sessions, Priority List (incl. `Next Follow-up`,
  `Follow-up Message`), Clients, Bookings, payment records, garage vehicles.
- **New:** `Purchases` table (manual in-person sales only).
- **New derived, not stored:** contacts index (Pillar 2), merged purchases list
  (Pillar 4) — both computed at read time.

## Phasing (implementation order)

- **Phase 1 — Unified inbox.** `listSessions` channel + view modes; dropdown +
  Completed UI. Ships the live pain fix (chats stop vanishing).
- **Phase 2 — Contacts directory.** `contacts.js` dedup/territory index; directory
  UI → Customer 360.
- **Phase 3 — Nudges.** setFollowup-from-chat/contact + quick-picks + "Reminders
  due" surface.
- **Phase 4 — Purchases & Ownership.** `Purchases` table; `customer-view`
  merge + `installer-add-purchase`; 360 panel + Add-purchase UI.

Each phase: TDD on server units (`node --test`, existing harness), then console
wiring, then ship per the `ship` skill (regenerate if SEO inputs touched — none
expected here — → `npm test` → push master → confirm Netlify `ready` → verify live).

## Testing strategy

- Server-side logic (list views/channel, contacts dedup/territory, nudge date math,
  purchases merge) is pure/deps-injected and unit-tested first, matching the
  existing `tests/*.test.js` patterns.
- Auth: every new endpoint (`contacts`, `installer-add-purchase`) fail-closed via
  `resolveInstaller`, with a 401-without-token test.
- No live Airtable in tests — inject `fetchImpl` / `loadFn` like current tests.

## Open questions / assumptions

- Territory = the installer/market covering the contact's city (via `routing.js`).
  Contacts with unknown/unroutable city group under "Unassigned".
- "Truck model" filter keys on the stored `Vehicle` string (model portion);
  good enough given the Toyota/Lexus catalog.
- Manual purchase amounts are optional and informational — not accounting.
