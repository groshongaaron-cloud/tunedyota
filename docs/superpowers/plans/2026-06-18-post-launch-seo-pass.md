# Post-launch SEO Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate, fix, and enrich the site's structured data + social/indexing surface, driven by a generator and guarded by a local test, plus a Search Console submission checklist.

**Architecture:** A single ESM generator (`scripts/build-seo.mjs`) is the engine: it injects a shared business-stub JSON-LD + per-page Open Graph/Twitter tags into every page (marker-based, idempotent), generates `Event` JSON-LD on the booking page and `Person` JSON-LD on the team page from source data, regenerates `sitemap.xml`, fixes the broken `/services` breadcrumb, and rasterizes the brand SVG into `logo.png`/`og-image.png` via the already-installed `sharp`. Pure builders live in `scripts/lib/seo-data.mjs` (unit-tested). A `tests/seo.test.js` integration test parses every page's JSON-LD and asserts structure, OG tags, sitemap coverage, and Event-schema drift — so `npm test` proves the pass done and protects it.

**Tech Stack:** Node 18+ (`node:test`, ESM), `sharp` (installed), static HTML in `site/`, CommonJS data modules under `netlify/functions/lib/`.

---

## File Structure

- `scripts/lib/seo-data.mjs` — **new.** Pure, side-effect-free builders: brand SVG/colors, business-stub JSON-LD, `buildEventsJsonLd`, `buildPeopleJsonLd`, `extractMeta`, `buildOgTags`, `buildSitemap`, page-set constants. The only file with SEO "knowledge"; everything else orchestrates it.
- `scripts/build-seo.mjs` — **new.** Orchestrator. Reads source data, calls builders, writes images + injects marked regions into `site/*.html`, rewrites `sitemap.xml`. Idempotent.
- `tests/seo-data.test.js` — **new.** Unit tests for the pure builders.
- `tests/seo.test.js` — **new.** Integration validator over the real `site/` output.
- `docs/seo/gsc-checklist.md` — **new.** Owner's Search Console steps.
- `site/logo.png`, `site/og-image.png` — **new (generated).** Brand raster assets.
- `site/*.html` (all except `google8e04e8318c14272c.html`) — **modified** by the generator (marked head regions only). `site/sitemap.xml` — **regenerated.**
- `package.json` — **modified.** Add `"build:seo"` script.

