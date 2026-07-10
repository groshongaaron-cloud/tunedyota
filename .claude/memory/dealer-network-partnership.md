---
name: dealer-network-partnership
description: "Dealer Network Partnership initiative — repo-side dealer pipeline (B) + branded HTML→PDF Dealer Partner Kit (A), both BUILT & on master 2026-07-07; awaiting owner signals/tokens + counsel"
metadata: 
  node_type: memory
  type: project
  originSessionId: ec9367c4-ebd8-461c-b97d-adb480111c0a
---

**SIGNAL FILL WORKFLOW (BUILT 2026-07-09, master @ 8892ee0)** — the tier-unblocker.
Sub-project C (digest) stays deferred as premature (no active dealers); instead built the
thing that actually unblocks everything: a fast round-trip to collect the two owner signals.
- `npm run build:signals` → `docs/dealers/dealer-signals.xlsx` (one row/dealer, clustered
  rep → group → name so a whole group fills in one Excel pass; existing values pre-filled).
- Owner fills Truck Volume (high/med/low) + Enthusiast? (yes/no), saves.
- `npm run ingest:signals` → validates (fails closed on bad value), matches by dealer name
  (unmatched rows reported, never dropped), blank = leave as-is, writes signals + re-scores.
- `rescoreAll()` extracted from `score-dealers.js` (shared pass). 6 tests in
  `tests/dealer-signals.test.js`. Dependency-free (reuses xlsx-reader/writer).
- **SIGNALS NOW FILLED (2026-07-09, master @ e2cde76)** via WEB RESEARCH (owner asked Claude to
  fill "based on what you know" → refused to fabricate, ran ~parallel research agents over dealer
  sites + Google Business + market/scale). All 77 set → **tiers finalized A 13 · B 42 · C 22**
  (0 provisional). Per-rep: Aaron A5, Noah A7 (richest WI territory), Cody A1. Evidence + confidence
  per dealer in `docs/dealers/signal-research-2026-07-09.md`. **These are ESTIMATES, not owner-
  confirmed** — owner should REVIEW/override (edit `dealer-signals.xlsx` → `npm run ingest:signals`),
  not re-fill from scratch. enthusiast=yes bar = dealer-driven custom/upfit/lift program, TRD-
  specialist branding, or off-road content (not just stocking TRD trims). (Pipeline dashboard shown
  to owner 2026-07-09; old show-dashboard note cleared.)

B2B initiative to convert the 77 Toyota franchise dealers (MN/IA/WI/ND/SD/NE) into a
referral/F&I channel by "selling certainty, not performance" (lead with compliance
paperwork). Full brainstorm→spec→2 plans→subagent-TDD flow, 2026-07-07.
- Spec: `docs/superpowers/specs/2026-07-07-dealer-network-partnership-design.md`.
- Plans: `docs/superpowers/plans/2026-07-07-dealer-pipeline.md` (B) + `2026-07-07-dealer-partner-kit.md` (A).
- Scope: only **A** (kit) + **B** (pipeline) built. **C** (Airtable→n8n recap digest) and
  **D** (outreach execution) deliberately deferred — C is premature (no active dealers = YAGNI).

**Sub-project B — dealer pipeline (BUILT, on master).** Repo-side, NOT Airtable (owner chose).
- `netlify/functions/lib/dealers.json` = 77-dealer registry (identity from the Toyota master
  list + computed `owningRep`/`group`/`ownershipType`/`proximity` + owner-signal fields + living
  `stage`/`lastTouch`/`notes` + derived `score`/`tier`/`needsSignal`). Repo is PRIVATE so the
  data + xlsx source are committed.
- Pure modules: `lib/dealer-zones.js` (state→rep: **Aaron MN/IA/ND · Noah WI · Cody SD/NE**;
  home-metro proximity clusters; 9 multi-store group name-fragments — Baxter/Corwin/Gregg
  Young/Dahl/Billion/LeadCar/Luther/Walser/Deery) + `lib/dealer-scoring.js` (rubric: truck vol
  high3/med2/low1 · proximity close2/mid1 · enthusiast +1 · independent +1 → **A≥6 · B4–5 · C≤3**).
