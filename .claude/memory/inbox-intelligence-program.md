---
name: inbox-intelligence-program
description: "Inbox intelligence LIVE 2026-07-17 (~06:00 UTC): 15-min Gmail sweep (classify → OTT ingest / NEPQ reply drafts, NEVER sends) + 8a/12p/7p CT review digest + OTT provenance chain + Qualified gate. Owner live-verification steps pending; thread-context for thread-reply drafts is the top fast-follow."
metadata:
  node_type: memory
  type: project
---

**SHIPPED LIVE 2026-07-17** (master @ `newer_than:2d` fix, 758 tests green; spec
`docs/superpowers/specs/2026-07-16-inbox-intelligence-design.md`, plan
`docs/superpowers/plans/2026-07-16-inbox-intelligence.md`; built subagent-driven, ~22 commits).

**What runs where:**
- `inbox-sweep` (every 15 min, replaces gmail-lead-poll): Gmail query
  `in:inbox newer_than:2d -label:ty-* -from:me`, CAP 20/tick. Haiku classifies by CONTENT
  (OTT subjects vary — never hardcode); routes: ott-lead → parse (`lib/ott-email.js`, full
  label vocab incl. GHL Link) → LLM-extract fallback → POST /lead-ingest (x-ty-task);
  inquiry/thread-reply/sensitive → Sonnet draft (NEPQ) → Gmail DRAFT in-thread;
  sensitive ALSO Slack-flags; automated/spam → ty-skipped. Labels are the idempotent state
  machine (ty-ingested/ty-drafted/ty-skipped/ty-flagged); errors leave msgs UNLABELED for
  retry; non-transient errors (TypeError etc.) flag+notify; fail-fast `no-task-secret`.
- `inbox-digest` (0 0,13,17 * * * UTC = 7p/8a/12p CDT): counts ONLY drafts in ty-drafted
  threads (52 pre-existing manual drafts polluted the naive count — filtered 2026-07-17),
  emails info@ the list + Slack one-liner; zero drafts = zero noise.
- Drafter grounding: `docs/sales/nepq-playbook.md` (STRATEGY — governs all outbound) +
  `docs/email-voice.md` (TONE) — both owner-editable, no deploy needed; markets.js installer
  match; vehicles.json pricing (word-boundary match, "gx470" works); checkDraftShape enforces
  1-3 questions ending, banned phrases, Aaron sign-off; one retry then ty-flagged.
- **NOTHING auto-sends to customers — createDraft only; Aaron reviews in Gmail.**

**CRM/provenance:** Stage gates now New → Contacted → **Qualified** → Following up → Booked →
Not now (Qualified = routable city + vehicle, auto-set on ingest, channel-agnostic per owner;
`ACTIVE_LEAD_STAGES` derived in installer.html — never re-inline). Lead→booking conversion
stamps `Source: lead:<channel>`; OTT badge chips on lead cards + booking rows (roster `ott`
flag = /(^|[:\s])ott-/i — the hyphen matters: "OTT Update" re-flash source must NOT match).
Monthly OTT report (+send) gains "OTT leads — X received · Y booked · Z completed".

**Go-live verified 2026-07-17:** all env vars present; Gmail drafts.create scope WORKS
(live test); deploy ready. **Owner steps possibly still pending — check before assuming:**
delete the "TEST — inbox intelligence go-live check" draft; personal-address test inquiry
("how much for a tune for my 2019 Tundra?") → verify NEPQ draft shape; optional OTT
forward test (then delete fake lead); confirm first 8am digest; add `GHL Link` column to
Priority List (tolerant writes — works without, link invisible until added).

**Fast-follows:** (1) thread-context fetch for thread-reply drafts (buildDraftPrompt slot
exists, sweep passes ""); (2) digest could dedupe manual drafts even harder via draft-id
tracking if noise reappears. Related: [[booking-model-year-capture]],
[[installer-dashboard-vin-and-ia-program]]; FB/IG + Twilio feeders + 1-2yr AMSOIL backfill
remain parked (see mem0 backlog).