**Page sets (defined once in `seo-data.mjs`):**
- `HEAD_PAGES` = every `site/*.html` **except** `google8e04e8318c14272c.html` (gets business stub + OG + canonical-derived tags). Includes `links.html`.
- `SITEMAP_PAGES` = `HEAD_PAGES` **except** `links.html` (matches today's sitemap).

**Marker convention (idempotent injection):** generated blocks are wrapped in
`<!-- SEO:<KEY>:START -->` … `<!-- SEO:<KEY>:END -->`. On each run the generator
replaces content between markers if present, else inserts the whole marked block
immediately after the page's `<link rel="canonical" …>` line. Keys: `BUSINESS`,
`OG`, `EVENTS`, `PEOPLE`.

**Schema decision recorded:** `AggregateOffer.offerCount` from the spec is
**intentionally omitted** — the block represents a price *range*
(`priceCurrency`+`lowPrice`+`highPrice`, already valid); a fabricated count would
violate the locked "truthful or dropped" guardrail. Noted here so it is not read
as a missed requirement.

---

### Task 1: Pure SEO builders (`scripts/lib/seo-data.mjs`)

**Files:**
- Create: `scripts/lib/seo-data.mjs`
- Test: `tests/seo-data.test.js`

- [ ] **Step 1: Write the failing unit tests**

```js
// tests/seo-data.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
// ESM module under test, loaded from CJS test via dynamic import:
let M;
test.before(async () => { M = await import("../scripts/lib/seo-data.mjs"); });

test("extractMeta pulls title, description, canonical", () => {
  const html = `<title>Foo | Tuned Yota</title>
<meta name="description" content="Bar baz.">
<link rel="canonical" href="https://tunedyota.com/foo">`;
  const m = M.extractMeta(html);
  assert.equal(m.title, "Foo | Tuned Yota");
  assert.equal(m.description, "Bar baz.");
  assert.equal(m.canonical, "https://tunedyota.com/foo");
});

test("buildOgTags emits og + twitter tags from meta", () => {
  const tags = M.buildOgTags({ title: "Foo", description: "Bar", canonical: "https://tunedyota.com/foo" });
  for (const n of ['og:title" content="Foo', 'og:description" content="Bar',
       'og:url" content="https://tunedyota.com/foo', 'og:type" content="website',
       'og:image" content="https://tunedyota.com/og-image.png',
       'twitter:card" content="summary_large_image']) {
    assert.ok(tags.includes(n), `missing ${n}`);
  }
});

test("buildEventsJsonLd makes one Event per active dated city with state", () => {
  const events = { "fargo": { dateISO: "2026-07-03", active: true, event: "Fargo OTT Event" },
                   "old":   { dateISO: "2026-01-01", active: false, event: "Old" } };
  const states = { "fargo": "ND" };
  const json = JSON.parse(M.buildEventsJsonLd(events, states));
  assert.equal(json["@type"], "ItemList");
  assert.equal(json.itemListElement.length, 1);
  const ev = json.itemListElement[0].item;
  assert.equal(ev["@type"], "Event");
  assert.equal(ev.startDate, "2026-07-03");
  assert.equal(ev.location.address.addressRegion, "ND");
  assert.equal(ev.organizer["@id"], "https://tunedyota.com/#business");
});

test("buildSitemap lists each page once with given lastmod", () => {
  const xml = M.buildSitemap([{ loc: "https://tunedyota.com/", priority: "1.0" }], "2026-06-18");
  assert.ok(xml.includes("<loc>https://tunedyota.com/</loc>"));
  assert.ok(xml.includes("<lastmod>2026-06-18</lastmod>"));
  assert.ok(xml.trim().startsWith("<?xml"));
});

test("BUSINESS_STUB is valid JSON with the canonical @id", () => {
  const b = JSON.parse(M.BUSINESS_STUB);
  assert.equal(b["@id"], "https://tunedyota.com/#business");
  assert.equal(b.logo["@type"], "ImageObject");
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `node --test tests/seo-data.test.js`
Expected: FAIL — `Cannot find module ../scripts/lib/seo-data.mjs`.

- [ ] **Step 3: Implement the builders**

```js
// scripts/lib/seo-data.mjs
// Pure, side-effect-free builders for the SEO generator. No fs, no network.

export const SITE = "https://tunedyota.com";
export const BIZ_ID = `${SITE}/#business`;

// Brand mark (decoded from the inline SVG favicon used sitewide) + palette.
export const BRAND = {
  ink: "#3A2E26", blue: "#B3D0D9", bg: "#EDECEB", cream: "#F3EFEA",
  viewBox: "3.879 5.098 40.002 39.316",
  path: "M23.881,44.414L3.879,29.408l5.022-7.53V5.098L19.837,18.77h8.094L38.86,5.098v16.78l5.021,7.53L23.881,44.414z M7.037,28.869l16.844,12.638l16.85-12.638l-4.189-6.287V11.726l-7.5,9.36H18.72l-7.493-9.36v10.857L7.037,28.869z",
};

// Pages whose <head> the generator manages. Google Search Console verification
// file is excluded. (Filenames only; the generator resolves to site/.)
export const HEAD_PAGES = [
  "index.html","faq.html","ott-tune.html","supercharger.html","team.html",
  "links.html","find-your-exact-tune.html",
  "toyota-4runner-ott-tune.html","toyota-camry-ott-tune.html","toyota-fj-cruiser-ott-tune.html",
  "toyota-highlander-ott-tune.html","toyota-land-cruiser-ott-tune.html","toyota-rav4-ott-tune.html",
  "toyota-sequoia-ott-tune.html","toyota-tacoma-ott-tune.html","toyota-tundra-ott-tune.html",
  "lexus-gx-ott-tune.html","lexus-ls460-ott-tune.html","lexus-lx570-ott-tune.html","lexus-rx350-ott-tune.html",
];
export const SITEMAP_EXCLUDE = new Set(["links.html"]);

// Sitemap priority by filename (preserves the existing sitemap's weighting).
export const PRIORITY = {
  "index.html": "1.0", "find-your-exact-tune.html": "0.9", "supercharger.html": "0.9",
  "faq.html": "0.7", "ott-tune.html": "0.7", "team.html": "0.7",
};
// loc path for a filename (index -> "/", others -> "/name" without .html).
export function locFor(file) {
  if (file === "index.html") return `${SITE}/`;
  return `${SITE}/${file.replace(/\.html$/, "")}`;
}

const ESC = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function extractMeta(html) {
  const title = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]?.trim() || "";
  const description = (html.match(/<meta\s+name="description"\s+content="([\s\S]*?)"\s*\/?>/i) || [])[1]?.trim() || "";
  const canonical = (html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i) || [])[1]?.trim() || "";
  return { title, description, canonical };
}

