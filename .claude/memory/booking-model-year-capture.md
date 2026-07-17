---
name: booking-model-year-capture
description: "Exact model-year dropdown on the booking form — FULLY COMPLETE 2026-07-04 (code + Airtable Model Year columns + n8n WF1 Slack (YYYY), re-verified live 2026-07-16); nothing pending"
metadata: 
  node_type: memory
  type: project
  originSessionId: 5dc65e6b-44f7-4e23-afad-16cc858aa763
---

**Model-year capture SHIPPED & LIVE 2026-07-04 (master @ 29a5625, verified on prod).** The booking form (`/find-your-exact-tune`, step 5) now has a **Model year** `<select>` between "Your vehicle" and "Modifications". When the selected config spans a range it shows a **required, newest-first** dropdown; single-year / **"All years"** / unparseable ranges **hide** it (not required).

Implementation notes (the non-obvious bits):
- Parses the clean **`S.cfg.y`** range (e.g. "2016-2023", open-ended "2024+"→current year), NOT the `#fVeh` display string (which also appends goals text). Helpers: `parseYearRange()` + `populateModelYear()` (called in `prepBooking()`). Field ids: `#fYearGroup` (wrapper, `display:none` default) / `#fYear` (select). Validation in `#fSubmit.onclick` blocks submit when visible+unpicked.
- Value (`modelYear`) is wired through the WHOLE in-repo path: `/book` JSON payload + Netlify lead-fallback fields + hidden `tune-lead` form + mailto fallback; `book.js` writes **`Model Year`** to Bookings + Priority Airtable tables; `book-background.js` adds it to the n8n ping payload; `templates.js` shows it in booking installer + customer emails (row() self-omits when empty). 263 tests green (7 new across book/book-background/booking-ui/templates tests).
- **SAFE via `createTolerant`**: `"Model Year"` is in the drop-on-unknown-field lists in book.js, so writing it can NEVER break a booking before the Airtable column exists (same pattern VIN used).

**PIPELINE FULLY COMPLETE 2026-07-04 — both former external steps DONE:**
1. **Airtable** — owner added the `Model Year` field to the Bookings + Priority tables. book.js now stores it (tolerant write; column exists so it lands).
2. **n8n Cloud** — WF1 "TY — WF1 New Booking → Slack" (`ALeBJP3JlqNxC16T`) Slack message now appends ` (YYYY)` after the vehicle via a `patchNodeField` patch; owner-approved, verified live (execution 41 success, Slack `ok`). NOTE: WF1 has NO Airtable node — the record write is book.js's job, so there was nothing to "map to Airtable" in n8n. See [[n8n-integration-open-action]] (incl. the WF1 "IF email failed" validation false-positive — don't rewire).
3. **Certificate of Calibration** — wired 2026-07-04 (master @ ff05111). `buildCertificate` takes `modelYear` and renders `vehicle (YYYY)` in the Vehicle field + subject (omits parens when blank); `certificate-dispatch` threads `f["Model Year"]` from the booking record; canonical [[tuned-yota-master-certificate]] template sample updated. Owner chose "append to vehicle line" over a separate field. 264 tests green; render verified. (Cert generates at installer close-out of a Completed booking, so it shows the year on the next real completion.)

**More email surfaces added 2026-07-04 (master @ b50e015):** the ` (YYYY)` convention now also appears in the **installer roster**, the **Post-Event Summary** (renamed from "Post-event rebook") + **Weekly rebook backlog** reports, and — fixing a gap — the **immediate close-out certificate** in `installer-closeout.js` (previously only the daily-backstop cert passed `modelYear`). See [[event-reminders-automation]].

**A SECOND HANDOFF ("Wire modelYear through the pipeline") arrived 2026-07-04 that overlaps this — steps 1/3/4 were already done, step 2 was N/A (its premise that the `ty-booking` n8n workflow has an Airtable "create record" node is WRONG — the Airtable write is book.js). Only its step 5 (certificate) was new work. If a similar handoff reappears, reconcile against this before executing.**

**"All years" limitation RESOLVED 2026-07-04 (master @ 826037b, owner-confirmed bounds).** The 5 former "All years" configs now have real production-year ranges, so the dropdown appears for them too: Tundra 4.0L V6 **2005-2009**, 4.7L V8 **2000-2009**, 4.6L V8 **2010-2019**; Sequoia 4.7L V8 **2001-2009**, 4.6L V8 **2010-2019**. Updated the funnel VEHICLES config + the Tundra/Sequoia SEO pages' spec grid + FAQ + FAQPage schema (verified live, 0 "All years" left on site). NOTE: `parseYearRange()` still hides the field for any unparseable `y` string (the code comment mentions "All years" as an example of that) — but no config uses it anymore. Also: `build:seo` re-stamps ALL sitemap lastmods to today + re-renders og-image.png even for unrelated content edits — revert that churn (`git checkout -- site/sitemap.xml site/og-image.png`) unless you actually changed SEO inputs.

Verified on prod with the **stub-fetch technique** (override `window.fetch` to capture the `/book` POST body + return a fake `booked` response) so NO real booking/email/Slack was created — see [[funnel-step5-layout-and-verification]] for how to drive the funnel. Deploy = push master (see [[funnel-roadmap-and-lead-setup]]).
