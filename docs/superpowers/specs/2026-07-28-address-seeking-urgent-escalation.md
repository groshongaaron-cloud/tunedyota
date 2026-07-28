# Urgent Escalation: Address-Seeking / "On My Way" Tripwire

**Date:** 2026-07-28 · **Status:** SPEC — awaiting Aaron's approval to build
**Incident:** session `sms:+16512781401`, 2026-07-28 ~4:41–4:52pm CT — customer
claimed a phone conversation authorized a same-day visit, sent the interim
Lakeville home address + a dropped map pin + "On my way." The AI deflected
politely, never escalated (customer never supplied the structured contact
fields the transfer tool wants), the thread closed, and no human was pinged.
Aaron discovered it hours later by accident, via a Calls-tab bug.

## Problem statement

Escalation is 100% dependent on the LLM electing `transfer_to_installer` AND
collecting its required fields (name, contact, vehicle, city). A customer who
is *already acting* — heading somewhere, sharing an address, dropping a pin —
doesn't cooperate with an intake flow. The one category of message where
minutes matter is exactly the category the current design can miss.

## Design principle

**Deterministic tripwire, not smarter prompting.** The LLM already failed this
case while behaving "reasonably." Detection of visit-intent must be a regex
layer in `processChat` that fires before and independent of the model, on
every channel (web widget, SMS, Messenger, Instagram — they all funnel through
`processChat`). Prompt improvements are a secondary layer, not the safety net.

## Detection (Tier A — deterministic, auto-escalates)

Case-insensitive match on each inbound client turn:

1. **Visit intent:** `on my way`, `omw`, `on the way`, `headed (your|that) way`,
   `heading (over|down|to you)`, `com(e|ing) (by|down|over|to you)`,
   `stop by`, `swing by`, `walk[- ]?in`, `leaving now`, `be there (in|at|by)`,
   `see you (soon|tonight|in)`
2. **Map pins:** any URL matching
   `maps\.apple\.com|maps\.app\.goo\.gl|goo\.gl/maps|google\.[a-z.]+/maps`
3. **Home-address echo:** any fragment from `TY_ADDRESS_FRAGMENTS` env
   (comma-separated; initial value `18758,iden av`). Env, not hardcode — the
   garage-condo move changes the address in ONE place, alongside the
   GBP/schema one-pass update already planned.

False-positive posture: **bias to fire.** Cost of a false positive is one
ignorable SMS to the dispatcher; cost of a false negative is a stranger at the
house. "On my way to work" firing occasionally is acceptable and expected.
Deliberately EXCLUDED from Tier A: bare "address"/"location" questions —
event-address questions are routine; those stay with the LLM (Tier B).

## Action when tripped (once per session)

In `processChat`, immediately after the user turn is pushed, before the
escalated-relay branch:

1. **Skip if already tripped** (session flag `urgentAt`, ISO timestamp — also
   the audit trail) — one urgent SMS per thread, later turns relay normally.
2. **Escalate WITHOUT the transfer payload** — a new lean path (`urgentEscalate`),
   NOT the existing `escalate()` (which formats a structured transfer):
   - `sess.status = "escalated"`, `sess.installer = ""` (dispatcher-first, same
     as normal escalation), `lastRelayedAt = now` (so phone replies route here)
   - SMS to dispatcher:
     `⚠ URGENT — customer may be COMING TO YOU. "<last message, 160 chars>"
     — <phone or channel> · <name if known> · thread already open in console.
     Reply to this text to reach them, or @cody / @noah to dispatch.`
   - Web push (same as escalation), escalation log row with
     `Reason: "urgent-visit-intent"`, lead ingest best-effort with whatever
     identity the session has (phone is always known on sms: threads)
   - Slack notify as backup (`notifyOwner`), since SMS can fail
3. **AI reply for that turn is fixed copy, no model call:**
   "I've flagged this straight to Aaron — he'll reach you directly in a few
   minutes. Please don't head anywhere until you hear from him; nothing is
   confirmed except through him."
4. Save; return. Subsequent client turns follow the normal escalated relay
   (they hit the dispatcher's phone).

## Tier B — prompt hardening (secondary)

Add to the chat agent system prompt: when a customer asks where to come, says
they're coming, or references an in-person meeting not tied to a listed event,
call `transfer_to_installer` immediately with whatever fields are known rather
than continuing to deflect; never state or confirm any address other than
published event addresses.

## Explicitly out of scope (v1)

- No auto-reply with legal language, no threats, no location denial games —
  the fixed copy is calm and routes to a human.
- No attempt to distinguish "friendly customer misunderstanding" from worse —
  that's the human's judgment call, which is the whole point.
- No blocking of the customer; thread stays open and relayed.

## Test plan (TDD)

- Detector: positives from the real transcript ("Send me that address and I'll
  be on my way", "On my way", apple-maps pin URL, "18758 iden ave"); negatives:
  "what's the address for the Madison event?" (Tier A silent), "my address is
  123 Oak St, Des Moines" (customer giving THEIR address — silent; no visit verb,
  no pin, no TY fragment).
- processChat: trips once → status escalated + SMS body contains URGENT + fixed
  reply + no model call; second message same session → normal relay, no second
  urgent SMS; already-escalated session → no re-fire; works for `sms:`, web,
  `fb:` ids; env fragments respected; SMS failure still saves turn + Slack.
- Full suite green; no change to normal transfer-tool escalation behavior.

## Rollout

Implement behind nothing — this ships on. Smoke: text the business line
"on my way" from a test phone; expect dispatcher SMS within seconds, fixed
reply back, thread escalated in console. Update
`docs/operations/` chat runbook and the incident note in memory.
