---
name: n8n-integration-open-action
description: "Open/paused action — wire an existing n8n instance into the Tuned Yota site pipeline; audit done, build not started"
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

**2026-06-29 — owner is now PRIORITIZING this + GBP setup** (deferring venue-address updates & Magnuson pricing numbers to a later session). So next session expect the owner to bring n8n direction (additive vs hub) + connection details, and to be executing GBP setup (see [[search-ai-visibility-program]] Phase 2 / docs/seo/gbp-setup.md). Lead with collecting those n8n connection details, then verify email delivery before building.
