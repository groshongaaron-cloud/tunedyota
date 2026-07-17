const { test } = require("node:test");
const assert = require("node:assert/strict");
const { secretEquals } = require("../netlify/functions/lib/secrets.js");

test("secretEquals matches identical non-empty secrets", () => {
  assert.equal(secretEquals("s3cret", "s3cret"), true);
});
test("secretEquals rejects a wrong secret of the same length", () => {
  assert.equal(secretEquals("s3creX", "s3cret"), false);
});
test("secretEquals rejects a wrong secret of a different length", () => {
  assert.equal(secretEquals("short", "a-much-longer-secret"), false);
});
test("secretEquals fails closed on empty/missing values", () => {
  assert.equal(secretEquals("", "s3cret"), false);
  assert.equal(secretEquals("s3cret", ""), false);
  assert.equal(secretEquals("", ""), false);      // both empty is NOT a match
  assert.equal(secretEquals(null, undefined), false);
});
test("secretEquals coerces non-strings safely", () => {
  assert.equal(secretEquals(123, "123"), true);
});
