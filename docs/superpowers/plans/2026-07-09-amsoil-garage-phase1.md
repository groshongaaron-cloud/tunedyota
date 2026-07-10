# AMSOIL Garage — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a live, commission-earning, hybrid-branded AMSOIL Garage on tunedyota.com that shows a client the exact AMSOIL fluids for their supported Toyota/Lexus, hands each order to amsoil.com under referral `30713116`, and pushes visitors toward Preferred-Customer/Dealer enrollment — plus a self-healing weekly price-sync agent.

**Architecture:** A dedicated static page (`site/amsoil-garage.html`) reads a JSON data file (`site/amsoil-garage.json`) and two small browser+Node dual-mode JS modules (a referral-link helper and pure render logic). Ordering is a deep-link handoff to amsoil.com with `?zo=`/`&zo=` attribution — AMSOIL owns the cart; Tuned Yota owns the experience. A Node price-sync agent (mirroring `scripts/measure/`) refreshes retail prices in the JSON weekly behind a ±40% guardrail. The page earns commission from day one via catalog + PC/Dealer CTAs; per-vehicle garages light up as their fluid specs are owner-verified (`verified` flag).

**Tech Stack:** Vanilla browser JS (no framework, matches the site), Node `node --test` for tests, Node ESM scripts for the agent, the existing `/notify` Slack relay, `scripts/build-seo.mjs` for page registration.

**Spec:** `docs/superpowers/specs/2026-07-09-amsoil-garage-design.md`

**Branch:** `amsoil-garage` (already created; the spec is committed there).

---

## File Structure

**Create:**
- `site/amsoil-referral.js` — dual-mode (browser `window` + Node `module.exports`) referral-link helper. Single home of the ZO number. One responsibility: build correctly-attributed amsoil.com URLs.
- `site/amsoil-garage.json` — the data: `products` (keyed by AMSOIL SKU) + `vehicles` (make → model → generation configs with fluid systems + bundle). Machine-writable by the agent, human-editable for structure.
- `site/amsoil-garage-render.js` — dual-mode pure logic (no DOM): parse URL params, resolve a vehicle→generation, compute bundle totals. Shared by the page and its tests.
- `site/amsoil-garage.html` — the Garage page (Hybrid look C). Fetches the JSON, renders picker + fluid cards + bundle + conversion band, wires order buttons through the referral helper.
- `scripts/amsoil/lib/price-parse.mjs` — pure: amsoil.com product HTML → `{retail, sale}`.
- `scripts/amsoil/lib/sync.mjs` — pure: decide apply/hold/noop for a price change under the guardrail.
- `scripts/amsoil/price-sync.mjs` — the runner: fetch each SKU, apply within guardrail, write JSON, notify Slack, optionally commit+push.
- `docs/amsoil/fluid-data-verification.md` — the owner/installer sign-off table for capacities + intervals.
- Tests: `tests/amsoil-referral.test.js`, `tests/amsoil-garage-data.test.js`, `tests/amsoil-garage-render.test.js`, `tests/amsoil-garage-page.test.js`, `tests/amsoil-price-parse.test.js`, `tests/amsoil-price-sync.test.js`.

**Modify:**
- `scripts/lib/seo-data.mjs` — add `amsoil-garage.html` to `HEAD_PAGES` + a `PRIORITY` entry.
- `package.json` — add `"sync:amsoil-prices"` script.
- (Optional, Task 9) `netlify/functions/book-background.js` — add the Garage deep-link to the booking-confirmation email.

**Data-source-of-truth rule:** the supported vehicle lineup is `netlify/functions/lib/vehicle-pricing.js` (`makes()`/`models()`), generated from the funnel. Garage vehicles must be a subset — enforced by a test.

---

## Task 1: Referral-link helper

**Files:**
- Create: `site/amsoil-referral.js`
- Test: `tests/amsoil-referral.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/amsoil-referral.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { amsoilUrl, AMSOIL_ZO } = require("../site/amsoil-referral.js");

test("AMSOIL_ZO is the Tuned Yota dealer number", () => {
  assert.equal(AMSOIL_ZO, "30713116");
});
test("adds ?zo to a bare product path", () => {
  assert.equal(amsoilUrl("/p/signature-series-0w-20/"),
    "https://www.amsoil.com/p/signature-series-0w-20/?zo=30713116");
});
test("uses &zo when the URL already has a query", () => {
  assert.equal(amsoilUrl("/shop/?q=oil"),
    "https://www.amsoil.com/shop/?q=oil&zo=30713116");
});
test("preserves a #fragment after the zo param", () => {
  assert.equal(amsoilUrl("/search/?query=V-Twin#q=V-Twin"),
    "https://www.amsoil.com/search/?query=V-Twin&zo=30713116#q=V-Twin");
});
test("accepts a full URL and an explicit zo override", () => {
  assert.equal(amsoilUrl("https://www.amsoil.com/offers/pc/", "999"),
    "https://www.amsoil.com/offers/pc/?zo=999");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/amsoil-referral.test.js`
Expected: FAIL — `Cannot find module '../site/amsoil-referral.js'`

- [ ] **Step 3: Write the implementation**

```js
// site/amsoil-referral.js
/* TUNED YOTA × AMSOIL — referral-link helper.
   The ONLY place the dealer ZO number lives. Loaded in the browser (attaches to
   window) and required by Node (tests + price agent). Attribution sticks to the
   visitor's device for 30 days once they hit amsoil.com with ?zo= attached. */
(function (root) {
  var AMSOIL_ZO = "30713116";                 // Tuned Yota dealer referral (public; appears in URLs)
  var AMSOIL_BASE = "https://www.amsoil.com";

  // Append the referral param to any amsoil.com path or full URL.
  // ?zo= when there's no query yet, &zo= when there is; #fragment preserved.
  function amsoilUrl(pathOrUrl, zo) {
    zo = zo || AMSOIL_ZO;
    var url = String(pathOrUrl || "");
    if (!/^https?:\/\//i.test(url)) url = AMSOIL_BASE + (url.charAt(0) === "/" ? "" : "/") + url;
    var hash = "", hi = url.indexOf("#");
    if (hi !== -1) { hash = url.slice(hi); url = url.slice(0, hi); }
    var sep = url.indexOf("?") === -1 ? "?" : "&";
    return url + sep + "zo=" + encodeURIComponent(zo) + hash;
  }

  var api = { AMSOIL_ZO: AMSOIL_ZO, AMSOIL_BASE: AMSOIL_BASE, amsoilUrl: amsoilUrl };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") { window.AMSOIL_ZO = AMSOIL_ZO; window.amsoilUrl = amsoilUrl; window.AMSOIL_BASE = AMSOIL_BASE; }
})(typeof globalThis !== "undefined" ? globalThis : this);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/amsoil-referral.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add site/amsoil-referral.js tests/amsoil-referral.test.js
git commit -m "feat(amsoil): referral-link helper with zo attribution"
```

