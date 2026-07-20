# AMSOIL Garage — Fluid Data Verification Checklist

**Status (2026-07-20): engine-oil + differential + transfer-case capacities are
cross-source VERIFIED for every row** (see `scripts/amsoil-capacity-reconciliation.json`,
`amsoil-driveline-reconciliation.json`, `amsoil-flagged-reconciliation.json` for sources
per value). Transmissions are deliberately unverified (sealed/overflow fill — no honest
single number). The draft-era checklist below remains for re-verification workflow.

Generated: 2026-07-10 · Branch: `amsoil-fluid-data`

---

## Storefront catalog refresh (monthly, or when AMSOIL adds products)

The on-site "Shop All AMSOIL" store (`/amsoil-garage`) renders `site/amsoil-catalog.json` —
a point-in-time build from AMSOIL's product sitemap with per-product images. One command
refreshes all of it (sitemap re-scrape via Firecrawl → shared categorization rules →
og:image harvest via curl; images are carried over between runs, only new products fetch):

```
npm run refresh:amsoil-catalog
```

Then `npm test`, review the diff (new/renamed/removed products, category counts, anything
landing in "Other Specialty" — tighten `scripts/amsoil-categorize.mjs` if so), commit and
push. Requires the local Firecrawl key (read from `~/.claude.json`) — cloud/CI can't run it.

---

## How to verify a platform (one command)

Flipping a platform to `verified: true` publishes its capacities + severe-service intervals to
both the AMSOIL Garage picker and the per-vehicle SEO page. Use the helper — review first, correct
any capacity, then confirm:

```
node scripts/amsoil/verify-platform.mjs list                    # what's live vs draft
node scripts/amsoil/verify-platform.mjs review "Toyota Tundra"  # see the draft specs to check
node scripts/amsoil/verify-platform.mjs set-cap "Toyota Tundra" "2007-2021" "Engine Oil" 7.9   # fix a number
node scripts/amsoil/verify-platform.mjs confirm "Toyota Tundra" --build   # go live (regenerates pages)
```

`confirm` takes an optional `--year "<year>"` to verify a single generation, and `--build` to
regenerate the pages immediately. After confirming: `npm test`, then commit `site/amsoil-garage.json`
+ the regenerated `site/amsoil-*.html` and push master. Revert with `unverify`. Until a platform is
confirmed, its product/viscosity/filter recommendations still show — only the capacities/intervals
are withheld **on the SEO pages + garage**. NOTE: the **follow-up email + certificate render capacity
UNGATED** (they read `resolveFluids` directly), so a wrong capacity reaches customers even before a
platform is verified — keep the numbers right regardless of the verified flag.
Logic lives in `scripts/amsoil/lib/verify.mjs` (tested by `tests/amsoil-verify.test.js`).

---

## Correction log

### 2026-07-14 — V8 engine-oil capacities (liters mis-entered as quarts) — CORRECTED (master @ ff465d0)
A factory-spec cross-check found several V8 oil capacities holding the **liter** figure in the quart
field. Corrected to with-filter US quarts (owner-approved; still `verified:false` pending installer nod):
- **5.7L V8 (3UR-FE): 7.4 → 7.9 qt** — Tundra 2007-2021, Sequoia 2008-2022, Land Cruiser 2016-2021 +
  2008-2015, Lexus LX570 2008-2021.
- **4.7L V8 (2UZ-FE): 6.1 → 6.4 qt** — Tundra 2000-2009, Sequoia 2001-2009, Land Cruiser 2006-2007,
  Lexus GX 2005-2009.

### Engine-oil rows still needing installer confirmation (🟡 — "yes, that's what we pour")
Cross-check flagged these as plausible-but-unconfirmed; confirm the actual fill, then `confirm` the platform:
- **3.5L V6 2GR-FKS** (2016-2023 Tacoma) — draft 6.4, spec ≈ 6.2 qt.
- **3.5L V6 2GR-FE** (Camry/RX350/Highlander/RAV4) — draft 6.4 qt.
- **4.6L V8 1UR** — draft is inconsistent across the SAME engine: Tundra/Sequoia 4.6 = 6.4 qt vs Lexus GX 4.6 = 6.9 qt. Pick one.
- **2.4L turbo T24A-FTS** (2024+ Tacoma / 2025+ 4Runner / Land Cruiser) — draft 4.8, spec ≈ 5.0 qt.
- **4.6L 1UR-FSE** (LS460) — draft 8.5 qt (verify).
- **2.7L I4 2TR-FE** (Tacoma 2.7) — draft 6.0 / 5.5 qt.
- **4Runner 2005-2009** dual-engine row shows only the 4.0L figure (5.5) — the 4.7L variant needs its own capacity.

Beyond engine oil, diff / transfer-case / ATF capacities across all platforms remain drafts too — the
`review "<Make Model>"` command lists every system per generation for a full walk-through.

---

## AMSOIL Guide Data — Source & Coverage

**Source:** AMSOIL official Auto & Light Truck fitment API (`https://api-1.amsoil.com/api/`) queried 2026-07-10 via the `Fitment/GetRecommendations` endpoint. This is the same data engine that powers the AMSOIL vehicle lookup at amsoil.com/lookup/auto-and-light-truck/. Values here are **authoritative for product family, viscosity, and product code**. They represent AMSOIL's official recommendation for each vehicle.

**What the API provides:** Product family name, viscosity grade, AMSOIL product code (primary/top-sort recommendation called out per vehicle). Multiple alternatives are returned — the first listed (sortOrder=100) is AMSOIL's primary recommendation for that application.

**What the API does NOT provide:** Fluid capacities, drain intervals, drain plug torque. These are NOT in the API at any endpoint — they exist only on the rendered HTML pages which are behind Cloudflare WAF and cannot be scraped from a headless context. Capacities and intervals in the tables below remain Toyota-OEM-spec draft values requiring manual verification.

**Coverage:** 27 of 28 platform-generations successfully queried. 1 miss: Toyota Land Cruiser 2008-2015 5.7L V8 — AMSOIL's database does not list "Land Cruiser" for model year 2012 (the vehicle was not sold in that specific year in the US market per AMSOIL's data). Use the 2016-2021 5.7L V8 data as a proxy (same 3UR-FE engine).

---

## Critical Findings — Product Discrepancies vs. Draft

The following are confirmed discrepancies between the AMSOIL guide and the current draft data. These need owner/installer decision before enabling those generations:

### CONFIRMED OIL FILTER SKU DISCREPANCIES
The draft uses `EAO-57`, `EAO-116`, and `EA15K34` as oil filter SKUs. The AMSOIL guide returns **completely different filter codes** for every vehicle. The correct AMSOIL Ea oil filter codes per engine family (from `GetRecommendations`):

