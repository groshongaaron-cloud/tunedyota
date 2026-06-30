---
name: n8n-integration-open-action
description: "n8n integration — additive layer BUILT 2026-06-29 (importable JSON + env-gated book.js ping shipped); now blocked on OWNER import/activation in n8n Cloud"
metadata: 
  node_type: memory
  type: project
  originSessionId: cb7db9fa-6301-4b25-ad04-be980eb59f5b
---

OPEN ACTION (paused 2026-06-26): connect n8n to the Tuned Yota site. Audit is done; the build is not started.

Audit findings:
- n8n MCP server is NOT connected to the session (only the n8n-mcp *skills* knowledge pack is installed). No `n8n` reference anywhere in the repo.
- The site does all integration in-process in Netlify Functions. Hub is `netlify/functions/book.js` (`processBooking`): routing.js (installer) → airtable.js (Bookings / Priority List) → resend.js (installer+customer email +.ics) → alert.js Slack **only on email failure**. `track.js` writes Funnel Events. Well-built, best-effort, but **no retries**.
- Gaps n8n could fill: (1) no positive "new booking" owner notification — Slack only fires on failure; (2) no follow-up/nurture emails, review requests, or digests.

Recommendation (not yet confirmed by owner): add n8n as an **additive, fire-and-forget layer** for new automation — leave `book.js` as-is — rather than rerouting the working critical path through n8n.

Next step when resumed: owner confirmed an n8n instance **exists** but the second question (additive layer vs full integration hub) was not answered, and connection details (Cloud vs self-hosted, API URL + key) were not collected. Start there. Also verify live email delivery first — [[email-sending-infra]] vs [[held-branches-ship-checklist]] conflict on whether Resend `send.tunedyota.events` actually delivers.

**2026-06-29 — DRAFT written:** `docs/n8n/additive-workflows-draft.md` (master @ fbdc367)
specs the 3 additive workflows (1: new-booking owner notification via webhook-or-poll;
2: post-event review-request + referral; 3: weekly booking digest) + a shared Error
Trigger→Slack workflow + a minimal env-gated `book.js` hook (proposed `lib/n8n.js`
`pingN8n`, no-op until `N8N_BOOKING_WEBHOOK_URL` set). Includes real Airtable field names
(Bookings/Priority List), the booking payload shape, brand-safe copy, and credentials list.
Build is still blocked on the instance URL/key. When resumed, follow the draft's "Build
order" section (Shared error wf → WF1 → WF3 → WF2).

**2026-06-29 — BUILT & SHIPPED (master @ f456fcf).** Owner decided: **additive layer**,
**webhook** ingestion for WF1, **all 3 workflows + shared error handler**, **n8n Cloud**.
Delivered:
- `netlify/functions/lib/n8n.js` `pingN8n` (TDD, 3 unit tests) + wired into `book.js`
  `processBooking` (fire-and-forget POST before the booked return; env-gated on
  `N8N_BOOKING_WEBHOOK_URL`, dark until set; priority/no-event path does NOT ping). +3
  book.js integration tests. 144 tests pass. Deploy healthy.
- 4 importable n8n Cloud JSONs in `docs/n8n/workflows/`: `0-shared-error-to-slack`,
  `1-new-booking-to-slack` (webhook `ty-booking`, fans out to Slack + IF-emailFailed note),
  `2-post-event-review-request` (Schedule daily 10:00 CT → Airtable search Completed →
  Code builds approved review email → Resend → stamp `Review Requested`), `3-weekly-digest`
  (Mon 07:00 CT → Airtable Bookings+Priority 7d → Code aggregate → email info@ + Slack).
- `docs/n8n/SETUP.md`: credentials (Airtable PAT / Resend Header Auth / Slack webhook URL
  pasted into HTTP nodes — no Slack OAuth), import order, validate→test→activate gates.

Design choices: Slack via HTTP Request to incoming-webhook (no OAuth app); Resend via HTTP
Request + Header Auth credential; native Airtable node + PAT. JSON was **hand-authored
without a live n8n instance** — typeVersions may drift; owner must validate/verify on import.

