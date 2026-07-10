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

**State-page generator (`scripts/build-state-pages.mjs`) is SEPARATE and NOT idempotent — handle with care.** It is *not* wired into `build:seo`; it writes the 6 `site/toyota-lexus-tuning-*.html` pages from its own inline data. Two traps: (1) it does **not** emit the `SEO:OG`/`SEO:BUSINESS` marker blocks — those are injected in a second pass by `build:seo`, so running the state generator *raw* strips them; the correct order is `node scripts/build-state-pages.mjs && npm run build:seo`. (2) Its inline city data can **lag the live pages** (e.g. live Minnesota had "Brainerd" the generator didn't), so a raw regenerate silently deletes hand/live edits. Before ever running it pre-deploy, `git diff` the 6 pages and confirm you're not losing content. Head-chrome constants (FONTS, FAVICON) live at the top of this file and must mirror the rest of the site.

**Favicons + PWA (completed 2026-07-09):** icons are **file-based** — `site/favicon.ico`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `fox.svg` (source mirror in `docs/brand/favicons/`) — plus `site/site.webmanifest` (linked + `theme-color #3A2E26` on all 41 non-verification pages). `netlify.toml` has a header rule serving `.webmanifest` as `application/manifest+json` (Netlify otherwise defaults it to octet-stream). The old inline data-URI favicon is gone everywhere, including the state-page generator's FAVICON constant.

Spec/plan: `docs/superpowers/specs/2026-06-18-post-launch-seo-pass-design.md`, `docs/superpowers/plans/2026-06-18-post-launch-seo-pass.md`. Owner's Search Console steps: `docs/seo/gsc-checklist.md`.
