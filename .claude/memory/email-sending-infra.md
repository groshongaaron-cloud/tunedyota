---
name: email-sending-infra
description: "How Tuned Yota booking/lead emails are sent — Resend account, the send.tunedyota.events sender domain, and why it exists"
metadata: 
  node_type: memory
  type: project
  originSessionId: 6f31c7da-21ad-4338-9fbf-fb7a07ce1803
---

Booking + lead notification emails are sent via **Resend** (account owner `groshong.aaron@gmail.com`). The production `RESEND_API_KEY` (same value across all Netlify contexts) is a **send-only restricted key** — it cannot list/manage domains via API, so domain status must be checked in the Resend dashboard.

The sender domain is **`send.tunedyota.events`** (FROM = `events@send.tunedyota.events` in `netlify/functions/book.js` and `submission-created.js`; replies route to `info@tunedyota.com` via replyTo/CC). This `.events` domain was registered at **Cloudflare specifically for email**, because **Wix (which manages `tunedyota.com` DNS) blocked subdomain MX verification** on the primary domain. So Cloudflare is where Resend's DKIM/SPF/MX verification records go.

**2026-06-24 — root cause of "booking emails not working":** `send.tunedyota.events` was **never verified in Resend** (no DKIM/SPF/MX records published at Cloudflare; account still in testing mode). Every send returns `403 domain not verified`, and `book.js` swallows the error (only `console.error`), so customers see "You're booked" but no email is ever delivered. Fix = add Resend's records at Cloudflare + click Verify; no code change needed (FROM already correct). See [[funnel-roadmap-and-lead-setup]].

**2026-06-25 — RESOLVED & LIVE:** email now delivers. Root cause of the long block was an **account mismatch** — the verified `send.tunedyota.events` domain was in a *different* Resend account than the Netlify `RESEND_API_KEY` (which belongs to `groshong.aaron@gmail.com`'s account). Fix: added + verified the domain in the key's own account (DNS already correct → instant verify). Live send returns 200; a live booking returned `emailFailed:false`. If email breaks again, FIRST check the key's account owns a verified domain (probe: send from `onboarding@resend.dev` to a non-owner address — the error names the account email).

**2026-06-25 — one-time confirmation recovery send (DONE):** because email was broken since launch, the 21 existing "Booked" customers never got confirmations. After the domain was verified, a one-off script sent booking confirmations (+`.ics`) to the **17 upcoming-event** bookings (skipped 4 Twin Cities — June 20 already past). The 2 Madison bookings got a *reschedule* notice (event moved July 18 → Aug 1) and their Airtable `Event Date` was corrected to 2026-08-01. **Do NOT re-send these** — there's no "confirmation sent" flag, so a re-run would double-email. Going forward, new bookings auto-confirm via `book.js` (email now works).

**2026-06-24 — WIP (now shipped, see [[held-branches-ship-checklist]]):** branch `feat/homepage-cta-ott-update` (homepage CTAs + `?intent=update` re-flash funnel, tagged `Source=OTT Update`) is committed + green (73/73) but the push is **held** until `send.tunedyota.events` is verified in Resend, so we can verify email end-to-end in one pass. After DNS verifies: re-run the Resend send probe (expect 200), merge to master + push, then a live booking to confirm delivery.

**Hardening worth doing:** book.js silently swallows email-send failures — consider surfacing/monitoring them (tie into the cloud routines) so a future verification lapse is caught automatically. See [[cloud-routines]].