**Owner-side setup DONE in n8n Cloud (2026-06-29 eve):** 3 credentials created, all 4 JSONs
imported, Slack webhook URL pasted into Slack nodes, Error Workflow set, credentials mapped.
Instance subdomain = **tunedyota.app.n8n.cloud** (WF1 prod webhook = `https://tunedyota.app.n8n.cloud/webhook/ty-booking`).
- **WF1**: ACTIVE. Tested green via webhook-test (Slack post confirmed) AND via direct curl to
  the PRODUCTION webhook (200, execution green, Slack node green). Owner set Netlify env
  `N8N_BOOKING_WEBHOOK_URL` + redeployed.
- **WF3**: tested green (digest email + Slack). Owner to confirm Active toggle is ON.
- **WF2**: still INACTIVE, parked on GBP (needs `Review Requested` Airtable column + GBP review link).

**UNRESOLVED at end of session — resume here (full-chain env-var verification):** owner ran a
real booking through the LIVE site `book.js` (test row "ZZ ENV TEST", Tacoma, Fargo 7/3 9:00)
but reported **no Slack `#bookings` post appeared**. Diagnosis in progress:
1. The green WF1 execution the owner inspected had `user-agent: curl/8.19.0` → it was Claude's
   DIRECT webhook test, NOT a book.js ping. Webhook data confirmed nested under `body` (so
   `$json.body.*` is correct). **Open Q1:** does an execution from book.js actually exist
   (non-curl user-agent, vehicle "Tacoma")? If NOT → `N8N_BOOKING_WEBHOOK_URL` isn't reaching
   the deployed Netlify fn (typo / scope / redeploy timing) → book.js never pinged.
2. **Open Q2:** the `Slack #bookings` node OUTPUT (right panel) in a green prod execution —
   is it `ok` (Slack accepted → message went to a channel the owner isn't watching, i.e. the
   pasted webhook URL may bind to a different channel than the one they monitored) or an error?
   NOTE the earlier webhook-TEST post DID appear, so channel/URL mismatch between then and now
   is suspect.
**Cleanup pending:** delete Airtable Bookings test row "ZZ ENV TEST - delete me" (Fargo 7/3,
9:00) — it's holding that slot. (Owner already deleted the earlier "ZZ TEST" row.)

**Next-session lead:** offer to connect the **n8n-mcp MCP server** so Claude can read executions
& self-debug Q1/Q2 directly instead of via owner click-throughs (see [[prefer-automation-over-handoffs]]).
Optional later build: WF4 +7-day review nudge (copy ready in review-request-email.md). GBP gates WF2.

**2026-06-30 — n8n-mcp MCP server setup (IN PROGRESS, resume on reopen):** Registered the
community **n8n-mcp** server at **USER scope** in `C:\Users\grosh\.claude.json` (top-level
`mcpServers`): `command: cmd`, `args: ["/c","npx","-y","n8n-mcp"]`, env `MCP_MODE=stdio`,
`N8N_API_URL=https://tunedyota.app.n8n.cloud`, `N8N_API_KEY=${N8N_API_KEY}` (literal ref —
Claude Code expands at server launch). The key is stored as a **Windows USER environment
variable** `N8N_API_KEY` (set via GUI, confirmed length 267 = JWT), NOT in config/transcript.
RESUME: on reopen, `ToolSearch select:n8n_health_check,...` to confirm tools loaded → run
`n8n_health_check` → then debug WF1 Q1/Q2 by reading executions (`n8n_executions`).
Why earlier attempts failed (root cause): two prior `claude mcp add` runs executed from
`C:\Windows\System32`, so n8n-mcp got registered under that dir's LOCAL scope (invisible to
this project session); also one add mangled the command (key fused into the package-name arg).
**Cleanup pending:** two inert/broken local registrations remain under project keys
`C:/Windows/system32` + `C:/Windows/System32` in ~/.claude.json — remove once the user-scope
server is confirmed working. **Gotcha:** the GUI env var only takes effect after a FULL quit+
reopen of Claude Code (child MCP process inherits env at launch). See [[pending-secret-rotation]]
for the 2nd key exposure that happened during this setup.
