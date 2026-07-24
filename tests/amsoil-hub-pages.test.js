// tests/amsoil-hub-pages.test.js
// Guards the Tier-2 full-line layer: one hub per catalog category + the
// searchable master index, complete coverage (every product exactly once),
// referral ordering, curated SKUs linking internal, NO bare Product schema
// (imageless Product nodes = the GSC error fixed 2026-07-24), and the privacy
// rule that dealer Wholesale pricing never reaches a public file.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SITE = path.join(__dirname, "..", "site");
const FULL = require("../site/amsoil-catalog-full.json");

let mod, SD;
test.before(async () => {
  mod = await import("../scripts/build-amsoil-pages.mjs");
  SD = await import("../scripts/lib/seo-data.mjs");
});

test("full catalog is complete and wholesale-free", () => {
  assert.ok(FULL.count >= 300, `expected the full line, got ${FULL.count}`);
  assert.equal(FULL.count, FULL.products.length);
  const raw = fs.readFileSync(path.join(SITE, "amsoil-catalog-full.json"), "utf8");
  assert.ok(!/wholesale/i.test(raw), "dealer wholesale pricing must NEVER reach the public catalog");
  for (const p of FULL.products) {
    assert.ok(p.name && p.category && p.stockNo, `incomplete product ${JSON.stringify(p).slice(0, 80)}`);
    assert.ok(p.retail > 0, `${p.stockNo}: bad retail`);
    assert.ok(p.variants.length >= 1, `${p.stockNo}: no variants`);
  }
});

test("one hub per category + index, all registered in HEAD_PAGES", () => {
  const cats = new Set(FULL.products.map((p) => p.category));
  assert.equal(mod.AMSOIL_HUB_FILES.length, cats.size + 1, "hub per category + master index");
  for (const f of mod.AMSOIL_HUB_FILES) {
    assert.ok(fs.existsSync(path.join(SITE, f)), `${f} missing on disk`);
    assert.ok(SD.HEAD_PAGES.includes(f), `${f} not in HEAD_PAGES`);
  }
});

test("every product is covered by the hubs (once per hub), with referral ordering", () => {
  // Some products are legitimately cross-listed in several sheet categories
  // (e.g. Chaincase & Gear Oil under snowmobile + ATV) — coverage means AT
  // LEAST once overall and EXACTLY once within any single hub.
  const seen = new Set();
  for (const f of mod.AMSOIL_HUB_FILES) {
    if (f === "amsoil-products.html") continue;
    const html = fs.readFileSync(path.join(SITE, f), "utf8");
    assert.ok(html.includes("zo=30713116"), `${f}: no referral on order links`);
    assert.ok(!html.includes('"@type":"Product"'), `${f}: hubs must not emit bare Product schema`);
    for (const p of FULL.products) {
      const n = html.split(`>${p.stockNo}<`).length - 1;
      assert.ok(n <= 1, `${p.stockNo} duplicated within ${f}`);
      if (n) seen.add(p.stockNo);
    }
  }
  for (const p of FULL.products) {
    assert.ok(seen.has(p.stockNo), `${p.stockNo} (${p.name}) missing from every hub`);
  }
});

test("curated Tier-1 SKUs link to their internal product pages from the hubs", () => {
  const CAT = require("../site/amsoil-garage.json");
  const all = mod.AMSOIL_HUB_FILES.filter((f) => f !== "amsoil-products.html")
    .map((f) => fs.readFileSync(path.join(SITE, f), "utf8")).join("");
  let checked = 0;
  for (const p of Object.values(CAT.products)) {
    const slug = `${mod.productSlug(p)}.html`;
    if (all.includes(`>${p.stockNo}<`)) { assert.ok(all.includes(`href="${slug}"`), `${p.stockNo}: hub row not linking internal page ${slug}`); checked++; }
  }
  assert.ok(checked >= 10, `expected most curated SKUs present in hubs, checked ${checked}`);
});

test("master index embeds the search data for the whole line", () => {
  const html = fs.readFileSync(path.join(SITE, "amsoil-products.html"), "utf8");
  const m = html.match(/<script id="hdata" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(m, "index missing embedded search data");
  const data = JSON.parse(m[1]);
  const uniqueStock = new Set(FULL.products.map((p) => p.stockNo)).size;
  assert.equal(data.length, uniqueStock, "search data must cover every unique product once");
  assert.ok(!/wholesale/i.test(m[1]), "no wholesale data in the search index");
});
