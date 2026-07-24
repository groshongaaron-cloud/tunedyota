// tests/amsoil-product-pages.test.js
// Guards the Merchant Center product-page layer: one SINGLE-product landing page
// per priced catalog SKU (Google's merchant-listing experience requires exactly
// one Product per page — multi-product pages only qualify for snippets). Each
// page must carry the full identifier set (stockNo as sku+mpn), the live synced
// price, a self-hosted image, and stay registered in HEAD_PAGES so it gets
// OG tags + sitemap coverage. Reads committed pages only (build-seo convention —
// never call buildAmsoilPages() here; it would strip the injected OG tags).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SITE = path.join(__dirname, "..", "site");
const CAT = require("../site/amsoil-garage.json");

let mod, SD;
test.before(async () => {
  mod = await import("../scripts/build-amsoil-pages.mjs");
  SD = await import("../scripts/lib/seo-data.mjs");
});

function ldBlocks(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
}
const priceOf = (p) => (typeof p.salePrice === "number" && p.salePrice > 0 ? p.salePrice
  : typeof p.retailPrice === "number" && p.retailPrice > 0 ? p.retailPrice : null);

test("one product page per priced catalog SKU, registered in HEAD_PAGES", () => {
  const priced = Object.values(CAT.products).filter((p) => priceOf(p) != null);
  assert.equal(mod.AMSOIL_PRODUCT_FILES.length, priced.length, "a page per priced product");
  for (const f of mod.AMSOIL_PRODUCT_FILES) {
    assert.ok(fs.existsSync(path.join(SITE, f)), `${f} missing on disk`);
    assert.ok(SD.HEAD_PAGES.includes(f), `${f} not registered in HEAD_PAGES (no OG/sitemap)`);
  }
});

test("each product page is a valid single-product merchant listing", () => {
  const bySlugFile = new Map(Object.entries(CAT.products)
    .filter(([, p]) => priceOf(p) != null)
    .map(([sku, p]) => [`${mod.productSlug(p)}.html`, { sku, p }]));
  for (const f of mod.AMSOIL_PRODUCT_FILES) {
    const { p } = bySlugFile.get(f);
    const html = fs.readFileSync(path.join(SITE, f), "utf8");
    const products = ldBlocks(html).filter((b) => b["@type"] === "Product");
    assert.equal(products.length, 1, `${f}: expected exactly ONE top-level Product node`);
    const prod = products[0];
    assert.equal(prod.name, p.name, `${f}: Product name mismatch`);
    assert.equal(prod.sku, p.stockNo, `${f}: sku must be the AMSOIL stock number`);
    assert.equal(prod.mpn, p.stockNo, `${f}: mpn must be the AMSOIL stock number`);
    assert.equal(prod.brand.name, "AMSOIL", `${f}: brand`);
    // Image must be absolute AND self-hosted (the file really exists in site/).
    const img = prod.image[0];
    assert.match(img, /^https:\/\/tunedyota\.com\/images\/amsoil\//, `${f}: image not self-hosted absolute`);
    assert.ok(fs.existsSync(path.join(SITE, img.replace("https://tunedyota.com/", ""))), `${f}: image file missing`);
    // Offer: live synced price, in stock, new condition, return policy attached.
    const o = prod.offers;
    assert.equal(o["@type"], "Offer");
    assert.equal(o.price, priceOf(p).toFixed(2), `${f}: schema price must match the synced catalog`);
    assert.equal(o.priceCurrency, "USD");
    assert.equal(o.availability, "https://schema.org/InStock");
    assert.equal(o.itemCondition, "https://schema.org/NewCondition");
    assert.equal(o.hasMerchantReturnPolicy.merchantReturnDays, 30, `${f}: return policy missing`);
    // Visible page carries the same price + the referral order link + track script.
    assert.ok(html.includes(`$${priceOf(p).toFixed(2)}`), `${f}: visible price missing`);
    assert.ok(html.includes("zo=30713116"), `${f}: order link missing the dealer referral`);
    assert.ok(html.includes("amsoil-track.js"), `${f}: click-tracking script missing`);
    assert.ok(html.includes(`<link rel="canonical" href="https://tunedyota.com/${f.replace(/\.html$/, "")}">`), `${f}: canonical wrong`);
  }
});

test("fitment capacity integrity: unverified generations expose no capacity", () => {
  // fitmentFor mirrors the vehicle-page rule: capacity renders only when BOTH
  // the generation and the system row are installer-verified.
  for (const sku of Object.keys(CAT.products)) {
    for (const f of mod.fitmentFor(sku)) {
      if (f.capacity) {
        const gens = CAT.vehicles[f.make][f.model].filter((g) => g.y === f.y);
        assert.ok(gens.every((g) => g.verified), `${sku}: capacity shown for unverified gen ${f.make} ${f.model} ${f.y}`);
      }
    }
  }
});

test("garage hub links every product page", () => {
  const html = fs.readFileSync(path.join(SITE, "amsoil-garage.html"), "utf8");
  for (const f of mod.AMSOIL_PRODUCT_FILES) {
    assert.ok(html.includes(`href="${f}"`), `garage hub missing link to ${f}`);
  }
});
