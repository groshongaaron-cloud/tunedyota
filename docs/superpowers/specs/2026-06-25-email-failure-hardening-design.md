# Email-Failure Hardening + Monitoring — Design

**Date:** 2026-06-25
**Status:** Approved (owner sign-off 2026-06-25)

## Problem

`book.js` and `submission-created.js` send booking/lead notifications via Resend
inside try/catch blocks that only `console.error` the failure. The booking still
returns `"booked"` (HTTP 200) and the lead handler returns 200 regardless. Result:
when Resend rejects mail (e.g. the `send.tunedyota.events` domain went unverified
for weeks), **every notification silently fails** — customers see success, leads
are lost, and nobody is alerted. This was the 2026-06-24/25 outage. See
[[email-sending-infra]].

## Goal

Make email-send failures impossible to miss, without ever letting the new
safety code break the core booking/lead flow:

1. **Real-time alert** — on any send failure, post to the Resend-independent
   Slack webhook (so the alert works even when email is down).
2. **Durable follow-up** — flag failed *bookings* in Airtable (`Email Status =
   FAILED`) so there's a worklist, not just a transient ping.
3. **Honest customer UX** — when the customer-facing email fails, soften the
   on-page success copy (no "check your email" promise we can't keep).
4. **Periodic canary** — a daily scheduled function proves the send path still
   returns 200, catching a silent lapse before a real lead hits it.

## Architecture

All alerting uses the existing **Slack Incoming Webhook** (already curled by the
cloud routines; independent of Resend). New side-effects are individually
try/caught so they can never break booking/lead processing.

### Components

| File | Responsibility |
|---|---|
| `netlify/functions/lib/alert.js` *(new)* | `notifyOwner({ fetchImpl, webhookUrl, text })` — POST `{text}` to Slack. No-ops (logs) if `webhookUrl` falsy. |
| `netlify/functions/lib/airtable.js` | add `updateRecord({ fetchImpl, token, baseId, table, id, fields })` — PATCH one record. |
| `netlify/functions/book.js` | capture each send result; on failure → `notifyOwner` + best-effort `updateRecord` Email Status=FAILED; return `emailFailed` when the customer email didn't send. |
| `netlify/functions/submission-created.js` | capture each send result; on failure → `notifyOwner`. (Leads aren't in Airtable → Slack only.) |
| `site/find-your-exact-tune.html` | when `out.emailFailed`, show softened success copy. |
| `netlify/functions/email-health.js` *(new, scheduled daily)* | canary send via Resend → expect 200; on non-200/throw → `notifyOwner("⚠️ email path DOWN …")`. |
| `netlify.toml` | schedule `email-health` daily. |

## Data flow

### Booking (book.js)
1. Create Airtable booking record (existing) → keep returned `id`.
2. Send installer email → record `{ok, reason}`. Send customer email (if email)
   → record `{ok, reason}`.
3. `anyFailed = !installer.ok || (hasCustomer && !customer.ok)`.
4. If `anyFailed`: `notifyOwner(webhook, "⚠️ Booking email FAILED — <name> · <city>
   · <phone/email> · reason: <reason>")` (try/caught). If `id`, best-effort
   `updateRecord(... Email Status: "FAILED")` (try/caught — a missing column just
   logs, never throws into the booking path).
5. Return existing booked payload plus `emailFailed: hasCustomer && !customer.ok`.

### Lead (submission-created.js)
Same send-result capture; on any failure `notifyOwner(...)`. No Airtable, no UX
change (the lead success screen already only promises "we'll be in touch").

### Canary (email-health.js, daily)
Send from `events@send.tunedyota.events` to `CANARY_TO`
(default `info+canary@tunedyota.com`). On non-200/throw → `notifyOwner("⚠️ email
path DOWN: <status/reason>")`. Success is silent (1 email/day). Liveness of the
scheduler itself is covered by the existing daily uptime routine.

## Frontend copy

In `find-your-exact-tune.html` `bookSuccess` path for `out.status==="booked"`:
- normal: `…Check your email for a calendar invite.`
- when `out.emailFailed`: `You're booked for <event> at <slot>. We'll confirm the
  details by phone/text shortly.`

## Config / prerequisites (owner)

- **Netlify env:** add `SLACK_WEBHOOK_URL` (existing routine webhook). Optional
  `CANARY_TO` (default `info+canary@tunedyota.com`).
- **Airtable:** add an `Email Status` single-line-text field to **Bookings** and
  **Priority List**. The `AIRTABLE_TOKEN` lacks schema scope, so this is a manual
  UI step (or grant `schema.bases:write` to script it). Until it exists, the
  flag-write best-effort-fails and only logs — bookings and Slack alerts are
  unaffected.

## Testing (TDD, node:test)

- `tests/alert.test.js` — posts text to webhook (mock fetch); no-ops when webhook
  falsy; never throws.
- `tests/airtable.test.js` — `updateRecord` issues PATCH to
  `…/{baseId}/{table}/{id}` with `{fields, typecast:true}`.
- `tests/book.test.js` — failing installer/customer send → `notifyOwner` called +
  `updateRecord` called with `Email Status: "FAILED"` + `emailFailed` set for a
  failed customer email; all-success → neither called, `emailFailed` falsy.
- `tests/process-submission.test.js` — failing send → `notifyOwner` called.
- `tests/email-health.test.js` *(new)* — 200 → no alert; non-200 → alert with
  reason.
- `tests/booking-ui.test.js` — softened-copy branch present in HTML.

Dependency injection: `book.js`/`submission-created.js` gain `notify` and
`update` (or `webhookUrl`) in their `deps`, defaulting to the real impls, so
tests assert calls without network/Airtable.

## Out of scope

- No retry/queue for failed sends (alert + manual follow-up is enough now).
- No change to the Resend domain fix itself (separate, in progress).
- Leads are not flagged in Airtable (they don't have records there).