export function buildOgTags({ title, description, canonical }) {
  const img = `${SITE}/og-image.png`;
  const lines = [
    `<meta property="og:title" content="${ESC(title)}">`,
    `<meta property="og:description" content="${ESC(description)}">`,
    `<meta property="og:url" content="${ESC(canonical)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:image" content="${img}">`,
    `<meta property="og:site_name" content="Tuned Yota">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${ESC(title)}">`,
    `<meta name="twitter:description" content="${ESC(description)}">`,
    `<meta name="twitter:image" content="${img}">`,
  ];
  return lines.join("\n");
}

// Compact business node embedded on every page so cross-page provider @id
// resolves per-page. Full reviews/aggregateRating stay only on index.html.
export const BUSINESS_STUB = JSON.stringify({
  "@context": "https://schema.org", "@type": "AutomotiveBusiness", "@id": BIZ_ID,
  name: "Tuned Yota", url: `${SITE}/`, telephone: "+1-612-406-7117", email: "info@tunedyota.com",
  priceRange: "$$", slogan: "Undeniable Performance",
  logo: { "@type": "ImageObject", url: `${SITE}/logo.png`, width: 512, height: 512 },
  image: `${SITE}/og-image.png`,
  areaServed: ["Minnesota","Iowa","Wisconsin","North Dakota","South Dakota","Nebraska"].map((n) => ({ "@type": "State", name: n })),
  sameAs: ["https://www.facebook.com/TunedYota/","https://www.instagram.com/tunedyota/","https://www.facebook.com/groups/501008078456222"],
});

export function buildEventsJsonLd(events, states) {
  const items = Object.entries(events)
    .filter(([, e]) => e && e.active && e.dateISO)
    .sort((a, b) => a[1].dateISO.localeCompare(b[1].dateISO))
    .map(([city, e], i) => {
      const region = states[city] || "";
      const cityName = city.replace(/\b\w/g, (c) => c.toUpperCase());
      return {
        "@type": "ListItem", position: i + 1,
        item: {
          "@type": "Event",
          name: e.event || `Tuned Yota OTT Tuning Event — ${cityName}`,
          startDate: e.dateISO,
          eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
          eventStatus: "https://schema.org/EventScheduled",
          location: { "@type": "Place", name: `${cityName}, ${region}`,
            address: { "@type": "PostalAddress", addressLocality: cityName, addressRegion: region, addressCountry: "US" } },
          organizer: { "@id": BIZ_ID },
          offers: { "@type": "Offer", url: `${SITE}/find-your-exact-tune`, availability: "https://schema.org/InStock", price: "450", priceCurrency: "USD" },
        },
      };
    });
  return JSON.stringify({ "@context": "https://schema.org", "@type": "ItemList", name: "Tuned Yota 2026 OTT Tuning Events", itemListElement: items });
}

// installers: [{name, jobTitle, areaServed:[state...]}]
export function buildPeopleJsonLd(installers) {
  const items = installers.map((p, i) => ({
    "@type": "ListItem", position: i + 1,
    item: { "@type": "Person", name: p.name, jobTitle: p.jobTitle,
      worksFor: { "@id": BIZ_ID },
      areaServed: (p.areaServed || []).map((n) => ({ "@type": "State", name: n })) },
  }));
  return JSON.stringify({ "@context": "https://schema.org", "@type": "ItemList", name: "Tuned Yota Installers", itemListElement: items });
}