| Application | Draft SKU | AMSOIL Guide SKU | Action Required |
|------------|-----------|-----------------|-----------------|
| T24A-FTS engine (2024+ Tacoma, 2025+ 4Runner, 2025+ LC, 2022+ Tundra) | EAO-116 / EA15K34 | **EA15K09** | UPDATE SKU |
| 1GR-FE engine (Tacoma 2005-2015, 4Runner 2007-2009, FJ Cruiser 2007-2009, Tundra 2005-2009 V6) | EAO-57 | **EA15K51** | UPDATE SKU |
| 2GR-FKS / 2GRFE engine (Tacoma 3.5L, Camry, Highlander, RAV4, RX350) | EAO-57 | **EA15K02** | UPDATE SKU |
| 1GR-FE newer spec (4Runner 2010+, FJ Cruiser 2010-2014) | EAO-57 | **EA15K49** | UPDATE SKU |
| 3UR-FE / 3UR-FBE (Tundra 5.7L, Sequoia 5.7L, LC 5.7L, LX570) | EAO-57 | **EA15K04** | UPDATE SKU |
| 1UR-FE engine (Tundra 4.6L, GX 460, LS460) | EAO-57 | **EA15K49** | UPDATE SKU |
| 2UZ-FE engine (Tundra 4.7L, Sequoia 4.7L, LC 4.7L, GX 470) | EAO-57 | **EA15K51** | UPDATE SKU |
| V35A-FTS (2022+ Tundra 3.4L TT V6) | EA15K34 | **EA15K09** | UPDATE SKU |

> **Owner action required:** The `site/amsoil-garage.json` uses EAO-57, EAO-116, and EA15K34 as filter SKUs across all vehicles. Every one of these appears to be wrong per the AMSOIL guide. The correct codes (EA15K09, EA15K51, EA15K02, EA15K49, EA15K04) are not yet in the product catalog in amsoil-garage.json. These need to be verified at amsoil.com, priced, and added to the product catalog before any generation can go live. **Do not flip `verified: true` until filter SKUs are corrected.**

### CONFIRMED VISCOSITY DISCREPANCIES
| Application | Draft Viscosity | AMSOIL Guide Viscosity | Notes |
|------------|-----------------|----------------------|-------|
| Tacoma 2016-2023 3.5L V6 (2GR-FKS) | SS-0W20 in draft ✓ | 0W-20 ✓ | Draft matches |
| Tacoma 2016-2023 2.7L I4 (2TR-FE) | SS-5W30 in draft | **0W-20** per guide | Guide updated spec |
| Tacoma 2005-2015 2.7L I4 (2TR-FE T) | SS-5W30 in draft | **0W-20** per guide | Newer rec than draft |
| 4Runner 2010-2019 4.0L V6 (2015) | SS-5W30 in draft | **0W-20** per guide | Guide updated |
| 4Runner 2020-2024 4.0L V6 (2022) | SS-5W30 in draft | **0W-20** per guide | Guide updated |
| FJ Cruiser 2010-2014 (2012) | SS-5W30 in draft | **0W-20** per guide | Guide updated |
| Tundra 2007-2021 5.7L V8 | SS-5W30 in draft | **0W-20** per guide | Major discrepancy |
| Tundra 2010-2019 4.6L V8 | SS-5W30 in draft | **0W-20** per guide | Major discrepancy |
| Sequoia 2008-2022 5.7L V8 | SS-5W30 in draft | **0W-20** per guide | Major discrepancy |
| Sequoia 2010-2019 4.6L V8 | SS-5W30 in draft | **0W-20** per guide | Major discrepancy |
| LC 2016-2021 5.7L V8 | SS-5W30 in draft | **0W-20** per guide | Major discrepancy |
| LX570 2008-2021 5.7L V8 | SS-5W30 in draft | **0W-20** per guide | Major discrepancy |
| LS460 2007-2017 4.6L V8 | SS-0W20 in draft ✓ | 0W-20 ✓ | Draft matches |
| GX 2019+ 4.6L V8 | SS-5W20 in draft | **0W-20** per guide | Confirms 0W-20 for 2019+ |
| GX 2010-2018 4.6L V8 | SS-5W20 in draft | **0W-20** per guide | Discrepancy — guide says 0W-20 |
| RAV4 2006-2012 3.5L V6 | SS-5W20 in draft | **5W-30** per guide | Guide says 5W-30, not 5W-20 |
| Highlander 2008-2016 3.5L V6 | SS-5W20 in draft | **0W-20** per guide | Guide updated |
| Camry 2007-2017 3.5L V6 (2012) | SS-5W30 in draft | **0W-20** per guide | Guide updated rec |

### CONFIRMED GEAR LUBE VISCOSITY DISCREPANCY
The draft universally uses SVG-75W90 and SVG-75W140 for differentials. The AMSOIL guide's **primary recommendation** for differentials across the entire Toyota/Lexus lineup (all generations, all models) is:

> **SEVERE GEAR 75W-85** (product code SVL / `SVLPK-EA`) — NOT 75W-90 or 75W-140

This is a significant and consistent finding. The 75W-85 is AMSOIL's factory-fill-compatible recommendation for Toyota's LT 75W-85 spec axles (used across most Tacoma, 4Runner, Tundra, Land Cruiser, Lexus GX/LX generations). The 75W-90 and 75W-140 choices in the draft were conservative but may not match what AMSOIL actually recommends.

**Exception — FJ Cruiser 2007-2009 differentials:** Guide returns 80W-90 (AGLPK) as the first differential option, not 75W-85. This is the older Toyota 8-inch axle spec.

**Transfer Case — 2022+ Tundra:** Guide confirms the transfer case uses **ATF** (Signature Series Fuel-Efficient ATF, code ATLPK). The draft has no transfer case entry for the 2022+ Tundra, which aligns with this (the t-case shares ATF fluid with the transmission circuit).

**Transfer Case — older part-time 4WD (2005-2015 Tacoma, 2007 4Runner, etc.):** Guide lists multiple options: 80W-90, SEVERE GEAR 75W-90, MTG 75W-90, SEVERE GEAR 75W-110. No single primary is forced — the installer should confirm the specific transfer case model.

---

## How this works

Every generation in `site/amsoil-garage.json` carries `"verified": false`. The live AMSOIL Garage page hides unverified generations from customers — so nothing below is customer-facing until you sign off.

