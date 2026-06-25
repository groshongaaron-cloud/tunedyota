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

test("event-date urgency: hooks + tier phrases present", () => {
  assert.ok(HTML.includes("tf-urgency"), "missing tf-urgency class");
  assert.ok(/function eventUrgency/.test(HTML), "missing eventUrgency() helper");
  assert.ok(/function urgencyLine/.test(HTML), "missing urgencyLine() renderer");
  for (const phrase of ["Lock in your spot", "days left", "event is in", "Tomorrow —"]) {
    assert.ok(HTML.includes(phrase), `missing tier phrase: ${phrase}`);
  }
});
