const { test } = require("node:test");
const assert = require("node:assert/strict");
const { eventsList, flattenRecords } = require("../netlify/functions/lib/report-sources.js");

test("eventsList joins events-data with state + installer", () => {
  const list = eventsList();
  const tc = list.find((e) => e.city === "Twin Cities");
  assert.ok(tc, "Twin Cities present");
  assert.equal(tc.dateISO, "2026-06-20");
  assert.ok(tc.state && tc.installerKey, "has state + installerKey");
});
test("flattenRecords lifts fields + createdTime", () => {
  const flat = flattenRecords([{ id: "r1", createdTime: "2026-06-20T00:00:00Z", fields: { Name: "Jane", City: "Omaha" } }]);
  assert.equal(flat[0].Name, "Jane");
  assert.equal(flat[0].createdTime, "2026-06-20T00:00:00Z");
});
