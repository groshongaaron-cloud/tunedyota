# Dealer Network Partnership — Design Spec

**Date:** 2026-07-07
**Status:** Approved for planning
**Source brief:** "Tuned Yota — Dealer Network Partnership Strategy" (2026-07-07)
**Scope of THIS spec:** Sub-projects **A** (Dealer Partner Kit) and **B** (Dealer pipeline),
built in parallel. Sub-projects **C** (partner recap digest) and **D** (outreach execution)
are explicitly **out of scope** — C is premature (no active dealers to report on yet = YAGNI),
D is human relationship work. The 15-minute walkthrough talk-track lives in A.

---

## 0. Goal & guiding principle

Convert the 77-dealer Toyota franchise network (MN/IA/WI/ND/SD/NE) from "unknown aftermarket
risk" into a B2B referral/F&I channel by **selling certainty, not performance** — lead with
compliance and documentation. This spec delivers two things:

- **A — the paperwork** a rep hands a nervous GM (the Dealer Partner Kit).
- **B — the pipeline** that turns a 77-row list into a prioritized, rep-assigned, stage-tracked
  prospecting system.

The repo is **private** (confirmed during prior OTT work), so committing dealer identity data
and internal strategy/scoring is acceptable.

---

## Part A — Dealer Partner Kit

### A.1 Home & rendering

- New directory **`docs/marketing/dealer-kit/`** — one HTML source per artifact, styled with the
  same brand tokens/patterns as `docs/marketing/ad-templates/` (draw tone from the existing
  `emissions-intact.html` template).
- **`docs/marketing/dealer-kit/render.mjs`** — adapted from `ad-templates/render.js`, but
  **print-to-PDF at US Letter** via headless Chrome (not fixed-pixel screenshot). Exports each
  artifact to **`assets-source/dealer-kit-exports/`** (gitignored, mirroring the ad-exports
  convention). The HTML sources are the version-controlled source of truth; PDFs are build output.

### A.2 Artifacts (6)

1. **Kit cover / index** — "Tuned Yota Dealer Partner Kit," a contents list, and the legitimacy
   block: OTT Authorized Installer · insured · every job documented and certificated.
2. **Emissions-Intact Compliance Statement** — explicit list of emissions systems and monitors
   **not** touched; no defeat devices; careful CARB/EPA posture. *Owner + counsel finishing.*
3. **Magnuson-Moss Warranty Education one-pager** — accurate, **education-framed** draft of the
   Magnuson-Moss principle (a warrantor generally cannot void an entire warranty merely because
   aftermarket parts/service were used; burden is on the warrantor to tie a specific failure to
   the modification) combined with the emissions-intact scope. **Watermarked/labeled
   `DRAFT — COUNSEL-REVIEW-REQUIRED`.** Positioned as education, never a guarantee or indemnity.
4. **Process & Logistics sheet** — scheduling, the mobile/service-area model, payment + rev-share
   flow, turnaround, and contact routing. *Contains owner-input fields (see A.4).*
5. **Scope-Boundary sheet** — what Tuned Yota does / does not do, framed so it reads complementary
   to (not competitive with) the dealer's own service and accessories revenue.
6. **15-minute walkthrough talk-track** — internal **markdown** (`docs/marketing/dealer-kit/walkthrough.md`),
   a page-by-page script the rep uses when dropping the kit. Not a rendered PDF.

### A.3 Brand guardrails (enforced; grep before ship per `brand-rules-locked`)

Emissions-intact throughout; turbo tier labeled **only** "Turbo Performance Calibration"; **no**
"Stage 2/3," **no** "MAF tune," **no** COBB/Accessport references, **no** "Kevin Whitman." A grep
gate for these strings runs before any dealer-kit content ships.

### A.4 Owner-input fields (marked, never fabricated)

Same discipline as the SEO/calibration gaps — placeholders are explicit, values are never invented:

- Referral fee / rev-share economics for tiers T1–T4 (Process sheet).
- Turnaround time and payment flow specifics (Process sheet).
- Contact routing (who/what number/email a dealer reaches).
- Certificate of Insurance (COI) — owner attaches; not producible by Claude.
- Verified OTT calibration warranty terms — must be reproduced accurately ("who backs the cal?").
- Counsel sign-off on artifacts 2 and 3 before they go on letterhead.

---

## Part B — Dealer pipeline (repo-side)

### B.1 Data reality

The provided `docs/dealers/dealer-master-list.xlsx` is the **identity layer only** — the Toyota
master dealer list. Verified columns: `State · Abbrev · Dealer Name · City · Street Address · ZIP
· Source URL · Notes`. Row count matches the brief exactly: **77** (MN 17, IA 16, ND 7, WI 23,
SD 5, NE 9). It contains **no scoring signals** (no truck volume, enthusiast posture, ownership
type, or contact).

### B.2 Registry — `netlify/functions/lib/dealers.json`

Array of dealer objects. Fields:

- **Identity (from file):** `name`, `city`, `state` (2-letter), `address`, `zip`, `sourceUrl`.
- **Computed now:**
  - `owningRep` — `aaron` | `noah` | `cody`, from the state→zone map (B.4).
  - `group` — nullable; name-matched against the §5.1 group list (B.5). `null` = independent/unknown.
  - `ownershipType` — `group` | `independent`, **inferred** from `group` match; carries
    `ownershipInferred: true` so it's never mistaken for confirmed data.
  - `proximity` — `close` | `mid`, best-effort from home-metro city clusters (B.4); owner-overridable.
