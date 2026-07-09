const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeScannedVin } = require("../netlify/functions/lib/vin.js");

test("passes a clean 17-char VIN through", () => {
  assert.equal(normalizeScannedVin("5TFDW5F17MX000000"), "5TFDW5F17MX000000");
});
test("uppercases and strips separators/star wrappers", () => {
  assert.equal(normalizeScannedVin("*5tfdw5f17-mx000000*"), "5TFDW5F17MX000000");
});
test("rejects wrong length", () => {
  assert.equal(normalizeScannedVin("5TF"), "");
  assert.equal(normalizeScannedVin("5TFDW5F17MX0000000000"), "");
});
test("rejects a 17-char string containing VIN-illegal I/O/Q", () => {
  assert.equal(normalizeScannedVin("5TFDW5F17MX00000O"), "");
  assert.equal(normalizeScannedVin("I5TFDW5F17MX00000"), "");
});
test("handles null/undefined/empty", () => {
  assert.equal(normalizeScannedVin(null), "");
  assert.equal(normalizeScannedVin(undefined), "");
  assert.equal(normalizeScannedVin(""), "");
});
