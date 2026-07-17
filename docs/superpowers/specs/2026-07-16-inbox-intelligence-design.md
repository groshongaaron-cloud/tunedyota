# Inbox Intelligence — OTT lead provenance + drafted replies (design)

**Date:** 2026-07-16 · **Owner approved:** Approach 1 (extend the Netlify stack)

## Goal

Complete the CRM's email intake and cut Aaron's inbox labor:

1. **Every OTT lead is caught** (content-classified, not subject-matched), ingested into
   the lead tracker branded `ott-national`, and that branding survives conversion to a
   booking through close-out — so the monthly OTT report can show **received → booked →
   completed** conversion.
2. **Every customer email gets a drafted reply** in the Tuned Yota voice, saved as a
   Gmail draft (never auto-sent), with Aaron reviewing batches at **8am / noon / 7pm CT**.

## CRM framing

The CRM spine already exists — the lead tracker (`lib/leads.js`, Priority List table):
channels, phase gates, `markets.js` territory routing, and an **Unassigned** bucket for
unknown locations. This spec builds the **email feeder**. Future feeders (out of scope
here) plug into the same `lead-ingest`: Facebook Messenger, Instagram DMs (Meta access or
Business-Suite notification emails — owner to confirm), Twilio SMS/voice (built, parked on
the number port), and the owner's planned **1–2 year historical lead backfill for AMSOIL
marketing** (noted in memory; needs bulk import + dedupe later).

## Phase gates

Stages become: **New → Contacted → Qualified → Following up → Booked → Not now.**

