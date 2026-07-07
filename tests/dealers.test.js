const { test } = require("node:test");
const assert = require("node:assert/strict");
const { assignRep, computeProximity, tagGroup, STATE_REP } = require("../netlify/functions/lib/dealer-zones.js");

test("assignRep maps each state to the correct rep", () => {
  assert.equal(assignRep("MN"), "aaron");
  assert.equal(assignRep("IA"), "aaron");
  assert.equal(assignRep("ND"), "aaron");
  assert.equal(assignRep("WI"), "noah");
  assert.equal(assignRep("SD"), "cody");
  assert.equal(assignRep("NE"), "cody");
  assert.equal(assignRep("mn"), "aaron"); // case-insensitive
  assert.equal(assignRep("XX"), null);    // unknown → null
});

test("computeProximity is 'close' for home-metro cities, 'mid' otherwise", () => {
  assert.equal(computeProximity("Burnsville", "aaron"), "close");
  assert.equal(computeProximity("burnsville", "aaron"), "close"); // case-insensitive
  assert.equal(computeProximity("Bemidji", "aaron"), "mid");
  assert.equal(computeProximity("Sioux Falls", "cody"), "close");
  assert.equal(computeProximity("Sheboygan", "noah"), "close");
});

test("tagGroup name-matches multi-store groups, else null", () => {
  assert.equal(tagGroup("Walser Bloomington Toyota"), "Walser");
  assert.equal(tagGroup("Luther Brookdale Toyota"), "Luther");
  assert.equal(tagGroup("Lake Country Toyota"), null);
});
