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

// Fix 1: formula must use exact-or-colon-delimited match to prevent cross-sender collisions
// e.g. prefix "fb:99" must not match "fb:999" via a bare FIND
test("filterByFormula uses colon-delimited prefix to prevent cross-sender collision", async () => {
  let capturedFormula = "";
  const fetchImpl = async (url) => {
    capturedFormula = decodeURIComponent(url);
    return { ok: true, json: async () => ({ records: [] }) };
  };
  await loadActiveByPrefix("fb:99", { env: ENV, fetchImpl });
  // Must contain the colon-delimited form so "fb:999" is not a false positive
  assert.ok(
    capturedFormula.includes("fb:99:"),
    `formula should contain colon-delimited "fb:99:" but got: ${capturedFormula}`
  );
});

// Fix 2: client-side closed filter (belt-and-braces)
// Even if Airtable returns a closed record (e.g. api filter missed it),
// the client-side filter must exclude it — even when it has the NEWEST Last Activity.
test("client-side closed filter excludes closed session even when it has the newest Last Activity", async () => {
  const fetchImpl = async (url) => {
    return { ok: true, json: async () => ({ records: [
      // closed record has the NEWEST timestamp — without client-side filter this would be returned
      rec("r_closed", "fb:42", "closed", "2026-07-20T23:00:00Z"),
      rec("r_open",   "fb:42:1752900000000", "ai", "2026-07-20T10:00:00Z"),
    ] }) };
  };
  const sess = await loadActiveByPrefix("fb:42", { env: ENV, fetchImpl });
  assert.ok(sess !== null, "should return a non-null session");
  assert.notEqual(sess.status, "closed", "must not return the closed session");
  assert.equal(sess.id, "fb:42:1752900000000", "should return the open session");
});
