const { test } = require("node:test");
const assert = require("node:assert/strict");
const { MARKETS, getMarket } = require("../netlify/functions/lib/markets.js");

test("has 20 markets", () => { assert.equal(MARKETS.length, 20); });
test("Brainerd, Bismarck, Grand Forks are waitlist-only, interim-routed to aaron (new installer TBD)", () => {
  assert.equal(getMarket("Brainerd").inst, "aaron");
  assert.equal(getMarket("Bismarck").inst, "aaron");
  assert.equal(getMarket("Grand Forks").inst, "aaron");
});
test("Lincoln and Sioux City route to cody (waitlist-only adjacent markets)", () => {
  assert.equal(getMarket("Lincoln").inst, "cody");
  assert.equal(getMarket("Sioux City").inst, "cody");
});
test("getMarket is case-insensitive and trims", () => {
  assert.equal(getMarket("  sioux falls ").inst, "cody");
  assert.equal(getMarket("Green Bay").inst, "noah");
  assert.equal(getMarket("Twin Cities").inst, "aaron");
});
test("getMarket returns null for unknown/empty", () => {
  assert.equal(getMarket("Atlantis"), null);
  assert.equal(getMarket(""), null);
});
