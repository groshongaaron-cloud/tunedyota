// tests/booking-ui.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const HTML = fs.readFileSync(path.join(__dirname, "..", "site", "find-your-exact-tune.html"), "utf8");

test("real review phrases are present (truthfulness parity with schema)", () => {
  for (const phrase of [
    "smoothest it's ever been",                 // S. Berry
    "throttle control and smoother gear shifts", // H. Aguirre
    "feels like a v8 now",                       // C. Vang
    "classy operation",                          // J. Mayer
  ]) {
    assert.ok(HTML.includes(phrase), `missing review phrase: ${phrase}`);
  }
});

test("conversion-polish hooks exist", () => {
  for (const hook of ["tf-proof", "tf-scarcity", "tf-success-check", 'id="proofResult"', 'id="proofBook"']) {
    assert.ok(HTML.includes(hook), `missing hook: ${hook}`);
  }
});

test("booking success copy softens when email delivery fails", () => {
  assert.ok(HTML.includes("out.emailFailed"), "missing emailFailed branch");
  assert.ok(/confirm the details by phone\/text/i.test(HTML), "missing softened fallback copy");
});