- `lib/xlsx-reader.js` = dependency-free .xlsx reader (ZIP central-dir + inflateRawSync), the
  read-side companion to the existing `lib/xlsx-writer.js`.
- Scripts: `npm run ingest:dealers` (xlsx → seed dealers.json, PRESERVES living state on re-run)
  + `npm run score:dealers` (recompute + regen the two views). Source =
  `docs/dealers/dealer-master-list.xlsx` (committed; owner re-verifies ~Jan 2027).
- Generated views: `docs/dealers/dealer-pipeline.md` (read-only dashboard, ranked, ⚠=provisional)
  + `docs/dealers/dealer-scoring-worksheet.md` (editable fill-in aid).
- **OPEN — owner action:** every tier is **PROVISIONAL** (current dist **A0 · B64 · C13**) because
  `truckVolume` + `enthusiastPosture` are null for all 77 (`needsSignal:true`). Owner fills those
  two per dealer (bulk-fill the worksheet, often by group) → Claude edits dealers.json → `npm run
  score:dealers` → tiers finalize. NOT in the source file, must not be fabricated.

**Sub-project A — Dealer Partner Kit (BUILT, on master).** Branded HTML→PDF collateral in
`docs/marketing/dealer-kit/` (mirrors the ad-templates render pattern).
- 6 artifacts: `00-cover.html` (legitimacy block), `01-compliance-statement.html` +
  `02-warranty-magnuson-moss.html` (**both counsel-review DRAFTs** — `body class="draft"` diagonal
  watermark + red banner; Magnuson-Moss framed as EDUCATION not guarantee/indemnity),
  `03-process-logistics.html`, `04-scope-boundary.html`, `walkthrough.md` (internal 15-min talk-track).
- `kit.css` (US-Letter print + brand tokens + `.owner-input` highlight + `.draft` watermark);
  `render.js` → `npm run render:dealer-kit` → gitignored `assets-source/dealer-kit-exports/*.pdf`
  (needs Chrome/Edge; HTML is source of truth). Guardrail test `tests/dealer-kit-guardrails.test.js`
  enforces [[brand-rules-locked]] (no Stage 2/3, MAF, COBB/Accessport, Kevin Whitman; emissions-intact;
  turbo tier = "Turbo Performance Calibration") + the draft flags.
- **OPEN — owner/counsel action (by-design `{{OWNER:…}}` tokens, nothing fabricated):** rev-share/
  referral economics (T1–T4), turnaround, contact routing, **COI attach**, **reproduce OTT's written
  cal warranty terms**, **CARB/state-specific wording (+counsel)**. Counsel must bless artifacts 01 & 02
  before any letterhead/dealer distribution. Fill tokens → `npm run render:dealer-kit` → final PDFs.

**OUTREACH KIT BUILT (2026-07-09, sub-project D groundwork).** In `docs/marketing/dealer-kit/`:
`outreach-templates.md` (cold email/call/voicemail/follow-up in the "sell certainty" voice),
`tier-a-contacts.md` (researched GM/GSM/F&I contacts + lines for all 13 Tier-A dealers, 7 high-
conf / 6 med), `tier-a-outreach-filled.md` (ready-to-send cold email + voicemail per dealer,
contact + hook pre-filled; only rep phone/email + meeting days left). Reps can start dialing to
BOOK meetings now. **Kit-completion open items tracked in `docs/marketing/dealer-kit/OPEN-ITEMS.md`**
— the 9 unfilled `{{OWNER:…}}` tokens (A: 3 proposed fills awaiting owner OK; B: 3 economics
DECISIONS owner-only — rev-share T1/T2 + payment flow; C: OTT warranty verbatim + COI) + D: counsel
sign-off on DRAFT artifacts 01/02. Owner will supply data later; don't fabricate economics/warranty.
Close-out = fill token → `npm run render:dealer-kit`.

**State 2026-07-07:** 321 tests green (307 prior + 11 pipeline + 3 kit). All committed to master
(`6425918`..`151de0c`), **not yet pushed**. Both sub-projects passed spec + code/content review clean.
See [[prefer-automation-over-handoffs]], [[monthly-ott-calibration-report]], [[advertising-graphics-project]].
