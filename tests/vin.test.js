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

// ---- ISO 3779 check digit (position 9) — the offline accuracy gate ----
const { vinCheckDigitOk } = require("../netlify/functions/lib/vin.js");
const fs = require("node:fs");
const path = require("node:path");

test("vinCheckDigitOk accepts VINs with a correct check digit", () => {
  assert.equal(vinCheckDigitOk("1M8GDM9AXKP042788"), true);   // textbook example (check digit X)
  assert.equal(vinCheckDigitOk("1HGCM82633A004352"), true);   // check digit 3
  assert.equal(vinCheckDigitOk("5TFDW5F16MX000000"), true);
  assert.equal(vinCheckDigitOk("1m8gdm9axkp042788"), true);   // case-insensitive
});
test("vinCheckDigitOk rejects a single-character misread", () => {
  assert.equal(vinCheckDigitOk("1M8GDM9AXKP042789"), false);  // last char flipped
  assert.equal(vinCheckDigitOk("5TFDW5F17MX000000"), false);  // wrong check digit
  assert.equal(vinCheckDigitOk("JTEBU5JR4K5601234"), false);
});
test("vinCheckDigitOk rejects malformed input outright", () => {
  assert.equal(vinCheckDigitOk(""), false);
  assert.equal(vinCheckDigitOk(null), false);
  assert.equal(vinCheckDigitOk("1M8GDM9AXKP04278"), false);   // 16 chars
});
test("installer console inlines the same check-digit math (drift guard)", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "site", "installer.html"), "utf8");
  assert.ok(html.includes("function vinCheckDigitOk"), "console missing vinCheckDigitOk");
  assert.ok(html.includes("8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2"), "console missing ISO 3779 weights");
});
