# SMS Chat Threads — iMessage-style client messaging (design)

Approved by Aaron 2026-07-22. Goal: installer ↔ client texting that looks and
feels like an iPhone message chain, unified with the existing AI chat channels.

## Decisions (owner-approved)

- **Full AI parity on inbound SMS**: a client text gets the same AI treatment as
  Messenger/web chat (answer → detail collection → escalation). The canned
  auto-reply retires (kept only as the failure fallback).
- **Installer-initiated threads are human-only**: the AI never speaks in a
  thread an installer started (`humanOnly` flag on the session).
- **First message of a new installer-initiated thread is prefilled, editable**:
  "Hi {first}, it's {installer} with Tuned Yota about your {vehicle} — ".
- **iMessage UI applies to ALL channels** (web/fb/ig/sms): one inbox, one look.
- Out of scope: websockets, MMS/images, group threads, read-receipt tracking
  (the list shows a needs-reply dot when the last turn is the customer's).

## Architecture

SMS becomes a session channel beside fb:/ig:/web, id = `sms:+1XXXXXXXXXX`,
stored in the existing Chat Sessions table. Mirrors meta-dm's pattern.

1. **Inbound** (`twilio-sms.js`): keyword guard (STOP/HELP — unchanged, silent)
   → installer-cell relay check (unchanged) → `loadActiveByPrefix("sms:+1…")`
   find-or-create → `processChat({session, message, page:"sms"})` → reply
   returned as TwiML `<Message>` (same delivery mechanics as today's canned
   reply; deliverable the moment A2P approves). Lead ingest unchanged. Any
   session/AI failure falls back to today's lead + canned reply — a texter is
   never dropped. Expired session → re-mint with timestamp suffix (meta-dm
   pattern).
2. **Outbound installer turns** (`lib/meta-deliver.js` extended): `sms:`
   sessions send via `sendSms` (Messaging Service once env set). On send
   failure (e.g. A2P 30034 pre-approval): append a system turn
   "⚠ not delivered — SMS pending carrier approval…" + Slack notify, mirroring
   the Meta window-closed pattern. Used by both console replies
   (chat-admin.installerReply) and the installer cell relay.
3. **Thread creation** (`chat.js` installerOp, new op `openSms`): installer-token
   authed; `{phone, name, vehicle}` → normalize to E.164 (10 digits required) →
   find active `sms:` session or create `{id, status:"escalated",
   installer:key, humanOnly:true, customerName, vehicle, phone}` → returns
   `{session, isNew}`. `processChat` skips the AI for `humanOnly` sessions
   (saves the customer turn, notifies the installer, no assistant reply).
4. **Console UI** (`site/installer.html`): **Message** button on lead cards
   (opens/creates the thread, switches to Chats, prefills the compose box when
   `isNew`); thread view rebuilt as bubbles — customer left/grey, installer
   right/blue, AI right/lighter with "AI" tag, system turns centered small,
   iOS-style time clusters (>15 min gaps) + day separators, channel badge
   (💬/📘/📸/📱) in header and list rows, auto-scroll, Enter-to-send; list rows =
   name · snippet · time · needs-reply dot. Polling unchanged (5s thread, 15s list).

## Error handling

- AI/store down on inbound SMS → canned-reply fallback (today's behavior).
- SMS send failure → visible system turn + Slack; the installer turn itself is
  already saved (never lost).
- STOP compliance precedes everything; opt-outs never touch sessions.

## Testing

Unit: twilio-sms session routing (keyword/relay precedence, fallback, re-mint);
openSms auth/validation/find-or-create; humanOnly AI skip; sms delivery branch
incl. failure note. Full suite green before deploy. Live smoke: inbound text →
AI thread; Message button → prefilled compose; send → blocked-state note
(pre-A2P) or delivery (post-A2P).
