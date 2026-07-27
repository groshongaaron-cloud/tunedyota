# Installer Console: Two-Way Chat Relay, AI Pause, Booking Delete

**Date:** 2026-07-27
**Status:** Approved by Aaron (design conversation, this date)
**Scope:** Installer console chat pipeline + booking record actions

## Problem

1. **Escalated chats "disappear" from the installer's phone.** The escalation SMS to
   the installer's personal phone fires exactly once, at the moment the AI escalates
   (`netlify/functions/chat.js` `escalate()`). Every later client message triggers only
   a web push. From the field it looks like the conversation vanished after the first
   reply.
2. **The AI keeps auto-replying after a human takes over.** There is no
   human-takeover pause; escalated sessions still run the AI on every client turn.
3. **Escalated sessions go stale after 2 hours** (`STALE_ESCALATED_MS` in
   `netlify/functions/lib/chat-store.js`). After that, an installer's SMS reply finds
   no active session and is ingested as a *new customer lead*; a client follow-up
   starts a fresh, un-escalated AI session.
4. **Installer replies can route to the wrong client.** `loadEscalatedForInstaller()`
   returns the most-recently-*active* escalated session, which is not necessarily the
   client the installer is replying to.
5. **No booking delete for installers.** Erroneous/duplicate bookings can only be
   removed by the owner via the token-gated OTT console
   (`netlify/functions/ott-report-review.js`).

Booking date/time/address editing is NOT a gap — it shipped 2026-07-24 (6d1da89) via
the card details expander → `installer-reschedule.js`. The gap is discoverability.

## Decisions (made with Aaron)

- Full two-way SMS relay, **labeled single chain** (one thread from the TY Twilio
  number; no per-client proxy number pool for now).
- **Centralized intake:** every escalated chat lands on Aaron's phone (612-655-7611)
  first; Aaron dispatches each thread to Cody, Noah, or any future installer (or
  handles it himself). Relay follows the assigned installer after dispatch.
- Console chat remains a first-class surface; both surfaces share the same thread.
- AI pause: 72 hours, rolling from the installer's **latest** reply; AI keeps covering
  until the installer's **first** reply. Additionally, installers get a **manual AI
  on/off toggle** per thread in the console that overrides the automatic behavior.
- Booking delete: **soft-cancel with Undo**, then **auto-purge after 30 days** of
  Cancelled status (permanent Airtable delete). Owner's OTT hard delete unchanged.

## Design

### 1. Two-way SMS relay with centralized dispatch

**Intake (dispatcher-first):** when a session escalates, it is **not** auto-assigned
by market routing. The escalation SMS and all subsequent client-message relays go to
the **dispatcher** — a new `CHAT_DISPATCHER` env var naming an installer key
(default `aaron`; his number, 612-655-7611, lives in the existing
`INSTALLER_SMS_NUMBERS` map — no hardcoded numbers). The session's `Installer` field
stays empty until dispatched, so it also appears as unassigned in every console inbox
(existing behavior).

**Dispatch** — two paths, same result (`assignSession()` already exists):

- **From Aaron's phone:** reply `@cody`, `@noah`, etc. (any installer key, `@`
  optional) to the relay chain. The command applies to the most-recently-relayed
  thread — same routing rule as normal replies. It is consumed as a command, not
  forwarded to the client.
- **From the console:** an Assign control on the thread (dropdown of installer keys),
  wired to the existing `assignSession` op.

On dispatch, the assignee gets a **handoff SMS** (thread label + the client's latest
message + "you've got this thread"), and all subsequent relays for that thread go to
the assignee only — Aaron stops receiving them on his phone but can always watch or
jump in via the console. If Aaron replies with normal text while a thread is
unassigned, he is simply handling it himself (the reply relays to the client and
assigns the thread to him, matching `installerReply`'s existing claim-if-unassigned
behavior). The first relay of each new thread appends a one-line hint:
`Reply to answer, or @cody / @noah to dispatch.`

**Relay trigger:** every client turn appended to a session with `Status="escalated"`
— regardless of inbound channel (Twilio SMS, web chat widget, Meta FB/IG DM). Target
is the assigned installer, or the dispatcher while unassigned.

**Relay format:** send an SMS to the target's personal number
(`smsNumberFor(key, env)`, honoring `INSTALLER_SMS_NUMBERS` overrides), formatted:

```
TY · {Customer Name} · '{yy} {Model} · {NEW|RETURNING}
"{client message text}"
```

- **NEW vs RETURNING:** lookup by client phone (fallback email) against the Bookings
  table; a prior `Status="Completed"` booking → `RETURNING`, else `NEW`. Lookup is
  best-effort; on error or no contact info, omit the tag rather than fail the relay.
- **Multi-chat warning:** if 2+ non-stale threads are currently relaying to this
  person (for the dispatcher that includes all unassigned threads), append
  `⚠ N active chats — reply goes to {this customer}; switch in console.`
- Existing web push on client turns is kept.
- Relay failures follow the existing delivery-failure pattern (system turn + Slack
  notify); a failed relay must never block saving the client turn or the AI/pause
  logic.

**Reply routing fix:** add a `Last Relayed At` field (ISO timestamp) to the Chat
Sessions table, stamped each time a client turn is forwarded to the installer's phone.
`relayInstallerReply()` (`netlify/functions/twilio-sms.js`) routes the installer's
inbound SMS to the session with the greatest `Last Relayed At` **for that person**
(assigned-to-them, or unassigned-and-relayed-to-dispatcher) — i.e., the client whose
message most recently hit their phone — instead of most-recent-activity. Dispatch
commands (`@key`) are parsed before this routing and consumed. Sessions without the
field sort last (legacy-safe). Console replies are addressed to an explicit session
ID and are unaffected.

