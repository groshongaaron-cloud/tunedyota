// tests/chat-store-prefix.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadActiveByPrefix } = require("../netlify/functions/lib/chat-store.js");

const ENV = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };
const rec = (id, sid, status, last) => ({ id, fields: { "Session ID": sid, Status: status, Transcript: "[]", "Last Activity": last } });

test("returns the most recent non-closed session whose id starts with the prefix", async () => {
  let formula = "";
  const fetchImpl = async (url) => {
    formula = decodeURIComponent(url);
    return { ok: true, json: async () => ({ records: [
      rec("r1", "fb:99", "closed", "2026-07-19T10:00:00Z"),
      rec("r2", "fb:99:1752900000000", "ai", "2026-07-20T10:00:00Z"),
      rec("r3", "fb:99:1752800000000", "escalated", "2026-07-19T22:00:00Z"),
    ] }) };
  };
  const sess = await loadActiveByPrefix("fb:99", { env: ENV, fetchImpl });
  assert.equal(sess.id, "fb:99:1752900000000"); // newest by Last Activity, closed excluded
  assert.ok(formula.includes("fb:99"));
  assert.ok(formula.includes("closed"));
});

test("returns null when nothing matches or on store failure", async () => {
  assert.equal(await loadActiveByPrefix("ig:1", { env: ENV, fetchImpl: async () => ({ ok: true, json: async () => ({ records: [] }) }) }), null);
  assert.equal(await loadActiveByPrefix("ig:1", { env: ENV, fetchImpl: async () => { throw new Error("503"); } }), null);
});
