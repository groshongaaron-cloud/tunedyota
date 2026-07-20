# AMSOIL Competitive Review & Outrank Strategy — 2026-07-20

Fresh SERP sweep building on the 2026-07-13 six-competitor analysis
(`amsoil-national-sales-strategy.md`). Goal per Aaron: outrank and outperform the
prominent AMSOIL dealers as **the Midwest Toyota & Lexus experts** with the
AMSOIL + Magnuson niche. Model unchanged: referral (`?zo=30713116`) + in-person
sales + personal communications + the Reserve flow.

## What today's SERPs actually show (checked 2026-07-20)

**1. Vehicle-intent queries — NO dealer ranks. This is the open lane.**
"best oil for toyota tundra 5.7 amsoil" returns: AMSOIL's own lookup, Facebook,
tundras.com, YouTube, Reddit, bobistheoilguy. Zero dealer sites. The dealer pack
(BuyOilDirect, Synthetics USA, Synthetic Garage) only holds generic "buy AMSOIL"
queries, where their 2011-2018 domain age defends them. **Conclusion: we don't
outrank the dealers on their turf first — we take the vehicle turf none of them
can touch, where our competition is forums, not dealers.**

**2. The capacity SERP is pure confusion — and we hold the verified answer.**
"toyota tundra 5.7 oil capacity" returns four forum threads ARGUING (7.4 vs 7.9
vs 8.5 vs 9.8 quarts — the 9.8 is Toyota's "total fill" spec misread as service
fill), AMSOIL's lookup, and Blauparts' year-split guide at #4. Our garage now has
**cross-verified, year-split capacities for every generation** (the 5.7L alone is
7.4 / 7.9 / 8.5 by year) — exactly the authoritative table that SERP lacks, and
exactly what AI engines synthesize from. Blauparts ranking #4 with this content
style proves the format wins.

**3. Local MN — five generalist dealers, none Toyota-specific, and we're absent.**
"amsoil dealer minnesota" returns amsoil.com's locator + amssyntheticoil.com
(Lino Lakes), cardey4everoil (Grasston), mikeford.shop (Ham Lake), southsidelube
(Farmington), motorsportsoils (Cambridge). All generalists. The known blocker is
ours, not theirs: **no Google Business Profile** — state pages already rank pos
2-5 with ~0 impressions until GBP exists.

## The strategy — five plays, in priority order

**Play 1 — Weaponize the verified capacity data (the wedge; build next).**
Add to each of the 13 vehicle AMSOIL pages: a year-split "Oil capacity —
verified" section (the garage data, rendered as a clean table with the
generation splits), a direct answer to the forum confusion ("Is it 7.4, 7.9 or
9.8?"), and matching FAQPage schema. Same for diffs/transfer where verified.
No dealer, and no forum thread, can match cross-verified year-split tables.
This targets "[model] oil capacity" (highest-volume AMSOIL-adjacent query
family), "best oil for [model]", and the AI-answer layer simultaneously.
Generator: `scripts/build-amsoil-pages.mjs` (never hand-edit output).

**Play 2 — GBP (Aaron's keystone task; everything local waits on it).**
The five MN generalist dealers are beatable on niche authority alone, but not
while we're invisible in the local pack. Playbook already written:
`docs/seo/gbp-setup.md`. Physical location + install events = review engine no
mail-order dealer can copy.

**Play 3 — Convert what we capture (already built — operate it).**
The conversion moat is live and competitors structurally can't copy it:
Reserve flow (kit → lead pipeline → personal close), PC enrollment at the
certificate + account + garage moments, cert QR + follow-up emails, referral
loop. Competitors leak 100% of visitors to amsoil.com and capture nothing.
Operating discipline: work `amsoil-reserve` leads same-day; push PC at every
in-person payment moment (Elavon card-present = a face-to-face PC pitch).

**Play 4 — Measure the wedge (add to the live monthly engine).**
Add to `docs/seo/tracked-queries.json`: "[tundra|tacoma|4runner] oil capacity",
"best oil for [tuned] tundra", "amsoil tundra", "amsoil dealer minnesota".
The monthly local runner (Task Scheduler, 1st @ 8am) + Perplexity citation probe
(31% baseline) then proves/disproves each play with real positions.

**Play 5 — Front B continues at maintenance pace (don't fight age head-on).**
The guide library (0W-20/5W-30/ATF/filter guides live) and state pages keep
compounding, but new investment goes to Plays 1-3 first: the niche lane is
uncontested TODAY; the generic lane is a multi-year domain-age grind.

## Why we win

Every prominent dealer is a marketing site wrapping the same referral link.
Tuned Yota is the only one that: touches the vehicles (installs → E-E-A-T +
reviews + content), holds verified fitment data (capacities no one else has
cross-checked), owns a captive high-trust moment (certificate), sells Magnuson
performance alongside (a customer no generic dealer can serve), and has a
physical Midwest presence (GBP + events + card-present). The dealers compete on
domain age; we compete on being the only actual experts in the room.
