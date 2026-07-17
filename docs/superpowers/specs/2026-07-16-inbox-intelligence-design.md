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

## Workstream B — drafted replies

**Grounding (live repo data, assembled per email):**
- `markets.js` — match stated city/state → nearest market + installer name; no match →
  the draft asks for location (and the lead, if created, lands Unassigned)
- `netlify/functions/lib/vehicles.json` — starting price for their year/engine
- Events data — next event date for their market
- `docs/email-voice.md` — **owner-editable** voice guide: short, direct,
  overlander-to-overlander, zero AI-speak; includes 3–4 real Q→A examples. Editing this
  file retunes the voice without code changes.

**Qualification rule (encoded):** both location + vehicle known → the draft goes straight
to price + installer + booking link + phone. Either missing → the draft asks for exactly
the missing item(s), nothing else. Thread replies include prior-thread context so the
customer is never re-asked something they already said.

**Hard rule: nothing auto-sends.** Drafts are created in-thread via a new
`createDraft` in `lib/gmail.js` (`drafts.create` with threadId + In-Reply-To/References).

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
- `lib/email-draft.js` — pure grounding assembly: market match, price lookup,
  qualification branching (4 cases: both known / location missing / vehicle missing /
  both missing), thread-context inclusion.
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
