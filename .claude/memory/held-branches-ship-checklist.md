---
name: held-branches-ship-checklist
description: SHIPPED 2026-06-25 — the five formerly-held feature branches are merged to master and live on tunedyota.com
metadata: 
  node_type: memory
  type: project
  originSessionId: 6f31c7da-21ad-4338-9fbf-fb7a07ce1803
---

**SHIPPED 2026-06-25.** All five formerly-held branches were merged to `master`, pushed, and deployed (Netlify deploy `5e6257c`, `ready`), then verified live. Local feature branches can be deleted. What went live:

- Homepage CTAs ("Book Event Time Slot NOW" + "Schedule my FREE OTT Update" → `?intent=update`) + funnel reframe/`Source=OTT Update`.
- Email-failure hardening (Slack alert + `Email Status=FAILED` flag + softened copy) + daily `email-health` canary.
- Weekly `submissions-report` digest (Slack + emailed `contacts.csv`).
- Daily `certificate-dispatch` (editable `certificate.html` to installer on Completed bookings).
- Funnel measurement (`track.js` beacons → `Funnel Events`, `aggregateFunnel`). (Event-date urgency shipped earlier the same day.)

**The Resend blocker (resolved):** the verified `send.tunedyota.events` domain lived in a *different* Resend account than the Netlify API key. Fixed via **Option B** — added + verified the domain in the key's own account (`groshong.aaron@gmail.com`); DNS records were already correct so it verified instantly. Live send now returns 200; a live end-to-end booking returned `emailFailed:false`. See [[email-sending-infra]].

**Owner setup — ALL COMPLETE & VERIFIED 2026-06-25:**
1. ~~`SLACK_WEBHOOK_URL`~~ ✅ set in Netlify, verified with a 200 test post.
2. ~~Airtable columns~~ ✅ `Email Status` (Bookings + Priority List), `Calibration Date` + `Certificate Sent` (Bookings) — all verified accepting writes. (Reminder still stands: add `Certificate Sent` BEFORE marking a booking `Completed` — it's there now.)
3. ~~`Funnel Events` table~~ ✅ created; one fix needed during setup (the `Step` field was created as a non-Number type → rejected writes; changed to Number/Integer). A live beacon then landed a clean row. Field names: `Session`, `Step` (Number), `Step Name`, `UTM Source/Medium/Campaign`.

**Everything is live, wired, and end-to-end verified.** Gotcha for future: a new Airtable table seeds 3 blank rows; and Number fields must be typed correctly or `createRecord` silently 422s (the writing function swallows it and returns 204).

**Fast-follow — DONE & SHIPPED 2026-06-25:** the weekly report now includes a month-to-date "Funnel" drop-off section (email table + Slack one-liner with biggest-drop callout), fed by `aggregateFunnel` over `Funnel Events`. It appears on the report's next run once there's MTD funnel traffic. See [[funnel-roadmap-and-lead-setup]].
