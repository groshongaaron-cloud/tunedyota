const { test } = require("node:test");
const assert = require("node:assert/strict");
const { extractVehicles } = require("../scripts/lib/extract-vehicles.cjs");

const VEHICLES = { Toyota: { Tacoma: [{ y: "2024+", e: "2.4L-T I4", base: 650 }] } };

test("extracts a single-line VEHICLES literal", () => {
  const html = `<script>\nconst VEHICLES = ${JSON.stringify(VEHICLES)};\n</script>`;
  assert.deepEqual(extractVehicles(html), VEHICLES);
});

test("extracts a multi-line (formatted) VEHICLES literal", () => {
  const html = `<script>\nconst VEHICLES = ${JSON.stringify(VEHICLES, null, 2)};\n</script>`;
  assert.deepEqual(extractVehicles(html), VEHICLES);
});

test("braces and escaped quotes inside strings do not confuse the scanner", () => {
  const tricky = { Toyota: { Tundra: [{ y: "2007-2021", note: 'say "hi" to } and { and \\', base: 500 }] } };
  const html = `const VEHICLES = ${JSON.stringify(tricky, null, 2)};`;
  assert.deepEqual(extractVehicles(html), tricky);
});

test("throws loudly when the literal is missing", () => {
  assert.throws(() => extractVehicles("<html>no vehicles here</html>"), /VEHICLES literal not found/);
});

test("extracts the real funnel literal from find-your-exact-tune.html", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const html = fs.readFileSync(path.join(__dirname, "..", "site", "find-your-exact-tune.html"), "utf8");
  const v = extractVehicles(html);
  assert.ok(v.Toyota && v.Lexus, "expected Toyota and Lexus makes in the funnel VEHICLES");
});
