# SMS Tapback Reactions: Intercept and Quiet

**Date:** 2026-07-27
**Status:** Approved by Aaron (follow-up from the 2026-07-27 chat-relay smoke test)
**Scope:** Twilio SMS inbound path only

## Problem

iPhones texting a non-iMessage number convert Tapback reactions into literal SMS
bodies (`Laughed at "Cody here to save the day"`). Observed live during the
2026-07-27 smoke. Today such a text is treated as a real message in both
directions:

- **Client reaction** → ingested as a NEW lead, stored as a user turn, relayed
  to the working installer's phone (escalated thread) or **answered by the AI**
  (ai-status session).
- **Installer reaction** → `relayInstallerReply` forwards it verbatim to the
  client as if the installer typed it.

## Decision (Aaron, 2026-07-27)

Keep reactions **in the transcript** as quiet system notes (they're real
acknowledgment signal in the console) and **silence everything else**: no AI
reply, no relay SMS, no lead, no delivery to the client.

## Design

### Detection — `isTapbackText(body)` in `netlify/functions/lib/twilio.js`

Lives beside `smsKeywordType` (same kind of inbound-body classification).
Matches, case-sensitively, the formats Apple emits:

- `^(Loved|Liked|Disliked|Laughed at|Emphasized|Questioned) [“"]` … ending in `[”"]`
- `^Reacted .{1,12} to [“"]` … ending in `[”"]` (emoji reactions)

The verb must be immediately followed by a space and an opening quote (straight
or curly), and the body must end with a closing quote — so a genuine sentence
("Loved the tune, thanks!") can never be swallowed. Exported.

### Client reactions — `twilio-sms.js` handler

After the signature + STOP/HELP checks and the installer-relay attempt, before
lead ingest: if `isTapbackText(params.Body)`:

1. Skip lead ingest and skip `processChat` entirely (no AI, no relay, no lead).
2. Best-effort transcript note: `loadActiveByPrefix("sms:" + From)`; if an
   active session exists, append `{ role: "system", text: `(reaction) ${body}`,
   at: now }` and save. Store failure is non-fatal.
3. Return empty TwiML.

No active session → the reaction is simply consumed (a reaction with no
conversation has no home).

### Installer reactions — top of `relayInstallerReply` in `twilio-sms.js`

After the sender is identified as an installer and the text is non-blank: if
`isTapbackText(clean)`, find their current relay-target session; if found,
append the same `(reaction)` system turn and save — **never** call
`deliverInstallerTurn`, so nothing reaches the client. With or without a
session, return `{ relayed: true }` (consumed — an installer's reaction must
never fall through to the lead/AI path).

### Out of scope

- Meta reactions (separate webhook events the DM feeder already ignores) and
  the web widget (no reactions exist).
- `processChat` is untouched.

## Tests

- `isTapbackText`: all six verb forms + `Reacted 😂 to "…"` (straight and curly
  quotes) match; near-misses don't: `Loved the tune, thanks!`, `Liked it a lot`,
  `Questioned whether it fits`, empty/null.
- Client reaction: no ingest, no chat call, transcript gains the system note
  when a session exists, empty TwiML; no session → consumed, nothing stored.
- Installer reaction: consumed, no delivery to client, system note stored when
  a thread exists.
- Plain client and installer messages flow exactly as before (regression).