- **Qualified** = location AND vehicle are known (the business's qualification bar).
- Ingestion auto-sets `Qualified` when both arrive with the lead (typical OTT lead);
  otherwise leads enter as `New` and the console's stage buttons include the new gate.
- `ACTIVE_STAGES` includes Qualified. Airtable's Stage select gains the option via
  `typecast: true` on first write (no manual column edit needed; verify on first live row).

## Architecture

Two scheduled functions (Gmail labels are the idempotent state machine, as today):

```
every 15 min: inbox-sweep.js
  list unprocessed inbox messages (no ty-* label, not from ourselves)
  → classify each (Claude Haiku, content-based; subject/From are hints only)
  → route by bucket:
      ott-lead      → parse labels → LLM-extract fallback → POST /lead-ingest
                      (channel ott-national, GHL Link) → label ty-ingested
      inquiry       → grounded draft (Claude Sonnet) → Gmail DRAFT in-thread → ty-drafted
      thread-reply  → same, with prior-thread context → ty-drafted
      sensitive     → cautious draft + Slack flag (notifyOwner) → ty-drafted + ty-flagged
      automated     → ty-skipped
      spam          → ty-skipped
      (low confidence / unknown → treated as sensitive: fail toward a human)

8am / 12pm / 7pm CT (13:00, 17:00, 00:00 UTC): inbox-digest.js
  find ty-drafted messages whose drafts still exist
  → email Aaron a review digest (from · subject · bucket · one-line gist) + Slack one-liner
```

`inbox-sweep` replaces `gmail-lead-poll` (its OTT parse + ingest path is absorbed; the
poller's tests migrate). `netlify.toml` swaps the schedule entries; the scheduled-guardrail
test picks up both new functions.

## Workstream A — OTT provenance chain

1. **Parser** (`lib/ott-email.js`): extend the label vocabulary to the full set — Name,
   Email, Phone, Lead, City, State, Country, Transmission Type, Vehicle Year/Make/Model,
   Engine Size, Engine Modifications, Campaign Name, Ad Set Name, **GHL Link**. GHL Link
   is stored on the lead (tolerant write — a missing Airtable column never blocks
   ingestion). Subject lines vary ("A New Lead From Facebook Ads", "OTT", future variants)
   — classification is by content; labels are parsed when present, and when they've
   drifted, **Haiku extracts** the same fields from prose. If extraction yields neither
   phone nor email, Slack-flag instead of ingesting junk.
2. **Conversion carries the channel**: `lead-update.js` stamps the created booking
   `Source: "lead:<channel>"` (e.g. `lead:ott-national`) instead of today's
   `lead:convert`.
3. **Console badges**: an **OTT** chip on the lead card and on the booking card (visible
   through close-out) when the channel/Source is ott-national.
4. **OTT monthly report** (`ott-report.js`): a conversion section — month's OTT leads
   received / booked / completed — in both the owner's DRAFT approval email and the final
   report OTT receives.

## Workstream B — drafted replies (NEPQ-governed)

**The governing sales framework is `docs/sales/nepq-playbook.md`** (owner-provided
2026-07-16, adapted from "The NEPQ Black Book of Questions"). Every draft is written
against it. The playbook is the strategy; the voice guide is the tone. Both are
owner-editable text files — retune without code changes.

**Grounding (assembled per email):**
- `docs/sales/nepq-playbook.md` — conversation sequence (Connect → Situation → Problem
  → Solution → Consequence → Qualifying → Transition → Commit), channel rules for email
  (2–3 questions max, short paragraphs, end with ONE clear question or micro-commitment),
  money-moment scripts, proposal rules, phrase bank, non-negotiables
- `docs/email-voice.md` — tone: short, direct, overlander-to-overlander, zero AI-speak,
  3–4 real Q→A examples
- `markets.js` — match stated city/state → nearest market + installer name
- `netlify/functions/lib/vehicles.json` — pricing (used ONLY per proposal rules below)
- Events data — next event date for their market

**Stage-aware drafting.** The classifier also estimates the NEPQ stage of the
conversation from the email/thread. The drafter then behaves per the playbook:

- **Cold "how much for a tune?"** → never a bare number. Deflect-with-purpose (§4):
  acknowledge, then ask what they're running and what it's doing that they want changed.
- **"Just send me pricing/info"** → qualify first (§4): ask what they're looking for it
  to do; info goes out only against a committed next step.
- **Discovery underway** (they've shared setup/frustrations) → advance ONE stage: mirror
  their exact words, dig with a clarifier ("why does that bother you though?"), end with
  exactly one question.
- **Ready to book** (explicit intent — "I want the Fargo event", "sign me up") → Stage 8:
  calm, assumptive, low-friction — slot options / booking link / phone, zero added
  friction. NEPQ never blocks a willing booker.
- **Quotes** follow §5: restate THEIR stated problems/goals in their words before any
  number; three options (basic / core / premium) built from the platform's real price
  tiers; actionable close ("reply YES and I'll slot you in" / booking link).
- **Objections** (warranty, think-about-it, spouse, price-shopper) → the matching §4
  script pattern, never argument.
- **Complaints/upset** → §7 pattern (ask, don't defend) AND the sensitive-bucket Slack
  flag so Aaron sees it immediately.

The **Qualified phase gate** maps to NEPQ Stage 2 (Situation): a lead is Qualified when
location + vehicle are known. This supersedes the earlier straight-to-price rule —
price timing now follows the playbook, not field completeness.

**Subject lines** on new threads reference THEIR situation, never our product.

**Hard rules:** nothing auto-sends — drafts are created in-thread via a new
`createDraft` in `lib/gmail.js` (`drafts.create` with threadId + In-Reply-To/References).
Every draft ends with exactly one question or one micro-commitment. No pressure
language (the playbook's banned-phrase list is enforced in the prompt).

## Safety & cost

- Per-message try/catch — one bad email never kills a sweep; unprocessed mail retries
  next tick (proven pattern).
- ~20-message cap per sweep bounds cost and rate limits.
- Email content goes to Anthropic transiently (classify/draft), never stored — same
  posture as VIN OCR.
- Cost: Haiku classify ≈ $0.001/email; Sonnet draft ≈ $0.02–0.03 → a few dollars/month.
- Models: `claude-haiku-4-5` (classify/extract), `claude-sonnet-4-6` (drafts).

## Prerequisites

1. **Gmail OAuth scope** — draft creation needs compose/modify scope. The token already
   sends replies, so it likely suffices; verify on the first live draft, else a one-time
   owner re-consent.
2. `ANTHROPIC_API_KEY` — already live in Netlify (set 2026-07-16 for VIN OCR).
3. Airtable: optional new Priority List columns (`GHL Link`) — tolerant writes mean the
   system works before the column exists; add it to actually see the link.

## Testing (TDD, node:test, injected deps)

- `lib/email-classify.js` — pure prompt build + response parse; unknown/garbage responses
  classify as `sensitive`.
- `lib/email-draft.js` — pure grounding assembly: market match, price lookup, NEPQ
  stage branching (cold price-ask deflects · discovery advances one stage · ready-to-book
  goes straight to scheduling · quote follows §5 three-option shape), thread-context
  inclusion. Draft-shape checks: ends with exactly one question/micro-commitment; no
  banned pressure phrases; no bare price on a cold ask.
- `lib/ott-email.js` — new fields incl. GHL Link; extraction fallback shape parity.
- `lead-update.js` — Source carries the channel.
- `ott-report.js` — conversion-section math from injected lead + booking rows.
- `inbox-sweep.js` / `inbox-digest.js` — routing + digest selection with stubbed gmail.
- Rollout: first days, drafts accumulate under `ty-drafted` for spot-checking before the
  digest rhythm is trusted.

## Out of scope (this spec)

- Facebook / Instagram feeders (parked: Meta access or notification-email answer).
- Twilio feeder activation (parked on the number port).
- Historical backfill + AMSOIL campaign (noted in memory as a future item).
- Auto-sending any category (revisit only after weeks of accepted-draft data).
