---
name: dealer-network-partnership
description: "Dealer Network Partnership initiative — repo-side dealer pipeline (B) + branded HTML→PDF Dealer Partner Kit (A), both BUILT & on master 2026-07-07; awaiting owner signals/tokens + counsel"
metadata: 
  node_type: memory
  type: project
  originSessionId: ec9367c4-ebd8-461c-b97d-adb480111c0a
---

**► NEXT-SESSION NOTE (owner request 2026-07-07):** at the start of the next session,
proactively SHOW the owner the pipeline dashboard `docs/dealers/dealer-pipeline.md`
(read + present it). Then clear this note.

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

**State 2026-07-07:** 321 tests green (307 prior + 11 pipeline + 3 kit). All committed to master
(`6425918`..`151de0c`), **not yet pushed**. Both sub-projects passed spec + code/content review clean.
See [[prefer-automation-over-handoffs]], [[monthly-ott-calibration-report]], [[advertising-graphics-project]].
