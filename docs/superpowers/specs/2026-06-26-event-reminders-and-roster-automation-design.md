# Event Reminders & Roster Automation — Design

**Date:** 2026-06-26
**Status:** Approved design, pending spec review

## Goal

Turn Tuned Yota's reporting into an event-driven automation system: a monthly
executive summary for the owner, time-based roster reminders for installers,
customer "where to go" notifications, and a post-event waitlist sweep — plus
two small content tweaks (a booking **Modifications** field, a certificate
**OTT Calibration** line) and a new **Green Bay** event.

## Scope — seven pieces, built and shipped in order

1. **Monthly executive summary → info@** (cadence change; remove the per-installer
   region reports shipped in `46515ca`).
2. **Installer event-roster reminders** at 30 / 15 / 10 / 2 days + morning-of.
3. **Auto-waitlist post-event sweep.**
4. **Customer event notifications** at 10 + 2 days (with venue address).
5. **Roster format** + new booking **Modifications** field.
6. **Certificate OTT Calibration** line.
7. **Add the Green Bay event.**

Pieces 2–4 share one new scheduler (below). Each piece is independently
testable and shippable.

## Architecture: one hourly, Central-gated scheduler

A single new scheduled function `netlify/functions/event-reminders.js`:

- **Cron:** hourly (`0 * * * *`, UTC — Netlify runs cron in UTC).
- **Gate:** acts only when the current time in `America/Chicago` is the **07:00**
  hour; otherwise it's a no-op. This is DST-safe (always 7 AM Central) and makes
  the function effectively **once-daily**. 7 AM Central is exactly **2 hours
  before** the 9 AM Central event start — so the morning-of run satisfies the
  "2 hours ahead of start time" requirement with no separate intraday trigger.
- **Planner / executor split:** a pure `planDispatch({ events, bookings, priority, nowCentral })`
  returns a list of actions (which emails, which sweeps); a thin executor sends
  them. The planner is unit-tested with no time or network.

For each **active** event, compute whole-days-until in Central time and dispatch:

