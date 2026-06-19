# Phase 2 — Local visibility (search + AI)

**Date:** 2026-06-19
**Status:** Draft for review
**Program:** Phase 2 of 3 of the search + AI-visibility program. Phase 1 (content + AEO) is in progress on the `seo-aeo-pages` branch (3 pages clean; supercharger guide parked pending owner gains/years). Phase 3 = on-page CTR + internal linking + measurement.

## Goal

Win **local/geo queries** ("Toyota/Lexus engine tuning in Wisconsin," "where to find tuning in [state]," "Upper Midwest Toyota tuning") and the AI answers for them. These are decided by **local relevance + trust signals**, not by who's the best value — so the work is location-matched on-site content **plus** off-site local presence. The **Google Business Profile is the keystone** for these queries.

## Why (diagnosis)

Geo queries carry location intent; ranking is dominated by local signals. Tuned Yota currently has **no GBP** and **no location-targeted pages** — so for "...in Wisconsin" it places ~#2 behind competitors with local profiles, regardless of tune quality. This phase closes both gaps.

## Non-goals

- Phase 1 (content/AEO pages) and Phase 3 (CTR/internal-linking/measurement).
- **Per-city pages** (~15) — rejected: thin/near-duplicate content risks Google's scaled-content policy. State-level is the right grain.
- The agent **cannot** create the GBP, leave reviews, or post in forums — those are owner actions. This spec produces turnkey checklists; the owner executes them.

## Components

### 1. Six state landing pages (on-site; I draft, owner verifies)

One page per served state — **MN, IA, WI, ND, SD, NE** — slug `toyota-lexus-tuning-<state>` (e.g. `/toyota-lexus-tuning-wisconsin`). Each is **genuinely distinct** (not find-and-replace): it lists that state's real **event cities** and the **assigned installer(s)** from `markets.js`, so content differs materially per page:

| State | Cities | Installer(s) |
|---|---|---|
| Minnesota | Duluth, Twin Cities, Mankato, Rochester | Aaron |
| Wisconsin | Eau Claire, Green Bay, Madison, Milwaukee | Aaron, Noah |
| Iowa | Des Moines, Cedar Rapids, Davenport | Aaron |
| North Dakota | Fargo | Aaron |
| South Dakota | Rapid City, Sioux Falls | Cody |
| Nebraska | Omaha | Cody |

Each page: answer-first H1 ("Toyota & Lexus Engine Tuning in <State>"), the cities served + that events run across the state (link the finder for **live dates** — do NOT hardcode dates, to avoid drift), what's offered (OTT calibration, supercharger), the installer(s) with a line of context, a pricing-from line linking `/ott-tune-cost`, and a local FAQ ("Where can I get my Toyota tuned in <State>?"). AEO structure (question-H2s, tables) like the Phase 1 pages.

### 2. Local schema

Each state page carries `Service` + `FAQPage` + `BreadcrumbList`. The `Service.areaServed` lists the state plus its `City` entities (real differentiator). `provider` → the single `#business`. No physical address/geo (service-area business). Registered in `HEAD_PAGES` so `build:seo` injects OG/business stub, adds to sitemap, and `tests/seo.test.js` validates each automatically.

### 3. On-page reframes + internal linking

Add "professional engine tuning in <region/state>" language to the **Tundra page** and a few key pages, and link them to the relevant state page + `/ott-tune-cost`. Add a homepage/footer **"Where we tune"** section linking the 6 state pages (so they're crawlable and pass internal link equity).

### 4. Google Business Profile setup checklist (`docs/seo/gbp-setup.md`; owner executes)

Turnkey steps: create a **service-area** business profile (no storefront address shown), primary + secondary categories (e.g. "Auto tuning service"), **service areas = the event cities**, NAP (name / (612) 406-7117 / info@tunedyota.com), services list (OTT calibration, Magnuson supercharger), photos, by-appointment hours, and a **review-request flow** (ask at/after each event). This is the keystone — flagged as highest ROI for the geo queries.

### 5. Reviews + citations + NAP playbook (`docs/seo/local-playbook.md`; owner executes)

Consistent NAP everywhere; where to list (relevant auto/local directories); how/when to request reviews (post-event cadence) and respond; and community engagement (the FB group, Toyota/overland forums, YouTube) — with the honest note that **off-site corroboration is what makes AI engines name you** for these queries.

## Content model

Per the owner's Phase-1 choice, the agent **drafts a first pass** (cities/installers pulled from `markets.js`; local voice drafted) and the **owner verifies** facts before publish. Off-site docs are checklists the owner runs.

## Verification

- `npm test` green — `tests/seo.test.js` validates the 6 new pages (canonical, OG, single `#business`, breadcrumb resolves, JSON-LD parses) once in `HEAD_PAGES`.
- Pages in `sitemap.xml`, reachable from the homepage/footer "Where we tune" links; Google Rich Results Test passes (Service/FAQ/Breadcrumb).
- GBP + reviews are owner actions (checklist completion).
- Geo-query rank/AI-citation impact measured over weeks (Phase 3 + the GSC routine).

## Files

- New: `site/toyota-lexus-tuning-{minnesota,iowa,wisconsin,north-dakota,south-dakota,nebraska}.html` (6); `docs/seo/gbp-setup.md`; `docs/seo/local-playbook.md`.
- Edit: `scripts/lib/seo-data.mjs` (`HEAD_PAGES` + 6 slugs), `site/index.html` ("Where we tune" links), `site/toyota-tundra-ott-tune.html` (+ a few peers: reframe + links), `site/sitemap.xml` (regenerated).

## Risks / notes

- **Near-duplicate state pages** → each MUST be materially distinct (real cities, installer, local FAQ); the table above guarantees differentiation. Avoid boilerplate-with-state-swapped.
- **GBP is owner-gated** → the biggest lever depends on the owner completing the checklist; on-site pages alone won't fully close the gap.
- **Date drift** → state pages link the finder for live event dates rather than hardcoding them.
- **Sequencing** → Phase 1's supercharger guide is still parked; this phase can proceed in parallel but Phase 1 should ship once gains/years land.
