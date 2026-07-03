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
  address email at **10/2/0 days** (`tpl.buildEventReminderCustomerEmail`, skips Cancelled/
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
live on the booking page (date confirmed correct 2026-06-29 — no change needed).

**Venue addresses — 7 of 9 now set.** First 3 @ d72eed1 (2026-06-29): Twin Cities
(620 Southcross Dr. W., Burnsville, MN), Cedar Rapids (Iowa Off-Road and Suspension,
2109 N Towne Ln NE, Cedar Rapids, IA 52402), Des Moines (Innovative AutoHous, 20 NW
54th Ave, Des Moines, IA 50313). Next 4 @ d351d11 (2026-06-29): Omaha (7337 L St.,
Omaha, NE 68127), Fargo (1666 1st Ave N., Fargo, ND 58102), Duluth (4165 Loberg Ave,
Hermantown, MN 55811), Madison (430 Commerce Dr., Madison, WI 53719). Remaining 2 still
**"To Be Released"**: Rapid City, **Green Bay**. Address surfaces ONLY in the installer
roster + customer 10/2-day address emails, not the public page/schema.

Airtable `Modifications` column — ADDED by owner 2026-06-27 in both Bookings and
Priority List (verified 200 via data API). Write path is live end-to-end.
NOTE: the booking `AIRTABLE_TOKEN` is data-only (no `schema.bases` scope) — adding
columns must be done in the Airtable UI or with a separate schema-scoped token +
`setup-airtable.mjs` (which now defines `Modifications`).

**Owner actions still pending (graceful — nothing breaks without them):**
1. Provide the remaining 2 venue addresses (Rapid City, Green Bay) to replace
   "To Be Released" in `events-data.js`. 7 of 9 done 2026-06-29.
2. `OTT Calibration` field — already added by owner. ✔
3. Airtable `Modifications` column — already added by owner. ✔ (see above)

**Event-ops enhancements — SHIPPED LIVE 2026-07-01 (master @ 2599302, deploy `ready`, smoke-tested).** Spec/plan: `docs/superpowers/{specs,plans}/2026-06-30-event-ops-enhancements.*`. Three features, TDD (189 tests green):
1. **Day-of (T-0) customer notice** — `CUSTOMER_OFFSETS` now `[10,2,0]`; `buildEventReminderCustomerEmail` daysUntil-0 variant ("your tune is today" + slot + address). Fires at the 7AM tick = 2h before the 9AM start.
2. **Rebook report** — new pure `lib/rebook-render.js` `renderRebookReport(records,{title})` (all + grouped by City + grouped by installer). Sent to info@ two ways: **T+1 per event** (hook in `event-reminders.js` after the sweep, "Post-event rebook — <date>") + **weekly Mondays** (new scheduled fn `rebook-report.js`, cron `0 13 * * 1`, all outstanding Priority rows where `!Notified`).
3. **Mobile staff intake form** — `site/intake.html` (LIVE at https://tunedyota.com/intake.html, `noindex`, NOT in sitemap/HEAD_PAGES) + `netlify/functions/intake.js`. Passcode-gated via **`INTAKE_SECRET`** (Netlify env, set 2026-07-01; value given to owner out-of-band, rotatable via `netlify env:set` + redeploy). Header `x-intake-secret`, fail-closed, exact match, no XSS (textContent). Two modes reusing book.js libs: **book** (event+slot → Bookings, Status Booked, no customer email) / **lead** (→ Priority List, Reason "No event scheduled"). Source recorded as `intake:<channel>` (text/phone/email/facebook/instagram/walk-in/other); city list synced to all 17 markets. Verified live: page 200, no-secret 401, wrong-input-with-secret 502 unknown-city (no junk record). **Follow-up shipped 2026-07-01 (master @ 5faa4bd, deploy ready):** (a) **General "Unassigned" bucket** — intake LEAD mode now accepts a "General / Unassigned (area TBD)" option (or any unknown city) and stores the lead with `City="Unassigned"` + blank Installer instead of erroring, so area-unknown leads aren't lost; `rebook-render` groups blank-installer rows under "Unassigned" (not the fallback). Book mode still requires a real market. (b) **`Source` column ADDED to the Priority List** (Airtable) via `setup-airtable.mjs` run with an owner-provided temp schema-scoped PAT (read from clipboard, base `appMYG0QlSZTCYxUU`, `--context production`) — the run ALSO added a missing `Requested Slot` singleSelect to Priority List. Source now persists for intake leads (was being dropped by createTolerant). setup-airtable.mjs schema updated to include Priority `Source`.

**Installer Event Console — SHIPPED LIVE 2026-07-01 (master @ d8c51d8, deploy ready, smoke-tested).** Spec/plan: `docs/superpowers/{specs,plans}/2026-07-01-installer-console.*`. A per-installer mobile console at **`/installer.html`** (`noindex`, not in sitemap): live scoped event roster + inline close-out. Each installer authenticates with their OWN passcode → scoped to only their bookings (server-side ownership check; another installer can't touch theirs). Env **`INSTALLER_TOKENS`** = JSON map `{aaron,noah,cody}` (Netlify, set 2026-07-01; passcodes given to owner out-of-band, rotatable via `netlify env:set`). Components: `lib/installer-auth.js` (`resolveInstaller`, fail-closed), `installer-roster.js` (`buildRoster` — live, filter `Installer=key & Status!=Cancelled`, drops past events, groups by event, sorts), `installer-closeout.js` (`processCloseout` — noshow → Status No-show; complete → require calibration ∈ CAL_OPTIONS, set Status Completed + OTT Calibration + Calibration Date, **email the cert IMMEDIATELY** via buildCertificate/sendEmail + set Certificate Sent; idempotent on Certificate Sent so a double-tap won't re-send; cert-send failure still leaves Completed + certSent:false → daily certificate-dispatch backstops). Added `getRecord` to `airtable.js`. 203 tests green; each piece reviewed (close-out got an opus security pass). Verified live: page 200, roster/closeout 401 without token, roster 200+scoped with a valid token. **Full E2E dry run passed 2026-07-01** (create booking → aaron roster shows it → cody blocked 403 → aaron close-out completed+certSent=true → Airtable Status/Calibration/Certificate-Sent persisted → cleanup). **GOTCHA found + fixed (master @ f46d866):** the live Airtable **`Installer` field is a `multipleSelects`**, so it reads back as an ARRAY `["aaron"]`, not the string `"aaron"`. `keyToInstaller(arr)` and Airtable `{Installer}="key"` formulas both string-coerce it (so book.js/event-reminders/certificate-dispatch/rebook-render all work), but a strict `===`/`!==` does NOT — the close-out ownership check `f.Installer !== key` wrongly 403'd the owner. Fix: normalize `const owner = Array.isArray(f.Installer)?f.Installer[0]:f.Installer` before comparing. Lesson: never strict-compare an Airtable single/multi-select field value — normalize first. This is the installer's day-of tool (roster + walk-in link to /intake.html + close-out → cert); un-completed bookings still roll into the rebook report.

**BUG FIXED 2026-07-03 (master @ d8e794f, deploy `ready`).** Symptom: session-start hook fired `⚠️ event-reminders had 2 failure(s): unknown-city:undefined · unknown-city:undefined` on the Fargo event morning (July 3). Root cause: **baked `events-data.js` is keyed by lowercase city but the event objects carry NO `city` field** — only sheet-parsed events (`parseEvents`) set `city`. With no `EVENTS_SHEET_ID` (or a failed sheet fetch), baked data is the source, so every `ev.city` was `undefined`. That broke BOTH `getMarket(undefined)` → `unknown-city:undefined` (roster/notify action skipped entirely) AND `planDispatch`'s `norm(b.City)===norm(ev.city)` filter → matched zero bookings. Net: whenever baked data was the source, installer rosters/customer notices/sweeps silently never fired. Tests never caught it because every fixture hand-added `city`. Fix: `fetchEvents` now backfills `city` from the map key when absent (single point, covers baked; sheet already has it). Regression tests at both `fetchEvents` (real baked data) and `runReminders` (Fargo baked, du=0) levels; 253 green. **NOTE: today's (July 3) Fargo morning-of roster + customer notices already missed at the 07:00 tick and won't auto-retry (hour!==7 off-hour gate) — mitigation is the Installer Event Console `/installer.html` where Aaron pulls the live Fargo roster himself.** Lesson: baked vs sheet event objects had divergent shapes; the shared shape is now guaranteed at the fetch boundary.

**On-demand roster endpoint — ADDED 2026-07-03 (master @ a0485e3, deploy `ready`).** `netlify/functions/event-roster-run.js`: token-gated HTTP fn (`INTERNAL_TASK_SECRET` via `x-ty-task` header, falls back to `?token=`) that builds any city's live roster from Airtable (city+date match, drops Cancelled) and emails it to info@ via `renderRosterEmail` — the escape hatch for (re)sending a roster OUTSIDE the once-daily 07:00 tick. Trigger: `curl -H "x-ty-task: $SECRET" "https://tunedyota.com/.netlify/functions/event-roster-run?city=fargo"`. **Used 2026-07-03 to send the missed Fargo roster** (returned 200 "3 booked, 0 waitlisted, emailed to info@"; sendEmail throws on non-2xx so 200 = Resend accepted, not swallowed). Also: both roster paths now render the market's **proper-case city + state** (baked events carry only the lowercase map key + no state, exposed by the city-backfill fix). 256 tests green.

See [[held-branches-ship-checklist]], [[email-sending-infra]], and [[tuned-yota-master-certificate]].