| daysUntil | Action |
|---|---|
| 30, 15, 10, 2 | Installer roster email (that event's region installer) |
| 0 | Installer roster email (morning-of, 7 AM = 2 h before 9 AM start) |
| 10, 2 | Customer event-address notification (each active booking w/ email) |
| −1 | Post-event waitlist sweep |

**Idempotency:** integer-day matching means each offset fires on exactly one
calendar day, and the sweep runs only on day −1 — so no "already sent" flags are
needed, given the once-daily gate. The sweep additionally skips a booking whose
customer already has a matching priority record for that event date (defensive
against a same-day rerun).

**Rejected alternative:** five separate cron functions (or per-event "reminders
sent" Airtable flags). More moving parts, more state, no benefit over the
single gated function.

## Piece 1 — Monthly executive summary

- `netlify.toml`: `submissions-report` schedule `0 13 * * 1` (weekly Mon) →
  `0 13 1 * *` (1st of month, 13:00 UTC).
- `submissions-report.js`: **remove** the per-installer region-report loop added
  in `46515ca`. Keep only the full digest → `REPORT_TO` (info@). Rename the
  subject to **"Monthly Executive Summary"**.
- `tests/submissions-report.test.js`: revert to expecting a single send to
  info@ (drop the cody/region assertions).
- Rationale: detailed per-installer data now lives in the event-roster reminders
  (Piece 2); info@ gets the high-level monthly roll-up.

## Piece 2 — Installer event-roster reminders

- Recipient: the event region's installer (`markets.js` city → inst →
  `routing.js` email). **Installer only**, no owner cc (owner gets the monthly
  exec; rosters are operational).
- Content — per-event roster table, columns:
  **Time · Name · Vehicle · Phone · Email · Mods**
  - **Vehicle** = the stored `Vehicle` field (year + make + model + engine).
    The `Goals` blurbs (towing confidence, better shifting, redline, sharper
    daily response) are **omitted**.
  - **Mods** = the new `Modifications` field (Piece 5); blank for legacy rows.
  - **Time** = the booking `Slot`.
- Plus a **Priority waitlist** section for that city (name, contact, reason).
- New renderer `lib/roster-render.js` (`renderRosterEmailHtml(event, rosterRows, waitlistRows)`),
  unit-tested.
- Subject: `Tuned Yota — {City} Roster · {label} ({daysUntil}-day)` /
  `… (morning-of)`.

## Piece 3 — Auto-waitlist post-event sweep

- On `daysUntil === −1`, for the event's bookings where
  `Status !== "Completed"` (**all** non-completed, including `Cancelled` and
  `No-show`), create a priority record for that city:
  `{ City, Name, Phone, Email, Vehicle, Modifications, Installer,
     Reason: "Rebook — not completed", "Event Date": <original> }`.
- Reflected automatically in subsequent rosters / the monthly exec (priority
  table is the shared source).
- Defensive dedupe: skip if a priority record already exists for the same
  Email + Event Date + Reason.

## Piece 4 — Customer event notifications (10 + 2 days)

- For each **active** booking (exclude `Cancelled`) with an email, on
  `daysUntil ∈ {10, 2}`, send an event-update email:
  date, **9 AM Central** start, city/state, and the **venue address**, with
  "make sure you have the address" copy.
- New template `buildEventReminderCustomerEmail(booking, event, installer)`.
  `replyTo` = owner.
- Requires the per-event **address** field (below).

## Piece 5 — Modifications field + roster format

- `find-your-exact-tune.html`: add a **Modifications** text input to the final
  booking step ("Lift, tires, exhaust, intake, etc."), send `mods` in the
  booking POST.
- `book.js`: write `Modifications: d.mods || ""` on booking **and** priority
  records.
- **Owner action:** add the `Modifications` column to the Airtable **Bookings**
  and **Priority List** tables (a write to a missing field is dropped).

## Piece 6 — Certificate OTT Calibration line

- `certificate-dispatch.js`: pass `f["OTT Calibration"]` into `buildCertificate`.
- `lib/certificate.js`: render an **OTT Calibration: {value}** line (free text —
  light / mild / medium / spicy / SS or whatever the installer types).
- Delivery **unchanged** (cert email still goes to the installer, who finalizes
  and forwards to the customer). The installer types the value into the Airtable
  field before checking `Status = Completed`.
- `tests/certificate.test.js`: assert the calibration line renders.
- `OTT Calibration` field already exists in Airtable (added by owner).

## Piece 7 — Green Bay event

- Add Green Bay to `events-data.js` (date, label, address) and the client
  `MARKETS`/event map in `find-your-exact-tune.html`. `markets.js` already maps
  Green Bay → `noah`. Use the **schedule-event** skill so the multi-file sync +
  SEO regen are correct.
- **Owner action:** provide the Green Bay **date** and **venue address**.

## Per-event address field

- `events-data.js` entries gain an `address` string. `lib/events.js` /
  `getEventForCity` surface it on the event object so `book.js` and the new
  notification/roster code can read it.
- If a Google Sheet is wired (`EVENTS_SHEET_ID`), it needs an **Address** column
  too — owner note.

## Owner action items (Airtable / data — writes are dropped otherwise)

1. Add `Modifications` column to **Bookings** and **Priority List** tables.
2. Provide Green Bay **date** + **venue address**.
3. `OTT Calibration` field — already added. ✔

## Testing

- `planDispatch` — given events + bookings + priority + a fixed `nowCentral`,
  asserts the exact set of actions at each offset (30/15/10/2/0/−1), including
  the Central-time 7 AM gate.
- Roster render, customer-notification template, certificate calibration line.
- Sweep: non-completed → priority, dedupe, Cancelled included.
- Existing suites updated (submissions-report back to single send; certificate).

## Out of scope

- Flyer image/PDF attachments (address is text only).
- Per-installer cc on rosters.
- Changing certificate delivery to direct-to-client.
- Backfilling `Modifications` for historical bookings.