**To verify a generation:**
1. Check each row in the table against the AMSOIL Guide data added below AND the OEM service manual (or a trusted source like ToyotaOwners.com, iATN, or the vehicle's actual service data).
2. Correct any wrong values directly in `site/amsoil-garage.json`.
3. Flip `"verified": true` on that generation object.
4. Run `node --test tests/amsoil-garage-data.test.js` to confirm no integrity errors.
5. Commit and push/deploy.

**Product prices** (marked `"priceVerifiedAt": "DRAFT"`) also need to be confirmed at amsoil.com before each generation goes live.

---

## Platform tables

Each table now has an "AMSOIL Guide" column showing the authoritative product/viscosity/code from the fitment API. Where the guide provides a capacity, it is noted; for all vehicles queried, the API returned **no capacity data** — capacities remain Toyota-spec drafts for manual verification.

---

### Toyota Tacoma

#### 2024+ · 2.4L-T I4

**AMSOIL Guide (2024, unitId=51458068):** Engine 2.4L 4-cyl T24A-FTS A Turbo. Engine Oil → Signature Series 0W-20 (ASMQT). Oil Filter → EA15K09 (not EAO-116 as drafted). ATF → Signature Series Fuel-Efficient ATF (ATLPK). Differentials → SEVERE GEAR 75W-85 (SVLPK). No Transfer Case Lubricant listed (confirms ATF-shared or e-locking diff design). Coolant → Propylene Glycol or PC&LT Antifreeze.

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-0W20-QT — Signature Series 0W-20 | **0W-20 (ASMQT) ✓ Matches** | 4.8 qt | 10,000 mi | 7,500 mi | ☐ |
| Engine Oil Filter | EAO-116 — Ea Oil Filter | **EA15K09 — MISMATCH. Update SKU** | 1 ea | 10,000 mi | 7,500 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Rear Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 2.0 qt | severe: inspect | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | **Not listed by guide — may be ATF or integral** | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 8.0 qt | severe service | 60,000 mi | ☐ |

#### 2016-2023 · 3.5L V6

**AMSOIL Guide (2020, unitId=36388015):** Engine 3.5L 6-cyl 2GR-FKS 4. Engine Oil → Signature Series 0W-20 (ASMQT). Oil Filter → EA15K02. ATF → Signature Series Fuel-Efficient ATF (ATLPK), two instances (front+rear or trans+PTU). Differentials → SEVERE GEAR 75W-85 (SVLPK), five instances. Manual Trans option listed (MTG 75W-90) — confirms Tacoma offers manual trans in this gen.

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-0W20-QT — Signature Series 0W-20 | **0W-20 (ASMQT) ✓ Matches** | 6.4 qt | 10,000 mi | 7,500 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | **EA15K02 — MISMATCH. Update SKU** | 1 ea | 10,000 mi | 7,500 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Rear Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 2.0 qt | severe: inspect | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) or 75W-90 (SVGPK) — multiple options listed** | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 8.5 qt | severe service | 60,000 mi | ☐ |

#### 2016-2023 · 2.7L I4

**AMSOIL Guide (2020, unitId=36388016):** Engine 2.7L 4-cyl 2TR-FE D. Engine Oil → Signature Series 0W-20 (ASMQT). **Draft had SS-5W30 — DISCREPANCY.** Oil Filter → EA15K51.

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | **0W-20 (ASMQT) — VISCOSITY DISCREPANCY** | 6.0 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-116 — Ea Oil Filter | **EA15K51 — MISMATCH. Update SKU** | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Rear Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 2.0 qt | severe: inspect | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) or 75W-90 (SVGPK) — multiple options** | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 8.5 qt | severe service | 60,000 mi | ☐ |

#### 2005-2015 · 4.0L V6

**AMSOIL Guide (2012, unitId=1534817):** Engine 4.0L 6-cyl 1GR-FE Z. Engine Oil → Signature Series 5W-30 (ASLQT). Oil Filter → EA15K51. Transfer Case → multiple options: 80W-90 (AGLPK), MTG 75W-90, SEVERE GEAR 75W-90, 75W-110. Differentials → SEVERE GEAR 75W-85 (SVLPK).

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | **5W-30 (ASLQT) ✓ Matches** | 5.5 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | **EA15K51 — MISMATCH. Update SKU** | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 2.0 qt | 30,000 mi | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | **Multiple options: 80W-90, MTG 75W-90, SEVERE GEAR 75W-90 — confirm with installer** | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 8.5 qt | severe service | 60,000 mi | ☐ |

#### 2005-2015 · 2.7L I4

**AMSOIL Guide (2012, unitId=1534816):** Engine 2.7L 4-cyl 2TR-FE T. Engine Oil → Signature Series 0W-20 (ASMQT). **Draft had SS-5W30 — DISCREPANCY.** Oil Filter → EA15K51.

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | **0W-20 (ASMQT) — VISCOSITY DISCREPANCY** | 5.5 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-116 — Ea Oil Filter | **EA15K51 — MISMATCH. Update SKU** | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 2.0 qt | 30,000 mi | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | **Multiple options: 80W-90, MTG 75W-90, SEVERE GEAR 75W-90** | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 8.5 qt | severe service | 60,000 mi | ☐ |

---

### Toyota 4Runner

#### 2025+ · 2.4L-T I4

**AMSOIL Guide (2025, unitId=51751491):** Engine 2.4L 4-cyl T24A-FTS 4 Turbo. Engine Oil → Signature Series 0W-20. Oil Filter → WL10332 (WIX only — no AMSOIL Ea filter listed). ATF → Signature Series Fuel-Efficient ATF (two instances). Differentials → SEVERE GEAR 75W-85 (three instances). No Transfer Case Lubricant listed.

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-0W20-QT — Signature Series 0W-20 | **0W-20 (ASMQT) ✓ Matches** | 4.8 qt | 10,000 mi | 7,500 mi | ☐ |
| Engine Oil Filter | EAO-116 — Ea Oil Filter | **Guide shows WIX WL10332 only — no AMSOIL Ea filter listed for this fitment. AMSOIL EA filter for T24A-FTS on other vehicles is EA15K09; verify fitment for 2025 4Runner** | 1 ea | 10,000 mi | 7,500 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Rear Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 2.0 qt | severe: inspect | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | **Not listed — guide shows no Transfer Case Lubricant for 2025 4Runner** | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 8.0 qt | severe service | 60,000 mi | ☐ |

#### 2020-2024 · 4.0L V6

**AMSOIL Guide (2022, unitId=44187378):** Engine 4.0L 6-cyl 1GR-FE 4. Engine Oil → Signature Series 0W-20 (ASMQT). **Draft had SS-5W30 — DISCREPANCY.** Oil Filter → EA15K49. ATF (two instances). Differentials → SEVERE GEAR 75W-85 (four instances).

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | **0W-20 (ASMQT) — VISCOSITY DISCREPANCY** | 5.5 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | **EA15K49 — MISMATCH. Update SKU** | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Rear Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 2.0 qt | severe: inspect | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 8.5 qt | severe service | 60,000 mi | ☐ |

#### 2010-2019 · 4.0L V6

**AMSOIL Guide (2015, unitId=7664479):** Engine 4.0L 6-cyl 1GR-FE 0. Engine Oil → Signature Series 0W-20. **Draft had SS-5W30 — DISCREPANCY.** Oil Filter → EA15K49. ATF two instances. Differentials → SEVERE GEAR 75W-85 (four instances).

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | **0W-20 (ASMQT) — VISCOSITY DISCREPANCY** | 5.5 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | **EA15K49 — MISMATCH. Update SKU** | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Rear Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 2.0 qt | severe: inspect | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 8.5 qt | severe service | 60,000 mi | ☐ |

#### 2005-2009 · 4.0L V6 / 4.7L V8

