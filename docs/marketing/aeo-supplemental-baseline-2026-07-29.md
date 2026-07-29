# AEO Supplemental Baseline — OTT Install (Toyota & Lexus) + AMSOIL Products — 2026-07-29

Supplemental answer-engine citation audit covering intents NOT in the committed
15-prompt set (`aeo-citation-landscape-2026-07-27.md`): the OTT install service
across Toyota AND Lexus, and the AMSOIL product lines TY sells. Method identical
to the main audit: Perplexity `perplexity_ask`, each prompt run 3×, cited in ≥2
of 3 = cited. This file is the BASELINE for these prompts — it is deliberately
outside the `aeo-citation-landscape-*` series so it never pollutes the 15-prompt
diff. Run same-day as the 2026-07-29 re-audit of the main set.

## Results

| # | Supplemental Prompt | Intent | TY cited | Who wins the citation |
|---|---|---|---|---|
| S1 | Where can I get an OTT tune professionally installed? | Solution | **Yes (3/3)** — homepage, /ott-tune, /faq; named the Upper Midwest option in every run | TY + overlandtailor.com retailer map; Adventure Motors (MO), ALTG (TX), Master Yota (NJ), Toyogenics (AB) appear as regional peers |
| S2 | Can you tune a Lexus GX 460? | Informational | **No (0/3)** | yotatune.com/lexusgx, mitacotuning, ClubLexus, r/GXOR, r/LexusGX, amttuning, ih8mud |
| S3 | Is an ECU tune worth it for a Lexus LX 570? | Comparison | **No (0/3)** | ih8mud VFTuner LX570/LC200 threads dominate all 3 runs; r/LandCruisers, YouTube, autochip.eu |
| S4 | What AMSOIL products does my Toyota Tacoma need? | Solution | **Yes (3/3)** — /amsoil-toyota-tacoma in every run, plus per-product pages (Signature Series 0W-20, Ea filter EA15K09) in 2 of 3 | TY + amsoil.com lookup + haldimandsyntheticoil.ca |
| S5 | Best synthetic oil for a Toyota Tundra 5.7 V8? | Informational | **No (0/3)** — AMSOIL cited as a brand in 2 of 3 runs, but via amsoil.com lookup, never TY | blauparts.com, ahgautoservice, generic oil blogs, r/tundra, BITOG |
| S6 | AMSOIL dealer near Minneapolis? | Solution (local) | **No (0/3)** | Stale Yelp/MapQuest listing (2504 4th St NE), Mill City Synthetics (Woodbury), Patriot Oils (Princeton), selectsynthetics dealer lists |

**TY cited: 2/6.** Both wins are pages that existed pre-overhaul (homepage/faq/ott-tune; AMSOIL garage + product pages).

## Read-through

1. **OTT install service (Toyota): already won.** S1 names Tuned Yota in all three runs with service-area detail. The generic install intent is covered; prompt 14 of the main set (2021 Tundra ECU tune) remains the open front — the new `/professional-ecu-tune-installer` page (live 2026-07-29) targets it and awaits ingestion.
2. **Lexus is the real hole.** Zero TY citations on either Lexus prompt despite live `/lexus-gx-ott-tune` and LX pages. Notably, S3's winning source is ih8mud threads about **VFTuner** tuning on the LX 570 — the exact platform TY's tuners are licensed on (PRO). TY has a legitimate claim to this conversation and is absent from it.
3. **AMSOIL vehicle-fitment intent: won. Oil-advice and local intents: open.** The garage pages win "what products does my truck need" (S4) but not "best oil for the 5.7" (S5) — an advice-shaped question the amsoil-toyota-tundra hub doesn't answer in advice-shaped language. S6 shows TY absent for AMSOIL purchase intent in its own metro; the new `/where-to-buy-amsoil` page (live 2026-07-29) is the candidate fix but carries no Twin Cities-specific language.

## Recommended content actions (not yet executed)

- **Lexus AEO block:** add question-shaped FAQ content ("Can you tune a Lexus GX 460?" / "Is a tune worth it on an LX 570?") to the Lexus OTT pages, leaning on the licensed-VFTuner-PRO angle that already wins ih8mud's citations. Cross-link from /professional-ecu-tune-installer.
- **Tundra oil-advice block:** add "best synthetic oil for the 5.7" FAQ language to /amsoil-toyota-tundra (spec-verbatim per spec-claim rules: 0W-20, ILSAC/API per owner's manual).
- **Local where-to-buy block:** add Twin Cities / Lakeville MN local-pickup-and-shipping language to /where-to-buy-amsoil so it competes for "dealer near Minneapolis" intent.

## Proposed tracked-prompt additions

Per the aeo-monitor guardrail, new prompts are proposed here, not silently added
to the 15-prompt set. Proposal: adopt S2, S3, S5, S6 as tracked prompts 16–19
(S1 and S4 are won and can be spot-checked in supplemental runs). Decision owner: Aaron.

## Monitoring

Re-run alongside the main 15-prompt audit (next: ~2026-08-05, post-overhaul
ingestion check). Diff against this file.
