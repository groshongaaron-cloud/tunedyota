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

**Reinforced HARD after the Phase 3 measurement-engine session (2026-07-01)** — owner:
"Learn from your mistakes. Make the manual entries I have to do minimal or none. Propose
and complete all tasks as automated as possible and seek my confirmation to proceed or
make edits." That session burned HOURS on avoidable manual work: I picked the cloud-routine
path (which forced the owner to hand-edit secrets into a routine prompt in the claude.ai UI,
couldn't be API-edited without clobbering, echoed secrets on every run, and had a read-only
GitHub integration that couldn't persist), then made the owner edit a JSON config in Notepad
~5 times — his saves kept missing the real file (a `.tunedyota` dot-folder Explorer hides).

**How to apply (default operating mode, not just for n8n):**
- **Pick the most automatable architecture up front.** If one design lets Claude do the
  work with local CLI/files + the owner's own creds and another forces manual UI steps /
  can't be edited programmatically, choose the automatable one — even if it looks slightly
  less "managed." (Local Windows Task Scheduler + a JSON config Claude writes >> a cloud
  routine with secrets embedded in a prompt.)
- **Propose a fully-worked, mostly-automated plan and ask for ONE go/no-go**, then execute
  it yourself end-to-end. Seek confirmation to proceed or before non-trivial edits — don't
  hand back a task list.
- **Never tell the owner to "open a file and edit it."** Claude writes/edits config &
  files directly (Write/Edit/CLI). Verify the write landed (size/mtime/length), don't trust
  "I saved it."
- **For values only the owner has (API keys, webhooks): capture with the least friction and
  zero chat leakage.** Best pattern found: owner copies the value to clipboard → Claude reads
  it via `Get-Clipboard` in the PowerShell tool and writes it into the target file, printing
  only length/validation, never the value. Beats "paste it into this file."
- Batch unavoidable manual steps into the fewest round-trips; anything doable via CLI/HTTP/git,
  just do it and don't narrate it as the owner's step.
- The biggest n8n-specific lever is still **connecting the n8n-mcp MCP server** (URL+key in
  MCP config, not chat) so Claude builds/tests/activates workflows and reads logs directly.

See [[n8n-integration-open-action]], [[search-ai-visibility-program]].
