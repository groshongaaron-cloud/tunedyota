// tests/tune-finder-year.test.js
// Model year is captured for EVERY vehicle selection (spec 2026-07-31):
// single-year platforms capture silently, unknown ranges get a generic required
// list, and the submit payload never gates modelYear on the field being visible.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const html = fs.readFileSync("site/find-your-exact-tune.html", "utf8");

test("single-year platforms auto-capture the year (no hidden empty select)", () => {
  assert.match(html, /r\.hi===r\.lo/, "populateModelYear must special-case single-year ranges");
  assert.match(html, /sel\.value=String\(r\.lo\)/, "single-year value must be set so it submits");
});

test("unparseable ranges fall back to a generic required year list", () => {
  assert.match(html, /const lo=r\?r\.lo:1995/, "generic fallback low bound");
});

test("submit reads the year unconditionally, not only when shown", () => {
  assert.doesNotMatch(html, /modelYear=yearShown\?yearEl\.value:""/,
    "modelYear must not be dropped when the group is hidden (single-year case)");
});
