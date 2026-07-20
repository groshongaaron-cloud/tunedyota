const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const cat = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "site", "amsoil-catalog.json"), "utf8"));

test("catalog is a substantial, well-formed AMSOIL product set", () => {
  assert.ok(cat.count >= 500, "expected the full catalog (500+ products)");
  assert.equal(cat.count, cat.products.length);
  assert.equal(cat.zo, "30713116");
});
test("every product has a name, code, category, and a referral buy URL", () => {
  for (const p of cat.products) {
    assert.ok(p.name && p.code && p.category, `incomplete product: ${JSON.stringify(p)}`);
    assert.match(p.buyUrl, /^https:\/\/www\.amsoil\.com\/p\/.+\?zo=30713116$/, `bad buyUrl: ${p.buyUrl}`);
  }
});
test("category counts in the index match the products", () => {
  const tally = {};
  for (const p of cat.products) tally[p.category] = (tally[p.category] || 0) + 1;
  assert.deepEqual(tally, cat.categories);
});