- **Owner-input (default `null`):** `truckVolume` (`high`|`med`|`low`), `enthusiastPosture` (bool).
- **Living pipeline state:** `stage` (`Prospect` → `Contacted` → `Kit Sent` → `Pilot` → `Active`,
  default `Prospect`), `lastTouch` (ISO date, nullable), `notes` (string).
- **Derived score fields (written by the scorer):** `score` (int), `tier` (`A`|`B`|`C`),
  `needsSignal` (bool — `true` while `truckVolume` or `enthusiastPosture` is `null`).

### B.3 Scorer — `scripts/score-dealers.mjs`

Reads the registry, computes `score`/`tier`/`needsSignal`, (re)assigns `owningRep`, tags `group`,
infers `ownershipType`, sets best-effort `proximity`; **idempotent** (safe to re-run). Writes the
computed fields back to `dealers.json` and regenerates the outputs (B.6).

**Rubric (transparent point model):**

| Factor | Points |
|---|---|
| Truck volume | high 3 · med 2 · low 1 · *(null → treated as med=2 for provisional score)* |
| Proximity to owning rep | close 2 · mid 1 |
| Enthusiast posture | +1 if true · *(null → 0)* |
| Independent/family ownership | +1 |
| **Tier thresholds** | **A** ≥ 6 · **B** 4–5 · **C** ≤ 3 |

- **Provisional vs final:** while `truckVolume` or `enthusiastPosture` is `null`, the dealer is
  scored with the noted defaults and flagged `needsSignal: true`. The tier is real but marked
  provisional in the output. Once the owner supplies both signals, `needsSignal` clears and the
  tier is final.
- **Groups are tagged, not auto-boosted** — a `group` flag enables group-level plays; it does not
  by itself raise the individual score (independent ownership is what gets the +1, so genuine
  independents are not penalized).

### B.4 Zone map & proximity

- **State → rep:** Aaron = MN, IA, ND · Noah = WI · Cody = SD, NE. (Mirrors the §5.2 coverage map;
  rep home bases per `installer-home-bases`: Aaron = Twin Cities/Rosemount, Cody = Sioux Falls,
  Noah = Sheboygan.)
- **Proximity (best-effort):** a per-rep home-metro city cluster list (e.g. Twin Cities suburbs for
  Aaron) → `close`; every other city in that rep's states → `mid`. No geocoding; owner can override
  any `proximity` value in the registry.

### B.5 Multi-store groups

Tag from a maintained group→name-fragment map derived from §5.1: Baxter, Corwin, Gregg Young, Dahl,
Billion, LeadCar, Luther, Walser (Rudy Luther), Deery (and others discovered during ingest by
scanning dealer names). Matching is by name substring; unmatched dealers get `group: null`.

### B.6 Outputs

- **`docs/dealers/dealer-pipeline.md`** — generated, human-readable: ranked A-first, grouped by
  rep, multi-store groups flagged, with tier/stage counts and a legend. This is the team's at-a-glance view.
- **`docs/dealers/dealer-scoring-worksheet.md`** — a **separate** generated fill-in aid: every
  dealer grouped by rep with blank `truckVolume` / `enthusiastPosture` columns, so the owner can
  bulk-fill (often by group) and hand it back for re-scoring. Kept separate from the pipeline view
  so the pipeline stays a clean read-only dashboard and the worksheet is the editable input.

### B.7 Ingestion

A one-time ingest step (script or documented procedure) parses `dealer-master-list.xlsx` → seeds
`dealers.json` with the identity fields for all 77, then runs `score-dealers.mjs`. The xlsx parse
reuses the repo's dependency-free approach where possible (the existing `lib/xlsx-writer.js` is
write-only; a minimal reader or a documented one-shot parse is acceptable since ingest runs rarely).

### B.8 Tests — `tests/dealers.test.js`

Part of the default `npm test` (offline, hermetic). Covers:

- **Deterministic scoring:** same input → same `score`/`tier`.
- **Registry integrity:** every dealer has a valid 2-letter `state`, a `stage` in the allowed enum,
  and an `owningRep` consistent with the state→zone map.
- **Rubric edge cases:** null-signal provisional scoring, tier threshold boundaries, group tagging.

---

## Sequencing & dependencies

1. **Now, no external deps:** Part A drafts (all 6 artifacts + render.mjs) and Part B scaffolding
   (registry schema, scorer, zone map, group map, tests), plus ingest of the 77 identity records.
2. **On owner signals:** fill `truckVolume` + `enthusiastPosture` → re-score → final tiers.
3. **On owner numbers:** fill A's owner-input fields (rev-share, turnaround, contact) → render PDFs.
4. **On owner + counsel:** bless artifacts 2 & 3 → letterhead.

## Non-goals

- No Airtable table (owner chose repo-side registry).
- No recap-digest automation (sub-project C — deferred).
- No outreach/CRM-send tooling (sub-project D — human).
- No fabricated dealer signals, prices, or legal guarantees.
