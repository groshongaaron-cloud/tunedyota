# Installer Console — "Smart Feed" Dashboard Redesign

Date: 2026-07-12
Surface: `site/installer.html` (frontend redesign) + a small `netlify/functions/installer-roster.js` addition.
Status: approved design, ready to build.

## Goal

Optimize how installers (Aaron/admin, Cody, Noah) see their **completed and open**
walk-ins and bookings. Today's console is month-locked, shows the same job in 2–3
buckets, splits walk-ins from their event, has no search/tally, and can land on an
empty screen. Replace the month browser with a time-ordered, event-centric **smart
feed** with a persistent tally + all-history search.

Data note: the roster already returns **every** non-cancelled booking for the
installer (all dates/statuses), so tally/search/history are computable client-side.
The only backend change is returning scheduled events that have no bookings yet.

## Backend change — `installer-roster.js`

Add an `events` array to the response: the installer's **scheduled events dated
today or later** (future calendar), so the feed can show upcoming days that have no
bookings yet and accept the first walk-in.

- Source events via the events lib (`getAllActiveEvents`/`fetchEvents` with baked
  `events-data.js` + optional `EVENTS_SHEET_ID`), matching what walk-in validation uses.
- Filter to the caller's markets: for each event `getMarket(city)` →
  `keyToInstaller(market.inst).key`; keep when it equals `key`, OR keep all when `admin`.
- Shape: `events: [{ city, dateISO, installer: ownerKey }]`, sorted by `dateISO` asc,
  `dateISO >= today` only.
- Response becomes `{ installer, admin, today, bookings, events }`.
- Tests: admin sees all markets' future events; a regular installer only their own;
  past events excluded.

## Frontend — `site/installer.html`

### State
`STATE = { today, bookings:[], events:[], admin, installerFilter, q:'',
showAllPast:false, eventOpen:{}, walkFormOpen:{} }`
(replaces `month` / `walkinOpen`; month nav removed).

- `visibleBookings()` / `visibleEvents()` apply the admin installer filter.
- `buildEvents()` merges visible event shells + grouped visible bookings into an
  event map keyed by `city|dateISO`: `{ key, city, dateISO, installer, bookings[],
  counts:{done,open,noshow,total} }`. `isOpen` = not Completed/No-show/Cancelled.

### Sections (relative to `today`)
- **NEEDS CLOSE-OUT** — `dateISO < today && hasOpen`. Auto-open, amber. Sort date desc.
- **TODAY** — `dateISO === today`. Auto-open.
- **UPCOMING** — `dateISO > today`. Sort date asc; nearest auto-open, rest closed.
- **RECENT** — `dateISO < today && !hasOpen && bookings.length`. Sort date desc,
  collapsed. Show first 5, then a "Show older events ▾" toggle (`showAllPast`).
- Empty past scheduled shells (no bookings, no open) appear nowhere.

Per-event expand state persists in `eventOpen[key]` (overrides section default once
toggled) so closing out one job never collapses the event being worked.

### Event card
- Summary: `City · <relative date>` + progress pill `N done · M open` (`· K no-show`).
- Body order: open jobs (full close-out card, unchanged) sorted by slot → no-shows →
  a muted **Done** group of completed (compact `✓ name · vehicle · calibration · VIN ·
  platform/type`). Walk-ins labeled `· walk-in` inline under their event.
- Actionable events (NEEDS/TODAY/UPCOMING) get a **"+ Add walk-in"** button → inline
  mini-form (name/vehicle/phone) scoped to that event's `city`+`dateISO`
  (`walkFormOpen[key]` keeps it open for the next add). Replaces the month-level
  walk-in form + event dropdown.

### Header (sticky)
- Installer name (+ admin filter select when `admin`).
- Tally: `This month  N done · M open · K no-show` · `Lifetime  T tunes ✓`.
- `Next: City · <date> (in N days)` from the soonest future event.
- Search box: filters ALL visible bookings by name/vehicle/vin/city/calibration/phone;
  non-empty query swaps the feed for grouped **"Search results (N)"** (all history,
  date desc, expanded) with a clear (×). Primary prior-month lookup.

### Relative date helper
`Today` / `Tomorrow` / `in N days` (≤7 future) / `Mon D` (same year) / `Mon D, YYYY`.

### Visual
Status colors: open = accent/actionable, done = muted green ✓, no-show = red.
Slim progress pill per event, section headers, sticky header, ≥44px touch targets.

## Unchanged
Close-out + certificate email, VIN scanner, no-show/waitlist, OTT commission fields,
the admin role/filter/labels, and auth. Write paths are untouched — this is a
presentation-layer redesign plus the additive roster `events` field.

## Verification
- `npm test` green (existing + new roster `events` tests).
- Browser-drive the live console with a real token: tally correct, search finds a past
  job, an event shows open+walk-in+completed together, expand state survives a
  close-out, per-event walk-in add works, admin filter narrows the feed.
