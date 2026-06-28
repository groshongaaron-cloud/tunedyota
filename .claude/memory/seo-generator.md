---
name: seo-generator
description: "SEO structured-data/OG/sitemap generator — run `npm run build:seo` before deploy; tests/seo.test.js guards it"
metadata: 
  node_type: memory
  type: project
  originSessionId: e75d74d1-a76c-483c-83d5-58cb118bc0c4
---

The site's structured data, Open Graph/Twitter tags, sitemap, and brand images are **generated**, not hand-edited. Shipped 2026-06-18 (Track A of the post-launch SEO pass — see [[funnel-roadmap-and-lead-setup]]).

- **Generator:** `scripts/build-seo.mjs` (run via `npm run build:seo`). Pure builders live in `scripts/lib/seo-data.mjs`. Idempotent, marker-based injection (`<!-- SEO:BUSINESS/OG/EVENTS:START/END -->`).
- **What it does:** injects a compact `AutomotiveBusiness` stub (so the cross-page `provider @id #business` resolves) on pages that don't already define `#business`; adds OG/Twitter tags derived from each page's title/description/canonical; injects `Event` JSON-LD on `find-your-exact-tune.html` from `netlify/functions/lib/events-data.js`; repoints the old `/services` breadcrumb to `/ott-tune`; regenerates `site/sitemap.xml` with a fresh `lastmod`; rasterizes the brand SVG to `site/logo.png` + `site/og-image.png` via `sharp`.
- **Run it before deploying** whenever events, page titles/descriptions, or the page set change, then commit the regenerated `site/` files.
- **Guard:** `tests/seo.test.js` (part of `npm test`) parses every page's JSON-LD, checks required fields, OG tags, breadcrumb URL resolution, sitemap coverage, single `#business` definition per page, and Event-schema drift vs `events-data.js`. If it fails, re-run the generator.
- **Do NOT** hand-edit the marked regions or add a second node with `@id` `https://tunedyota.com/#business` to a page (the duplicate-`@id` guard test will fail). `team.html` already ships its own `Person` schema — don't add more.
- **Gotcha baked into the generator:** injection uses replacement *functions*, not strings, so `$$` in JSON (e.g. `priceRange`) isn't mangled by `String.replace` `$`-patterns.

Spec/plan: `docs/superpowers/specs/2026-06-18-post-launch-seo-pass-design.md`, `docs/superpowers/plans/2026-06-18-post-launch-seo-pass.md`. Owner's Search Console steps: `docs/seo/gsc-checklist.md`.
