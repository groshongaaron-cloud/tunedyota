---
name: n8n-integration-open-action
description: "n8n integration — additive layer LIVE. WF1 booking→Slack RESOLVED 2026-06-30: root cause was Netlify N8N_BOOKING_WEBHOOK_URL pointing at the /webhook-test/ URL (404) instead of /webhook/; fixed + redeployed. WF3 live, WF2 parked on GBP"
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

**RESOLVED 2026-06-30 (~12:50am CDT) — root cause found & fixed by Claude via the n8n REST API.**
Symptom: real site bookings produced no `#bookings` Slack post. Diagnosis:
- WF1 had only **2 executions total** (one `curl/8.19.0`, one `manual`) → **zero book.js pings
  ever arrived.** So Q1 = NO book.js execution existed.
- The green prod execution's `Slack #bookings` node output was `{"data":"ok"}` → Q2 = Slack
  ACCEPTED the message; node + incoming-webhook URL are fine. Slack node works.
- **ROOT CAUSE:** Netlify env `N8N_BOOKING_WEBHOOK_URL` was set to
  `https://tunedyota.app.n8n.cloud/webhook-test/ty-booking` — the n8n **test** URL, which only
  listens while the editor is in "Listen for test event" mode and returns **404** for live
  traffic. So `pingN8n` POSTed to a dead endpoint and silently no-op'd (fire-and-forget swallows
  errors). Verified: POST to `/webhook-test/ty-booking` → 404; POST to `/webhook/ty-booking` → 200.
  (Origin: the SETUP.md curl *sample* uses the test URL; owner copied that into Netlify.)
- **FIX:** `netlify env:set N8N_BOOKING_WEBHOOK_URL https://tunedyota.app.n8n.cloud/webhook/ty-booking`
  + `netlify deploy --build --prod` (deploy live). Added a ⚠️ guardrail note to `docs/n8n/SETUP.md`
  (use `/webhook/` not `/webhook-test/`).
- **END-TO-END VERIFIED (12:55am CDT):** fired a real booking through the LIVE site
  `/.netlify/functions/book` (Fargo, "ZZ N8N TEST - delete me", Tacoma, slot 12:40) → returned
  `{"status":"booked","emailFailed":false}` (2.06s warm) → WF1 **execution 34** appeared with
  `user-agent: node` (= book.js node-fetch, the FIRST non-curl execution), correct payload, and
  `Slack #bookings` node `{"data":"ok"}`. Chain confirmed working. NOTE: a COLD-START call timed
  out (empty HTTP body) before reaching the ping (ping is the last step, after Airtable + 2 emails);
  the warm retry succeeded.

**2026-06-30 (~1:15am CDT) — ARCHITECTURE HARDENING (master @ 8d9b254, deployed):** the
cold-start ping-drop is now structurally impossible. Split the booking pipeline:
- `book.js` = SYNCHRONOUS critical path only (validate → slot check → create Airtable record →
  return status to the UI). It no longer sends emails or pings; instead it POSTs a job
  `{kind:"booking"|"priority", d, inst, market, event/reason, recordId, stamp}` to a new Netlify
  **background function** via `lib/background.js` `triggerBackground()`.
- `netlify/functions/book-background.js` = the `-background` suffix makes it a Netlify Background
  Function (202 ACK immediately, runs ≤15 min). `processNotifications()` runs the MOVED installer/
  customer emails (+ics) + `reportEmailFailure` + the n8n `pingN8n`. The ping now carries the
  ACCURATE `emailFailed` (emails complete first, then ping). Verified end-to-end: WF1 **execution
  35** `user-agent: node`, Slack `{"data":"ok"}`, emailFailed:false.
- Plan check: team is **Netlify Pro** → `background_functions: included:true` (required for `-background`).
- UI impact: `book.js` booked response no longer includes `emailFailed` (emails run after it); the
  frontend defaults to "check your email", and book-background still Slack-alerts on real failures.
- Tests split: `tests/book.test.js` (sync + trigger contract) + `tests/book-background.test.js`
  (emails + ping) + `tests/background.test.js`. Full suite **156 pass**.
- **HARDENING DONE (2026-06-30 ~1:25am CDT):** Netlify env `INTERNAL_TASK_SECRET` set (64-char hex,
  value never printed) + redeployed. `book.js` attaches it as `x-ty-task`; `book-background` drops any
  request whose header doesn't match (returns before `processNotifications`). Verified: authenticated
  booking via book.js → WF1 **execution 36** (`user-agent: node`, Slack `ok`); a well-formed job POSTed
  directly to book-background WITHOUT the secret created **no execution** (dropped). GOTCHA for future
  testing: a Netlify Background Function ALWAYS returns HTTP **202** at the platform layer before the
  handler runs, so the 401 is invisible over HTTP — verify the gate by EFFECT (did it process?), not
  status code. To rotate the secret: `netlify env:set INTERNAL_TASK_SECRET <new>` + redeploy (book.js
  and book-background read the same var, so one set + redeploy keeps them in sync).

