---
name: event-reminders-automation
description: "Event reminder/roster automation system shipped 2026-06-26 — scheduled installer rosters, customer notifications, post-event waitlist sweep, monthly exec summary"
metadata: 
  node_type: memory
  type: project
  originSessionId: 600aba31-9063-4c1b-ad58-6765170e353e
---

Shipped LIVE to tunedyota.com on 2026-06-26 (master @ 7875253). A scheduled
event-automation layer. Spec: `docs/superpowers/specs/2026-06-26-event-reminders-and-roster-automation-design.md`; plan: `docs/superpowers/plans/2026-06-26-event-reminders-and-roster-automation.md`.

**What runs now:**
- `netlify/functions/event-reminders.js` — NEW, cron hourly (`0 * * * *`), but acts
  ONLY at 07:00 America/Chicago (DST-safe via `lib/central-time.js`; 7AM = 2h before
  the 9AM event start). Pure planner `lib/event-plan.js` → executor. Per active event:
  installer roster email at 30/15/10/2/0 days (`lib/roster-render.js`), customer
  address email at 10/2 days (`tpl.buildEventReminderCustomerEmail`, skips Cancelled/
  no-email), and a post-event sweep at −1 day that adds every non-Completed booking to
  the city's Priority List (Reason "Rebook — not completed", self-dedups).
- `submissions-report.js` — now a MONTHLY "Executive Summary" to info@ only
  (cron `0 13 1 * *`). The per-installer region reports from commit 46515ca were
  REMOVED (superseded by the rosters).
- Certificate now prints the installer-typed `OTT Calibration` field (light/mild/
  medium/spicy/SS); delivery still installer-mediated.
- Booking form has a `Modifications` text field (`#fMods` → payload `mods` → Airtable
  `Modifications`). `airtable.js` `createTolerant` retries a create without an optional
  field if Airtable 422s on a missing column, so bookings never break.

Green Bay, WI event ADDED 2026-06-27 (master @ 7a5d5c0): Sept 12, 2026, Noah,
live on the booking page. All event `address` fields are set to the placeholder
**"To Be Released"** (real venues not yet provided) — customer 10/2-day emails will
say "Address: To Be Released" until updated in `events-data.js`.

Airtable `Modifications` column — ADDED by owner 2026-06-27 in both Bookings and
Priority List (verified 200 via data API). Write path is live end-to-end.
NOTE: the booking `AIRTABLE_TOKEN` is data-only (no `schema.bases` scope) — adding
columns must be done in the Airtable UI or with a separate schema-scoped token +
`setup-airtable.mjs` (which now defines `Modifications`).

**Owner actions still pending (graceful — nothing breaks without them):**
1. Replace the "To Be Released" `address` values in `events-data.js` with real venue
   addresses as they're confirmed (Green Bay + the 8 existing events).
2. `OTT Calibration` field — already added by owner. ✔

See [[held-branches-ship-checklist]] and [[email-sending-infra]].
