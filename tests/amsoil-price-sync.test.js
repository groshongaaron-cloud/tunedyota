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
