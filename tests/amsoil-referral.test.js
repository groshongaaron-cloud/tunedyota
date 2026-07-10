// tests/amsoil-referral.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { amsoilUrl, AMSOIL_ZO } = require("../site/amsoil-referral.js");

test("AMSOIL_ZO is the Tuned Yota dealer number", () => {
  assert.equal(AMSOIL_ZO, "30713116");
});
test("adds ?zo to a bare product path", () => {
  assert.equal(amsoilUrl("/p/signature-series-0w-20/"),
    "https://www.amsoil.com/p/signature-series-0w-20/?zo=30713116");
});
test("uses &zo when the URL already has a query", () => {
  assert.equal(amsoilUrl("/shop/?q=oil"),
    "https://www.amsoil.com/shop/?q=oil&zo=30713116");
});
test("preserves a #fragment after the zo param", () => {
  assert.equal(amsoilUrl("/search/?query=V-Twin#q=V-Twin"),
    "https://www.amsoil.com/search/?query=V-Twin&zo=30713116#q=V-Twin");
});
test("accepts a full URL and an explicit zo override", () => {
  assert.equal(amsoilUrl("https://www.amsoil.com/offers/pc/", "999"),
    "https://www.amsoil.com/offers/pc/?zo=999");
});