---

## Task 2: Garage data file + integrity tests

The data file seeds ONE generation (2022+ Tundra) with **draft** specs marked `verified: false`. Draft SKUs/paths/prices are placeholders replaced by verified data in Task 8. Nothing renders in the live picker until `verified: true`.

**Files:**
- Create: `site/amsoil-garage.json`
- Test: `tests/amsoil-garage-data.test.js`

- [ ] **Step 1: Write the data file**

```json
{
  "updated": "2026-07-09",
  "products": {
    "SS-0W20-QT": { "sku": "SS-0W20-QT", "name": "Signature Series 0W-20 Synthetic Motor Oil", "productPath": "/p/signature-series-0w-20-synthetic-motor-oil-asm/", "image": "/images/amsoil/ss-0w20.png", "retailPrice": 16.15, "salePrice": null, "priceVerifiedAt": "2026-07-09" },
    "EA15K34": { "sku": "EA15K34", "name": "Ea Oil Filter EA15K34", "productPath": "/p/ea-oil-filters-ea15k34/", "image": "/images/amsoil/ea15k34.png", "retailPrice": 18.99, "salePrice": null, "priceVerifiedAt": "2026-07-09" },
    "SVG-75W90-QT": { "sku": "SVG-75W90-QT", "name": "SEVERE GEAR 75W-90 Synthetic Gear Lube", "productPath": "/p/severe-gear-synthetic-gear-lube-75w-90/", "image": "/images/amsoil/svg-75w90.png", "retailPrice": 23.60, "salePrice": null, "priceVerifiedAt": "2026-07-09" },
    "SVG-75W140-QT": { "sku": "SVG-75W140-QT", "name": "SEVERE GEAR 75W-140 Synthetic Gear Lube", "productPath": "/p/severe-gear-synthetic-gear-lube-75w-140/", "image": "/images/amsoil/svg-75w140.png", "retailPrice": 25.50, "salePrice": null, "priceVerifiedAt": "2026-07-09" },
    "ATL-QT": { "sku": "ATL-QT", "name": "Signature Series Multi-Vehicle Synthetic ATF", "productPath": "/p/signature-series-multi-vehicle-synthetic-automatic-transmission-fluid-atl/", "image": "/images/amsoil/atl.png", "retailPrice": 19.20, "salePrice": null, "priceVerifiedAt": "2026-07-09" }
  },
  "vehicles": {
    "Toyota": {
      "Tundra": [
        {
          "y": "2022+",
          "e": "3.4L i-FORCE twin-turbo V6",
          "verified": false,
          "systems": [
            { "system": "Engine Oil", "sku": "SS-0W20-QT", "unit": "qt", "capacity": 7.9, "factoryInterval": "10,000 mi", "tunedInterval": "7,500 mi" },
            { "system": "Engine Oil Filter", "sku": "EA15K34", "unit": "ea", "capacity": 1, "factoryInterval": "10,000 mi", "tunedInterval": "7,500 mi" },
            { "system": "Front Differential", "sku": "SVG-75W90-QT", "unit": "qt", "capacity": 1.9, "factoryInterval": "severe: inspect", "tunedInterval": "30,000 mi" },
            { "system": "Rear Differential", "sku": "SVG-75W140-QT", "unit": "qt", "capacity": 2.4, "factoryInterval": "severe: inspect", "tunedInterval": "30,000 mi" },
            { "system": "Transmission", "sku": "ATL-QT", "unit": "qt", "capacity": 11, "factoryInterval": "severe service", "tunedInterval": "60,000 mi" }
          ],
          "bundle": ["SS-0W20-QT", "EA15K34", "SVG-75W90-QT", "SVG-75W140-QT", "ATL-QT"]
        }
      ]
    }
  }
}
```

- [ ] **Step 2: Write the failing integrity test**

