// tests/amsoil-page-schema.test.js
// Guards the Google structured-data invariant for the AMSOIL platform pages:
// every Product node MUST carry one of offers/review/aggregateRating, or GSC
// raises the critical "Either offers, review, or aggregateRating should be
// specified" error (regression from 2026-07-12). We emit real `offers`, so this
// asserts each Product's offer is present and well-formed.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SITE = path.join(__dirname, "..", "site");

// Read the on-disk pages (produced by `npm run build:seo`, which also injects the
// OG/twitter tags after this base build). Regenerating here would strip those tags
// and race other suites — so we only read, matching tests/seo.test.js's convention.
// Covers both the per-vehicle platform pages and the AMSOIL Garage hub. The hub
// carries category-level Products whose offer is an AggregateOffer (price range).
let PAGE_FILES;
test.before(async () => {
  const mod = await import("../scripts/build-amsoil-pages.mjs");
  PAGE_FILES = [...mod.AMSOIL_PAGE_FILES, "amsoil-garage.html"];
});

function ldBlocks(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
}
// Every @type:"Product" found anywhere in the JSON-LD graph.
function collectProducts(node, out = []) {
  if (Array.isArray(node)) { node.forEach((n) => collectProducts(n, out)); return out; }
  if (node && typeof node === "object") {
    if (node["@type"] === "Product") out.push(node);
    for (const v of Object.values(node)) collectProducts(v, out);
  }
  return out;
}
const price2dp = (v) => /^\d+\.\d{2}$/.test(String(v));

// Asserts a Product satisfies Google's rule (one of offers/review/aggregateRating)
// and, when it uses offers, that the offer is a well-formed Offer or AggregateOffer.
function assertValidProduct(f, p) {
  assert.ok(p.offers || p.review || p.aggregateRating,
    `${f}: Product "${p.name}" missing offers/review/aggregateRating`);
  if (!p.offers) return;
  const offer = Array.isArray(p.offers) ? p.offers[0] : p.offers;
  assert.equal(offer.priceCurrency, "USD", `${f}: Product "${p.name}" missing USD currency`);
  assert.ok(/^https?:\/\//.test(offer.url || ""), `${f}: Product "${p.name}" offer missing url`);
  if (offer["@type"] === "AggregateOffer") {
    assert.ok(price2dp(offer.lowPrice) && price2dp(offer.highPrice),
      `${f}: Product "${p.name}" AggregateOffer low/high not "N.NN"`);
    assert.ok(Number(offer.offerCount) >= 1, `${f}: Product "${p.name}" AggregateOffer offerCount < 1`);
  } else {
    assert.equal(offer["@type"], "Offer", `${f}: Product "${p.name}" offer not an Offer/AggregateOffer`);
    assert.ok(price2dp(offer.price), `${f}: Product "${p.name}" price not "N.NN"`);
  }
}

test("every AMSOIL page's Products carry a valid offer (Offer or AggregateOffer)", () => {
  let totalProducts = 0;
  for (const f of PAGE_FILES) {
    const html = fs.readFileSync(path.join(SITE, f), "utf8");
    const products = collectProducts(ldBlocks(html));
    assert.ok(products.length > 0, `${f}: expected Product nodes in JSON-LD`);
    for (const p of products) { totalProducts++; assertValidProduct(f, p); }
  }
  assert.ok(totalProducts >= 17, `expected products across pages, got ${totalProducts}`);
});

test("all AMSOIL page JSON-LD blocks are parseable", () => {
  for (const f of PAGE_FILES) {
    const html = fs.readFileSync(path.join(SITE, f), "utf8");
    assert.doesNotThrow(() => ldBlocks(html), `${f}: unparseable JSON-LD`);
  }
});
