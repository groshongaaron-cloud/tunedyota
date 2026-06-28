---
name: funnel-roadmap-and-lead-setup
description: "Tune-finder funnel status — Spec A lead routing + event booking notifications are LIVE on tunedyota.com; Specs B/C not started; deploy = git push to master"
metadata: 
  node_type: memory
  type: project
  originSessionId: 41a611d5-b208-4534-a65d-38079658d120
---

The Tuned Yota funnel upgrade was decomposed into three specs (see `docs/superpowers/specs/` and `docs/superpowers/plans/`):

- **Spec A — Lead capture + territory routing: DONE and LIVE** (deployed 2026-06-18). Tune finder submits to the Netlify `tune-lead` form; `submission-created.js` routes each lead to the assigned installer by `installer_key` (CC info@, Aaron/info@ fallback) and auto-replies the customer via Resend.
- **Event booking system: LIVE** at `/find-your-exact-tune`. `book.js` handles booked + Priority Wait List paths, stores to Airtable, sends installer email (CC info@) + customer email (+ `.ics`). SMS/text confirmation was DROPPED (commit a981d88) — bookings are **email-only** now. (73/73 unit tests as of 2026-06-24.)
- **Spec B — event-date urgency: DONE & LIVE** (2026-06-25). `.tf-urgency` countdown on the slot step.
- **Spec C — funnel measurement: DONE & LIVE** (2026-06-25). Anonymous-sid step/outcome beacons → `track.js` → `Funnel Events` Airtable table; pure `aggregateFunnel`. Owner must create the `Funnel Events` table to capture. See [[held-branches-ship-checklist]].
- **Email notifications now actually deliver** (2026-06-25) — the Resend domain was finally verified in the key's account; before this, booking/lead emails silently 403'd. See [[email-sending-infra]].
- **Post-launch SEO pass — Track A (structured data/OG/sitemap/indexing): DONE and LIVE** 2026-06-18. See [[seo-generator]] and `docs/seo/gsc-checklist.md` (owner still needs to submit the sitemap + request indexing in Search Console — I can't push GSC buttons).
- **Post-launch SEO pass — Track B (design-skill polish): DONE and LIVE** 2026-06-18. Booking-flow conversion polish on `find-your-exact-tune`: social proof (4 verified reviews surfaced at result + booking steps, brand-matched), live "Only N spots left" scarcity on the slot grid, and booking-moment craft (selected-slot check, confirm-CTA glow, animated success). Frontend-only; `tests/booking-ui.test.js` guards review-text parity + CSS hooks. Spec/plan: `docs/superpowers/{specs,plans}/2026-06-18-booking-conversion-polish*.md`.

**Live production config (verified 2026-06-18 via Netlify API):** `RESEND_API_KEY` SET, `AIRTABLE_TOKEN`/`AIRTABLE_BASE_ID` SET. `EVENTS_SHEET_ID` UNSET — bookings run off the **baked** schedule in `events-data.js` (8 active dated cities; the sheet only overrides if set). Twilio UNSET — SMS is skipped and the email fallback covers it (turn on once A2P 10DLC clears).

**Email sender:** mail sends `from: "Tuned Yota <events@send.tunedyota.events>"` in BOTH `book.js` and `submission-created.js`. `replyTo`/owner copy stays `info@tunedyota.com`. CORRECTION (2026-06-24): `send.tunedyota.events` was NEVER actually verified in Resend, so booking/lead emails have been silently 403'ing (book.js swallows the error) — i.e. notifications never delivered. DNS records being added at Cloudflare; verification pending. Do NOT set `from:` to an `@tunedyota.com` address — also unverified. See [[email-sending-infra]].

**Deploy = git push to `master`.** The repo (`github.com/groshongaaron-cloud/tunedyota`) is connected to Netlify site `tunedyotaclaudbuildv1` (siteId `47fd6491-fd07-4f6b-9e1e-20a83e164d36`), which serves **tunedyota.com** (custom domain on Netlify — no longer Wix). Pushing master triggers the production build automatically; no manual `netlify deploy` needed. (Note: deploys briefly errored ~2026-06-18 with "account credit usage exceeded" — a Netlify billing issue, not a build break.)

Installer routing keys (`aaron`/`noah`/`cody`) live in BOTH `site/find-your-exact-tune.html` (INSTALLERS/MARKETS) and `netlify/functions/lib/routing.js` — keep them in sync.
