# SOP 10 — Data Security & Secrets

**Owner:** Owner/Operator · **Cadence:** On change + periodic review
**Goal:** Customer data and credentials stay protected; a leaked secret is a contained, recoverable event.

---

## 1. Where secrets live

All secrets are **Netlify environment variables** (production) — never committed to the repo.

| Secret | Purpose |
|--------|---------|
| `AIRTABLE_TOKEN` / `AIRTABLE_BASE_ID` | Airtable data access |
| `RESEND_API_KEY` | Sending email |
| `SLACK_WEBHOOK_URL` | Alerts (server-side only) |
| `NOTIFY_TOKEN` | Gates the `/notify` Slack relay |
| `INTAKE_SECRET` | Gates `/intake.html` staff form |
| `INSTALLER_TOKENS` | Per-installer console passcodes (JSON map) |
| `INTERNAL_TASK_SECRET` | Gates the background booking function |
| `N8N_BOOKING_WEBHOOK_URL`, `N8N_API_KEY` | n8n integration |

Manage with the Netlify CLI (`netlify env:set/get`) — reading a value into a variable, never
echoing it into logs or chat.

---

## 2. Principle of least privilege

- The **data token** (`AIRTABLE_TOKEN`) should hold only the scopes it needs. Schema-management
  scopes (`schema.bases:write/read`) are powerful — grant them only when doing schema work
  (e.g. adding the `VIN` column) and consider narrowing afterward.
- The **Slack webhook** is never placed in a routine prompt or client code — it's called only
  server-side, and cloud routines reach it through the `/notify` relay (`NOTIFY_TOKEN`-gated).
- Installer passcodes scope each installer to **their own** bookings; ownership is re-checked
  server-side on every close-out.

---

## 3. Gated endpoints (fail closed)

| Endpoint | Gate | On bad/missing credential |
|----------|------|---------------------------|
| `/intake.html` → `intake.js` | `INTAKE_SECRET` | 401 |
| `/installer.html` → `installer-roster` / `installer-closeout` | `INSTALLER_TOKENS` | 401 |
| `/notify` | `NOTIFY_TOKEN` | 401 |
| `book-background` | `INTERNAL_TASK_SECRET` | rejected |

---

## 4. If a secret leaks — rotation playbook

1. **Revoke** the exposed credential at its source (Airtable / Resend / Slack / n8n) immediately.
2. **Reissue** a new one and set it via `netlify env:set` (+ redeploy so functions pick it up).
3. **Scrub** any plaintext copy from local config / transcripts.
4. **Verify** the old credential is dead and the new one works end-to-end.
5. Record the incident (what, when, verified) so the history is clear.

> **Never put a secret in a command *argument*** (e.g. MCP `add` args) — it lands in transcripts.
> Pass secrets via environment variables or clipboard capture, not chat.

---

## 5. Customer data

- Personal data (name, phone, email, VIN) lives in Airtable; access is via the scoped token only.
- VIN appears on the customer's own certificate and in the OTT report — treat it as customer PII.
- Don't export contact lists anywhere they'd be cached/indexed publicly.

---

## 6. Definition of done

- [ ] No secret in the repo or in any prompt/transcript.
- [ ] Tokens hold only needed scopes.
- [ ] Gated endpoints fail closed.
- [ ] Any leak followed the rotation playbook and is verified closed.

**Related:** [SOP 8 Monitoring & Incident Response](sop-monitoring-incident-response.md)
