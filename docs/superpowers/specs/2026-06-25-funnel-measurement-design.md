# Funnel Measurement (Funnel Spec C) — Design

**Date:** 2026-06-25
**Status:** Approved (owner sign-off 2026-06-25)

## Goal

Make in-funnel drop-off visible. Today the tune-finder fires Facebook Pixel
conversion events (`Schedule`, `Lead`) but nothing tracks the steps between, so
we can't see where people abandon (Make → Model → Config → Goals → Result →
Book). Spec C adds a **first-party, owner-owned** measurement pipeline: the client
beacons each step transition to a Netlify `track` function that records it in an
Airtable `Funnel Events` table, plus a pure, tested aggregator that turns those
rows into a drop-off funnel.

**Scope: capture-only.** Surfacing the funnel in the weekly submissions report is
a deliberate fast-follow (that report is on a held branch off the older master;
wiring it now would couple this work to it). This spec delivers the pipeline +
the aggregator so the data is captured immediately and analyzable.

## Privacy

Anonymous and first-party: a random session id (no PII, `sessionStorage`, no
cross-site cookie), step number/name, timestamp, and the marketing attribution
already captured in `ATTR`. No consent banner required.

## Capture (client — `site/find-your-exact-tune.html`)

- **Session id:** on load, `S.sid = sessionStorage["ty_sid"]` or a fresh random id
  (e.g. `"s_" + Math.random().toString(36).slice(2) + Date.now().toString(36)`),
  persisted to `sessionStorage`. Anonymous.
- **Step beacon:** a `track(step, name)` helper does
  `navigator.sendBeacon("/.netlify/functions/track", JSON.stringify(payload))`
  (fall back to a `fetch(..., {keepalive:true})` if `sendBeacon` is unavailable),
  wrapped in try/catch so it can never block or break the funnel.
- **Payload:** `{ sid, step, name, utm_source, utm_medium, utm_campaign }` —
  utm_* read from `ATTR`.
- **Wiring:** call `track(n, STEP_NAMES[n])` inside `go(n)` (the single transition
  chokepoint). `STEP_NAMES = ["make","model","config","goals","result","book"]`.
- **Terminal outcomes:** alongside the existing `fbq` calls, beacon
  `track(6,"booked")`, `track(6,"priority")`, or `track(6,"lead")` so the funnel
  has an end. (Step 6 = outcome; `name` distinguishes which.)

## `track` function (server — `netlify/functions/track.js`)

- Parse JSON body; ignore if missing `sid` or `step` is not a number, or if a
  honeypot field is set → return `204` (always 204, beacons ignore the response).
- Write one row to the `Funnel Events` table via `createRecord`:
  `{ Session, Step, "Step Name", "UTM Source", "UTM Medium", "UTM Campaign" }`.
- Every side effect try/caught; a store failure logs and still returns `204` so a
  user's session is never affected.
- `processTrack(body, deps)` is the pure-ish core (injectable `create`, `env`,
  `log`) for tests; `handler` wires real deps.

## Airtable table (owner prerequisite)

New **`Funnel Events`** table:

| Field | Type |
|---|---|
| Session | Single line text |
| Step | Number (integer) |
| Step Name | Single line text |
| UTM Source | Single line text |
| UTM Medium | Single line text |
| UTM Campaign | Single line text |
| Created Time | Created time (auto) |

(Default table name `Funnel Events`, overridable with `AIRTABLE_FUNNEL_TABLE`.)

## Aggregator (pure — `netlify/functions/lib/funnel.js`)

`aggregateFunnel(events)` where `events` are flat rows (`Session`, `Step`,
`Step Name`, createdTime). Returns an ordered funnel:

- For each step 0..6, **distinct `Session` count** that reached it (back-navigation
  dedups — a session counts once per step).
- `dropPct` from the previous step, and `overallPct` vs step 0.
- Shape: `{ steps: [{ step, name, sessions, dropPct, overallPct }], totalSessions }`.
- `STEP_LABELS` map for friendly names (make/model/config/goals/result/book/outcome).

Pure and fully unit-tested. WIRED into the monthly report same day (b5dd4b8:
submissions-report.js fetches month-to-date Funnel Events → `report.funnel`;
report-render.js shows the step table in the email + a biggest-drop Slack line).
Verified live 2026-07-16: Funnel Events table collecting (~5k rows all-time),
July MTD aggregation ran clean (1,098 sessions).

## Config / prerequisites

- **Airtable:** create the `Funnel Events` table (above). The track function
  degrades gracefully if it's missing (writes fail → logged, still 204) but no
  data is captured until it exists.
- **Netlify env:** `AIRTABLE_TOKEN`/`AIRTABLE_BASE_ID` (exist). Optional
  `AIRTABLE_FUNNEL_TABLE`.

## Testing (TDD, node:test)

- `tests/track.test.js` — `processTrack`: valid payload → `create` called with the
  mapped fields; missing `sid`/non-numeric `step`/honeypot → no write; a `create`
  throw is swallowed (no throw out of `processTrack`).
- `tests/funnel.test.js` — `aggregateFunnel`: distinct-session counts per step;
  back-navigation (same sid revisiting a step) counted once; drop-off percentages;
  empty input → zeros.
- `tests/booking-ui.test.js` — presence: the funnel HTML contains the `track(`
  beacon, `sendBeacon`, `ty_sid`, and `STEP_NAMES`.

## Out of scope (this spec)

- Report integration / drop-off dashboard (fast-follow on the report branch).
- Bot filtering beyond the honeypot (raw rows; filter at aggregation later).
- Time-on-step / scroll / heatmaps. Step-enter + outcome only.