**Staleness:** `STALE_ESCALATED_MS` changes from 2 h to **72 h**. Consequences
accepted: escalated threads linger up to 72 h in the console inbox (the existing
Close action remains the way to end one early), and client follow-ups within 72 h
continue the same thread.

### 2. 72-hour AI pause + manual per-thread toggle

**Storage:** new `AI Mode` field on Chat Sessions: `auto` (default) | `on` | `off`.

**Effective logic** in the chat-processing path (`processChat`), before invoking the
AI:

- `off`: AI never replies on this thread.
- `on`: AI always replies (overrides the automatic pause — e.g., installer hands the
  thread back to the AI before 72 h are up).
- `auto` (default): scan the session's turns for the latest `role="installer"` turn;
  if it exists and is within 72 h of now, **skip the AI** — still save the client
  turn, still relay, still fire push. Rolling window: every installer reply (phone or
  console) restarts the clock. Before the first installer reply, the AI keeps
  covering so the client is never left hanging.

**Console UI:** each thread shows a compact **"AI replies" on/off control** (radio /
toggle) reflecting the *effective* state right now. Flipping it writes an explicit
`on`/`off` to `AI Mode`; a small "auto" affordance resets to the default automatic
behavior. Never blocks — flip takes effect on the next client message.

- 72 h constant lives beside the staleness constants in `chat-store.js` (or a shared
  config) — one place to tune later.
- Legacy sessions without `AI Mode` behave as `auto`.

### 3. Booking soft-delete + 30-day purge

**Schema:** ensure `Cancelled At` (text, ISO) and `Cancelled By` (text, installer key)
columns on Bookings via the existing ensure-field script
(`scripts/airtable/ensure-field.mjs`; Airtable token has schema scope).

**Backend:** two new ops added to `installer-closeout.js` (it already owns booking
status transitions and has the auth/ownership plumbing):

- `cancel`: requires installer auth (`resolveInstaller()`); owner-of-booking or admin
  (`INSTALLER_ADMINS`). Only `Status` not in {Completed, Cancelled}. Sets
  `Status="Cancelled"`, `Cancelled At=now`, `Cancelled By=key`.
- `uncancel` (Undo): same auth; only if `Status="Cancelled"`. Restores
  `Status="Booked"`, clears `Cancelled At`/`Cancelled By`.

**Console UI (`site/installer.html`):**

- Delete control on the booking card (in the details area, styled as destructive).
- Tap → optimistic removal from roster/calendar (they already filter
  `{Status}!="Cancelled"`) + an **Undo toast** (~10 s). Undo calls `uncancel` and the
  booking reappears highlighted, per the console UX rule (no silent outcomes, action
  ends with the booking visible).
- No blocking confirm dialog — Undo is the safety net (owner-freedom rule).

**Purge:** a Netlify **scheduled function** (daily) deletes Bookings where
`Status="Cancelled"` AND `Cancelled At` is a valid timestamp older than 30 days.
Records without `Cancelled At` (anything cancelled before this ships, or cancelled by
other tools) are **never** purged. Log a Slack/console line per purge run with the
count.

**Out of scope:** cascading cleanup of side-effects (sent emails, Slack pings, .ics
invites) — accepted; soft-cancel means nothing is orphaned mid-flight.

### 4. Reschedule editor discoverability (polish)

The date/time/address editor exists and works. Change: replace the subtle expander
affordance with a visible `✏️ Edit` control on the card face (same expander body,
same `installer-reschedule.js` backend). No backend change. Follow-up outside code:
tell Cody/Noah the editor exists.

## Testing

Unit tests (existing test setup/patterns in repo):

- Relay fires on client turns for escalated sessions on all three channels; targets
  dispatcher while unassigned, assignee after dispatch; correct label format;
  NEW/RETURNING lookup incl. no-match and error paths; multi-chat warning line at 2+
  active threads; dispatch hint on first relay of a new thread.
- Dispatch: `@cody` from the dispatcher's number assigns the most-recently-relayed
  thread, sends the handoff SMS, and is not forwarded to the client; unknown `@key`
  is treated as a normal reply-attempt (or safe error back to dispatcher); plain-text
  reply from dispatcher on an unassigned thread claims + relays; console Assign
  path produces the same handoff.
- Reply routing picks max `Last Relayed At` among threads relaying to that person;
  legacy sessions without the field don't win over stamped ones; installer reply
  after 3 h (previously dead) now relays.
- AI pause/toggle: `auto` + installer turn 1 h ago → AI skipped; 73 h ago → AI runs;
  no installer turn → AI runs; console and phone replies both count; `off` always
  skips; `on` runs even inside the 72 h window; missing `AI Mode` = `auto`.
- Cancel/uncancel: auth + ownership, Completed locked, field writes, uncancel
  restores.
- Purge: deletes only Cancelled + stamped + >30 d; leaves unstamped Cancelled rows.

Full suite green → commit → push (standing repo rule).

## Rollout notes

- `Last Relayed At`, `AI Mode`, `Cancelled At`, `Cancelled By` columns created
  idempotently before deploy; `CHAT_DISPATCHER=aaron` set in Netlify env and Aaron's
  612-655-7611 confirmed present in `INSTALLER_SMS_NUMBERS`.
- Dispatcher intake concentrates all escalation SMS on Aaron's phone — watch volume
  the first week; the `@key` dispatch command is the pressure valve.
- Behavior change to watch post-deploy: installers will now receive one SMS per
  client message — confirm A2P campaign traffic stays within expected volume.
- Meta channels: relay applies to escalated FB/IG sessions identically (delivery to
  the *client* stays on the Meta channel; only the installer notification is SMS).
