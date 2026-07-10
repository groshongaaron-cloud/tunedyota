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
