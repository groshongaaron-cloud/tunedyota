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
