---
name: pending-secret-rotation
description: Credential-incident log. Airtable PAT + Slack webhook (2026-06-29) + n8n key (2026-06-30) + Resend key (2026-07-16) ALL rotated/CLOSED. No open items.
metadata: 
  node_type: memory
  type: project
  originSessionId: e5319100-6ade-4bc9-95a6-c9423d101c2c
---

**2026-07-15 — 3rd exposure (RESEND_API_KEY), CLOSED 2026-07-16.** During installer-dashboard work, a
`netlify env:list --plain` filtered on `api_key` printed the **value** of `RESEND_API_KEY`
(`re_…`) into the session transcript. It was the live Netlify key sending all booking/lead/cert
email via Resend (from `send.tunedyota.events`; see [[email-sending-infra]]). **ROTATED & VERIFIED
2026-07-16:** owner minted a new send-only key `tunedyota-prod-2026-07` in the Resend dashboard →
`netlify env:set RESEND_API_KEY` (via clipboard, cleared after) → prod redeploy → the `email-health`
canary returned `200 {"ok":true}` BEFORE and AFTER deleting the old `Netlify Production (send-only)`
key, proving the new key sends and the old one is gone. **Kept `tunedyota-n8n`** (separate key for
the n8n instance — NOT part of this rotation; deleting it would break n8n email). Lesson: never
`env:list --plain` / grep on values — read one var name-only with `netlify env:get`, and don't pipe
secrets through grep.

**CLOSED — COMPLETE 2026-06-29.** Both credentials fully rotated; both OLD secrets REVOKED
and the plaintext copies in `.claude/settings.local.json` were scrubbed (replaced with
`REVOKED_ROTATED_2026-06-29`, JSON re-validated).
- **Airtable:** new PAT `patkSWrl…` set in Netlify, prod redeployed; new token whoami 200,
  old token now 401.
- **Slack:** owner's first replacement webhook returned `no_service` (Incoming Webhooks not
  activated / app not installed); owner created a second one (bot id `B0BE3A1NQJY`) which
  test-posts `ok`. Set in Netlify + prod redeployed → alert.js notifications post again.
No secrets stored here. Nothing left to do on this task.

**2026-06-30 — 2nd exposure (n8n API key), CLOSED.** During n8n-mcp MCP setup, a `claude mcp add`
ran from `C:\Windows\System32` and **mangled the command so the n8n API key (a JWT) landed in a
package-name ARG instead of a hidden env value** — a later diagnostic that printed the config args
echoed the full key into the session transcript. Owner **revoked** the leaked key and generated a
new one same day. New key is stored ONLY as a Windows USER env var `N8N_API_KEY` (GUI), referenced
by the MCP config as `${N8N_API_KEY}` — never inlined again. Lesson: never put secrets in MCP
`args`; use `-e KEY=${ENV_REF}` + an OS/user env var. See [[n8n-integration-open-action]].

---
*(original task, for reference:)* Rotate two live credentials that were sitting in plaintext in
the **gitignored** `.claude/settings.local.json` permission-rule history (not pushed to the
repo, but locally exposed and likely still valid):

1. **Airtable PAT** (prefix `patC50p7…`) — the live Netlify `AIRTABLE_TOKEN`; data-only scope
   (`data.records:read`+`write`) on base `appMYG0QlSZTCYxUU` (Bookings + Priority List). Used by
   book.js, event-reminders.js, submissions-report.js, certificate-dispatch.js.
2. **Slack webhook** (path `…/B0BCJL4Q74Y/…`) — the live Netlify `SLACK_WEBHOOK_URL`; used by
   alert.js for failure notifications.

**Why owner-only first:** neither can be minted via API (unlike the Resend keys). Owner creates
the replacements in the dashboards: Airtable → airtable.com/create/tokens (same scopes + base,
then delete old); Slack → api.slack.com/apps → Incoming Webhooks (new webhook, remove old).

**Then I do:** `netlify env:set AIRTABLE_TOKEN …` + `netlify env:set SLACK_WEBHOOK_URL …` →
**redeploy** (push or `netlify deploy --prod`) so functions pick them up → verify (Airtable
whoami 200 + Slack test post) → **scrub** the old token strings out of the settings.local.json
allow-list. Mirror of the Resend rotation flow (see [[email-sending-infra]] /
[[held-branches-ship-checklist]] — that one is DONE; Resend keys in settings.local.json are
already revoked/inert). Do NOT store the new secrets in memory.
