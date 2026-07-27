const { test } = require("node:test");
const assert = require("node:assert/strict");
const { purgeCancelled, PURGE_AFTER_MS } = require("../netlify/functions/purge-cancelled.js");

const DAY = 24 * 60 * 60 * 1000;
const ENV = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };

test("purges only Cancelled records stamped >30 days ago; unstamped never touched", async () => {
  const now = Date.now();
  const deleted = [];
  const out = await purgeCancelled({
    env: ENV, now: () => now,
    list: async () => [
      { id: "old", fields: { "Cancelled At": new Date(now - 31 * DAY).toISOString() } },
      { id: "fresh", fields: { "Cancelled At": new Date(now - 5 * DAY).toISOString() } },
      { id: "legacy-unstamped", fields: {} },
      { id: "garbage-stamp", fields: { "Cancelled At": "not a date" } },
    ],
    del: async (a) => { deleted.push(a.id); },
  });
  assert.deepEqual(deleted, ["old"]);
  assert.equal(out.purged, 1);
  assert.equal(out.considered, 4);
  assert.equal(PURGE_AFTER_MS, 30 * DAY);
});

test("one failed delete doesn't stop the sweep", async () => {
  const now = Date.now();
  const deleted = [];
  const out = await purgeCancelled({
    env: ENV, now: () => now, log: { error: () => {}, log: () => {} },
    list: async () => [
      { id: "a", fields: { "Cancelled At": new Date(now - 40 * DAY).toISOString() } },
      { id: "b", fields: { "Cancelled At": new Date(now - 40 * DAY).toISOString() } },
    ],
    del: async (a) => { if (a.id === "a") throw new Error("422"); deleted.push(a.id); },
  });
  assert.deepEqual(deleted, ["b"]);
  assert.equal(out.purged, 1);
});
