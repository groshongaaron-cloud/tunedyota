# AEO Citation Landscape — Baseline 2026-07-27

Answer-engine (Perplexity) citation audit for Tuned Yota's market: superchargers,
fluids/oil, parts. 15 simulated customer prompts across three intents; for each,
the cited source domains were recorded. This file is the BASELINE — the
`aeo-monitor` agent re-runs the same prompts and diffs against it.

## Reddit citation table (the tracked-prompt audit)

| # | Tracked Prompt | Primary User Intent | Reddit Cited | Subreddit / angle favored by the AI |
|---|---|---|---|---|
| 1 | Is supercharging a Toyota Tundra safe for reliability? | Informational | Yes | r/ToyotaTundra — owner reliability anecdotes (130k-mi blown 5.7 stories; "don't boost a worn engine") |
| 2 | What oil should I run in a supercharged Toyota engine? | Informational | Yes | Peripheral: r/Supra, r/ToyotaTacoma — brand/viscosity debate; specs carried by toyota-club.net + BITOG |
| 3 | How much HP does a Magnuson add to a 4Runner? | Informational | Yes | r/4Runner — real-world dyno/longevity datapoints (**tunedyota.com Magnuson guide cited**) |
| 4 | Do I need a tune after a supercharger install (Tacoma)? | Informational | Yes | r/ToyotaTacoma — "must re-tune so the ECU knows" consensus (an OTT thread) |
| 5 | 4Runner diff/transfer-case fluid interval? | Informational | Yes | r/4Runner (×7) — 30k/60k owner-interval consensus |
| 6 | Magnuson vs Whipple for a Tundra? | Comparison | Yes | r/ToyotaTundra (×4) — "Magnuson proven/safe, Whipple headroom" (**tunedyota.com cited for specs/pricing**) |
| 7 | AMSOIL vs Mobil 1 for Toyota trucks? | Comparison | Yes | r/ToyotaTacoma, r/COROLLA — "quality oil on time is fine; AMSOIL pays off run-hard/extended drains" (**tunedyota.com cited on warranty point**) |
| 8 | OTT tune vs KDMax for a Tacoma? | Comparison | Yes | r/ToyotaTacoma (×5), r/Tacomaworld, r/KDMaxPro — Reddit testimonials DECIDED the verdict ("ran both, stayed with OTT"); **tunedyota.com cited as dyno source** |
| 9 | Supercharger vs turbo for a 4Runner? | Comparison | Yes | r/4Runner, r/explainlikeimfive — "SC for daily/off-road" consensus |
| 10 | OEM vs aftermarket synthetic for the transfer case? | Comparison | Yes | r/Toyota, r/ToyotaTacoma — GL-5/LSD caution; legacy forums dominate (TY absent — **gap**) |
| 11 | Who installs a Magnuson on a 4Runner in the Midwest? | Solution | Yes | r/4Runner (minor) — **tunedyota.com is the #1 named recommendation with phone number** (competitors: Modern Muscle MO, Adventure Motors MO, Mr. Kustom Chicago) |
| 12 | How to get more power out of my 5.7 Tundra? | Solution | Yes | r/ToyotaTundra (×3) — mod skepticism ("chips/spacers are hype; headers or blower") |
| 13 | Cost to supercharge a Tacoma? | Solution | Yes | r/ToyotaTacoma (×3) — owner cost anchors ($4.5k–$8k all-in); **tunedyota.com cited for retail pricing** |
| 14 | Where to get a professional ECU tune for a 2021 Tundra? | Solution | Yes | r/ToyotaTundra (×3) — KDMax's installer network won the rec via Reddit; TY not cited (**biggest gap**) |
| 15 | Best place to buy AMSOIL for my truck? | Solution | **No** | — AMSOIL dealer-affiliate microsites own the entire answer; TY hubs absent (**gap**) |

**Reddit cited: 14/15. tunedyota.com cited: 6/15.**

## Full citation-source landscape (all domains, by role in the synthesis)

| Source layer | Domains the AI leans on | Role in the answer |
|---|---|---|
| Reddit | r/ToyotaTacoma, r/Tacomaworld, r/4Runner, r/ToyotaTundra (+ r/Toyota, r/tundra) | Owner sentiment, consensus, real costs, reliability anecdotes — often decides "worth it" verdicts |
| Legacy forums | tundras.com, tundratalk.net, yotatech.com, toyota-4runner.org, 4runners.com, trailtacoma.com, tacoma3g, ih8mud, bobistheoilguy.com | Technical specs, intervals, oil analysis — dominates fluids questions |
| Enthusiast blogs | trail4runner.com (dyno articles), tacomaexplorer.com | Structured how-to/dyno content |
| Vendor/manufacturer | magnusonsuperchargers.com, install PDFs, procharger.com, vividracing | Official numbers, kit specs |
| YouTube | dyno + install videos | Visual proof layer |
| Auto media | MotorTrend, Car and Driver, Hagerty | Generic explainers (SC vs turbo) |
| AMSOIL affiliate microsites | buyoildirect, buyusaoil, performanceoiltechnology, selectsynthetics, technilube, blog.amsoil.com | Own the entire "where to buy AMSOIL" answer |
| **tunedyota.com** | Magnuson guide, Tacoma supercharger pricing, AMSOIL/warranty content, dyno data | Cited 6/15 — strongest on Magnuson-intent |

## Gaps and plan

1. **ECU-tune installer query (prompt 14) — top priority.** KDMax's "nationwide installer network" narrative wins via Reddit. TY needs: (a) AEO-shaped page targeting "professional OTT tune installer" language, (b) Reddit presence in OTT threads (the scout digest's #1 pattern).
2. **AMSOIL purchase query (prompt 15).** Affiliate microsites win on "buy direct / Preferred Customer" framing. TY's /amsoil-products hubs need where-to-buy/PC-program AEO content.
3. **Transfer-case fluid (prompt 10).** Legacy forums own it; TY holds real expertise (2013+ Tundra transfer = Toyota 75W, never SVL) that isn't in the citation pool — a content page turns this.
4. **Defend the Magnuson position** (prompts 3/6/11/13) — already winning; keep the guide/pricing pages fresh.
5. **Reddit engagement** — per the reddit-scout digest: OTT worth-it threads, supercharger-on-a-daily threads, oil-after-supercharging. Helpful-expert answers only.

## Monitoring

- `reddit-scout` agent (user-level agent registry): thread/subreddit digest on demand.
- `aeo-monitor` agent: re-runs the 15 prompts above via Perplexity, diffs citations vs this file, reports movement (TY citations gained/lost, new competitors, Reddit share).
- Cadence: owner-triggered (suggest monthly, or before/after publishing gap-closing content).
