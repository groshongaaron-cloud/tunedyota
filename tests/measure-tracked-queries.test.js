// tests/measure-tracked-queries.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
let M;
test.before(async () => { M = await import("../scripts/measure/lib/tracked-queries.mjs"); });

test("loadTrackedQueries trims and returns normalized entries", () => {
  const out = M.loadTrackedQueries([{ query: " ott tune cost ", intent: "commercial", targetPage: "/ott-tune-cost" }]);
  assert.deepEqual(out, [{ query: "ott tune cost", intent: "commercial", targetPage: "/ott-tune-cost" }]);
});

test("loadTrackedQueries throws on a missing field", () => {
  assert.throws(() => M.loadTrackedQueries([{ query: "x", intent: "commercial" }]), /targetPage/);
});

test("loadTrackedQueries throws when not an array", () => {
  assert.throws(() => M.loadTrackedQueries({}), /array/);
});

test("the shipped tracked-queries.json is valid and non-trivial", async () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "../docs/seo/tracked-queries.json"), "utf8"));
  const out = M.loadTrackedQueries(raw);
  assert.ok(out.length >= 12, "expected at least 12 tracked queries");
});