**AMSOIL Guide (2007, unitId=13383, 4.0L V6):** Engine 4.0L 6-cyl 1GR-FE Z. Engine Oil → Signature Series 5W-30 (ASLQT). Oil Filter → EA15K51. Transfer Case → 80W-90 (AGLPK), 75W-90 (SVGPK), 75W-110 (SVTPK) options. Differentials → SEVERE GEAR 75W-85 (two instances only — older axle listing is sparse).

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | **5W-30 (ASLQT) ✓ Matches** | 5.5 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | **EA15K51 — MISMATCH. Update SKU** | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 2.0 qt | 30,000 mi | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | **Multiple options: 80W-90, SEVERE GEAR 75W-90 — confirm with installer** | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 8.5 qt | severe service | 60,000 mi | ☐ |

**Note:** This generation spans both the 4.0L V6 and 4.7L V8. Oil capacity shown (5.5 qt) is for the 4.0L V6. The 4.7L V8 takes approximately 6.1 qt. If the page will show a single row for this combined generation, the installer should confirm which engine the customer has.

---

### Toyota FJ Cruiser

#### 2010-2014 · 4.0L V6

**AMSOIL Guide (2012, unitId=1485998):** Engine 4.0L 6-cyl 1GR-FE Z. Engine Oil → Signature Series 0W-20 (ASMQT). **Draft had SS-5W30 — DISCREPANCY.** Oil Filter → EA15K49. Differentials → SEVERE GEAR 75W-85 (four instances).

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | **0W-20 (ASMQT) — VISCOSITY DISCREPANCY** | 5.5 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | **EA15K49 — MISMATCH. Update SKU** | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | **75W-85 (SVLPK) — viscosity discrepancy (guide does not recommend 75W-140 here)** | 2.0 qt | severe: inspect | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 8.5 qt | severe service | 60,000 mi | ☐ |

#### 2007-2009 · 4.0L V6

**AMSOIL Guide (2008, unitId=13595):** Engine 4.0L 6-cyl 1GR-FE Z. Engine Oil → Signature Series 5W-30. Oil Filter → EA15K51. Differentials → **SEVERE GEAR 80W-90 (AGLPK) as primary**, plus 75W-90 and 75W-110 options — older Toyota 8" axle spec. Note: Guide uses 80W-90, NOT 75W-140 as in the draft.

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | **5W-30 (ASLQT) ✓ Matches** | 5.5 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | **EA15K51 — MISMATCH. Update SKU** | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **80W-90 (AGLPK) primary, 75W-90 (SVGPK) alternate — check axle spec** | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | **80W-90 (AGLPK) primary — guide does NOT recommend 75W-140 for 2007-2009 FJ** | 2.0 qt | 30,000 mi | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | **80W-90, 75W-90, or 75W-110 — multiple options, confirm with installer** | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 8.5 qt | severe service | 60,000 mi | ☐ |

**Note — 2007-2008 generation:** The lineup shows three FJ Cruiser generations (2007-2008, 2007-2009, 2010-2014). The 2007-2008 and 2007-2009 data is essentially identical — confirm whether two separate rows are intended or if these should be collapsed.

---

### Toyota Tundra

#### 2022+ · 3.4L i-FORCE twin-turbo V6

**AMSOIL Guide (2024, unitId=50280533):** Engine 3.4L 6-cyl V35A-FTS 6 Turbo. Engine Oil → Signature Series 0W-20 (ASMQT). **Draft matches.** Oil Filter → EA15K09 (draft has EA15K34 — check fitment, both are the flat-basket style). Transfer Case → **Signature Series Fuel-Efficient ATF (ATLPK)** — confirms t-case is ATF-filled. Differentials → SEVERE GEAR 75W-85 (three instances).

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-0W20-QT — Signature Series 0W-20 | **0W-20 (ASMQT) ✓ Matches** | 7.9 qt | 10,000 mi | 7,500 mi | ☐ |
| Engine Oil Filter | EA15K34 — Ea Oil Filter | **EA15K09 — possible MISMATCH (both are flat-basket; verify fitment)** | 1 ea | 10,000 mi | 7,500 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 1.9 qt | severe: inspect | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | **75W-85 (SVLPK) — guide does NOT recommend 75W-140 for 2022+ Tundra** | 2.4 qt | severe: inspect | 30,000 mi | ☐ |
| Transfer Case | *(not in draft)* | **ATF (ATLPK) — guide confirms ATF-filled transfer case. ADD this row** | — | severe: inspect | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 11.0 qt | severe service | 60,000 mi | ☐ |

#### 2007-2021 · 5.7L V8

**AMSOIL Guide (2015, unitId=7922785):** Engine 5.7L 8-cyl 3UR-FBE 3 Flex. Engine Oil → Signature Series 0W-20 (ASMQT). **Draft had SS-5W30 — MAJOR DISCREPANCY.** Oil Filter → EA15K04. Differentials → SEVERE GEAR 75W-85 (SVLPK), multiple instances.

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | **0W-20 (ASMQT) — MAJOR VISCOSITY DISCREPANCY** | 7.4 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | **EA15K04 — MISMATCH. Update SKU** | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 1.9 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | **75W-85 (SVLPK) — guide does NOT recommend 75W-140** | 2.8 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 9.8 qt | severe service | 60,000 mi | ☐ |

**Note:** No transfer case entry — the 2007-2021 Tundra has a part-time 4WD transfer case. The guide for 2015 5.7L flex does NOT list a Transfer Case Lubricant separately, which suggests it may share ATF with the automatic transmission circuit. Confirm with service manual.

#### 2010-2019 · 4.6L V8

**AMSOIL Guide (2015, unitId=7922784):** Engine 4.6L 8-cyl 1UR-FE 5. Engine Oil → Signature Series 0W-20 (ASMQT). **Draft had SS-5W30 — MAJOR DISCREPANCY.** Oil Filter → EA15K04.

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | **0W-20 (ASMQT) — MAJOR VISCOSITY DISCREPANCY** | 6.4 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | **EA15K04 — MISMATCH. Update SKU** | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 1.9 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | **75W-85 (SVLPK) — guide does NOT recommend 75W-140** | 2.8 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 9.8 qt | severe service | 60,000 mi | ☐ |

**Note:** Transfer case gap same as 5.7L V8 generation.

#### 2000-2009 · 4.7L V8

**AMSOIL Guide (2007, unitId=13967):** Engine 4.7L 8-cyl 2UZ-FE 9. Engine Oil → Signature Series 5W-30 (ASLQT). Draft matches. Oil Filter → EA15K51. Transfer Case → multiple options listed. Differentials → SEVERE GEAR 75W-85 (SVLPK).

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | **5W-30 (ASLQT) ✓ Matches** | 6.1 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | **EA15K51 — MISMATCH. Update SKU** | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 1.9 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | **75W-85 (SVLPK) — guide does NOT recommend 75W-140** | 2.8 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 9.8 qt | severe service | 60,000 mi | ☐ |

**Note:** Transfer case gap — see 5.7L note. 1st-gen Tundra (2000-2006) A340E 4-speed transmission capacity is different from 2007+ A750F.

#### 2005-2009 · 4.0L V6

