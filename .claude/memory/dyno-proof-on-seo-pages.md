---
name: dyno-proof-on-seo-pages
description: "Real dyno charts are LIVE across the supported lineup (8 pages, 9 chart instances) — the rollout governed by the add-dyno-proof skill; what's covered, the shared-platform reuse, and what has no data"
metadata: 
  node_type: memory
  type: project
  originSessionId: e5319100-6ade-4bc9-95a6-c9423d101c2c
---

Real Dynojet proof shipped across the Tuned Yota site over 2026-06-27/28, governed by the
[[add-dyno-proof]] skill. Charts are curated into the **published** `site/images/dyno/`; the
raw library stays in **gitignored** `assets-source/` (see [[advertising-graphics-project]]).

**Live — 9 chart instances on 8 pages:**
- **Magnuson supercharger guide** — Tundra 5.7 V8 **~292→450 whp** (Magnuson Stage 1),
  Tacoma 3.5 V6 ~246→362, 4Runner 4.0 V6 ~334 whp.
- **Vehicle pages (NA Stock-vs-OTT)** — Tundra 5.7 (~301→307 whp, **+27 lb-ft, ~860 rpm
  earlier**), Tacoma 3.5 (~246→255), 4Runner 4.0 (~232→250), Sequoia, Land Cruiser, FJ
  Cruiser, and Lexus GX (**two** charts: GX460 4.6 V8 ~211→220, GX470 4.7 V8 ~183→192).

**Shared-platform reuse (labeled honestly, never fabricated):** Sequoia + Land Cruiser 5.7 V8
reuse the **Tundra** pull; FJ Cruiser 4.0 V6 reuses the **4Runner** pull — each captioned
"… shared platform · pull run on a [vehicle]". Lexus GX has its own real GX460/GX470 pulls.

**No dyno data (would need real pulls):** Camry, Highlander, RAV4, Lexus RX350, Lexus LS460.

**House rules baked into every embed:** numbers confirmed before publishing (public claims);
NA tunes framed torque/midrange/drivability-first (modest peak HP); required "results vary by
build, fuel & mods"; `ImageObject` schema (`@graph` when >1 chart); **FAQ accordions untouched**
to avoid FAQPage-schema desync; charts credited "Overland Tailor Tuning". Honest framing also
satisfies [[brand-rules-locked]].

**Still pending (owner) — SEO money-page number gaps (exact locations, audited 2026-07-07; owner chose to leave the whole set OPEN):**
1. **Pricing — 5 "Call for pricing" cells** (the only literal placeholders):
   - `site/magnuson-supercharger-guide.html` lines 113–115 = Tacoma 3.5L V6 / Tacoma-4Runner-FJ 4.0L V6 / Tundra-Sequoia-LC 5.7L V8 kit+install+cal "from" prices.
   - `site/ott-tune-cost.html` lines 117–118 = Custom calibration + Supercharger+calibration prices.
2. **Magnuson 4.0L gain row** (`magnuson-supercharger-guide.html` line 114) shows only `~334 whp (Magnuson)` — missing the stock baseline + `+gain` delta the 3.5L/5.7L rows have. Needs a verified stock 4.0L dyno number to read `~XXX→~334 (+XX)`; else leave as-is (honest, just non-parallel).
3. **CARB nuance** (`site/tune-warranty-emissions-legality.html` line 107 + FAQ lines 32/130) is a deliberate "varies by state — contact us" hedge. NOT a number — a legal/positioning wording call only owner can make (tighten to a firmer emissions-intact/state-specific stance, or keep the hedge). See [[brand-rules-locked]].
Fill path when data arrives: edit cells → `npm run build:seo` → tests → ship. See [[search-ai-visibility-program]].
