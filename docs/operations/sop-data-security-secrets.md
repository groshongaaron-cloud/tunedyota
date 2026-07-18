# SOP 10 — Data Security & Secrets

**Owner:** Owner/Operator · **Cadence:** On change + periodic review
**Goal:** Customer data and credentials stay protected; a leaked secret is a contained, recoverable event.

---

## 1. Where secrets live

All secrets are **Netlify environment variables** (production) — never committed to the repo.

| Secret | Purpose | Notes |
|--------|---------|-------|
| `AIRTABLE_TOKEN` / `AIRTABLE_BASE_ID` | Airtable data access | |
| `RESEND_API_KEY` | Sending email | |
| `SLACK_WEBHOOK_URL` | Alerts (server-side only, via `/notify` relay) | **Rotated 2026-07-16** — old webhook was embedded in n8n workflows and has been revoked; new webhook is in this env var only, reached exclusively through the `/notify` relay |
| `NOTIFY_TOKEN` | Gates the `/notify` Slack relay; n8n workflows post Slack via `/notify` using header `x-ty-notify` | |
| `INTAKE_SECRET` | Gates `/intake.html` staff form | |
| `INSTALLER_TOKENS` | Per-installer console passcodes (JSON map) | |
| `INTERNAL_TASK_SECRET` | Gates `/lead-ingest`; `inbox-sweep` presents it on every ingest POST; constant-time compared in `lib/secrets.js`; if unset, sweep fails fast with `no-task-secret` | |
| `N8N_BOOKING_WEBHOOK_URL`, `N8N_API_KEY` | n8n integration | |
| `TWILIO_FROM_NUMBER` | Outbound SMS sender (chat escalation notifies installers) | The business Twilio line |
| `INSTALLER_SMS_NUMBERS` | JSON map installer-key → real cell; overrides the public phone for chat-escalation SMS + relay identity | Needed for aaron (public phone IS the Twilio line) |
| `ANTHROPIC_API_KEY` | Claude vision (VIN OCR) + `inbox-sweep` classify/draft (`claude-haiku` classify, `claude-sonnet-4-6` NEPQ draft) | Set + verified 2026-07-16 |
| `GMAIL_REFRESH_TOKEN` | info@ Gmail OAuth — `inbox-sweep` read + label + draft; `inbox-digest` read | Token requires `gmail.modify` + `gmail.compose` / drafts scope; verified working 2026-07-17 |
| `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` | info@ Gmail OAuth client credentials | Paired with `GMAIL_REFRESH_TOKEN` |

Manage with the Netlify CLI (`netlify env:set/get`) — reading a value into a variable, never
echoing it into logs or chat.

---

## 2. Principle of least privilege

- The **data token** (`AIRTABLE_TOKEN`) holds data scopes only. Schema-management scopes
  (`schema.bases:read/write`) are powerful — grant them **temporarily** for schema work and
  **remove them as soon as the work is verified**, in the same sitting. The working procedure
  (practiced 2026-07-17 for the `Events` table):
  1. At airtable.com/create/tokens, edit the production token (match it by its `pat…` ID —
     never regenerate; that changes the secret and breaks the live site) and add
     `schema.bases:read` + `schema.bases:write`.
  2. Run the schema work (e.g. `setup-airtable.mjs`) and verify data reads/writes still work.
  3. Remove both schema scopes immediately. Data operations need no schema scope, so
     nothing live is affected.
- The **Slack webhook** is never placed in a routine prompt or client code — it's called only
  server-side, and cloud routines reach it through the `/notify` relay (`NOTIFY_TOKEN`-gated).
- Installer passcodes scope each installer to **their own** bookings; ownership is re-checked
  server-side on every close-out.

---

## 3. Gated endpoints (fail closed)

| Endpoint | Gate | On bad/missing credential |
|----------|------|---------------------------|
| `/intake.html` → `intake.js` | `INTAKE_SECRET` | 401 |
| `/installer.html` → `installer-roster` / `installer-closeout` | `INSTALLER_TOKENS` | 401 (constant-time) |
| `/notify` | `NOTIFY_TOKEN` (`x-ty-notify` header) | 401 |
| `book-background` | `INTERNAL_TASK_SECRET` | rejected |
| `lead-ingest` | `INTERNAL_TASK_SECRET` (`x-ty-task` header) | rejected; `inbox-sweep` is the primary caller |

---

## 4. Installer console credential persistence

Installer passcodes now persist on-device so installers don't re-enter them on every visit:

- **localStorage** — the passcode is stored in each device's localStorage after first entry.
- **iOS Keychain / Google Password Manager** — browsers offer to save/autofill on first entry.
- **App biometric lock** — the PWA can use device biometrics (where supported).

The data itself remains gated server-side (fail-closed, constant-time compare in `lib/secrets.js`). Credential persistence is a UX convenience only — it never weakens the server-side gate.

**Lost or stolen device response:** rotate that **one installer's token** in `INSTALLER_TOKENS` (Netlify env var → `netlify env:set` → redeploy). The installer re-enters their new passcode once on first login; all other installers are unaffected. No other action is required unless there is evidence of unauthorized booking access.

---

## 5. If a secret leaks — rotation playbook

> **Known rotation — 2026-07-16:** `SLACK_WEBHOOK_URL` was rotated after the old webhook had been embedded in n8n workflow nodes. The old webhook is revoked. The new webhook lives only in this env var and is reached exclusively through the `/notify` relay — never inline in n8n or prompts.

1. **Revoke** the exposed credential at its source (Airtable / Resend / Slack / n8n) immediately.
2. **Reissue** a new one and set it via `netlify env:set` (+ redeploy so functions pick it up).
3. **Scrub** any plaintext copy from local config / transcripts.
4. **Verify** the old credential is dead and the new one works end-to-end.
5. Record the incident (what, when, verified) so the history is clear.

> **Never put a secret in a command *argument*** (e.g. MCP `add` args) — it lands in transcripts.
> Pass secrets via environment variables or clipboard capture, not chat.

---

## 6. Customer data

- Personal data (name, phone, email, VIN) lives in Airtable; access is via the scoped token only.
- VIN appears on the customer's own certificate and in the OTT report — treat it as customer PII.
- Don't export contact lists anywhere they'd be cached/indexed publicly.

---

## 7. Definition of done

- [ ] No secret in the repo or in any prompt/transcript.
- [ ] Tokens hold only needed scopes.
- [ ] Gated endpoints fail closed.
- [ ] Any leak followed the rotation playbook and is verified closed.

**Related:** [SOP 8 Monitoring & Incident Response](sop-monitoring-incident-response.md)