**AMSOIL Guide (2007, unitId=13974):** Engine 4.0L 6-cyl 1GR-FE Z. Engine Oil → Signature Series 5W-30. Draft matches. Oil Filter → EA15K51. Differentials → SEVERE GEAR 75W-85.

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | **5W-30 (ASLQT) ✓ Matches** | 5.5 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | **EA15K51 — MISMATCH. Update SKU** | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 1.9 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 2.4 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 9.8 qt | severe service | 60,000 mi | ☐ |

---

### Toyota Sequoia

#### 2008-2022 · 5.7L V8

**AMSOIL Guide (2015, unitId=7664482):** Engine 5.7L 8-cyl 3UR-FBE 3 Flex. Engine Oil → Signature Series 0W-20 (ASMQT). **Draft had SS-5W30 — MAJOR DISCREPANCY.** Oil Filter → EA15K04. Transfer Case → multiple options (80W-90, 75W-90, 75W-110). Differentials → SEVERE GEAR 75W-85 (SVLPK) several instances.

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | **0W-20 (ASMQT) — MAJOR VISCOSITY DISCREPANCY** | 7.4 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | **EA15K04 — MISMATCH. Update SKU** | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 1.9 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | **75W-85 (SVLPK) — guide does NOT recommend 75W-140** | 3.4 qt | 30,000 mi | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | **Multiple options: 80W-90, SEVERE GEAR 75W-90 — confirm with installer** | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 9.8 qt | severe service | 60,000 mi | ☐ |

#### 2010-2019 · 4.6L V8

**AMSOIL Guide (2015 — NOTE: AMSOIL returned 5.7L data for 2015 Sequoia since no 4.6L was offered in 2015. Sequoia 4.6L ran 2010-2012 only. Re-query recommended at 2011 for 4.6L.)** Proxy data from 5.7L: Engine Oil → 0W-20, Oil Filter → EA15K04.

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | **0W-20 (ASMQT) expected (same 1UR-FE engine as Tundra 4.6L) — VERIFY at 2011** | 6.4 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | **EA15K04 expected — VERIFY at 2011** | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) expected — VERIFY** | 1.9 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | **75W-85 (SVLPK) expected — guide unlikely to recommend 75W-140** | 3.4 qt | 30,000 mi | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | **Multiple options expected — VERIFY** | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches expected** | 9.8 qt | severe service | 60,000 mi | ☐ |

#### 2001-2009 · 4.7L V8

**AMSOIL Guide (2007, unitId=13795):** Engine 4.7L 8-cyl 2UZ-FE 9. Engine Oil → Signature Series 5W-30 (ASLQT). Draft matches. Oil Filter → EA15K51. Differentials → SEVERE GEAR 75W-85.

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | **5W-30 (ASLQT) ✓ Matches** | 6.1 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | **EA15K51 — MISMATCH. Update SKU** | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 1.9 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | **75W-85 (SVLPK) — guide does NOT recommend 75W-140** | 3.4 qt | 30,000 mi | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | **Multiple options — confirm with installer** | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 9.8 qt | severe service | 60,000 mi | ☐ |

---

### Toyota Land Cruiser

#### 2025+ · 2.4L-T I4

**AMSOIL Guide (2025, unitId=51458264):** Engine 2.4L 4-cyl T24A-FTS 7 Turbo. Engine Oil → Signature Series 0W-20. Draft matches. Oil Filter → EA15K09. ATF two instances. Differentials → SEVERE GEAR 75W-85 (three instances, no 75W-140). Transfer Case not listed.

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-0W20-QT — Signature Series 0W-20 | **0W-20 (ASMQT) ✓ Matches** | 4.8 qt | 10,000 mi | 7,500 mi | ☐ |
| Engine Oil Filter | EAO-116 — Ea Oil Filter | **EA15K09 — MISMATCH. Update SKU** | 1 ea | 10,000 mi | 7,500 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 1.9 qt | severe: inspect | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | **75W-85 (SVLPK) — guide does NOT recommend 75W-140** | 2.4 qt | severe: inspect | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | **Not listed by guide for 2025 LC — may be ATF-filled** | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 8.0 qt | severe service | 60,000 mi | ☐ |

**Note:** 250 Series Land Cruiser — full specs not yet published as of early 2026. All capacity figures are provisional pending service manual data.

#### 2016-2021 · 5.7L V8

**AMSOIL Guide (2018, unitId=28233255):** Engine 5.7L 8-cyl 3UR-FE 7. Engine Oil → Signature Series 0W-20 (ASMQT). **Draft had SS-5W30 — MAJOR DISCREPANCY.** Oil Filter → EA15K04.

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | **0W-20 (ASMQT) — MAJOR VISCOSITY DISCREPANCY** | 7.4 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | **EA15K04 — MISMATCH. Update SKU** | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 1.9 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | **75W-85 (SVLPK) — guide does NOT recommend 75W-140** | 2.4 qt | 30,000 mi | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | **Guide shows multiple options — confirm with installer** | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 9.8 qt | severe service | 60,000 mi | ☐ |

#### 2008-2015 · 5.7L V8

**AMSOIL Guide coverage: NOT AVAILABLE.** AMSOIL's database does not include "Land Cruiser" for 2012 (not sold in US that year per AMSOIL data). Use 2016-2021 data as a proxy — same 3UR-FE engine, same AMSOIL recommendations apply.

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | **0W-20 expected (same engine as 2016-2021) — VERIFY via AMSOIL guide at 2010 or 2013 MY** | 7.4 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | **EA15K04 expected — VERIFY** | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) expected** | 1.9 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | **75W-85 (SVLPK) expected — guide unlikely to recommend 75W-140** | 2.4 qt | 30,000 mi | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | **Multiple options expected** | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches expected** | 9.8 qt | severe service | 60,000 mi | ☐ |

#### 2006-2007 · 4.7L V8

**AMSOIL Guide (2007, unitId=13641):** Engine 4.7L 8-cyl 2UZ-FE 9. Engine Oil → Signature Series 5W-30. Draft matches. Oil Filter → EA15K51. 30 total recommendations including multiple transfer case and differential options.

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | **5W-30 (ASLQT) ✓ Matches** | 6.1 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | **EA15K51 — MISMATCH. Update SKU** | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 1.9 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | **75W-85 (SVLPK) — guide does NOT recommend 75W-140** | 2.4 qt | 30,000 mi | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | **Multiple options — confirm with installer** | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 9.8 qt | severe service | 60,000 mi | ☐ |

---

### Toyota RAV4

#### 2006-2012 · 3.5L V6

**AMSOIL Guide (2009, unitId=13775):** Engine 3.5L 6-cyl 2GRFE A. Engine Oil → Signature Series 5W-30 (ASLQT). **Draft had SS-5W20 — DISCREPANCY. Guide says 5W-30 for this application.** Oil Filter → EA15K02.