**2026-06-30 (~1:40am CDT) — FULL LIVE UI VERIFICATION (browser, end-to-end):** drove the real
booking form at tunedyota.com/find-your-exact-tune through all 6 steps (Toyota→Tacoma→2016-2023
3.5L V6→More power & torque→Book at an Event→Fargo Jul 3→12:40 slot→form→Confirm Booking). UI showed
"You're booked … Check your email" (new sync contract); WF1 **execution 37** `user-agent: node`,
`source: find-your-exact-tune`, full form data, `emailFailed: False`, Slack `{"data":"ok"}`. Confirms
the whole chain: real UI → book.js (sync) → book-background (async) → emails + n8n ping → Slack.
Test row cleaned up; real customer bookings on that date left untouched.
**Cleanup pending:** delete Airtable Bookings test rows holding real Fargo 7/3 slots:
(a) "ZZ ENV TEST - delete me" (9:00) and (b) "ZZ N8N TEST - delete me" (12:40, created by the
end-to-end verification above). ALSO possibly a stray Omaha **Priority List** record from a
slot-probe (Omaha's event was 6/28, now past → no-event → priority path; the probe HTTP response
was empty/timed-out so a record may or may not exist — verify). (Owner already deleted the earlier "ZZ TEST" row.)
**Note:** Claude debugged this via direct `curl` to the n8n REST API (key from `$N8N_API_KEY`),
NOT the n8n-mcp tools — those still don't register in-session (see below).

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
**2026-06-30 UPDATE:** `claude mcp list` shows `n8n-mcp: ✔ Connected` and `$N8N_API_KEY`
authenticates (curl to `/api/v1/workflows` → 200), BUT the n8n-mcp **tools never register in
this session's deferred registry** (ToolSearch for `n8n_*` / `mcp__n8n*` → nothing). Likely the
slow `npx -y n8n-mcp` spawn doesn't finish before the session tool list is built. WORKAROUND
THAT WORKS NOW: skip the MCP tools, hit the n8n REST API directly with curl + `$N8N_API_KEY`
against `https://tunedyota.app.n8n.cloud/api/v1/` (workflows, executions?workflowId=…&limit=,
executions/{id}?includeData=true). That's how WF1 was debugged. If MCP tools are wanted, a fresh
restart *might* register them; not required for n8n work.
Why earlier attempts failed (root cause): two prior `claude mcp add` runs executed from
`C:\Windows\System32`, so n8n-mcp got registered under that dir's LOCAL scope (invisible to
this project session); also one add mangled the command (key fused into the package-name arg).
**Cleanup DONE (2026-06-30 ~1:40am CDT):** removed the two inert/broken `n8n-mcp` registrations
under project keys `C:/Windows/system32` + `C:/Windows/System32` in ~/.claude.json (both held OLD
*revoked* JWTs in plaintext — one in `env.N8N_API_KEY`, one mangled into `args`; scrubbed, 0 leaked-key
strings remain). User-scope keeper intact (`${N8N_API_KEY}` env ref) and `claude mcp list` ✔ Connected.
The two empty System32 *project* keys were then also deleted entirely (~1:45am CDT); `projects` now
holds only `C:/Users/grosh/Documents` + `C:/Users/grosh/Documents/tunedyota`.
NOTE: edited while Claude Code was running; if a System32 reg reappears after a restart, the live
process rewrote the file from memory — redo with Claude Code closed. **Gotcha:** the GUI env var only takes effect after a FULL quit+
reopen of Claude Code (child MCP process inherits env at launch). See [[pending-secret-rotation]]
for the 2nd key exposure that happened during this setup.

**2026-07-04 — n8n-mcp TOOLS WORKED IN-SESSION (correction to the note above).** This session the
`mcp__n8n-mcp__*` tools DID register/load via `ToolSearch select:...` and ran fine (health_check ok,
list/get/update_partial/validate/executions all worked against `tunedyota.app.n8n.cloud`). So the
"tools never register" workaround is no longer always true — TRY the MCP tools first now; fall back to
curl + `$N8N_API_KEY` only if they don't load.

**2026-07-04 — WF1 Slack message now shows the exact MODEL YEAR** (part of the [[booking-model-year-capture]]
feature). WF1 = **"TY — WF1 New Booking → Slack"** (id `ALeBJP3JlqNxC16T`). Applied via
`n8n_update_partial_workflow` `patchNodeField` on the `Slack #bookings` node's `parameters.jsonBody`:
appended `+ (b.modelYear ? ' (' + b.modelYear + ')' : '')` right after the vehicle, so the alert reads
e.g. `2016-2023 Toyota Tacoma 3.5L V6 (2019) · 9:20 …` and shows nothing extra when modelYear is empty.
Owner-approved before applying. Verified: test webhook POST → **execution 41 success**, Slack node
`{"data":"ok"}`. **The Airtable Model Year write is in book.js (owner added the column) — WF1 has NO
Airtable node**, so there was nothing to "map to Airtable" in n8n; the only n8n change was the Slack text.
Full pipeline now complete: form → book.js (Airtable Model Year, tolerant) → book-background n8n ping
(`modelYear`) → WF1 Slack shows it.

**KNOWN FALSE POSITIVE:** `n8n_validate_workflow` on WF1 reports an error that the node **"IF email failed"**
should move from the Webhook's `main[0]` to an error output (`main[1]` + `onError:continueErrorOutput`).
DO NOT do this — that node is an intentional PARALLEL branch (fires on every booking, checks the
`emailFailed` flag in the payload, posts a note only if an email bounced). It is NOT a webhook error
handler; the validator just trips on the word "failed" in the node name. Rewiring would break the
email-failed notification. Leave WF1's connections as-is.
