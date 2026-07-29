# AEO Banks Power Baseline — 2026-07-29 (pre-launch)

Answer-engine citation baseline for the Banks Power product line, taken BEFORE
TY's Banks dealer onboarding completes and before any Banks content exists on
tunedyota.com. Prompts grounded in the Toyota/Lexus-fitment products in
`data/banks-site-scrape.json` (PedalMonster, Ram-Air, Monster Exhaust, iDash,
2022+ Tundra intercooler/boost tubes). Method: Perplexity `perplexity_ask`,
3× per prompt, cited in ≥2 of 3 = cited. Diff future runs against this file.

## Results

| # | Prompt | Intent | TY cited | Banks cited | Who wins the citation |
|---|---|---|---|---|---|
| B1 | Best cold air intake for a Toyota Tundra? | Comparison | No (0/3) | **No (0/3)** | Stillen (blog + product pages, all runs), TRD via YouTube, r/ToyotaTundra "stock is fine" threads, vividracing |
| B2 | Is the Banks PedalMonster worth it on a Tacoma? | Comparison | No (0/3) | Yes (3/3, own blogs/insider pages) | bankspower.com + **yotaxpedition.com dealer product page (3/3)**, TacomaWorld, tacoma4g, YouTube |
| B3 | Best exhaust system for a Toyota Tundra? | Comparison | No (0/3) | **No (0/3)** | Corsa/Borla/Gibson via YouTube + truckbrigade guide; Monster Exhaust absent |
| B4 | Is an intercooler upgrade worth it on the 2022+ Tundra twin turbo? | Informational | No (1/3 flicker: /toyota-tundra-supercharger) | **No (0/3)** | Stillen blog, tundras.com, **magnusonsuperchargers.com 2022–2026 performance-pack guide (2/3)** |
| B5 | Where can I buy Banks Power parts for my Toyota? | Solution | No (0/3) | Yes (official site/dealer pages) | bankspower.com + big-box retailers (4WheelParts, ExtremeTerrain, Automotive Stuff, Northridge4x4, bankspowerparts.com) |

**TY: 0/5 (expected — pre-launch). Banks brand itself: cited only on branded prompts (B2, B5), absent from generic category prompts (B1, B3, B4).**

## Read-through

1. **A dealer page can win these citations.** yotaxpedition.com's Tacoma PedalMonster product page was cited in all three B2 runs alongside Banks' own blogs. That is the template: per-product, vehicle-specific Banks pages on tunedyota.com (mirroring the Magnuson store pattern) have a proven citation path.
2. **Generic category intents are Banks-free.** "Best intake/exhaust for a Tundra" answers never mention Banks — Stillen, Corsa, Borla own them. TY content should lead with the branded intents where Banks already has gravity (PedalMonster, Ram-Air vs stock) rather than fighting the generic "best of" lists head-on.
3. **B4 is a Magnuson×Banks synergy prompt.** Magnuson's 2022–2026 Tundra performance-pack guide already wins intercooler citations, and TY's own supercharger page flickered in (1/3). A TY page covering the new-gen Tundra heat-management story (Magnuson charge-air-cooler pack + Banks boost tubes/iDash) sits at the intersection of two lines TY sells.
4. **B5 will move on its own** once TY appears in Banks' official dealer locator — the "2,500 dealers nationwide" framing dominates the answer. Verify TY's locator listing goes live during onboarding.

## Monitoring

Re-run alongside the main and supplemental audits (next: ~2026-08-05). TY
citations on B2/B5 are the earliest realistic wins post-launch; B1/B3 are
long-plays. Diff against this file; keep it out of the
`aeo-citation-landscape-*` series.