FWD/AWD transverse platform. Drivetrain systems limited to engine, filter, and transmission. AWD variants have a rear differential (open, electronically-engaged) — not included here because the lineup does not distinguish AWD vs FWD trim.

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-5W20-QT — Signature Series 5W-20 | **5W-30 (ASLQT) — VISCOSITY DISCREPANCY (guide says 5W-30, not 5W-20)** | 6.4 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | **EA15K02 — MISMATCH. Update SKU** | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 7.4 qt | severe service | 60,000 mi | ☐ |

**Note:** RAV4 V6 oil capacity is approximately 6.4 qt — confirm. Toyota spec'd 5W-20 for this engine in most North American applications; AMSOIL guide says 5W-30. Owner should verify door jamb label. AWD RAV4 adds a rear torque coupling/differential — if AWD-specific guidance is wanted, a rear differential system should be added.

---

### Toyota Highlander

#### 2017-2019 · 3.5L V6

**AMSOIL Guide (2018, unitId=28233254):** Engine 3.5L 6-cyl 2GR-FKS 5. Engine Oil → Signature Series 0W-20 (ASMQT). Draft matches. Oil Filter → EA15K02.

FWD/AWD transverse platform. Used newer 2GR-FKS (direct + port injection), Toyota spec'd 0W-20.

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-0W20-QT — Signature Series 0W-20 | **0W-20 (ASMQT) ✓ Matches** | 6.4 qt | 10,000 mi | 7,500 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | **EA15K02 — MISMATCH. Update SKU** | 1 ea | 10,000 mi | 7,500 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 7.4 qt | severe service | 60,000 mi | ☐ |

#### 2008-2016 · 3.5L V6

**AMSOIL Guide (2012, unitId=1486000):** Engine 3.5L 6-cyl 2GR-FXE C (this is the Highlander Hybrid engine code returned — non-hybrid 2GR-FE would be ASMQT 0W-20 as well per guide). Engine Oil → Signature Series 0W-20 (ASMQT). **Draft had SS-5W20 — DISCREPANCY.** Oil Filter → EA15K02.

FWD/AWD transverse platform. Toyota spec'd 5W-20 for 2GR-FE in most North American applications, but guide recommends 0W-20.

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-5W20-QT — Signature Series 5W-20 | **0W-20 (ASMQT) — VISCOSITY DISCREPANCY** | 6.4 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | **EA15K02 — MISMATCH. Update SKU** | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 7.4 qt | severe service | 60,000 mi | ☐ |

**Note:** AWD Highlander adds a rear differential/power transfer unit — same caveat as RAV4 above.

---

### Toyota Camry

#### 2018-2024 · 3.5L V6

**AMSOIL Guide (2022, unitId=45095122):** Engine 3.5L 6-cyl 2GR-FKS 9. Engine Oil → Signature Series 0W-20. Draft matches. Oil Filter → EA15K02.

FWD only (V6 Camry). Toyota spec'd 0W-20 for 2GR-FKS.

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-0W20-QT — Signature Series 0W-20 | **0W-20 (ASMQT) ✓ Matches** | 6.4 qt | 10,000 mi | 7,500 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | **EA15K02 — MISMATCH. Update SKU** | 1 ea | 10,000 mi | 7,500 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 7.4 qt | severe service | 60,000 mi | ☐ |

#### 2007-2017 · 3.5L V6

**AMSOIL Guide (2012, unitId=1485997):** Engine 3.5L 6-cyl 2GRFE A. Engine Oil → Signature Series 0W-20 (ASMQT). **Draft had SS-5W30 — DISCREPANCY.** Oil Filter → EA15K02.

FWD only. Toyota spec'd 5W-30 for 2GR-FE in early applications, later revised; guide says 0W-20.

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | **0W-20 (ASMQT) — VISCOSITY DISCREPANCY** | 6.4 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | **EA15K02 — MISMATCH. Update SKU** | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 7.4 qt | severe service | 60,000 mi | ☐ |

---

### Lexus GX

#### 2019+ · 4.6L V8

**AMSOIL Guide (2021, unitId for GX460):** Engine 4.6L V8. Engine Oil → Signature Series 0W-20 (ASMQT). **Draft had SS-5W20 — confirms guide says 0W-20 for 2019+ GX.** Oil Filter → EA15K49. Differentials → SEVERE GEAR 75W-85.

GX 460 (body-on-frame, 4WD). Toyota spec'd 0W-20 starting with the 2019 facelift.

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-5W20-QT — Signature Series 5W-20 | **0W-20 (ASMQT) — VISCOSITY DISCREPANCY (guide confirms 0W-20, update to SS-0W20-QT)** | 6.9 qt | 10,000 mi | 7,500 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | **EA15K49 — MISMATCH. Update SKU** | 1 ea | 10,000 mi | 7,500 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | **75W-85 (SVLPK) — guide does NOT recommend 75W-140** | 2.0 qt | severe: inspect | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 9.8 qt | severe service | 60,000 mi | ☐ |

#### 2010-2018 · 4.6L V8

**AMSOIL Guide (2015, unitId for GX460):** Engine 4.6L V8 1UR-FE. Engine Oil → Signature Series 0W-20 (ASMQT). **Draft had SS-5W20 — DISCREPANCY.** Oil Filter → EA15K49.

GX 460 (same 1UR-FE engine as 2019+ but earlier calibration). Toyota factory spec was 5W-20 in North America, but AMSOIL guide says 0W-20.

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-5W20-QT — Signature Series 5W-20 | **0W-20 (ASMQT) — VISCOSITY DISCREPANCY** | 6.9 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | **EA15K49 — MISMATCH. Update SKU** | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | **75W-85 (SVLPK) — guide does NOT recommend 75W-140** | 2.0 qt | 30,000 mi | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 9.8 qt | severe service | 60,000 mi | ☐ |

#### 2005-2009 · 4.7L V8

**AMSOIL Guide (2007, unitId for GX470):** Engine 4.7L V8 2UZ-FE. Engine Oil → Signature Series 5W-30. Draft matches. Oil Filter → EA15K51. Differentials → 80W-90 (AGLPK) primary + 75W-90, 75W-110 options (older Toyota axle spec).

GX 470 (UZJ120 platform, 2UZ-FE engine).

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | **5W-30 (ASLQT) ✓ Matches** | 6.1 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | **EA15K51 — MISMATCH. Update SKU** | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **80W-90 (AGLPK) primary, 75W-90 alternate — older axle spec** | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | **80W-90 (AGLPK) primary — guide does NOT recommend 75W-140 for GX470** | 2.0 qt | 30,000 mi | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | **Multiple options: 80W-90, 75W-90 — confirm with installer** | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 9.8 qt | severe service | 60,000 mi | ☐ |

---

### Lexus RX350

#### 2015-2022 · 3.5L V6

**AMSOIL Guide (2018, unitId for RX350):** Engine 3.5L V6 2GR-FKS. Engine Oil → Signature Series 0W-20. Draft matches. Oil Filter → EA15K02.