```js
// tests/amsoil-garage-data.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const CATALOG = require("../site/amsoil-garage.json");
const { makes, models } = require("../netlify/functions/lib/vehicle-pricing.js");

function eachGeneration(cb) {
  for (const mk of Object.keys(CATALOG.vehicles))
    for (const md of Object.keys(CATALOG.vehicles[mk]))
      CATALOG.vehicles[mk][md].forEach((gen) => cb(mk, md, gen));
}

test("every system + bundle SKU exists in products", () => {
  eachGeneration((mk, md, gen) => {
    for (const s of gen.systems)
      assert.ok(CATALOG.products[s.sku], `${mk} ${md} ${gen.y}: unknown system SKU ${s.sku}`);
    for (const sku of gen.bundle)
      assert.ok(CATALOG.products[sku], `${mk} ${md} ${gen.y}: unknown bundle SKU ${sku}`);
  });
});

test("every product has an amsoil /p/ path and a positive numeric retail price", () => {
  for (const p of Object.values(CATALOG.products)) {
    assert.match(p.productPath, /^\/p\//, `${p.sku} needs an amsoil /p/ path`);
    assert.equal(typeof p.retailPrice, "number", `${p.sku} retailPrice must be a number`);
    assert.ok(p.retailPrice > 0, `${p.sku} retailPrice must be > 0`);
  }
});

test("garage vehicles are a subset of the supported Toyota/Lexus lineup", () => {
  const supportedMakes = makes();
  for (const mk of Object.keys(CATALOG.vehicles)) {
    assert.ok(supportedMakes.includes(mk), `${mk} is not a supported make`);
    const supportedModels = models(mk);
    for (const md of Object.keys(CATALOG.vehicles[mk]))
      assert.ok(supportedModels.includes(md), `${mk} ${md} is not in the supported lineup`);
  }
});

test("each generation has a year range, engine, verified flag, systems, and bundle", () => {
  eachGeneration((mk, md, gen) => {
    assert.ok(gen.y && gen.e, `${mk} ${md}: missing y/e`);
    assert.equal(typeof gen.verified, "boolean", `${mk} ${md} ${gen.y}: verified must be boolean`);
    assert.ok(Array.isArray(gen.systems) && gen.systems.length, `${mk} ${md} ${gen.y}: needs systems`);
    assert.ok(Array.isArray(gen.bundle) && gen.bundle.length, `${mk} ${md} ${gen.y}: needs a bundle`);
  });
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `node --test tests/amsoil-garage-data.test.js`
Expected: PASS (4 tests). If "subset of lineup" fails, the make/model spelling must match `vehicle-pricing.js` exactly (e.g. `"Toyota"`, `"Tundra"`).

- [ ] **Step 4: Commit**

```bash
git add site/amsoil-garage.json tests/amsoil-garage-data.test.js
git commit -m "feat(amsoil): garage data file + integrity tests (Tundra seed, unverified)"
```

---

## Task 3: Pure garage render logic

**Files:**
- Create: `site/amsoil-garage-render.js`
- Test: `tests/amsoil-garage-render.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/amsoil-garage-render.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const G = require("../site/amsoil-garage-render.js");

const CATALOG = {
  products: {
    A: { sku: "A", retailPrice: 10, salePrice: null },
    B: { sku: "B", retailPrice: 20, salePrice: 15 }
  },
  vehicles: {
    Toyota: {
      Tundra: [
        { y: "2022+", e: "V6", verified: true, systems: [{ system: "Engine Oil", sku: "A" }], bundle: ["A", "B"] },
        { y: "2007-2021", e: "V8", verified: false, systems: [], bundle: ["A"] }
      ]
    }
  }
};

test("parseVehicleParams reads v=Make:Model and y=YYYY", () => {
  assert.deepEqual(G.parseVehicleParams("?v=Toyota:Tundra&y=2024"),
    { make: "Toyota", model: "Tundra", year: 2024 });
  assert.deepEqual(G.parseVehicleParams(""), { make: null, model: null, year: null });
});

test("inRange handles ranges, open-ended, and null year", () => {
  assert.equal(G.inRange("2022+", 2024, 2026), true);
  assert.equal(G.inRange("2007-2021", 2024, 2026), false);
  assert.equal(G.inRange("2007-2021", null, 2026), true);
});

test("resolveVehicle returns the matching VERIFIED generation", () => {
  const r = G.resolveVehicle({ make: "toyota", model: "tundra", year: 2024 }, CATALOG, 2026);
  assert.equal(r.make, "Toyota");
  assert.equal(r.model, "Tundra");
  assert.equal(r.gen.y, "2022+");
});

test("resolveVehicle skips unverified generations", () => {
  const r = G.resolveVehicle({ make: "Toyota", model: "Tundra", year: 2015 }, CATALOG, 2026);
  assert.equal(r, null);
});

test("resolveVehicle returns null for unknown make/model", () => {
  assert.equal(G.resolveVehicle({ make: "Ford", model: "F150", year: 2024 }, CATALOG, 2026), null);
});

