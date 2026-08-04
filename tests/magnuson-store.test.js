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

// ── shippingDetails schema (owner-sourced lead times, Aaron 2026-08-03) ──────
// Same two profiles as the merchant feed, classified by the same family rule:
// supercharger systems + upgrade kits are bespoke build-to-order (12–20 bd
// handling, 3–5 transit ≈ Aaron's 3–5 week caution); everything else is
// drop-ship (1–3 handling, 3–7 transit, his numbers verbatim).

function shippingDetailsOf(html) {
  const m = html.match(/"shippingDetails":\s*({.*?"transitTime".*?}\s*})/s);
  return m ? m[1] : null;
}

test("every store page's Product schema carries shippingDetails with one of the two lead-time profiles", () => {
  let bespoke = 0, dropShip = 0;
  for (const slug of new Set(Object.values(SLUGS))) {
    const html = fs.readFileSync(path.join(SITE, `${slug}.html`), "utf8");
    const sd = shippingDetailsOf(html);
    assert.ok(sd, `${slug}: Offer missing shippingDetails`);
    assert.ok(/"value":\s*310/.test(sd), `${slug}: shippingRate must be the $310 flat freight`);
    assert.ok(/"addressCountry":\s*"US"/.test(sd), `${slug}: missing US shippingDestination`);
    const isBespoke = /"minValue":\s*12/.test(sd) && /"maxValue":\s*20/.test(sd);
    const isDropShip = /"minValue":\s*1[,\s]/.test(sd) && /"maxValue":\s*3[,\s]/.test(sd);
    assert.ok(isBespoke !== isDropShip, `${slug}: unknown lead-time profile: ${sd}`);
    if (isBespoke) bespoke++; else dropShip++;
  }
  assert.ok(bespoke > 0 && dropShip > 0, `both profiles must occur (bespoke ${bespoke}, dropShip ${dropShip})`);
});

test("page profile agrees with the merchant feed profile for every feed SKU", () => {
  const feed = fs.readFileSync(path.join(SITE, "merchant-feed.xml"), "utf8");
  const items = feed.split("<item>").slice(1);
  let checked = 0;
  for (const item of items) {
    const sku = (item.match(/<g:id>([^<]+)<\/g:id>/) || [])[1];
    const slug = SLUGS[sku];
    if (!slug) continue; // feed items landing on vehicle pages (no store page)
    const feedBespoke = /<g:min_handling_time>12</.test(item);
    const html = fs.readFileSync(path.join(SITE, `${slug}.html`), "utf8");
    const pageBespoke = /"minValue":\s*12/.test(shippingDetailsOf(html) || "");
    assert.strictEqual(pageBespoke, feedBespoke, `${sku} (${slug}): feed/page lead-time profile mismatch`);
    checked++;
  }
  assert.ok(checked >= 20, `expected 20+ cross-checked SKUs, got ${checked}`);
});

test("bespoke store pages tell the shopper about the 3–5 week build-to-order lead time", () => {
  // The visible page must say what the schema says — feed/page/schema all agree.
  const html = fs.readFileSync(path.join(SITE, `${SLUGS["01-26-57-107-BL"]}.html`), "utf8");
  assert.ok(/[Bb]uilt to order/.test(html), "bespoke page missing visible built-to-order note");
  assert.ok(/3–5 weeks/.test(html), "bespoke page missing the 3–5 week caution");
});

test("merchant feed g:links point at per-SKU store pages", () => {
  const feed = fs.readFileSync(path.join(SITE, "merchant-feed.xml"), "utf8");
  const links = [...feed.matchAll(/<g:link>https:\/\/tunedyota\.com\/([^<]+)<\/g:link>/g)].map((m) => m[1]);
  assert.ok(links.length >= 20, "feed unexpectedly small");
  const storePages = new Set(Object.values(SLUGS));
  const onStore = links.filter((l) => storePages.has(l)).length;
  assert.ok(onStore === links.length, `${links.length - onStore} feed links still point at multi-product pages`);
});
