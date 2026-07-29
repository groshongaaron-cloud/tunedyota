// Magnuson full-line store invariants (scripts/magnuson/build-store-pages.mjs).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const SITE = path.join(__dirname, "..", "site");
const CAT = JSON.parse(fs.readFileSync(path.join(SITE, "magnuson-catalog-full.json"), "utf8"));
const SLUGS = JSON.parse(fs.readFileSync(path.join(SITE, "magnuson-slugs.json"), "utf8"));

test("catalog carries retail pricing only — no dealer-level fields or labels", () => {
  const txt = JSON.stringify(CAT);
  for (const banned of [/trade/i, /jobber/i, /dealer pricing/i, /dealer plus/i, /distributor/i, /wholesale/i]) {
    assert.ok(!banned.test(txt), `wholesale leak in catalog: ${banned}`);
  }
  for (const k of CAT.superchargers) assert.ok(typeof k.retail === "number" && k.retail > 0, `${k.sku} missing retail`);
});

test("every mapped slug has a page on disk with canonical, Product schema and the retail price", () => {
  const pages = new Set(Object.values(SLUGS));
  const retailBySku = new Map([...CAT.superchargers, ...CAT.parts].map((x) => [x.sku, x.retail]));
  let checked = 0;
  for (const [sku, slug] of Object.entries(SLUGS)) {
    const p = path.join(SITE, `${slug}.html`);
    assert.ok(fs.existsSync(p), `missing page for ${sku}: ${slug}.html`);
    if (!pages.delete(slug)) continue; // color twins share a page — check once
    const html = fs.readFileSync(p, "utf8");
    assert.ok(html.includes(`<link rel="canonical" href="https://tunedyota.com/${slug}">`), `${slug}: canonical wrong`);
    assert.ok(html.includes('"@type": "Product"') || html.includes('"@type":"Product"'), `${slug}: no Product schema`);
    const retail = retailBySku.get(sku);
    assert.ok(html.includes(retail.toFixed(2)) || html.includes(`$${retail.toLocaleString("en-US")}`), `${slug}: price ${retail} not on page`);
    checked++;
  }
  assert.ok(checked >= 190, `expected 190+ product pages, checked ${checked}`);
});

test("store pages never leak dealer-level pricing labels", () => {
  for (const slug of new Set(Object.values(SLUGS))) {
    const html = fs.readFileSync(path.join(SITE, `${slug}.html`), "utf8");
    for (const banned of [/jobber/i, /dealer pricing/i, /dealer plus/i, /distributor pricing/i]) {
      assert.ok(!banned.test(html), `${slug}: wholesale label leaked`);
    }
  }
});

test("hub links every store product and no excluded tuner SKUs got pages", () => {
  const hub = fs.readFileSync(path.join(SITE, "magnuson-products.html"), "utf8");
  for (const slug of new Set(Object.values(SLUGS))) {
    assert.ok(hub.includes(`href="/${slug}"`), `hub missing link to /${slug}`);
  }
  // Standalone handheld tuners compete with the OTT calibration — excluded.
  // (31-19-57-215, the FFV RTD Upgrade, is supporting hardware and stays.)
  for (const sku of ["88-85-59-005", "88-85-59-009"]) {
    assert.ok(!SLUGS[sku], `excluded tuner SKU ${sku} has a store page`);
  }
  assert.ok(SLUGS["31-19-57-215"], "FFV RTD Upgrade should have a store page");
});

test("merchant feed g:links point at per-SKU store pages", () => {
  const feed = fs.readFileSync(path.join(SITE, "merchant-feed.xml"), "utf8");
  const links = [...feed.matchAll(/<g:link>https:\/\/tunedyota\.com\/([^<]+)<\/g:link>/g)].map((m) => m[1]);
  assert.ok(links.length >= 20, "feed unexpectedly small");
  const storePages = new Set(Object.values(SLUGS));
  const onStore = links.filter((l) => storePages.has(l)).length;
  assert.ok(onStore === links.length, `${links.length - onStore} feed links still point at multi-product pages`);
});
