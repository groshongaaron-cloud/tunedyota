---
name: installer-phone-numbers
description: The three installers' cell numbers (call-forwarding + contact) — update here if any changes
metadata:
  type: reference
---

Installer cell numbers (E.164), owner-provided 2026-07-15 — used for Twilio call-forwarding and general contact:

- **Aaron** (Twin Cities, MN) — `+16126557611`
- **Cody** (Sioux Falls, SD) — `+16052141335`
- **Noah** (Sheboygan, WI) — `+19208607050`

**If a number changes:** update this file AND the Netlify env `TWILIO_FORWARD_NUMBERS` (comma-separated E.164), which the Twilio voice adapter (`twilio-voice.js`) reads to ring all three cells at once on an inbound call. Current env value = `+16126557611,+16052141335,+19208607050`.

See [[installer-home-bases]] (home cities), [[lead-tracking-program]] (Twilio adapter).

Note: kept in the git-mirrored memory at the owner's explicit request (2026-07-15) for easy access/updating — this **supersedes** the earlier "installer cells go in Netlify config, NOT git/memory" note in [[lead-tracking-program]]. If this repo is ever made public, move these to Netlify-only.
