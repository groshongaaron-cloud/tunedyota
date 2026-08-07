import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOfferPrices, driftedVariants } from "../scripts/amsoil/lib/drift-core.mjs";

const HTML = `
<script type="application/ld+json">
{"@type":"ProductGroup","hasVariant":[
  {"@type":"Product","sku":"ABC-EA","offers":{"@type":"Offer","price":"12.95"}},
  {"@type":"Product","sku":"ABC-CA","offers":{"price":11.5}}
]}
</script>`;

test("parseOfferPrices reads every per-sku offer price, upper-cased", () => {
  const m = parseOfferPrices(HTML);
  assert.equal(m.get("ABC-EA"), 12.95);
  assert.equal(m.get("ABC-CA"), 11.5);
});

test("parseOfferPrices tolerates non-JSON ld blocks", () => {
  const m = parseOfferPrices(`<script type="application/ld+json">not json</script>`);
  assert.equal(m.size, 0);
});

test("driftedVariants flags only beyond-tolerance mismatches", () => {
  const product = { category: "Oil", variants: [
    { stockNo: "ABC-EA", retail: 12.95 },  // matches
    { stockNo: "ABC-CA", retail: 10.00 },  // drift: live 11.5
  ]};
  const live = new Map([["ABC-EA", 12.95], ["ABC-CA", 11.5]]);
  const out = driftedVariants(product, live);
  assert.equal(out.length, 1);
  assert.equal(out[0].stockNo, "ABC-CA");
  assert.equal(out[0].catalog, 10.0);
  assert.equal(out[0].live, 11.5);
});

test("driftedVariants does not fire at exactly the tolerance boundary", () => {
  const product = { category: "Oil", variants: [{ stockNo: "BND-EA", retail: 10.0 }] };
  const live = new Map([["BND-EA", 10.01]]); // exactly TOLERANCE away — must NOT flag
  assert.equal(driftedVariants(product, live).length, 0);
});

test("driftedVariants matches a sold-each sku when page drops the -EA suffix", () => {
  const product = { category: "Oil", variants: [{ stockNo: "XYZ-EA", retail: 9.0 }] };
  const live = new Map([["XYZ", 9.99]]); // page listed base sku, no -EA
  const out = driftedVariants(product, live);
  assert.equal(out.length, 1);
  assert.equal(out[0].live, 9.99);
});

test("driftedVariants ignores variants absent from the live page", () => {
  const product = { category: "Oil", variants: [{ stockNo: "GONE-EA", retail: 5.0 }] };
  assert.equal(driftedVariants(product, new Map()).length, 0);
});
