---
name: new-vehicle-page
description: Use when adding a new Toyota or Lexus vehicle OTT-tune landing page to the Tuned Yota site (e.g. a newly supported model) — covers the page template, the easy-to-miss HEAD_PAGES/sitemap registration, schema, homepage nav, and deploy.
---

# Adding a Vehicle OTT-Tune Landing Page

## Overview

Each supported model has a page like `site/toyota-tacoma-ott-tune.html` with Service + AggregateOffer + FAQPage + BreadcrumbList schema. The **silent trap**: if you create the page but don't register it in `HEAD_PAGES`, the build skips it (no OG, no business stub, **absent from the sitemap**) and the test suite never even checks it — tests pass green while the page is orphaned from search. This skill is the checklist that prevents that.

## The one that bites: register the page in `HEAD_PAGES`

`scripts/lib/seo-data.mjs` has a hardcoded `HEAD_PAGES` array. `npm run build:seo` only injects the business stub + OG tags and includes a page in `sitemap.xml` if it's in that list, and `tests/seo.test.js` only validates pages in that list. **Add the new filename to `HEAD_PAGES`** or the page is invisible to the build and the tests.

## Steps

1. **Pick the slug:** `<make>-<model>-ott-tune.html`, lowercase, hyphenated (e.g. `toyota-gr-supra-ott-tune.html`). The canonical URL is `https://tunedyota.com/<slug-without-.html>`.
2. **Create the page** by copying the closest existing vehicle page (e.g. `site/toyota-tacoma-ott-tune.html`) and adapting:
   - `<title>`, `<meta name="description">`, `<link rel="canonical">` to the new model/slug. Keep the shared chrome (nav/footer/CSS/Pixel/accordion JS) byte-identical.
   - The **three JSON-LD blocks**: `Service` (`@id` `…/<slug>#service`, `serviceType`, `name`, `provider` `{"@id":"https://tunedyota.com/#business"}`, `areaServed` States, `AggregateOffer` `lowPrice`/`highPrice`); `FAQPage` (model-specific Q&A); `BreadcrumbList` (Home → `/ott-tune` labelled "OTT Tune" → this page). The **visible FAQ accordion copy must match the `FAQPage` JSON-LD verbatim** (site convention).
   - Hero image: reference `images/<slug-make-model>.jpg` and drop the actual photo at `site/images/…` (else broken image / placeholder).
   - Body: H1, supported years/engines, the pricing table, FAQ copy, CTAs.
   - **Do NOT** hand-add `<!-- SEO:BUSINESS -->` or OG tags — `build:seo` injects those. Do NOT point the breadcrumb at `/services` (use `/ott-tune`).
3. **Register it** in `scripts/lib/seo-data.mjs` → `HEAD_PAGES` (add the filename). Vehicle pages use the default sitemap priority (0.8) — no `PRIORITY` entry needed.
4. **Make it bookable** — add the model to the `VEHICLES` object in `site/find-your-exact-tune.html`, under its make: `"Model":[{ y, e, base, fi, custom?, sc?, turbo? }]`. **Without this the landing page exists but the booking finder never lists the model** — a functional gap, not just SEO.
5. **Add the homepage nav card** in `site/index.html`, inside the Toyota or Lexus `.v-grid` under `#vehicles`:
   `<a class="v-card" href="<slug>.html"><span class="vm">Make Model</span><span class="vp">from $XXX</span></a>`
6. **`npm run build:seo`** — injects the business stub + OG into the new page and rebuilds `sitemap.xml` (now including it).
7. **`npm test`** — `tests/seo.test.js` now checks the new page: canonical present, OG tags, business `@id` resolves, breadcrumb URLs map to real files, exactly one `#business` definition, all JSON-LD parses. Fix anything it flags.
8. **Deploy:** commit the new page + image + `seo-data.mjs` + `find-your-exact-tune.html` + `index.html` + the regenerated `site/` files, **push to `master`** (Netlify auto-deploys). Verify the page is live and in `https://tunedyota.com/sitemap.xml`.

**Price consistency:** the lowest price must be identical across **four** places — the page's spec grid, the homepage `from $X` card, the `VEHICLES` `base` in the booking finder, and the `AggregateOffer` `lowPrice`. Source of truth = the OTT price sheet.

## Common mistakes

- **Forgot `HEAD_PAGES`** → page has no OG/business stub, isn't in the sitemap, and tests don't catch it (they only scan `HEAD_PAGES`). The page is orphaned from search. This is the #1 error.
- **Hand-adding the business stub / OG tags** → duplicates what `build:seo` injects (the duplicate-`#business` guard test fails). Let the build do it.
- **Forgot the `VEHICLES` object** in `find-your-exact-tune.html` → the landing page exists but the model can't be selected in the booking finder.
- **Breadcrumb points at `/services`** → that page 404s; use `/ott-tune`.
- **Forgot the homepage `v-card`** → page exists but isn't linked from site nav.
- **Prices disagree** across the page spec grid, homepage card, `VEHICLES` base, and `AggregateOffer` → site contradicts itself; keep all four equal to the price sheet.
- **Skipped `npm run build:seo`** → no OG/business stub on the page, stale sitemap.

## Quick reference

create `<slug>.html` (copy + adapt schema) → add to `HEAD_PAGES` (`seo-data.mjs`) → add to `VEHICLES` booking finder (`find-your-exact-tune.html`) → add homepage `v-card` (`index.html`) → `npm run build:seo` → `npm test` → push `master` → verify live + in sitemap.

Related: the SEO generator is documented in the `seo-generator` project memory; event scheduling in the `schedule-event` skill.
