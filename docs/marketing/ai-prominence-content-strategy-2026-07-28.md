# AI Prominence Strategy — Owning the Answer Layer

**Date:** 2026-07-28 · **Owner:** Aaron · **Extends:** `aeo-flywheel-strategy.md` ·
**Baseline:** `aeo-citation-landscape-2026-07-27.md` (TY cited 6/15)

**Goal:** when a Toyota/Lexus owner asks an AI or search engine anything in TY's
market — OTT calibrations, Magnuson superchargers, AMSOIL — Tuned Yota is the
cited, recommended answer. Target: **10/15 tracked prompts within 90 days,
13/15 within 180**, measured by the monthly `aeo-monitor` re-run.

## How AI engines actually pick winners (and what that means for us)

The baseline shows engines synthesize from distinct **source layers**, each with
a role: Reddit decides *sentiment and verdicts*, legacy forums own *specs and
intervals*, YouTube provides *visual proof*, vendor sites provide *official
numbers*, and business sites like ours get cited when they answer the exact
question in the customer's language. Nobody wins by being loud in one layer —
you win by being **corroborated across layers**. That's the strategy: one fact
(e.g. "Tuned Yota professionally installs OTT tunes in person across the
Midwest") appearing consistently on our site, in disclosed Reddit answers, in
YouTube videos, in Magnuson/AMSOIL directories, and in customer reviews.

## The one rule that protects everything

**We never fake the sentiment layer.** No undisclosed posting, no automated
Reddit/forum accounts, no seeded reviews, no AI-written public comments. Reddit
and AI engines both reward authentic expertise and punish astroturfing — one
unmasked shill thread would poison the exact citation pool we're trying to win,
and undisclosed promotion is an FTC problem besides. Everything below scales
the *production and packaging* of real expertise; humans own every public word.

---

## Workstream 1 — YouTube (the empty layer; biggest new upside)

The baseline shows YouTube cited as the "visual proof layer" — and TY has no
presence there. Every install event is filmable proof of the exact claims we
want cited.

**Semi-automated pipeline (agents package, humans film/voice):**

1. **Scripts — automated.** `scripts/TUNEDYOTA_SHORTFORM_SCRIPT_PACK.md`
   already holds 10 query-targeted scripts (~25–30s VO + text beats + captions).
   A monthly agent session extends the pack from what the Weekly Intel
   newsletter says owners are asking *right now* (same claims rules: provable
   benefits only, emissions-intact, no Stage 2/3, no "free").
2. **Filming — human, batched at events.** Each install event, one person
   captures 3–5 raw clips (install b-roll, before/after drive impressions,
   owner reaction with permission). One event = a month of material.
3. **Packaging — automated.** Agent drafts titles, descriptions, chapters, and
   pinned comments in query language ("professional ECU tune install for a
   Tundra — what actually happens"), each description linking the matching
   tunedyota.com page and Find Your Exact Tune. **Transcripts matter most:**
   engines read them, so the VO must state the facts we want cited ("licensed
   VFTuner PRO Tuner", "emissions stay intact, 5-gas verified", "installed in
   person across MN·IA·WI·ND·SD·NE").
4. **Cadence:** 2 Shorts/week + 1 longer install-walkthrough per month. Aaron
   approves before anything publishes.

Longer-term: dyno pulls and data-logged before/afters become the citable
numbers layer no competitor in this niche publishes properly.

## Workstream 2 — Reddit (scale the flywheel, don't automate it)

Already designed and running (flywheel ENGAGE step + Monday newsletter queue).
What changes:

- **Accountability:** the newsletter's "suggested owner per thread" becomes an
  expectation — 1–3 answered threads per installer per week; the following
  newsletter reports who answered what (visible streak, no nagging).
- **Karma-first accounts:** each installer's account should be an established,
  history-rich profile (genuine participation beyond TY topics) — new accounts
  that only talk about one shop read as shills and get filtered.
- **The 5 standing patterns** (OTT worth-it, supercharger-on-a-daily,
  oil-after-supercharging, keep-the-5.7, tune-vs-regear-for-big-tires) each get
  a canonical, personal, disclosed answer the team refines over time — the
  repeated consistent answer is what engines learn to attribute.
- **Legacy forums join the rotation:** tundras.com, TacomaWorld, IH8MUD,
  toyota-4runner.org, bobistheoilguy — they *own* the fluids/specs queries
  (gap #10). Same rules: disclosed, answer-first, sparse links. One good
  technical thread on a legacy forum outranks ten Reddit comments for
  transfer-case-fluid queries.

## Workstream 3 — On-site (finish the gap pages, keep defending)

| When | Page | Closes |
|---|---|---|
| ✅ Shipped 2026-07-28 | `/professional-ecu-tune-installer` | Gap #14 (installer query — was the biggest) |
| August | Where-to-buy-AMSOIL / Preferred Customer page | Gap #15 (affiliate microsites own it) |
| September | Toyota transfer-case fluid explainer (Toyota 75W; never SVL for 2013+ Tundra transfer) | Gap #10 (legacy forums own it) |
| Ongoing | Keep Magnuson guide + pricing fresh; refresh dyno data | Defends prompts 3/6/11/13 |

Every new page: answer-first opening, FAQPage + Service schema, customer
question language, funnel hook. IndexNow on publish (`npm run indexnow`).

## Workstream 4 — Third-party corroboration (the trust layer we don't control)

Engines cross-check. Fastest wins, all Aaron-gated, mostly one-time:

1. **Magnuson dealer locator** — confirm TY's listing on magnusonsuperchargers.com
   is present/complete. The baseline shows engines citing Magnuson's official
   site; their installer page corroborates "authorized installer" directly.
2. **AMSOIL dealer locator** — same, for the AMSOIL dealer page.
3. **Google Business Profile** — reviews are the highest-leverage citation we
   under-use. The review-ask automation is already built and dormant — it
   activates the moment `GOOGLE_REVIEW_URL` is set in Netlify env (requires the
   GBP to finish verification first — as of 2026-07-28 the profile is not yet
   publicly listed). **Once GBP is live this is a five-minute unlock.** More
   fresh, specific reviews ("Cody installed my OTT
   tune in Sioux Falls…") feed both Maps and AI answers.
4. **OTT/VFTuner official channels** — wherever Overland Tailor lists
   installers, TY should be listed with a link back.
5. **Local/enthusiast press** — one pitch per quarter (event announcements to
   local outlets; install-day invites to Toyota YouTubers/bloggers like
   trail4runner). Earned mentions in the blogs engines already cite.

## Measurement (already automated)

- **Monthly:** `aeo-monitor` full 15-prompt Perplexity re-measure (local
  session), new dated baseline committed. Cloud "TY Monthly AEO Pulse" routine
  reminds on the 1st and runs an approximate web sweep between measures.
- **Weekly:** newsletter reports engagement-queue completion + AEO trend.
- **Success =** prompt-level movement: gap prompts flipping to cited; defended
  prompts staying cited; YouTube videos appearing in the citation pool.

## Division of labor

| Actor | Does | Never does |
|---|---|---|
| Agents (scheduled + on-demand) | Scripts, packaging, drafts, queues, measurement, page builds | Post publicly, publish video, send email, review anything |
| Installers | Film clips at events, voice VO, answer queued threads (disclosed) | Undisclosed promotion, guardrail topics |
| Aaron | Approvals, directory listings, GBP unlock, sensitive threads | — |
