# Chat Session Duplicate-Create Race: Converge + Dedup

**Date:** 2026-07-27
**Status:** Approved by Aaron
**Scope:** `lib/chat-store.js` create path, `chat.js` sid dedup, `twilio-sms.js` sid pass-through, one-off data cleanup

## Problem (observed live 2026-07-27)

Twilio delivered the same inbound SMS twice ~0.9 s apart (`sms:+12245483604`).
Both invocations ran concurrently; each `loadSession` found nothing (the ~2.5 s
AI call is the race window between check and create), so each created its own
"Chat Sessions" record — two records, one Session ID, created 91 ms apart
(`recniuXnX…` 16:20:01.897 → live thread; `recYQA8me…` 16:20:01.988 →
abandoned). Airtable has no unique constraint. Reads tolerate duplicates
(oldest-Created wins) but the orphan sits in the table and different query
paths could disagree.

## Design

### 1. Create-guard in `saveSession` (`lib/chat-store.js`)

After a CREATE (not updates), best-effort `dedupeAfterCreate(sess)`:

- Re-query records for the Session ID; consider only non-`closed` records
  (a closed thread must never swallow a new conversation).
- Fewer than 2 live records → done.
- Canonical winner = oldest `Created`, record-ID tiebreak — the same rule
  `loadSession` uses to read. Deterministic on both racers.
- If OUR record is the winner → done (the other racer will clean itself up).
- Otherwise we are the loser: merge into the winner any of our turns the
  winner lacks — matched by **role+text, ignoring timestamps**, because raced
  duplicates are the same message processed twice with different `at` values
  and must NOT double the transcript — carry forward customer metadata the
  winner lacks (name/phone/vehicle/city/installer), escalation status, and the
  newest `lastRelayedAt`; save the winner; **delete our own record**; repoint
  `sess.recordId` at the winner so any later save in this invocation updates it.
- Any guard failure is swallowed: behavior degrades to today's
  (duplicate exists, reads pick the oldest). The guard can never make things
  worse than the status quo.

### 2. MessageSid dedup (mirrors the Meta channel's `mid` check)

`twilio-sms.js` passes `sid: params.MessageSid` into `processChat` (both the
normal and expired-retry calls). `processChat` stamps the user turn with
`sid` and, when an incoming `sid` already exists on any turn of the loaded
session, returns `{reply:"", duplicate:true}` **before** the turn push — so a
sequential Twilio redelivery runs no AI, sends no relay SMS, and stores
nothing. (Truly concurrent deliveries still each run the AI — accepted; the
create-guard converges their storage.)

### 3. One-off cleanup

Delete the abandoned `recYQA8me…` record. Its two turns are semantic
duplicates of the live record's first exchange (same texts, raced
timestamps) — merging would double the transcript, so deletion is correct.

## Tests

- Create-guard: loser deletes self + merges only genuinely-missing turns
  (role+text match) + repoints recordId; winner path no-ops; a `closed`
  co-record is never merged into; guard exception leaves the created record
  intact.
- Sid dedup: duplicate sid → no AI, no relay, no save, `duplicate:true`; new
  messages stamp `sid` on the user turn; twilio-sms passes `MessageSid`
  through on both call sites.
- Regression: plain create/update paths unchanged.
