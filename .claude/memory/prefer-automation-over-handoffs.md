---
name: prefer-automation-over-handoffs
description: User wants Claude to own/automate multi-step setup tasks rather than hand back long lists of manual click-steps
metadata: 
  node_type: memory
  type: feedback
  originSessionId: bd82cf5d-65e7-4df7-804d-715bb1cb0da5
---

After the n8n rollout (2026-06-29), the owner said: "I wish you could make some of
these steps easier or complete these tasks on your own." The session had too many
"now you go click this in n8n / Netlify" handoffs.

**Why:** the owner is the sole operator of a small business and is doing this setup
solo in the evening; every manual click-path step is friction and a chance to get
stuck. He wants Claude to carry more of the execution, not just the planning.

**How to apply:**
- Before starting a multi-step external setup, proactively offer to remove the manual
  parts at the source. The biggest lever for n8n is **connecting the n8n-mcp MCP server**
  (n8n Cloud API URL + key in MCP config, NOT pasted in chat) — that lets Claude create,
  validate, test, AND activate workflows directly and read execution logs to self-debug.
  Lead with this offer next n8n session.
- For things Claude truly can't do (entering credentials, Netlify env vars), hand a
  single ready-to-run command (e.g. `! netlify env:set NAME value`) instead of a
  click-path.
- Batch the unavoidable manual steps into the fewest possible round-trips; don't drip
  one click at a time.
- Anything Claude CAN do via a public endpoint (HTTP tests, deploys via git push,
  curl against live functions), just do it — don't narrate it as a step for the user.

See [[n8n-integration-open-action]].
