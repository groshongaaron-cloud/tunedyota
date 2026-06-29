---
name: pending-secret-rotation
description: OPEN/paused 2026-06-28 — rotate the Airtable PAT + Slack webhook (both exposed in plaintext in gitignored .claude/settings.local.json); resume next session
metadata: 
  node_type: memory
  type: project
  originSessionId: e5319100-6ade-4bc9-95a6-c9423d101c2c
---

**CLOSED — COMPLETE 2026-06-29.** Both credentials fully rotated; both OLD secrets REVOKED
and the plaintext copies in `.claude/settings.local.json` were scrubbed (replaced with
`REVOKED_ROTATED_2026-06-29`, JSON re-validated).
- **Airtable:** new PAT `patkSWrl…` set in Netlify, prod redeployed; new token whoami 200,
  old token now 401.
- **Slack:** owner's first replacement webhook returned `no_service` (Incoming Webhooks not
  activated / app not installed); owner created a second one (bot id `B0BE3A1NQJY`) which
  test-posts `ok`. Set in Netlify + prod redeployed → alert.js notifications post again.
No secrets stored here. Nothing left to do on this task.

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