test("bundleTotal sums sale price where present, else retail", () => {
  const gen = CATALOG.vehicles.Toyota.Tundra[0];
  assert.equal(G.bundleTotal(gen, CATALOG.products), 25); // A retail 10 + B sale 15
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/amsoil-garage-render.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// site/amsoil-garage-render.js
/* TUNED YOTA × AMSOIL — pure Garage logic (no DOM). Shared by the page + tests. */
(function (root) {
  function parseVehicleParams(search) {
    var p = new URLSearchParams(search || "");
    var parts = (p.get("v") || "").split(/[:|]/);
    return {
      make: (parts[0] || "").trim() || null,
      model: (parts[1] || "").trim() || null,
      year: p.get("y") ? parseInt(p.get("y"), 10) : null
    };
  }

  // Mirror of vehicle-pricing.parseYearRange semantics for "2022+" / "2007-2021".
  function inRange(rangeStr, year, currentYear) {
    if (year == null) return true;
    var CUR = currentYear || new Date().getFullYear();
    var s = String(rangeStr || ""), m;
    if ((m = s.match(/((?:19|20)\d{2})\s*(?:-|–|—|to)\s*((?:19|20)\d{2})/i)))
      return year >= Math.min(+m[1], +m[2]) && year <= Math.max(+m[1], +m[2]);
    if ((m = s.match(/((?:19|20)\d{2})\s*\+/))) return year >= +m[1] && year <= CUR;
    if ((m = s.match(/((?:19|20)\d{2})/))) return year === +m[1];
    return false;
  }

  function resolveVehicle(params, catalog, currentYear) {
    if (!params || !params.make || !params.model) return null;
    var mk = Object.keys(catalog.vehicles).find(function (k) {
      return k.toLowerCase() === String(params.make).toLowerCase();
    });
    if (!mk) return null;
    var md = Object.keys(catalog.vehicles[mk]).find(function (k) {
      return k.toLowerCase().replace(/\s+/g, "") === String(params.model).toLowerCase().replace(/\s+/g, "");
    });
    if (!md) return null;
    var gens = catalog.vehicles[mk][md].filter(function (g) { return g.verified; });
    var gen = gens.find(function (g) { return inRange(g.y, params.year, currentYear); });
    if (!gen && params.year == null) gen = gens[0];
    return gen ? { make: mk, model: md, gen: gen } : null;
  }

  function bundleTotal(gen, products) {
    return gen.bundle.reduce(function (sum, sku) {
      var p = products[sku];
      if (!p) return sum;
      return sum + (p.salePrice != null ? p.salePrice : p.retailPrice);
    }, 0);
  }

  var api = { parseVehicleParams: parseVehicleParams, inRange: inRange, resolveVehicle: resolveVehicle, bundleTotal: bundleTotal };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.AmsoilGarage = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/amsoil-garage-render.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add site/amsoil-garage-render.js tests/amsoil-garage-render.test.js
git commit -m "feat(amsoil): pure garage render logic (resolve vehicle, bundle total)"
```

---

## Task 4: Garage page (Hybrid look) + SEO registration

The page always renders the **conversion band + full-catalog + PC/Dealer CTAs** (commission-ready immediately, even before any vehicle is verified). The vehicle garage section populates for verified generations; with none matched it shows a graceful "verified specs rolling out" state.

**Files:**
- Create: `site/amsoil-garage.html`
- Modify: `scripts/lib/seo-data.mjs` (add to `HEAD_PAGES` + `PRIORITY`)
- Test: `tests/amsoil-garage-page.test.js`

- [ ] **Step 1: Write the failing page test**

```js
// tests/amsoil-garage-page.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const html = fs.readFileSync(path.join(__dirname, "..", "site", "amsoil-garage.html"), "utf8");

test("loads the shared chrome + the three garage modules + data", () => {
  assert.match(html, /site\.css/);
  assert.match(html, /amsoil-referral\.js/);
  assert.match(html, /amsoil-garage-render\.js/);
  assert.match(html, /amsoil-garage\.json/);
});
test("has the conversion band linking PC and Dealer enrollment", () => {
  assert.match(html, /Preferred Customer/i);
  assert.match(html, /\/offers\/pc\//);
  assert.match(html, /\/lander\/join\//);
});
test("offers a full-catalog escape hatch", () => {
  assert.match(html, /full AMSOIL catalog/i);
});
test("declares itself an Authorized AMSOIL Dealer", () => {
  assert.match(html, /Authorized AMSOIL Dealer/i);
});
test("is registered for SEO (HEAD_PAGES)", async () => {
  const SD = await import("../scripts/lib/seo-data.mjs");
  assert.ok(SD.HEAD_PAGES.includes("amsoil-garage.html"), "add amsoil-garage.html to HEAD_PAGES");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/amsoil-garage-page.test.js`
Expected: FAIL — file not found / HEAD_PAGES missing.

- [ ] **Step 3: Create the page**

Create `site/amsoil-garage.html`. Match the head pattern of `site/toyota-tundra-ott-tune.html` (charset/viewport/title/description/canonical, the `<!-- SEO:OG:START/END -->` and `<!-- SEO:BUSINESS:START/END -->` markers so `build:seo` manages them, the Google Fonts link, `site.css`, favicons). Use the `.lp`/`.btn` design tokens. Body outline:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AMSOIL Garage for Your Toyota &amp; Lexus | Tuned Yota</title>
<meta name="description" content="The exact AMSOIL synthetic fluids, capacities, and severe-service intervals for your tuned Toyota or Lexus — order online through Tuned Yota, an Authorized AMSOIL Dealer.">
<link rel="canonical" href="https://tunedyota.com/amsoil-garage">
<!-- SEO:OG:START -->
<!-- SEO:OG:END -->
<!-- SEO:BUSINESS:START -->
<!-- SEO:BUSINESS:END -->
<link href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&family=Spectral:wght@400;500;600;700&family=Spectral+SC:wght@500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="site.css">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<meta name="theme-color" content="#3A2E26">
<style>
  /* Hybrid: TY warm frame; product cards use AMSOIL-authentic white/red identity. */
  .ag{font-family:'Lato',sans-serif;color:var(--brown2);max-width:820px;margin:0 auto;padding:26px 18px 52px}
  .ag h1{font-family:'Spectral',serif;font-weight:600;font-size:clamp(28px,6vw,40px);color:var(--ink);margin:6px 0 10px}
  .ag-eyebrow{font-family:'Spectral SC',serif;letter-spacing:.18em;text-transform:uppercase;font-size:12px;color:var(--sage-d);font-weight:600}
  .ag-picker{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}
  .ag-picker select{font:inherit;padding:11px 14px;border:1.5px solid var(--line);border-radius:12px;background:var(--white)}
  .fluid{display:flex;gap:12px;align-items:center;background:var(--white);border:1px solid #e2e2e2;border-radius:12px;padding:12px 14px;margin-bottom:8px}
  .fluid .bottle{width:34px;height:44px;border-radius:3px;flex:0 0 auto;background:linear-gradient(#c8102e,#7a0a1c)}
  .fluid .meta{flex:1}.fluid .nm{font-weight:800;color:#111;font-size:14px}.fluid .sub{font-size:12px;color:#666}
  .fluid .price{font-weight:800;color:#111;margin-right:8px}
  .order{background:var(--ink);color:#fff;border-radius:99px;padding:8px 16px;font-weight:900;text-decoration:none;font-size:13px}
  .bundle{background:var(--card);border:1.5px solid var(--line);border-radius:16px;padding:16px 18px;margin:14px 0}
  .convert{background:var(--ink);color:#F3EFEA;border-radius:16px;padding:20px 22px;margin:26px 0}
  .convert a{display:inline-block;margin:8px 8px 0 0}
</style>
</head>
<body>
<!-- Shared nav: copy the <nav class="snav">…</nav> block from site/toyota-tundra-ott-tune.html verbatim -->
<main class="ag">
  <div class="ag-eyebrow">Tuned Yota · Authorized AMSOIL Dealer</div>
  <h1>Your AMSOIL Garage</h1>
  <p>The exact AMSOIL synthetic fluids for your Toyota or Lexus — capacities and severe-service intervals dialed for tuned trucks. You order here; checkout completes securely on AMSOIL.com.</p>

  <div class="ag-picker" id="picker" aria-label="Choose your vehicle">
    <select id="sel-make" aria-label="Make"></select>
    <select id="sel-model" aria-label="Model"></select>
    <select id="sel-year" aria-label="Year"></select>
  </div>

  <section id="garage" aria-live="polite"><!-- fluid cards + bundle injected here --></section>

  <p style="margin-top:18px"><a id="full-catalog" class="btn outline" href="#">Browse the full AMSOIL catalog →</a></p>

  <div class="convert">
    <strong>Buy retail today — or lock in bigger savings.</strong>
    <p style="margin:6px 0 0;opacity:.9">Become a Preferred Customer to save up to 25% on every future order, or a Dealer to earn. Enroll under Tuned Yota once and you're set for life.</p>
    <a id="cta-pc" class="btn primary" href="#">Become a Preferred Customer</a>
    <a id="cta-dealer" class="btn outline" style="border-color:#F3EFEA;color:#F3EFEA" href="#">Become a Dealer</a>
  </div>
</main>
<!-- Shared footer: copy the <footer class="sfoot">…</footer> block from a vehicle page verbatim -->

<script src="amsoil-referral.js"></script>
<script src="amsoil-garage-render.js"></script>
<script>
(async function () {
  var CAT = await fetch("amsoil-garage.json").then(function (r) { return r.json(); });
  var el = function (id) { return document.getElementById(id); };
  var CUR = new Date().getFullYear();

  // Static CTAs (commission-ready immediately, independent of vehicle data)
  el("full-catalog").href = amsoilUrl("/shop/");
  el("cta-pc").href = amsoilUrl("/offers/pc/");
  el("cta-dealer").href = amsoilUrl("/lander/join/");

  function money(n) { return "$" + n.toFixed(2); }

  function renderGarage(resolved) {
    var g = el("garage");
    if (!resolved) {
      g.innerHTML = '<p style="color:var(--sage-d)">Pick your vehicle above. Verified fluid specs are rolling out across the lineup — meanwhile, browse the full catalog or lock in Preferred-Customer savings below.</p>';
      return;
    }
    var gen = resolved.gen, rows = "";
    gen.systems.forEach(function (s) {
      var p = CAT.products[s.sku]; if (!p) return;
      var price = p.salePrice != null ? p.salePrice : p.retailPrice;
      rows += '<div class="fluid"><div class="bottle"></div><div class="meta">' +
        '<div class="nm">' + s.system + '</div>' +
        '<div class="sub">' + p.name + ' · ' + s.capacity + ' ' + s.unit + ' · service ' + s.tunedInterval + '</div>' +
        '</div><span class="price">' + money(price) + '</span>' +
        '<a class="order" target="_blank" rel="noopener" href="' + amsoilUrl(p.productPath) + '">Order ▸</a></div>';
    });
    var total = AmsoilGarage.bundleTotal(gen, CAT.products);
    var kit = '<div class="bundle"><strong>🛒 Full service kit — ' + resolved.make + ' ' + resolved.model + ' ' + gen.y + '</strong>' +
      '<p style="margin:6px 0 0">Every fluid this build needs. Add each item to your AMSOIL cart (they stay for 30 days) — total about <strong>' + money(total) + '</strong> retail.</p></div>';
    g.innerHTML = '<h2 style="font-family:Spectral,serif;color:var(--ink);margin:18px 0 12px">' +
      resolved.make + ' ' + resolved.model + ' <span style="color:var(--sage-d);font-size:15px">' + gen.e + '</span></h2>' + rows + kit;
  }

  // Build pickers from verified generations only
  var makes = Object.keys(CAT.vehicles);
  function opt(v, t) { var o = document.createElement("option"); o.value = v; o.textContent = t || v; return o; }
  function fill(sel, items, ph) { sel.innerHTML = ""; sel.appendChild(opt("", ph)); items.forEach(function (i) { sel.appendChild(opt(i)); }); }
  fill(el("sel-make"), makes, "Make");

  function modelsFor(mk) { return mk ? Object.keys(CAT.vehicles[mk]) : []; }
  function yearsFor(mk, md) {
    if (!mk || !md) return [];
    return CAT.vehicles[mk][md].filter(function (g) { return g.verified; }).map(function (g) { return g.y; });
  }
  function sync() {
    var mk = el("sel-make").value, md = el("sel-model").value, y = el("sel-year").value;
    var params = { make: mk || null, model: md || null, year: y ? parseInt(y, 10) : (y === "" ? null : null) };
    // year select holds range labels; resolve by label match if chosen, else by null
    var resolved = AmsoilGarage.resolveVehicle(params, CAT, CUR);
    if (!resolved && mk && md) {
      // try to resolve by the selected range label directly
      var gens = (CAT.vehicles[mk] && CAT.vehicles[mk][md] || []).filter(function (g) { return g.verified && (!el("sel-year").value || g.y === el("sel-year").value); });
      if (gens.length) resolved = { make: mk, model: md, gen: gens[0] };
    }
    renderGarage(resolved);
  }
  el("sel-make").addEventListener("change", function () { fill(el("sel-model"), modelsFor(el("sel-make").value), "Model"); fill(el("sel-year"), [], "Year"); sync(); });
  el("sel-model").addEventListener("change", function () { fill(el("sel-year"), yearsFor(el("sel-make").value, el("sel-model").value), "Year"); sync(); });
  el("sel-year").addEventListener("change", sync);

  // Deep-link: ?v=Make:Model&y=YYYY preselects (from booking-confirmation links)
  var pre = AmsoilGarage.parseVehicleParams(location.search);
  if (pre.make) {
    el("sel-make").value = makes.find(function (m) { return m.toLowerCase() === pre.make.toLowerCase(); }) || "";
    fill(el("sel-model"), modelsFor(el("sel-make").value), "Model");
    if (pre.model) el("sel-model").value = modelsFor(el("sel-make").value).find(function (m) { return m.toLowerCase().replace(/\s+/g, "") === pre.model.toLowerCase().replace(/\s+/g, ""); }) || "";
    fill(el("sel-year"), yearsFor(el("sel-make").value, el("sel-model").value), "Year");
  }
  var r0 = AmsoilGarage.resolveVehicle(pre, CAT, CUR);
  renderGarage(r0);
})();
</script>
</body>
</html>
```

Note: copy the real `<nav class="snav">` and `<footer class="sfoot">` blocks verbatim from `site/toyota-tundra-ott-tune.html` so the chrome matches the rest of the site.

- [ ] **Step 4: Register the page for SEO**

In `scripts/lib/seo-data.mjs`, add `"amsoil-garage.html"` to the `HEAD_PAGES` array (near the other top-level pages) and add a priority entry:

```js
// in the PRIORITY object:
"amsoil-garage.html": "0.9",
```

- [ ] **Step 5: Run the SEO build + tests**

Run: `npm run build:seo`
Expected: prints `seo build complete`; injects OG/BUSINESS blocks into the new page and adds it to `site/sitemap.xml`.

Run: `node --test tests/amsoil-garage-page.test.js`
Expected: PASS (5 tests).

- [ ] **Step 6: Manually verify in a browser**

Open `site/amsoil-garage.html` via a local static server (e.g. `npx serve site`) and confirm: the make/model/year pickers populate, selecting Toyota → Tundra shows the Tundra section ONLY after Task 8 sets `verified: true` (until then the graceful "rolling out" copy shows), and the PC/Dealer/full-catalog links all carry `?zo=30713116`.

- [ ] **Step 7: Commit**

```bash
git add site/amsoil-garage.html scripts/lib/seo-data.mjs site/sitemap.xml site/*.png tests/amsoil-garage-page.test.js
git commit -m "feat(amsoil): garage page (hybrid look) + SEO registration"
```

---

## Task 5: Price parser (pure)

**Files:**
- Create: `scripts/amsoil/lib/price-parse.mjs`
- Test: `tests/amsoil-price-parse.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/amsoil-price-parse.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
let P;
test.before(async () => { P = await import("../scripts/amsoil/lib/price-parse.mjs"); });

const JSONLD = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Signature Series 0W-20","offers":{"@type":"Offer","price":"16.15","priceCurrency":"USD"}}</script>
</head><body></body></html>`;

const SALE = `<html><head>
<script type="application/ld+json">{"@type":"Product","offers":[{"@type":"Offer","price":"25.50"},{"@type":"Offer","price":"19.95"}]}</script>
</head></html>`;

test("reads a single JSON-LD offer price as retail, no sale", () => {
  const r = P.parsePrice(JSONLD);
  assert.equal(r.retail, 16.15);
  assert.equal(r.sale, null);
});
test("reads min as sale + max as retail when two offers exist", () => {
  const r = P.parsePrice(SALE);
  assert.equal(r.retail, 25.5);
  assert.equal(r.sale, 19.95);
});
test("returns nulls when no price is present", () => {
  const r = P.parsePrice("<html><body>no price here</body></html>");
  assert.equal(r.retail, null);
  assert.equal(r.sale, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/amsoil-price-parse.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// scripts/amsoil/lib/price-parse.mjs
// Parse an amsoil.com product page for {retail, sale}. Prefer JSON-LD Product/offers
// (stable); fall back to a visible price. Built against a live fixture in Task 7.
export function parsePrice(html) {
  const out = { retail: null, sale: null };
  const blocks = [...String(html).matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  for (const b of blocks) {
    let j; try { j = JSON.parse(b); } catch { continue; }
    const nodes = Array.isArray(j) ? j : (j["@graph"] || [j]);
    for (const n of nodes) {
      if (n && /Product/.test(n["@type"] || "") && n.offers) {
        const offers = Array.isArray(n.offers) ? n.offers : [n.offers];
        const prices = offers.map((o) => parseFloat(o.price)).filter((x) => !isNaN(x));
        if (prices.length) {
          out.retail = Math.max(...prices);
          const lo = Math.min(...prices);
          out.sale = lo < out.retail ? lo : null;
          return out;
        }
      }
    }
  }
  const m = String(html).match(/data-price="([\d.]+)"/) || String(html).match(/\$([\d,]+\.\d{2})/);
  if (m) out.retail = parseFloat(m[1].replace(/,/g, ""));
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/amsoil-price-parse.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/amsoil/lib/price-parse.mjs tests/amsoil-price-parse.test.js
git commit -m "feat(amsoil): price parser (JSON-LD offers + fallback)"
```

---

## Task 6: Price-sync guardrail logic (pure)

**Files:**
- Create: `scripts/amsoil/lib/sync.mjs`
- Test: `tests/amsoil-price-sync.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/amsoil-price-sync.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
let S;
test.before(async () => { S = await import("../scripts/amsoil/lib/sync.mjs"); });

test("applies a change within the guardrail", () => {
  const d = S.decide({ retailPrice: 16.15, salePrice: null }, { retail: 17.99, sale: null });
  assert.equal(d.action, "apply");
  assert.equal(d.to, 17.99);
});
test("holds a change beyond ±40% (likely a parse error)", () => {
  const d = S.decide({ retailPrice: 16.15, salePrice: null }, { retail: 3.00, sale: null });
  assert.equal(d.action, "hold");
});
test("noop when the price is unchanged", () => {
  const d = S.decide({ retailPrice: 16.15, salePrice: null }, { retail: 16.15, sale: null });
  assert.equal(d.action, "noop");
});
test("holds when no price parsed", () => {
  const d = S.decide({ retailPrice: 16.15, salePrice: null }, { retail: null, sale: null });
  assert.equal(d.action, "hold");
});
test("applies when there was no prior price", () => {
  const d = S.decide({ retailPrice: null, salePrice: null }, { retail: 20, sale: null });
  assert.equal(d.action, "apply");
});
test("tracks a sale price as the effective 'to'", () => {
  const d = S.decide({ retailPrice: 25.5, salePrice: null }, { retail: 25.5, sale: 19.95 });
  assert.equal(d.action, "apply");
  assert.equal(d.to, 19.95);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/amsoil-price-sync.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// scripts/amsoil/lib/sync.mjs
// Pure decision: what to do with a freshly-parsed price vs the catalog's current one.
export const GUARDRAIL = 0.40; // reject changes beyond ±40% — almost always a parse error

// Returns { action: "apply"|"hold"|"noop", from, to, reason }.
export function decide(current, parsed, guardrail = GUARDRAIL) {
  const to = parsed && (parsed.sale != null ? parsed.sale : parsed.retail);
  if (to == null || isNaN(to) || to <= 0) return { action: "hold", from: null, to: null, reason: "no price parsed" };
  const from = current && (current.salePrice != null ? current.salePrice : current.retailPrice);
  if (from == null) return { action: "apply", from: null, to, reason: "no prior price" };
  if (to === from) return { action: "noop", from, to, reason: "unchanged" };
  const delta = Math.abs(to - from) / from;
  if (delta > guardrail) return { action: "hold", from, to, reason: `Δ${(delta * 100).toFixed(0)}% exceeds ±${guardrail * 100}% guardrail` };
  return { action: "apply", from, to, reason: `Δ${(delta * 100).toFixed(0)}%` };
}

// Apply a decision to a product record (mutates + returns it). Sets salePrice when the
// parsed sale is present, else clears it; always stamps priceVerifiedAt.
export function applyToProduct(product, parsed, todayISO) {
  product.retailPrice = parsed.retail != null ? parsed.retail : product.retailPrice;
  product.salePrice = parsed.sale != null ? parsed.sale : null;
  product.priceVerifiedAt = todayISO;
  return product;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/amsoil-price-sync.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/amsoil/lib/sync.mjs tests/amsoil-price-sync.test.js
git commit -m "feat(amsoil): price-sync guardrail decision logic"
```

---

## Task 7: Price-sync runner + npm script

**Files:**
- Create: `scripts/amsoil/price-sync.mjs`
- Modify: `package.json` (add `sync:amsoil-prices`)

- [ ] **Step 1: Write the runner**

```js
// scripts/amsoil/price-sync.mjs
// Weekly price-sync agent. Fetches each garage SKU's amsoil.com product page, parses
// retail/sale, applies within the ±40% guardrail, writes site/amsoil-garage.json,
// posts a summary to the /notify Slack relay. Pass --commit to git commit+push.
// Schedule locally with Windows Task Scheduler (same host as scripts/measure/).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { parsePrice } from "./lib/price-parse.mjs";
import { decide, applyToProduct } from "./lib/sync.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = path.join(ROOT, "site", "amsoil-garage.json");
const BASE = "https://www.amsoil.com";
const TODAY = new Date().toISOString().slice(0, 10);
const COMMIT = process.argv.includes("--commit");

async function notify(text) {
  const url = process.env.NOTIFY_URL || "https://tunedyota.com/notify";
  const token = process.env.NOTIFY_TOKEN;
  if (!token) { console.log("[notify skipped: no NOTIFY_TOKEN]\n" + text); return; }
  try {
    await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-ty-notify": token }, body: JSON.stringify({ text }) });
  } catch (e) { console.error("notify failed:", e.message); }
}

async function main() {
  const cat = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const applied = [], held = [];
  for (const sku of Object.keys(cat.products)) {
    const p = cat.products[sku];
    if (!p.productPath) continue;
    let html = "";
    try {
      const res = await fetch(BASE + p.productPath, { headers: { "user-agent": "TunedYotaPriceSync/1.0 (+https://tunedyota.com)" } });
      html = await res.text();
    } catch (e) { held.push(`${sku}: fetch failed (${e.message})`); continue; }
    const parsed = parsePrice(html);
    const d = decide(p, parsed);
    if (d.action === "apply") { applyToProduct(p, parsed, TODAY); applied.push(`${sku}: ${d.from ?? "—"} → ${d.to} (${d.reason})`); }
    else if (d.action === "hold") { held.push(`${sku}: HELD ${d.from ?? "—"} → ${d.to ?? "?"} (${d.reason})`); }
  }
  if (applied.length) {
    cat.updated = TODAY;
    fs.writeFileSync(DATA, JSON.stringify(cat, null, 2) + "\n");
  }
  const summary = `AMSOIL price-sync ${TODAY}\nApplied: ${applied.length}\n${applied.join("\n") || "  (none)"}\nHeld: ${held.length}\n${held.join("\n") || "  (none)"}`;
  console.log(summary);
  await notify(summary);
  if (COMMIT && applied.length) {
    execSync(`git add ${JSON.stringify(DATA)}`, { cwd: ROOT });
    execSync(`git commit -m "chore(amsoil): weekly retail price sync (${applied.length} updated)"`, { cwd: ROOT });
    execSync("git push", { cwd: ROOT });
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Add the npm script**

In `package.json` `scripts`, add:

```json
"sync:amsoil-prices": "node scripts/amsoil/price-sync.mjs"
```

- [ ] **Step 3: Dry-run against live amsoil.com + fix the parser if needed**

Run: `npm run sync:amsoil-prices`
Expected: prints a summary. **This is the moment to confirm the real amsoil.com product HTML.** If prices come back `null` (all HELD "no price parsed"), open one product URL, inspect its markup, and adjust `parsePrice` in `scripts/amsoil/lib/price-parse.mjs` to match (then re-run its test with a fixture captured from the live page). Do NOT pass `--commit` until parsed prices look correct.

- [ ] **Step 4: Run the full suite**

Run: `node --test`
Expected: all tests pass (existing + the 6 new AMSOIL test files).

- [ ] **Step 5: Commit**

```bash
git add scripts/amsoil/price-sync.mjs package.json site/amsoil-garage.json
git commit -m "feat(amsoil): weekly price-sync runner (guardrailed, Slack-notified)"
```

- [ ] **Step 6: Schedule it (owner step, documented)**

Add a Windows Task Scheduler entry (same host as the search-visibility engine) running weekly:
`node scripts/amsoil/price-sync.mjs --commit` with `NOTIFY_TOKEN` set in the environment. Document this in `docs/amsoil/fluid-data-verification.md` (Task 8) under "Operations."

---

## Task 8: Compile + verify the full fluid dataset (owner/installer gate)

This is the launch gate. The page ships live in Task 10 earning via catalog/PC/Dealer links, but **per-vehicle garages stay dark until verified here.**

**Files:**
- Modify: `site/amsoil-garage.json` (add every supported platform; set `verified: true` only after sign-off)
- Create: `docs/amsoil/fluid-data-verification.md`

- [ ] **Step 1: Draft the dataset for all supported platforms**

For every make/model in `vehicle-pricing.js` `catalog()`, add generation configs mirroring the funnel's year ranges. For each, fill `systems` (engine oil + filter, front/rear diff, transmission, transfer case, plus coolant/grease/brake/PS where applicable) with: correct AMSOIL product (from amsoil.com/garage for that vehicle), `capacity` (Toyota/Lexus factory service spec), `factoryInterval`, and a drafted `tunedInterval` (AMSOIL published drain interval, shortened for severe/tuned service). Add any new SKUs to `products`. Keep every new generation `verified: false`.

- [ ] **Step 2: Produce the verification doc**

Create `docs/amsoil/fluid-data-verification.md` — one table per platform listing System / AMSOIL product / capacity / factory interval / proposed tuned interval, with a sign-off checkbox column. Include an "Operations" section documenting the weekly price-sync Task Scheduler entry from Task 7.

- [ ] **Step 3: Owner/installer review — STOP HERE**

Hand the doc to the owner/installers. **Do not set `verified: true` on any generation until they confirm its capacities + intervals.** Flip `verified: true` per platform as each is signed off (platforms light up on the live page incrementally).

- [ ] **Step 4: Re-run integrity tests after edits**

Run: `node --test tests/amsoil-garage-data.test.js`
Expected: PASS (SKU refs resolve, vehicles ⊆ lineup, every generation well-formed).

- [ ] **Step 5: Commit (data only; verified flags flipped as signed off)**

```bash
git add site/amsoil-garage.json docs/amsoil/fluid-data-verification.md
git commit -m "feat(amsoil): full fluid dataset draft + verification doc"
```

---

## Task 9 (optional, within Phase 1): Booking-confirmation deep link

Realizes "the site already knows the client's vehicle" — the booking email links straight into their pre-loaded Garage.

**Files:**
- Modify: `netlify/functions/book-background.js` (booking-confirmation email body)
- Test: `tests/book-background.test.js` (extend)

- [ ] **Step 1:** Find where the confirmation email HTML is built and add a button/link:
`https://tunedyota.com/amsoil-garage?v=<Make>:<Model>&y=<Year>` built from the booking's vehicle fields (URL-encode the model).
- [ ] **Step 2:** Extend `tests/book-background.test.js` to assert the email contains `/amsoil-garage?v=` with the booked make/model.
- [ ] **Step 3:** Run: `node --test tests/book-background.test.js` — Expected: PASS.
- [ ] **Step 4:** Commit: `git commit -m "feat(amsoil): link booking-confirmation email to the customer's garage"`

---

## Task 10: Ship

- [ ] **Step 1: Regenerate SEO + run the whole suite**

Run: `npm run build:seo && node --test`
Expected: `seo build complete`; all tests pass. (`tests/seo.test.js` guards that the build was run.)

- [ ] **Step 2: Merge to master**

```bash
git checkout master
git merge --no-ff amsoil-garage -m "feat(amsoil): Phase 1 Garage — vehicle fluids + referral ordering + price agent"
```

- [ ] **Step 3: Push (deploys via Netlify)**

```bash
git push origin master
```

- [ ] **Step 4: Verify live**

Load `https://tunedyota.com/amsoil-garage`. Confirm: page renders with shared chrome; PC/Dealer/full-catalog links carry `?zo=30713116`; a verified platform (once signed off) shows its fluids with working Order links; the price agent's first `--commit` run posts to Slack. Follow the `ship` skill's live-verification checklist.

- [ ] **Step 5: Update project memory**

Add a memory file for the AMSOIL Garage program (LIVE date, referral number location, the `verified`-flag gate, the weekly price agent + its Task Scheduler entry, and the Phase 2–4 north-star) and a one-line pointer in `MEMORY.md`.

---

## Self-Review

**Spec coverage:**
- Hybrid look C → Task 4 (page styles). ✓
- Retail-only pricing + our catalog file → Task 2 (JSON, retail fields only). ✓
- Referral `?zo=`/`&zo=` handoff → Task 1 + wired in Task 4. ✓
- Full-catalog escape hatch → Task 4 (`#full-catalog`). ✓
- Conversion CTAs (PC/Dealer, permanent association) → Task 4 (`.convert` band). ✓
- Vehicle-specific fluids, full depth, supported lineup only → Tasks 2/3/8 + subset test. ✓
- Data trust / owner verification before publish → Task 8 gate + `verified` flag; page renders only verified generations (Task 3 filter). ✓
- Price-sync agent, weekly, retail+sale, ±40% guardrail, Slack, auto-apply → Tasks 5/6/7. ✓
- Bundle without one-click multi-item cart → Task 4 (guided kit copy). ✓
- Error handling (no vehicle / unsupported / stale price / parse failure) → Task 4 graceful state, Task 6 hold logic. ✓
- "Site knows the vehicle" → Task 4 deep-link params + Task 9 booking email. ✓
- Config not hardcoded → Task 1 (single ZO home). ✓
- Deferred Phases 2–4 → untouched; data model (make→model→gen, tunedInterval) supports them. ✓

**Placeholder scan:** Draft SKUs/paths/prices in Task 2 are explicitly labeled placeholders resolved in Task 8; the `verified` gate keeps them off the live page. No unresolved TODOs in code.

**Type consistency:** `amsoilUrl` (Task 1) used identically in Tasks 4/7. Data shape `{products, vehicles}`, product `{sku,name,productPath,image,retailPrice,salePrice,priceVerifiedAt}`, generation `{y,e,verified,systems,bundle}`, system `{system,sku,unit,capacity,factoryInterval,tunedInterval}` — consistent across Tasks 2, 3, 4, 6, 7, 8. `decide()`/`applyToProduct()`/`parsePrice()` signatures match between Tasks 5/6 and their use in Task 7. `resolveVehicle`/`bundleTotal`/`parseVehicleParams` match between Task 3 and Task 4.
