---
name: testing-airtable-backed-emails
description: "How to test a roster/report email end-to-end when it renders live Airtable data — inject a transient test row, send, then delete. Used 2026-07-04 to confirm Model Year shows in the roster."
metadata: 
  node_type: memory
  type: reference
  originSessionId: 5dc65e6b-44f7-4e23-afad-16cc858aa763
---

The roster/report emails (installer roster, Post-Event Summary, weekly rebook backlog) render **live Airtable data**, so to confirm a NEW field renders you need a real record that has it set. When the field is brand-new, no real record has it yet → inject a **transient test row**, send, then delete. Clean recipe (used 2026-07-04 to verify the `Model Year` `(YYYY)` in the Duluth roster):

**1. Check first (read-only)** whether any real record already has the field — if so, just send and skip the injection:
```
TOKEN=$(netlify env:get AIRTABLE_TOKEN 2>/dev/null)   # capture into a var; NEVER echo it
curl -s -H "Authorization: Bearer $TOKEN" \
 "https://api.airtable.com/v0/appMYG0QlSZTCYxUU/Bookings?filterByFormula=NOT(%7BModel%20Year%7D%3D%22%22)&maxRecords=5"
```
Base = `appMYG0QlSZTCYxUU`; tables = `Bookings` / `Priority List`.

**2. Inject a transient test row via the RAW Airtable API** (POST) — NOT through book.js. Raw insert bypasses the whole cascade (no book-background → no Slack/n8n ping, no customer/installer emails). Match the roster filter: `City` (proper-case, e.g. "Duluth") + `Event Date` = an existing event's `dateISO` (e.g. "2026-07-25"). **Leave `Slot` blank** so it can't collide with a real slot's availability. Use `typecast:true` and a clearly-labeled name ("ZZ … TEST — delete me").

**3. (optional) Prove content offline before sending** — fetch the city's bookings and call `renderRosterEmail(ev, bookings, [])` in a node one-liner; assert `m.html.includes("(2019)")`. Confirms the render without needing to read the delivered email.

**4. Send the real email** via the on-demand endpoint (goes to info@, the owner's own inbox — no external recipient):
```
SECRET=$(netlify env:get INTERNAL_TASK_SECRET 2>/dev/null)
curl -s -H "x-ty-task: $SECRET" "https://tunedyota.com/.netlify/functions/event-roster-run?city=duluth"
```
`event-roster-run` (see [[event-reminders-automation]]) needs the city to have an event in `events-data.js`/sheet, matches Bookings by City+Event Date, drops Cancelled. Returns "Roster sent ✓".

**5. DELETE the test row** (`curl -X DELETE .../Bookings/<recId>`) and verify it's gone. It's your own seconds-old artifact; deleting restores state so it doesn't pollute rosters/reports/counts. Same principle as the n8n test-execution delete.

Secret hygiene: `netlify env:get VAR` prints the value, so always `VAR=$(netlify env:get VAR 2>/dev/null)` into a shell var and use it only inside a header/`-H` — never `echo` it (keeps it out of the transcript). Related browser-side technique: stub `window.fetch` to test the booking form without a real booking — see [[funnel-step5-layout-and-verification]]. Field being tested here: [[booking-model-year-capture]].
