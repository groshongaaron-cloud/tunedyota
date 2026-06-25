const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const HTML = fs.readFileSync(path.join(__dirname, "..", "site", "index.html"), "utf8");

test("homepage shows both CTA buttons", () => {
  assert.ok(HTML.includes("Book Event Time Slot NOW"), "missing Book button");
  assert.ok(HTML.includes("Schedule my FREE OTT Update"), "missing Update button");
  assert.ok(HTML.includes("find-your-exact-tune.html?intent=update"), "update button must deep-link intent=update");
});
test("CTA band sits above the main content sections", () => {
  const band = HTML.indexOf("Book Event Time Slot NOW");
  const vehicles = HTML.indexOf('id="vehicles"');
  assert.ok(band > -1 && vehicles > -1 && band < vehicles, "CTA band should appear before the vehicles section");
});