export function buildSitemap(entries, lastmod) {
  const urls = entries.map((e) =>
    `  <url>\n    <loc>${e.loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${e.priority || "0.8"}</priority>\n  </url>`
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `node --test tests/seo-data.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/seo-data.mjs tests/seo-data.test.js
git commit -m "feat(seo): pure builders for schema/OG/sitemap generation"
```

---

### Task 2: Integration validator (`tests/seo.test.js`) — TDD target state

This test encodes the *desired* end state and will FAIL against the current site
(no OG tags, `/services` breadcrumb, no Event schema). Later tasks make it pass.

**Files:**
- Create: `tests/seo.test.js`

- [ ] **Step 1: Write the validator**

```js
// tests/seo.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const SITE_DIR = path.join(__dirname, "..", "site");
let SD;
test.before(async () => { SD = await import("../scripts/lib/seo-data.mjs"); });

const read = (f) => fs.readFileSync(path.join(SITE_DIR, f), "utf8");
function ldBlocks(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]);
}

test("every managed page: JSON-LD parses, has canonical + OG + business stub", () => {
  for (const f of SD.HEAD_PAGES) {
    const html = read(f);
    assert.match(html, /<link rel="canonical"/, `${f} canonical`);
    assert.ok(html.includes('property="og:title"'), `${f} og:title`);
    assert.ok(html.includes('name="twitter:card"'), `${f} twitter:card`);
    const blocks = ldBlocks(html);
    assert.ok(blocks.length, `${f} has JSON-LD`);
    for (const b of blocks) assert.doesNotThrow(() => JSON.parse(b), `${f} JSON-LD parses`);
    assert.ok(blocks.some((b) => b.includes(SD.BIZ_ID)), `${f} business @id present`);
  }
});

test("no breadcrumb points at a non-existent page", () => {
  for (const f of SD.HEAD_PAGES) {
    for (const b of ldBlocks(read(f))) {
      const j = JSON.parse(b);
      if (j["@type"] !== "BreadcrumbList") continue;
      for (const li of j.itemListElement || []) {
        const url = li.item && (li.item["@id"] || li.item);
        if (typeof url !== "string" || !url.startsWith(SD.SITE)) continue;
        const slug = url.replace(SD.SITE, "").replace(/^\//, "").replace(/\/$/, "");
        const file = slug === "" ? "index.html" : `${slug}.html`;
        assert.ok(fs.existsSync(path.join(SITE_DIR, file)), `${f} breadcrumb -> missing ${file}`);
      }
    }
  }
});

test("find-your-exact-tune carries Event schema matching events-data.js", async () => {
  const events = require("../netlify/functions/lib/events-data.js");
  const { MARKETS } = require("../netlify/functions/lib/markets.js");
  const states = Object.fromEntries(MARKETS.map((m) => [m.city.toLowerCase(), m.state]));
  const expected = JSON.parse(SD.buildEventsJsonLd(events, states));
  const blocks = ldBlocks(read("find-your-exact-tune.html")).map((b) => JSON.parse(b));
  const got = blocks.find((b) => b["@type"] === "ItemList" && /Events/.test(b.name || ""));
  assert.ok(got, "Event ItemList present");
  assert.equal(got.itemListElement.length, expected.itemListElement.length, "event count drift");
  assert.deepEqual(got.itemListElement.map((x) => x.item.startDate).sort(),
                   expected.itemListElement.map((x) => x.item.startDate).sort(), "event dates drift");
});

test("sitemap covers exactly the indexable page set", () => {
  const xml = read("sitemap.xml");
  const expected = SD.HEAD_PAGES.filter((f) => !SD.SITEMAP_EXCLUDE.has(f)).map(SD.locFor).sort();
  const got = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
  assert.deepEqual(got, expected);
  assert.ok(!/<lastmod>2026-06-12<\/lastmod>/.test(xml), "sitemap lastmod refreshed");
});

test("generated image assets exist", () => {
  for (const f of ["logo.png", "og-image.png"]) {
    assert.ok(fs.existsSync(path.join(SITE_DIR, f)), `${f} exists`);
  }
});
```

- [ ] **Step 2: Run it, verify it fails for the right reasons**

Run: `node --test tests/seo.test.js`
Expected: FAIL — missing OG tags / `/services` breadcrumb / no Event schema / stale sitemap / missing images. This is the work list.

- [ ] **Step 3: Commit the failing target**

```bash
git add tests/seo.test.js
git commit -m "test(seo): integration validator for schema/OG/sitemap (target state)"
```

---

### Task 3: Brand image generation (inside `scripts/build-seo.mjs`)

Stand up the generator file with **only** the image step first, so it is
independently runnable and the image assertion in Task 2 can go green.

**Files:**
- Create: `scripts/build-seo.mjs`
- Modify: `package.json` (add script)

- [ ] **Step 1: Create the generator with image rendering**

```js
// scripts/build-seo.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import sharp from "sharp";
import * as SD from "./lib/seo-data.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_DIR = path.join(ROOT, "site");
const today = () => new Date().toISOString().slice(0, 10);

function logoSvg(size) {
  const { ink, blue, viewBox, path: d } = SD.BRAND;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.18)}" fill="${ink}"/>
  <svg x="${size * 0.2}" y="${size * 0.2}" width="${size * 0.6}" height="${size * 0.6}" viewBox="${viewBox}">
    <path fill="${blue}" d="${d}"/></svg></svg>`;
}
function ogSvg() {
  const { ink, blue, cream, viewBox, path: d } = SD.BRAND;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${ink}"/>
  <svg x="120" y="225" width="180" height="180" viewBox="${viewBox}"><path fill="${blue}" d="${d}"/></svg>
  <text x="340" y="320" font-family="Georgia,serif" font-size="86" fill="${cream}" font-weight="600">Tuned Yota</text>
  <text x="344" y="380" font-family="Arial,sans-serif" font-size="30" letter-spacing="6" fill="${blue}">UNDENIABLE PERFORMANCE</text></svg>`;
}
async function writeImages() {
  await sharp(Buffer.from(logoSvg(512))).png().toFile(path.join(SITE_DIR, "logo.png"));
  await sharp(Buffer.from(ogSvg())).png().toFile(path.join(SITE_DIR, "og-image.png"));
  console.log("images: logo.png, og-image.png");
}

async function main() {
  await writeImages();
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Add the npm script**

In `package.json` `"scripts"`, add: `"build:seo": "node scripts/build-seo.mjs"`.

- [ ] **Step 3: Run the generator, verify images render**

Run: `npm run build:seo`
Expected: stdout `images: logo.png, og-image.png`; both files exist under `site/`.
Sanity-check dimensions: `node -e "require('sharp')('site/og-image.png').metadata().then(m=>console.log(m.width,m.height))"` → `1200 630`.

- [ ] **Step 4: Commit**

```bash
git add scripts/build-seo.mjs package.json site/logo.png site/og-image.png
git commit -m "feat(seo): generate brand logo.png + og-image.png via sharp"
```

---

### Task 4: Head injection — business stub + OG tags on every page

Add marker-based injection to the generator and run it across `HEAD_PAGES`.

**Files:**
- Modify: `scripts/build-seo.mjs`

- [ ] **Step 1: Add the injection helper + head pass**

Insert above `main()`:

```js
// Replace content between <!-- SEO:KEY:START/END -->, or insert a fresh marked
// block right after the canonical link. Returns the new html.
function injectMarked(html, key, inner) {
  const block = `<!-- SEO:${key}:START -->\n${inner}\n<!-- SEO:${key}:END -->`;
  const re = new RegExp(`<!-- SEO:${key}:START -->[\\s\\S]*?<!-- SEO:${key}:END -->`);
  if (re.test(html)) return html.replace(re, block);
  return html.replace(/(<link rel="canonical"[^>]*>)/i, `$1\n${block}`);
}

function processHead(file) {
  const p = path.join(SITE_DIR, file);
  let html = fs.readFileSync(p, "utf8");
  const meta = SD.extractMeta(html);
  html = injectMarked(html, "BUSINESS",
    `<script type="application/ld+json">\n${SD.BUSINESS_STUB}\n</script>`);
  html = injectMarked(html, "OG", SD.buildOgTags(meta));
  fs.writeFileSync(p, html);
}
```

Update `main()`:

```js
async function main() {
  await writeImages();
  for (const f of SD.HEAD_PAGES) processHead(f);
  console.log(`head injected: ${SD.HEAD_PAGES.length} pages`);
}
```

- [ ] **Step 2: Run the generator**

Run: `npm run build:seo`
Expected: `head injected: 20 pages`. Spot-check: `grep -c 'og:title' site/index.html` → `1`; `grep -c '#business' site/faq.html` → ≥1.

- [ ] **Step 3: Verify idempotency**

Run `npm run build:seo` again, then `git diff --stat site/` — re-running after the
first injection must add **no** new diff versus the just-built state (run once,
commit-stage, run again, confirm clean).

- [ ] **Step 4: Commit**

```bash
git add scripts/build-seo.mjs site/*.html
git commit -m "feat(seo): inject business stub + OG/Twitter tags into all pages"
```

---

### Task 5: Event + Person schema and breadcrumb fix

**Files:**
- Modify: `scripts/build-seo.mjs`

- [ ] **Step 1: Add events, people, and breadcrumb-fix passes**

Add helpers above `main()`:

```js
function processEvents() {
  const events = require("../netlify/functions/lib/events-data.js");
  const { MARKETS } = require("../netlify/functions/lib/markets.js");
  const states = Object.fromEntries(MARKETS.map((m) => [m.city.toLowerCase(), m.state]));
  const p = path.join(SITE_DIR, "find-your-exact-tune.html");
  let html = fs.readFileSync(p, "utf8");
  html = injectMarked(html, "EVENTS",
    `<script type="application/ld+json">\n${SD.buildEventsJsonLd(events, states)}\n</script>`);
  fs.writeFileSync(p, html);
}

const INSTALLERS = [
  { name: "Aaron Groshong", jobTitle: "Founder & PRO Tuner", areaServed: ["Minnesota","Iowa","Wisconsin","North Dakota"] },
  { name: "Noah Kreis", jobTitle: "Installer & Tuner", areaServed: ["Wisconsin"] },
  { name: "Cody Star", jobTitle: "Installer & Tuner", areaServed: ["South Dakota","Nebraska"] },
];
function processPeople() {
  const p = path.join(SITE_DIR, "team.html");
  let html = fs.readFileSync(p, "utf8");
  html = injectMarked(html, "PEOPLE",
    `<script type="application/ld+json">\n${SD.buildPeopleJsonLd(INSTALLERS)}\n</script>`);
  fs.writeFileSync(p, html);
}

// Repoint the broken Services breadcrumb to the real OTT Tune hub.
function fixBreadcrumbs() {
  for (const f of SD.HEAD_PAGES) {
    const p = path.join(SITE_DIR, f);
    let html = fs.readFileSync(p, "utf8");
    const next = html
      .replaceAll(`"item": "${SD.SITE}/services"`, `"item": "${SD.SITE}/ott-tune"`)
      .replaceAll(`"name": "Services"`, `"name": "OTT Tune"`);
    if (next !== html) fs.writeFileSync(p, next);
  }
}
```

Confirm the exact literal first: run
`grep -n '"item": "https://tunedyota.com/services"' site/toyota-tacoma-ott-tune.html`.
If the spacing differs (e.g. `"item":"…"`), match the generator's `replaceAll`
strings to the real text before running.

Update `main()`:

```js
async function main() {
  await writeImages();
  for (const f of SD.HEAD_PAGES) processHead(f);
  fixBreadcrumbs();
  processEvents();
  processPeople();
  console.log("seo build complete");
}
```

- [ ] **Step 2: Run the generator**

Run: `npm run build:seo`
Expected: `seo build complete`. Verify: `grep -c '/services' site/toyota-tacoma-ott-tune.html` → `0`; `grep -c 'Event' site/find-your-exact-tune.html` → ≥1; `grep -c 'Person' site/team.html` → ≥1.

- [ ] **Step 3: Commit**

```bash
git add scripts/build-seo.mjs site/*.html
git commit -m "feat(seo): Event + Person schema, repoint Services breadcrumb to /ott-tune"
```

---

### Task 6: Sitemap regeneration

**Files:**
- Modify: `scripts/build-seo.mjs`

- [ ] **Step 1: Add the sitemap pass**

Add above `main()`:

```js
function writeSitemap() {
  const entries = SD.HEAD_PAGES
    .filter((f) => !SD.SITEMAP_EXCLUDE.has(f))
    .map((f) => ({ loc: SD.locFor(f), priority: SD.PRIORITY[f] || "0.8" }));
  fs.writeFileSync(path.join(SITE_DIR, "sitemap.xml"), SD.buildSitemap(entries, today()));
}
```

Append `writeSitemap();` as the last line of `main()` before the log.

- [ ] **Step 2: Run + verify**

Run: `npm run build:seo`
Expected: `site/sitemap.xml` `lastmod` is today; `grep -c '<loc>' site/sitemap.xml` → `19`.

- [ ] **Step 3: Run the full integration validator**

Run: `node --test tests/seo.test.js`
Expected: PASS (all 6 tests now green).

- [ ] **Step 4: Commit**

```bash
git add scripts/build-seo.mjs site/sitemap.xml
git commit -m "feat(seo): regenerate sitemap with fresh lastmod from page set"
```

---

### Task 7: GSC submission checklist

**Files:**
- Create: `docs/seo/gsc-checklist.md`

- [ ] **Step 1: Write the checklist**

```markdown
# Google Search Console — submission & verification checklist

Property: https://tunedyota.com (verified via `site/google8e04e8318c14272c.html`).
Run this after each SEO deploy.

## 1. Sitemap
- Search Console → **Sitemaps** → enter `sitemap.xml` → **Submit**.
- Confirm status **Success** and "Discovered URLs" = 19.

## 2. Request indexing (priority pages)
For each URL: **URL Inspection** → paste → **Test Live URL** → **Request Indexing**.
- https://tunedyota.com/
- https://tunedyota.com/find-your-exact-tune
- https://tunedyota.com/supercharger
- https://tunedyota.com/toyota-tacoma-ott-tune
- https://tunedyota.com/lexus-gx-ott-tune

## 3. Rich results validation
- https://search.google.com/test/rich-results → test a vehicle page and
  `find-your-exact-tune`. Expect detected: Breadcrumb, FAQ, (vehicle) Service/Offer,
  (booking) Event, Organization. Zero errors; warnings acceptable.

## 4. Monitor (check 1–2 weeks later)
- **Pages** report: indexed count climbing, no new "Excluded" spikes.
- **Enhancements**: Breadcrumbs, FAQ, Merchant listings, Events show valid items.
- Re-submit the sitemap after any future content ship.
```

- [ ] **Step 2: Commit**

```bash
git add docs/seo/gsc-checklist.md
git commit -m "docs(seo): GSC submission + rich-results checklist"
```

---

### Task 8: Full verification + deploy

- [ ] **Step 1: Run the entire suite**

Run: `npm test`
Expected: all tests pass (existing 51 + `seo-data` 5 + `seo` 6).

- [ ] **Step 2: Idempotency + cleanliness gate**

Run: `npm run build:seo && git status --short`
Expected: no unstaged changes (generator output already committed; re-run is a no-op).

- [ ] **Step 3: Deploy**

```bash
git push origin master
```

Then confirm the production deploy is `ready` and spot-check live:
`curl -s https://tunedyota.com/find-your-exact-tune | grep -c '"@type": "Event"'` → ≥1;
`curl -s https://tunedyota.com/og-image.png -o /dev/null -w "%{http_code}\n"` → `200`.

- [ ] **Step 4: Owner action**

Hand the owner `docs/seo/gsc-checklist.md` and confirm they run section 1–2.

---

## Self-Review

**Spec coverage:**
- Validation backbone → Task 2 (`tests/seo.test.js`). ✓
- Generator (events + sitemap + images, idempotent, drift test) → Tasks 1,3,4,5,6 + drift test in Task 2. ✓
- Per-page business stub / provider resolution → Task 4. ✓
- Breadcrumb `/services`→`/ott-tune` → Task 5. ✓
- Event schema → Task 5. ✓ · Person schema → Task 5. ✓
- Logo `ImageObject` + raster → Tasks 1 (stub references logo.png) + 3. ✓
- OG/Twitter + og-image → Tasks 1,3,4. ✓
- Sitemap refresh → Task 6. ✓
- GSC checklist → Task 7. ✓
- `offerCount` → **intentionally dropped** (truthful-or-dropped guardrail), documented in File Structure note. ✓ (deviation recorded, not a gap)

**Placeholder scan:** No TBD/TODO; every code step shows complete code; commands have expected output.

**Type/name consistency:** `BIZ_ID`, `HEAD_PAGES`, `SITEMAP_EXCLUDE`, `PRIORITY`, `locFor`, `buildEventsJsonLd(events, states)`, `buildPeopleJsonLd(installers)`, `buildSitemap(entries, lastmod)`, `injectMarked(html, key, inner)`, marker keys `BUSINESS/OG/EVENTS/PEOPLE` are used identically across `seo-data.mjs`, `build-seo.mjs`, and both test files. ✓
