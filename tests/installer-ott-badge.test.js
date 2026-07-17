const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const HTML = fs.readFileSync(path.join(__dirname, "..", "site", "installer.html"), "utf8");
test("console renders OTT badges for ott-national leads and ott bookings", () => {
  assert.ok(HTML.includes("l.channel==='ott-national'"), "lead card OTT chip");
  assert.ok(HTML.includes("b.ott?"), "booking row OTT chip");
});
