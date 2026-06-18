const { test } = require("node:test");
const assert = require("node:assert/strict");
const { MARKETS, getMarket } = require("../netlify/functions/lib/markets.js");

test("has 15 markets", () => { assert.equal(MARKETS.length, 15); });
test("getMarket is case-insensitive and trims", () => {
  assert.equal(getMarket("  sioux falls ").inst, "cody");
  assert.equal(getMarket("Green Bay").inst, "noah");
  assert.equal(getMarket("Twin Cities").inst, "aaron");
});
test("getMarket returns null for unknown/empty", () => {
  assert.equal(getMarket("Atlantis"), null);
  assert.equal(getMarket(""), null);
});
