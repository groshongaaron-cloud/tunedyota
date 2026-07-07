// Guards against drift between the funnel's inline VEHICLES config (the human-edited
// "Edit prices here" source in find-your-exact-tune.html) and the server-side copy the
// WebMCP pricing tool reads (netlify/functions/lib/vehicles.json). If prices change in one
// place and not the other, this fails loudly.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const HTML = fs.readFileSync(path.join(__dirname, "..", "site", "find-your-exact-tune.html"), "utf8");
const JSON_COPY = require("../netlify/functions/lib/vehicles.json");

test("lib/vehicles.json is byte-equal to the funnel's inline VEHICLES config", () => {
  const m = HTML.match(/const VEHICLES = (\{[^\n]*\});/);
  assert.ok(m, "could not locate `const VEHICLES = {...};` on a single line in the funnel");
  const funnel = JSON.parse(m[1]);
  assert.deepEqual(JSON_COPY, funnel,
    "netlify/functions/lib/vehicles.json is out of sync with the funnel VEHICLES — re-run the extraction or update both.");
});
