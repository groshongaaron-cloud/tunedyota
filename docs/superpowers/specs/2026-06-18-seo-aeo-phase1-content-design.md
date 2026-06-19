# Phase 1 — Content + AEO Foundation (search + AI visibility)

**Date:** 2026-06-18
**Status:** Draft for review
**Program:** "Improve Google search + AI visibility," run as a phased program. This is **Phase 1 of 3**. Phase 2 = Local (GBP + event-city pages); Phase 3 = on-page CTR + internal linking + measurement. Each phase is its own spec.

## Goal

Lift organic- and AI-driven **booking demand** by adding a high-intent content layer plus AI-citation/entity signals on top of the already-solid technical SEO foundation (schema, sitemap, robots+AI crawlers, `llms.txt`, OG, GSC). One engine advances three of the owner's four goals at once: rank for commercial terms, convert searchers to bookings, and get cited by AI answer engines. (Goal 4, local, is Phase 2.)

## Non-goals

- Phase 2 (Google Business Profile, event-city/location pages, local citations) and Phase 3 (title/meta CTR tuning, internal-linking overhaul, rank/AI-citation measurement).
- Off-site authority (backlinks, directories) — advisory only, not in this spec.
- **Writing the prose.** Per the owner's choice, the owner supplies copy/facts; this work produces the architecture, briefs, structure, schema, and shipping. Each page build is **gated on the owner returning that page's copy.**

## Content workflow (owner supplies copy)

For each new page: (1) I deliver a **content brief** — target query, outline, the exact questions to answer, the comparison/pricing tables to fill, the schema, and internal links. (2) Owner returns prose/facts. (3) I assemble the page (HTML structure + schema + AEO formatting + links), register it, `build:seo`, `npm test`, ship. Components 1–2 below need **no** owner copy and ship first.

## Components

### 1. Query map + gap analysis (I produce; no copy needed)

A `docs/seo/query-map.md` mapping target high-intent queries → the page that serves each → gap status. Buckets:
- **Commercial:** "OTT tune cost / price", "[model] OTT tune" (✅ 13 vehicle pages), "Magnuson supercharger [model] cost".
- **Consideration:** "is the OTT tune worth it", "OTT tune vs stock", "what does a tune do".
- **Objection:** "does a tune void warranty", "is tuning emissions legal / CARB", "will it throw a CEL".
- **Informational/AEO:** "what is an OTT tune", "OTT vs custom tune".
This map is the roadmap; it justifies the four pages below and seeds Phases 2–3.

### 2. AEO + entity signals (I build entirely from existing facts; no copy needed)

- **`llms.txt` enrichment:** add a citable **Key Facts** block (pricing-from ranges per path, authorizations — OTT installer, Magnuson dealer, VFTuner PRO; emissions/EPA/5-gas compliance; supported platforms) and a short **FAQ** section. AI engines lift these near-verbatim.
- **Entity schema:** add the founder **Aaron Groshong as a `Person`** entity (`jobTitle`, `worksFor`/`founder` → `#business`, VFTuner PRO Tuner) linked from the business node; enrich `knowsAbout` and `sameAs`. Keep the single-`#business` rule (guarded by `tests/seo.test.js`).
- These serve goal 3 (AI authority) and need no new prose.

### 3. Four new content pages (I architect/brief/build; owner supplies prose)

Each page: slug + `<title>`/meta/canonical; **AEO structure** (H2s phrased as the real question, a one-sentence answer up top, definitions, a comparison or pricing **table**, explicit numbers); **`FAQPage` schema** (visible Q&A mirrored, per the `add-review`-style convention); `BreadcrumbList` → `/ott-tune`; internal links to the finder, relevant vehicle pages, and the OTT hub; registered in `HEAD_PAGES` so `build:seo` injects OG/business-stub + adds it to the sitemap and `tests/seo.test.js` validates it; linked from the homepage and footer nav.

1. **`ott-tune-cost.html` — "OTT Tune Cost & Pricing"** (commercial, highest intent). Pricing table by platform/path (OTT from, custom, supercharger), what affects price, K-Line note, FAQ, CTA → finder.
2. **`is-the-ott-tune-worth-it.html` — "Is the OTT Tune Worth It? (OTT vs Stock)"** (consideration, highly citable). What changes (shift behavior, throttle, gear hunting, towing), before/after framing, "who it's for / not for", comparison table, FAQ.
3. **`magnuson-supercharger-guide.html` — "Magnuson Supercharger Buyer's Guide"** (high-ticket commercial). Supported platforms + gains, install + calibration, cost ranges, Harrop/ProCharger note, FAQ. Cross-links the existing `supercharger.html` (decide: new guide complements the existing sales page; the guide is the informational/AEO sibling).
4. **`tune-warranty-emissions-legality.html` — "Tuning, Warranty & Emissions"** (objection-handling, very citable). Q&A: warranty (Magnuson-Moss), emissions intact + EPA/CARB compliance, 5-gas verification, no CEL defeat, no off-road-only. `FAQPage` schema.

### 4. Wiring & ship

New pages flow through the existing machinery (see the `new-vehicle-page` and `ship` skills): add to `HEAD_PAGES` (`scripts/lib/seo-data.mjs`), `npm run build:seo`, `npm test` (the SEO validator checks each new page automatically), deploy by pushing `master`, verify live + in sitemap + Rich Results Test on the FAQ pages.

## Verification

- `npm test` green — `tests/seo.test.js` validates each new page (canonical, OG, single `#business`, breadcrumb resolves, JSON-LD parses) automatically once it's in `HEAD_PAGES`.
- Google Rich Results Test passes (FAQ + Breadcrumb) for each new page; the `Person` entity validates.
- Pages reachable from homepage/footer nav and present in `sitemap.xml`.
- `llms.txt` updated and still well-formed.
- Ranking/AI-citation impact is measured over weeks (Phase 3 + the existing GSC cloud routine) — not a launch gate.

## Files

- New: `docs/seo/query-map.md`; `site/ott-tune-cost.html`, `site/is-the-ott-tune-worth-it.html`, `site/magnuson-supercharger-guide.html`, `site/tune-warranty-emissions-legality.html`; per-page content briefs (in `docs/seo/`).
- Edit: `site/llms.txt`, `site/index.html` (Person entity + nav/footer links), `scripts/lib/seo-data.mjs` (`HEAD_PAGES` + the 4 slugs), `site/sitemap.xml` (regenerated), footer nav across pages as needed.

## Risks / notes

- **Owner-copy dependency:** pages 1–4 can't ship until the owner returns prose; Components 1–2 ship independently first so Phase 1 shows immediate progress.
- **Thin/duplicate content:** the new pages must add genuine value, not restate the vehicle pages — the briefs enforce distinct intent per page.
- **Supercharger overlap:** the new guide must complement, not cannibalize, `supercharger.html` (guide = informational/AEO; existing = sales). Internal-link them and differentiate intent.
- A short **2026 AEO/GEO research pass** is available on request to validate the citation tactics before building; not gating.
