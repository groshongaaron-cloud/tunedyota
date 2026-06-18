# Post-launch SEO pass — structured-data validation/enrichment + indexing readiness

**Date:** 2026-06-18
**Status:** Draft for review
**Track:** A of 2 (the design-polish pass is a separate spec)

## Goal

Validate, fix, and enrich the site's structured data (JSON-LD); make the
crawl/index surface complete and current; and hand the owner an exact Google
Search Console (GSC) submission checklist. Everything must be *verifiable
locally* via `npm test` so the pass can be proven done and protected from drift.

## Non-goals

- **Visual / design polish** — separate track (Track B).
- **Pushing buttons inside Google Search Console** — GSC is an authenticated
  Google account action. We make the site ready and validated and deliver a
  click-by-click checklist; the owner runs it. (Property appears already
  verified via `site/google8e04e8318c14272c.html`.)

## Audit findings (current state)

The site already has strong SEO infra: 23 pages; `robots.txt` (sitemap ref + AI
crawlers allowed); `sitemap.xml` (19 indexable URLs); `llms.txt`; JSON-LD on 19
pages. Vehicle pages carry `Service` + `AggregateOffer`(areaServed `State[]`) +
`FAQPage` + `BreadcrumbList`; homepage carries a rich `AutomotiveBusiness`
(`@id: …/#business`, reviews, aggregateRating, sameAs). Gaps:

1. **Broken breadcrumb target** — every vehicle page's `BreadcrumbList`
   position 2 points to `https://tunedyota.com/services`, which does not exist.
2. **Cross-page `provider` reference** — vehicle `Service.provider` is
   `{@id: …/#business}`, defined only on the homepage; per-page rich-results
   validation cannot resolve it.
3. **No `Event` schema** for the 8-city 2026 schedule (data already in
   `netlify/functions/lib/events-data.js`).
4. **Stale sitemap** — all `lastmod` are `2026-06-12`, pre-dating multiple ships.
5. **`AggregateOffer`** lacks `offerCount`.
6. **No `Organization.logo` ImageObject** — logo is an inline SVG data-URI; no
   raster asset exists in `site/`.
7. **No Open Graph / Twitter Card tags sitewide** (discovered; see Scope fork).

## Decisions (locked with owner)

- **Event schema + sitemap stay in sync via a generator + drift test** — not
  hand-maintained.
- **Maximal but valid schema** — broad, truthful, Google-supported coverage;
  the validator test is the guardrail against invalid additions.

## Architecture

### 1. Validation backbone — `tests/seo.test.js` (the verifiable core)

A Node test (node:test, matching the repo) that, for every `site/*.html`:
- extracts each `<script type="application/ld+json">` block and `JSON.parse`s it
  (hard-fail on syntax error);
- asserts required fields per `@type` (e.g. `Service` → name/provider/areaServed;
  `Event` → name/startDate/location; `BreadcrumbList` → ordered positions;
  `FAQPage` → ≥1 Question with acceptedAnswer; `AutomotiveBusiness` →
  name/url/telephone);
- asserts every breadcrumb `item` URL maps to a real page file (no `/services`);
- asserts every page has a `<link rel="canonical">`;
- asserts `sitemap.xml` covers every indexable page (all `site/*.html` except
  `links.html` and the Google-verification file) and excludes non-indexable ones;
- asserts the `Event` JSON-LD on `find-your-exact-tune.html` matches what the
  generator produces from `events-data.js` (drift detection — same cities/dates).

### 2. SEO generator — `scripts/build-seo.mjs`

Idempotent, marker-based, run manually before deploy (no CI build step added):
- Reads `events-data.js` → builds `Event` JSON-LD (active, dated cities only) →
  injects between `<!-- SEO:EVENTS:START -->` / `<!-- SEO:EVENTS:END -->` in
  `find-your-exact-tune.html`.
- Regenerates `sitemap.xml` from the indexable page set with `lastmod` = run date.
- Rasterizes the brand SVG → `site/logo.png` (512×512) and, if OG cards are in
  scope, `site/og-image.png` (1200×630) via the already-installed `sharp`.
- `npm run build:seo` script entry; safe to re-run (deterministic output).

### 3. Schema changes (maximal, valid)

- **Per-page business stub** — embed a compact `AutomotiveBusiness`
  (`@id: …/#business`, name, url, `logo` ImageObject, telephone, sameAs) in the
  `<head>` of every content page so `provider`/`@id` resolves per-page. The
  **full** node with `review`/`aggregateRating` stays homepage-only (avoids
  self-serving-review warnings replicated across pages).
- **Fix breadcrumb** — repoint position 2 from `/services` to `/ott-tune`
  (the services hub), label "OTT Tune", across all vehicle pages.
- **`Event` schema** — generated (§2) onto `find-your-exact-tune.html`; each
  `Event`: name, `startDate`, `location` (city/state `Place`), `organizer`
  (→ `#business`), `offers`, `eventAttendanceMode` (Offline), `eventStatus`
  (Scheduled).
- **`Person` schema** — on `team.html` for Aaron / Noah / Cody (`Person`:
  name, jobTitle, `worksFor` → `#business`, areaServed), kept truthful.
- **`AggregateOffer.offerCount`** added to vehicle pages.
- **`Organization.logo`** → `ImageObject` pointing at `site/logo.png`.
- **BreadcrumbList coverage** — ensure `faq`, `team`, `supercharger`,
  `find-your-exact-tune` each carry a breadcrumb (add where missing).

### 4. Scope fork — Open Graph / Twitter Cards (owner decides at review)

No social-card tags exist sitewide. Recommendation: **include** — add
`og:*`/`twitter:*` tags to every page (title, description, url, type, image) and
a `sharp`-generated `og-image.png`. Alternative: **defer** the share-image visual
to Track B (design) and add only the tags now, or skip entirely. This is the one
open scope item; the rest of the pass proceeds regardless.

### 5. GSC-readiness checklist — `docs/seo/gsc-checklist.md`

Click-by-click for the owner: submit `sitemap.xml`; URL-inspect + Request
Indexing the priority pages (home, find-your-exact-tune, top vehicle pages);
watch Coverage + Enhancements (Breadcrumb, FAQ, Merchant/Offers, Events); run the
Rich Results Test on one vehicle page and the events page; re-submit sitemap
after each content ship.

## Source of truth & data flow

`events-data.js` (baked schedule) → `build-seo.mjs` → Event JSON-LD in
`find-your-exact-tune.html` + fresh `sitemap.xml`. `tests/seo.test.js` asserts
the committed HTML/sitemap match the source, so `npm test` fails on drift.

## Verification

- `npm test` green, including `tests/seo.test.js` (parse + structural + coverage
  + drift assertions).
- Re-running `npm run build:seo` produces no diff (idempotent).
- Manual (in GSC checklist): Rich Results Test passes for a vehicle page and the
  events page with zero errors.

## Files

- New: `tests/seo.test.js`, `scripts/build-seo.mjs`, `docs/seo/gsc-checklist.md`,
  `site/logo.png` (+ `site/og-image.png` if OG in scope).
- Edit: all `site/*.html` content pages (business stub, breadcrumb fix, offerCount,
  canonical/OG as scoped), `site/sitemap.xml`, `package.json` (`build:seo` script).

## Risks

- **Cross-page `@id`** — mitigated by per-page business stub.
- **Self-serving reviews** — full review node confined to homepage.
- **Image generation** — `sharp` SVG→PNG must yield a clean logo; verify output
  dimensions/transparency in the validator or by eye.
- **Maximal ≠ invalid** — every added type must pass the validator; anything that
  can't be made truthfully valid is dropped, not forced.
