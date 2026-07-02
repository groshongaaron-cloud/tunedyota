# SOP 8 — Monitoring & Incident Response

**Owner:** Owner/Operator · **Cadence:** Passive (alerts) + monthly review
**Goal:** Failures are loud, not silent — and there's a known response for each.

The system is built to **fail loud and never lose data**. Most problems surface as a **Slack alert**
(posted via the `/notify` relay so the webhook is never exposed). Your job is to recognize and act.

---

## 1. Automated monitors

| Monitor | Trigger | Watches for |
|---------|---------|-------------|
| `email-health.js` | Daily canary | The Resend email path is alive; Slack alert if send fails |
| `book-background.js` | Per booking | Email send failures → flags `Email Status = FAILED` + Slack |
| `certificate-dispatch.js` | Daily ~9 AM CT | Completed bookings missing certs; Slack if a send fails or a cert is **held** (no calibration) |
| `event-reminders.js` | 07:00 CT daily | Unknown event cities; failure summaries to Slack |
| **Cloud routines** | Scheduled | Uptime/integrity, event-schedule freshness, SEO/booking smoke test, lead radar |

Cloud routines require the Default cloud env **Network access = "Full"** — with it set to
"Trusted" they silently pass while doing nothing (this bit us before). If a monitor reports
"Completed" but you never see real data, check that first.

---

## 2. Incident playbook

| Alert | Meaning | Response |
|-------|---------|----------|
| **⚠️ email path DOWN** (canary) | Resend isn't sending at all | Check Resend status/API key + domain (`send.tunedyota.events`). Bookings still save; follow up affected customers manually. |
| **`Email Status = FAILED`** on a booking | That one email didn't reach the customer | Contact the customer directly with slot/venue; the booking itself is intact. |
| **Certificate(s) held** | Completed booking has no OTT Calibration | Set the calibration on the Airtable row; next daily run releases the cert. |
| **Certificate email FAILED** | Cert send errored | Re-check the installer email; the daily job retries automatically. |
| **Unknown event city** (reminders/sweep) | A booking references a city not in event data | Fix the city name / event data so its reminders + rebooks aren't skipped. |
| **Uptime/SEO routine red** | Site down or schema/sitemap drift | Check the latest Netlify deploy is `ready`; re-run `build:seo` + ship if drift. |

---

## 3. Deploy failures

Deploys have **silently skipped** before (e.g. "account credit usage exceeded"), leaving a commit
that looks fine but isn't live. After any push to `master`: confirm the Netlify deploy shows
**`ready`**, then `curl` the changed page on `tunedyota.com` to confirm the change is actually there.
Don't outsource this to the cloud routines — verify at ship time (see [`ship`](../../.claude/skills/ship/SKILL.md)).

---

## 4. Data integrity guarantees (why you can stay calm)

- Bookings/leads use **tolerant writes** — a missing Airtable column never drops a record.
- Email is **non-fatal** — a booking returns success even if email fails, and is flagged for follow-up.
- Tracking is a **separate path** — analytics never block a booking.
- Certificates are **idempotent** and **held** rather than sent blank.

---

## 5. Definition of done (monthly review)

- [ ] No unresolved `Email Status = FAILED` rows.
- [ ] No certificates stuck "held".
- [ ] All cloud routines actually returning data (not silently passing).
- [ ] Latest production deploy is `ready` and live-verified.

**Related:** [SOP 4 Close-Out](sop-event-closeout.md) · [SOP 10 Data Security](sop-data-security-secrets.md) · [`docs/architecture/`](../architecture/)
</content>