FWD/AWD transverse platform (2GR-FKS or 2GR-FE depending on MY). Toyota spec'd 0W-20 for 2015+ in North America.

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-0W20-QT — Signature Series 0W-20 | **0W-20 (ASMQT) ✓ Matches** | 6.4 qt | 10,000 mi | 7,500 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | **EA15K02 — MISMATCH. Update SKU** | 1 ea | 10,000 mi | 7,500 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 7.4 qt | severe service | 60,000 mi | ☐ |

#### 2006-2012 · 3.5L V6

**AMSOIL Guide (2009, unitId for RX350):** Engine 3.5L V6 2GRFE. Engine Oil → Signature Series 5W-30 (ASLQT). **Draft had SS-5W30 ✓ Matches.** Oil Filter → EA15K02.

FWD/AWD transverse platform (2GR-FE). Toyota spec'd 5W-30 in early years.

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | **5W-30 (ASLQT) ✓ Matches** | 6.4 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | **EA15K02 — MISMATCH. Update SKU** | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 7.4 qt | severe service | 60,000 mi | ☐ |

**Note:** AWD RX350 has a rear differential/power transfer — not included (same rationale as RAV4/Highlander). Confirm if AWD coverage is wanted.

---

### Lexus LS460

#### 2007-2017 · 4.6L V8

**AMSOIL Guide (2012, unitId for LS460):** Engine 4.6L V8 (1UR-FSE). Engine Oil → Signature Series 0W-20. Draft matches. Oil Filter → EA15K49. Rear Differential → SEVERE GEAR 75W-85 (SVLPK). **Draft had SVG-75W90 — discrepancy.**

RWD platform (1UR-FSE engine, D-4S direct injection). No transfer case, no front diff. Rear diff is standard.

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-0W20-QT — Signature Series 0W-20 | **0W-20 (ASMQT) ✓ Matches** | 8.5 qt | 10,000 mi | 7,500 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | **EA15K49 — MISMATCH. Update SKU** | 1 ea | 10,000 mi | 7,500 mi | ☐ |
| Rear Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 1.9 qt | severe: inspect | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 9.8 qt | severe service | 60,000 mi | ☐ |

**Note:** LS460 oil capacity (8.5 qt) is highly uncertain — VERIFY against owner's manual. The 1UR-FSE has a larger oil sump.

---

### Lexus LX570

#### 2008-2021 · 5.7L V8

**AMSOIL Guide (2015, unitId for LX570):** Engine 5.7L V8 (3UR-FE). Engine Oil → Signature Series 0W-20. **Draft had SS-5W30 — MAJOR DISCREPANCY.** Oil Filter → EA15K04. Differentials → SEVERE GEAR 75W-85. Transfer Case → multiple options listed.

Body-on-frame, 4WD (same 3UR-FE as Tundra/Sequoia 5.7L V8). Uses Toyota 9.5" rear axle.

| System | AMSOIL Product (Draft) | AMSOIL Guide | Capacity (Draft) | Factory Interval | Proposed Tuned Interval | Verify |
|--------|----------------------|--------------|-----------------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | **0W-20 (ASMQT) — MAJOR VISCOSITY DISCREPANCY** | 7.4 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | **EA15K04 — MISMATCH. Update SKU** | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | **75W-85 (SVLPK) — viscosity discrepancy** | 1.9 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | **75W-85 (SVLPK) — guide does NOT recommend 75W-140 for LX570** | 2.4 qt | 30,000 mi | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | **Multiple options: 80W-90, 75W-90 — confirm with installer** | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | **ATF (ATLPK) ✓ Matches** | 9.8 qt | severe service | 60,000 mi | ☐ |

**Note:** LX570 rear diff capacity listed as 2.4 qt — the 9.5" ring gear axle used in the LX/Sequoia has a larger sump than the Tundra's 8" unit. Cross-check against LX570 service manual; 3.0–3.4 qt may be more accurate.

---

## Notes / Assumptions (prioritized by uncertainty)

The following values are the weakest links in this dataset. Verify these FIRST before enabling any generation.

### Highest priority — verify before enabling

1. **All oil filter SKUs need updating.** Every EAO-57, EAO-116, and EA15K34 in `site/amsoil-garage.json` is wrong per the AMSOIL guide. Correct codes: EA15K09 (T24A-FTS), EA15K51 (1GR-FE older/2TR-FE/2UZ-FE), EA15K02 (2GR-FKS/2GR-FE), EA15K49 (1GR-FE newer/1UR-FE), EA15K04 (3UR-FE/3UR-FBE). These also need to be added to the product catalog in amsoil-garage.json with verified prices. **No generation should go live until filter SKUs are corrected.**

2. **Gear lube viscosity — 75W-85 vs 75W-90/75W-140.** AMSOIL's guide consistently recommends SEVERE GEAR 75W-85 (SVL product family, not SVG) for Toyota differentials across virtually the entire lineup. The 75W-90 and 75W-140 choices in the draft may be incorrect per AMSOIL's own recommendations. Owner decision: follow AMSOIL's recommendation (75W-85, which matches Toyota's LT 75W-85 factory fill) or keep the more conservative 75W-90/75W-140.

3. **Engine oil viscosity on 3UR-FE/3UR-FBE (5.7L V8 platforms).** AMSOIL guide recommends 0W-20 for the 5.7L Tundra (2007-2021), Sequoia (2008-2022), Land Cruiser (2016-2021), and LX570 (2008-2021). Draft had 5W-30. Toyota's factory spec for these engines (especially pre-2015) was also 5W-30. This is a major discrepancy — confirm with AMSOIL dealer or service manual which is appropriate for tuned applications. Toyota updated the factory spec to 0W-20 for some late model years.

4. **Engine oil viscosity on 1GR-FE (4.0L V6) — newer generations.** AMSOIL guide recommends 0W-20 for 4Runner 2010-2024 and FJ Cruiser 2010-2014. Toyota's factory spec for 1GR-FE has been 5W-30 for most of this range. Same confirmation needed.

5. **LS460 oil capacity (8.5 qt).** The 1UR-FSE has a larger oil pan than other 1UR variants. The actual capacity may be 8.0–9.5 qt range. CHECK THE OWNER'S MANUAL — this is the single highest-risk capacity figure in the whole dataset.

6. **Sequoia and LX570 rear differential capacity (3.4 qt / 2.4 qt).** The 9.5" ring gear rear axle on these platforms holds more fluid than the Tundra's 8" unit. Both figures are estimates. VERIFY against service manual drain/fill procedure.

7. **2022+ Tundra transfer case.** AMSOIL guide confirms it is ATF-filled (Signature Series Fuel-Efficient ATF). The draft correctly omits a separate transfer case lubricant entry; however, a Transfer Case entry should be ADDED to the JSON with ATF (ATL-QT) to provide complete service information. Confirm capacity from service manual.

8. **4Runner / Tacoma 2024+ and 2025+ transfer case.** Guide does not list a Transfer Case Lubricant for the new GR platform T24A-FTS vehicles. Confirm with service manual whether it shares ATF or is sealed/maintenance-free.

### Medium priority

