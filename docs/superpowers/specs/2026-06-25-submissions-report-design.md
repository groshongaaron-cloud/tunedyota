# Submissions Reporting Bundle — Design

**Date:** 2026-06-25
**Status:** Approved (owner sign-off 2026-06-25)
**Scope:** Build-unit 1 of 2. (Build-unit 2 = Certificate of Authenticity, separate spec.)

## Goal

A weekly, automated digest of website submissions that carves each event into its
own success section, rolls everything up into a month-to-date total of general
form submissions, tracks closed-loop outcomes (won/lost, by whom, when), and
emits a portable contacts export.

Delivered hands-off: a **condensed Slack summary** (works immediately) plus a
**full emailed report with a `contacts.csv` attachment** (activates once the
Resend `send.tunedyota.events` domain is verified — see [[email-sending-infra]]).

## Data sources

- **Airtable `Bookings`** — primary. Fields incl. City, Event Date, Slot, Name,
  Phone, Email, Vehicle, Goals, Installer, Status (`Booked`/`Completed`/
  `No-show`/`Cancelled`), Source, UTM *, plus record `createdTime` (metadata),
  plus **new `Calibration Date`** (see below).
- **Airtable `Priority List`** — waitlist. City, Name, contact, Vehicle, Installer,
  Reason (`No event scheduled`/`Event full`), Event Date, Requested Slot, Notified.
- **Netlify Forms `tune-lead`** — optional/secondary (currently empty; the funnel
  routes most submissions to Airtable). Included only when reachable; absence is
  not an error.

Read with a **paginated** Airtable list (current `listRecords` returns one page).

## Closed-loop model ("closed or not, by whom, when")

- **Outcome derives from `Status`:** `Completed` → **Won**, `No-show`/`Cancelled`
  → **Lost**, `Booked` → **Open**. No new status field.
- **By whom** = existing `Installer`.
- **When** = new Airtable field **`Calibration Date`** (date) on `Bookings`,
  set by owner/installer when marking `Completed`. Doubles as the Certificate's
  "Date Calibration Applied".
- Capture is **read-only** here: owner updates the row; the report reads it.
- **Owner prerequisite:** add a `Calibration Date` (date) column to `Bookings`
  (manual, like `Email Status`). Missing column/values degrade gracefully (the
  field simply reads blank; "when" shows `—`).

## Architecture

Fetch → compute (pure) → render (pure) → deliver. Pure core so it's fully
unit-testable without network.

| File | Responsibility |
|---|---|
| `netlify/functions/lib/report-metrics.js` *(new)* | Pure. `buildReport({ bookings, priority, leads, events, capacity, now })` → a structured metrics object (rollup, per-event, cross-cutting, closed roster, latent demand, action items). |
| `netlify/functions/lib/report-render.js` *(new)* | Pure. `renderSlack(report)`, `renderEmailHtml(report)`, `renderContactsCsv(report)`. |
| `netlify/functions/lib/airtable.js` | add `listAllRecords()` (follows `offset` pagination). |
| `netlify/functions/submissions-report.js` *(new, scheduled)* | Fetch Bookings+Priority (+leads if configured) → `buildReport` → render → `notifyOwner` (Slack) + `sendEmail` (HTML + `contacts.csv`). |
| `netlify.toml` | schedule `submissions-report` weekly (Mon 13:00 UTC). |

`reportTo` from `env.REPORT_TO` (default `info@tunedyota.com`). FROM reuses
`events@send.tunedyota.events`.

## Metrics (what `buildReport` computes)

**Period framing:** `now` drives "this week" (last 7 days by `createdTime`),
"prior week" (days 8–14), and "month-to-date". When `now.getDate() <= 7`, also
emit `priorMonthClose` (the just-ended month's final totals).

**1 · Month-to-date rollup (general form submissions):**
- Total submissions MTD = bookings + priority (+ leads); Δ vs prior week; Δ vs
  last month same day-of-month.
- Slots filled across all events (booked / total capacity).
- Won / Lost / Open counts; conversion = Won / (Won+Lost) ... and Booked→Completed
  rate; avg days `createdTime → Calibration Date`.

**2 · Per-event sections** (events from `events-data.js` that are upcoming OR
completed within the current month). For each `City + Event Date`:
- Capacity (12), **booked** (Status≠Cancelled), **fill rate**, open slots,
  **new bookings this week**.
- **Pace flag:** `full` (0 open) · `slow` (daysUntil ≤ 7 and fill < 50%) ·
  `on-track` (else, future) · `past` (date passed).
- Waitlist/overflow = Priority rows for that city (Event full).
- Post-event status: Completed / No-show / Cancelled, naming **installer** and
  **Calibration Date(s)**.
- Vehicle mix; top UTM source.

**3 · Cross-cutting:** by market, by installer, by vehicle (counts); attribution
(UTM source/medium/campaign tallies); **latent demand** = Priority `No event
scheduled` grouped by city (markets to schedule next).

**4 · Closed this period roster:** `Client · Installer · Calibration Date ·
Vehicle` for bookings marked Completed in-period.

**5 · Action items / flags:** slow-filling events; full events with waitlist
(add capacity?); **failed-email follow-ups** (`Email Status = FAILED`);
data-hygiene (Completed rows missing `Calibration Date`).

## Rendering

- **Slack (condensed):** header + MTD headline (totals/Δ, won/lost) + one line per
  event with an ASCII fill bar + top 3 action items + contacts count. Plain text,
  webhook-safe.
- **Email HTML (full):** every section as branded tables (reuse the email visual
  language from `templates.js`).
- **`contacts.csv`:** header `Created Date,Name,Phone,Email,City,State,Vehicle,
  Goals,Source,UTM Source,UTM Medium,UTM Campaign,Installer,Outcome,Calibration
  Date`; rows from Bookings + Priority (+ leads), **deduped by email then phone,
  newest `createdTime` wins**. CSV-escaped (quote fields containing comma/quote/newline).

## Delivery & failure behavior

- Slack summary always attempted first (independent of Resend).
- Email (HTML + base64 `contacts.csv` attachment) via `sendEmail`. If it throws
  (e.g. domain not yet verified), catch and append a line to the Slack message:
  `(full report email failed: <reason>)`. Never throw out of the handler.

## Config / prerequisites

- **Netlify env:** `SLACK_WEBHOOK_URL` (shared with hardening work), `RESEND_API_KEY`
  + `AIRTABLE_TOKEN`/`AIRTABLE_BASE_ID` (exist). Optional `REPORT_TO`.
- **Airtable:** add `Calibration Date` (date) to `Bookings`.

## Testing (TDD, node:test)

- `tests/report-metrics.test.js` — fixtures (bookings/priority/events/now) →
  assert MTD totals + deltas, per-event fill/pace, won/lost/conversion, closed
  roster, latent demand, action items, `priorMonthClose` when `now` early in month.
- `tests/report-render.test.js` — metrics → Slack contains headline + event bars +
  actions; email HTML contains each section heading; CSV header + escaping + dedup.
- `tests/airtable.test.js` — `listAllRecords` follows `offset` across pages.
- `tests/submissions-report.test.js` — injected deps (fake fetch, spy notify, spy
  send) → Slack called; email called with a `contacts.csv` attachment; email
  failure appends the Slack note and does not throw.

## Out of scope (this build-unit)

- Certificate of Authenticity (separate spec; will reuse `Calibration Date` and
  the closed-loop model).
- Automated close-capture / writing back to Airtable (read-only here).
- Charts/graphics (text + tables only).
