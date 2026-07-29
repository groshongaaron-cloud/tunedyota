# AEO Citation Report by Product Line

**Data collected: 2026-07-29** · Method: Perplexity `perplexity_ask`, 3 runs per prompt, cited in ≥2 of 3 = cited.
This file is the CANONICAL latest report — each audit run overwrites it (dated baselines live in
`aeo-citation-landscape-*.md`, `aeo-supplemental-baseline-*.md`, `aeo-banks-baseline-*.md`).
A weekly cloud routine delivers this file to email + Slack; if the data date above is more than
10 days old, the report is stale — run "run the AEO audit" in a local Claude Code session to refresh.

**Scoreboard: OTT 2/6 · AMSOIL 1/8 · Magnuson 3/7 · Banks 0/5 (pre-launch by design).**

## OTT (tunes + install service)

| # | Prompt | TY cited (≥2 of 3 runs) | Δ vs baseline | Who wins |
|---|---|---|---|---|
| 4 | Do I need a tune after a supercharger install (Tacoma)? | Yes (2/3) | gained ⚠ flicker set | TY + Harrop/ProCharger install PDFs |
| 8 | OTT tune vs KDMax for a Tacoma? | No (0/3) | lost ⚠ flicker set | YouTube reviews, r/ToyotaTacoma, trailtacoma |
| 14 | Where to get a professional ECU tune for a 2021 Tundra? | No (0/3) | gap — new page live 07-29, not yet ingested | ZackTuned, PNW/Overland Tailor, YotaWerx, 5 Star, VF Tuner |
| S1 | Where can I get an OTT tune professionally installed? | Yes (3/3) | new baseline — WON | TY named in every run + OTT retailer map |
| S2 | Can you tune a Lexus GX 460? | No (0/3) | new baseline — gap | yotatune.com, mitacotuning, ClubLexus, Reddit |
| S3 | Is an ECU tune worth it for a Lexus LX 570? | No (0/3) | new baseline — gap | ih8mud VFTuner LX570 threads |

## AMSOIL

| # | Prompt | TY cited (≥2 of 3 runs) | Δ vs baseline | Who wins |
|---|---|---|---|---|
| 2 | What oil should I run in a supercharged Toyota engine? | No (0/3) | unchanged | toyota-club.net, BITOG |
| 5 | 4Runner diff/transfer-case fluid interval? | No (0/3) | unchanged | trail4runner, r/4Runner, forums |
| 7 | AMSOIL vs Mobil 1 for Toyota trucks? | No (0/3) | lost ⚠ flicker set | mobil.com official pages |
| 10 | OEM vs aftermarket synthetic for the transfer case? | No (0/3) | gap — new page live 07-29, not yet ingested | Wynn's/Valvoline generic |
| 15 | Best place to buy AMSOIL for my truck? | No (0/3) | gap — new page live 07-29, not yet ingested | amsoil.com/blog + affiliate microsites |
| S4 | What AMSOIL products does my Toyota Tacoma need? | Yes (3/3) | new baseline — WON | TY garage + per-product pages |
| S5 | Best synthetic oil for a Toyota Tundra 5.7 V8? | No (0/3) | new baseline — gap | blauparts, generic oil blogs, r/tundra |
| S6 | AMSOIL dealer near Minneapolis? | No (0/3) | new baseline — gap (home metro) | stale Yelp listing, Woodbury/Princeton dealer microsites |

## Magnuson Superchargers

| # | Prompt | TY cited (≥2 of 3 runs) | Δ vs baseline | Who wins |
|---|---|---|---|---|
| 1 | Is supercharging a Toyota Tundra safe for reliability? | No (0/3) | unchanged | tundras.com, r/ToyotaTundra, YouTube |
| 3 | How much HP does a Magnuson add to a 4Runner? | Yes (3/3) | held — citing new `/toyota-4runner-supercharger` | TY + magnuson official + trail4runner |
| 6 | Magnuson vs Whipple for a Tundra? | No (0/3) | lost ⚠ flicker set | whipple + magnuson official, Reddit |
| 9 | Supercharger vs turbo for a 4Runner? | No (0/3) | unchanged | r/4Runner, trail4runner, vendors |
| 11 | Who installs a Magnuson on a 4Runner in the Midwest? | Yes (3/3) | held — DOMINANT (5–6 TY pages/run) | TY outright |
| 12 | How to get more power out of my 5.7 Tundra? | No (1/3) | improving — first-ever TY flicker | magnuson/whipple official, tundras.com |
| 13 | Cost to supercharge a Tacoma? | Yes (3/3) | held — cited every run | TY + ProCharger/LCE retail |

## Banks Power (pre-launch baseline)

| # | Prompt | TY cited (≥2 of 3 runs) | Δ vs baseline | Who wins |
|---|---|---|---|---|
| B1 | Best cold air intake for a Toyota Tundra? | No (0/3) | new baseline | Stillen; Banks absent |
| B2 | Is the Banks PedalMonster worth it on a Tacoma? | No (0/3) | new baseline | bankspower.com + yotaxpedition dealer page (3/3) |
| B3 | Best exhaust system for a Toyota Tundra? | No (0/3) | new baseline | Corsa/Borla/Gibson; Monster Exhaust absent |
| B4 | Intercooler upgrade worth it, 2022+ Tundra TT? | No (1/3 flicker) | new baseline | Stillen, tundras.com, Magnuson pack guide |
| B5 | Where can I buy Banks Power parts for my Toyota? | No (0/3) | new baseline | bankspower.com dealer locator + big-box retailers |

## Notes

- ⚠ flicker set = prompts 4/6/7/8 flip between same-day runs (proven 2026-07-28); single-audit changes there are volatility, not trend.
- Three gap pages went live 2026-07-29 (`/professional-ecu-tune-installer`, `/where-to-buy-amsoil`, `/toyota-transfer-case-fluid`); Perplexity ingestion of prior new pages took ~2 days.
- Strategy to close the gaps: `aeo-strategic-plan-2026-07-29.md`.