9. **Tundra 1st-gen (2000-2009) transmission — two different transmissions in range.** 2000-2006 Tundra used A340E 4-speed (≈8 qt). 2007-2009 used A750F 5-speed (≈9.8 qt). The capacity of 9.8 qt in the current data only applies to 2007-2009 trucks.

10. **4Runner 2005-2009 combined V6/V8 generation.** Oil capacity (5.5 qt) is for the 4.0L V6. The 4.7L V8 in this generation takes approximately 6.1 qt.

11. **FJ Cruiser 2007-2008 vs 2007-2009 generation overlap.** Three FJ Cruiser generations with overlapping years. Confirm whether both early-year rows should exist or be collapsed.

12. **Sequoia 4.6L V8 — re-query needed.** Year 2015 was used as representative but Sequoia dropped the 4.6L after 2012. Re-query using 2011 to get accurate data.

13. **RAV4, Highlander, and RX350 AWD rear differential.** All three are FWD/AWD platforms. Current data only includes engine + trans because the lineup doesn't distinguish AWD vs FWD trim. Decision is owner's.

### Lower priority (likely correct but confirm anyway)

14. **2025+ 4Runner oil filter.** Guide shows only WIX WL10332 — no AMSOIL Ea filter. Check if EA15K09 (T24A-FTS Tacoma 2024) is the same fitment for the 4Runner application.
15. **Transfer case fluid type across part-time 4WD platforms.** Guide lists multiple gear lube options (80W-90, 75W-90, 75W-110). For consistency and best practice, pick one recommendation after confirming the specific transfer case model with an installer.
16. **FJ Cruiser rear differential — 75W-140 in draft vs 80W-90 per guide.** Guide for both FJ generations returns 80W-90 (or 75W-90) as the primary differential recommendation, not 75W-140. Owner should confirm which is appropriate for the Torsen-style FJ rear diff.

---

## Product catalog — items to verify at amsoil.com

| SKU | Name | Draft Price | Draft Product Path | Status |
|-----|------|------------|-------------------|--------|
| SS-0W20-QT | Signature Series 0W-20 | $17.99 | /p/amsoil-signature-series-0w-20-100-synthetic-motor-oil-asm/ | Verified 2026-07-10 |
| SS-5W30-QT | Signature Series 5W-30 | $17.99 | /p/amsoil-signature-series-5w-30-100-synthetic-motor-oil-asl/ | Verified 2026-07-10 |
| SS-5W20-QT | Signature Series 5W-20 | $17.99 | /p/amsoil-signature-series-5w-20-100-synthetic-motor-oil-alm/ | Verified 2026-07-10 |
| EA15K34 | Ea Oil Filter EA15K34 | $10.60 | /p/amsoil-oil-filter-eaoilfilt/?code=EA15K34-EA | Verified 2026-07-10 — **but may need replacement by EA15K09 for 2022+ Tundra. Verify fitment.** |
| EAO-116 | Ea Oil Filter EAO-116 | $10.60 | /p/amsoil-oil-filter-eaoilfilt/?code=EAO116-EA | DRAFT — **Guide returns EA15K09 instead. Verify which is correct for T24A-FTS applications** |
| EAO-57 | Ea Oil Filter EAO-57 | $10.60 | /p/amsoil-oil-filter-eaoilfilt/?code=EAO57-EA | DRAFT — **Guide returns application-specific codes (EA15K51, EA15K02, EA15K49, EA15K04). Verify** |
| SVG-75W90-QT | SEVERE GEAR 75W-90 | $24.59 | /p/amsoil-severe-gear-75w-90-100-synthetic-gear-lube-svg/ | Verified 2026-07-10 — **Guide consistently recommends 75W-85 (SVL) instead. See discrepancy note** |
| SVG-75W140-QT | SEVERE GEAR 75W-140 | $26.69 | /p/amsoil-severe-gear-75w-140-100-synthetic-gear-lube-svo/ | Verified 2026-07-10 — **Guide does NOT recommend 75W-140 for any Toyota/Lexus in our lineup** |
| ATL-QT | Signature Series Multi-Vehicle ATF | $24.19 | /p/amsoil-signature-series-multi-vehicle-100-synthetic-automatic-transmission-fluid-atf/ | Verified 2026-07-10 ✓ |
| **EA15K09** | Ea Oil Filter EA15K09 | **NOT IN CATALOG** | TBD | **ADD — needed for T24A-FTS (2024+ Tacoma, 2025+ 4Runner, 2025+ LC, 2022+ Tundra)** |
| **EA15K51** | Ea Oil Filter EA15K51 | **NOT IN CATALOG** | TBD | **ADD — needed for 1GR-FE (older), 2TR-FE, 2UZ-FE applications** |
| **EA15K02** | Ea Oil Filter EA15K02 | **NOT IN CATALOG** | TBD | **ADD — needed for 2GR-FKS, 2GR-FE, 2GRFE applications** |
| **EA15K49** | Ea Oil Filter EA15K49 | **NOT IN CATALOG** | TBD | **ADD — needed for 1GR-FE (newer 2010+), 1UR-FE applications** |
| **EA15K04** | Ea Oil Filter EA15K04 | **NOT IN CATALOG** | TBD | **ADD — needed for 3UR-FE, 3UR-FBE applications** |
| **SVL-QT** | SEVERE GEAR 75W-85 | **NOT IN CATALOG** | TBD | **ADD if owner approves 75W-85 as differential recommendation per guide** |

---

## Operations

### Weekly price-sync agent

The weekly price-sync agent is responsible for keeping `retailPrice` and `salePrice` current in `site/amsoil-garage.json` by scraping the live amsoil.com product pages.

**Architecture decision (owner-confirmed):** amsoil.com is behind Cloudflare anti-bot protection, which blocks headless browser requests from server environments (Netlify functions, cloud agents). The price-sync will therefore run **locally** using a headed or stealth Puppeteer/Playwright instance that has access to a real browser profile. This approach bypasses Cloudflare by using a genuine browser session.

**How to run manually:**
```
node scripts/amsoil/price-sync.mjs
```

**Scheduled run:** A Windows Task Scheduler entry runs the sync weekly. The script is called as:
```
node scripts/amsoil/price-sync.mjs --commit
```
The `--commit` flag causes the script to automatically commit any price changes to the `amsoil-garage` branch (or master, depending on configuration). Slack notification is sent on completion or error via the existing `SLACK_WEBHOOK_URL` environment variable.

**Status:** The price-sync script architecture is defined; the Puppeteer/Playwright implementation is not yet built. This is a planned follow-on task after the fluid data is verified and the garage page is live.

### Signing off a generation

Once an installer or the owner has confirmed a generation's fluid data:

1. Open `site/amsoil-garage.json`
2. Find the generation by make → model → year/engine
3. Change `"verified": false` to `"verified": true`
4. Run `node --test tests/amsoil-garage-data.test.js` (should stay green)
5. Commit to `amsoil-fluid-data` branch and push/merge to master to go live

The garage page filters by `gen.verified === true` before displaying any vehicle data — so unverified generations remain hidden from customers until explicitly signed off.
