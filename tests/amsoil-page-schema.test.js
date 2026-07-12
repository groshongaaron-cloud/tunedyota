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
let PAGE_FILES;
test.before(async () => {
  ({ AMSOIL_PAGE_FILES: PAGE_FILES } = await import("../scripts/build-amsoil-pages.mjs"));
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

test("every AMSOIL platform page has at least one Product with a valid offer", () => {
  let totalProducts = 0;
  for (const f of PAGE_FILES) {
    const html = fs.readFileSync(path.join(SITE, f), "utf8");
    const products = collectProducts(ldBlocks(html));
    assert.ok(products.length > 0, `${f}: expected Product nodes in JSON-LD`);
    for (const p of products) {
      totalProducts++;
      // Satisfies Google's rule: one of offers/review/aggregateRating.
      const hasQualifier = p.offers || p.review || p.aggregateRating;
      assert.ok(hasQualifier, `${f}: Product "${p.name}" missing offers/review/aggregateRating`);
      const offer = Array.isArray(p.offers) ? p.offers[0] : p.offers;
      assert.equal(offer["@type"], "Offer", `${f}: Product "${p.name}" offer not an Offer`);
      assert.match(String(offer.price), /^\d+\.\d{2}$/, `${f}: Product "${p.name}" price not "N.NN"`);
      assert.equal(offer.priceCurrency, "USD", `${f}: Product "${p.name}" missing USD currency`);
      assert.ok(/^https?:\/\//.test(offer.url || ""), `${f}: Product "${p.name}" offer missing url`);
    }
  }
  assert.ok(totalProducts >= 13, `expected products across pages, got ${totalProducts}`);
});

test("all AMSOIL page JSON-LD blocks are parseable", () => {
  for (const f of PAGE_FILES) {
    const html = fs.readFileSync(path.join(SITE, f), "utf8");
    assert.doesNotThrow(() => ldBlocks(html), `${f}: unparseable JSON-LD`);
  }
});
