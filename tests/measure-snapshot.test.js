// tests/measure-snapshot.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
let M;
test.before(async () => { M = await import("../scripts/measure/lib/snapshot.mjs"); });

test("expectedCtr follows the curve and floors past page 1", () => {
  assert.equal(M.expectedCtr(1), 0.28);
  assert.equal(M.expectedCtr(4.2), 0.07); // rounds to 4
  assert.equal(M.expectedCtr(8), 0.03);
  assert.equal(M.expectedCtr(20), 0.01);
});

test("assembleSnapshot computes rates and flags below-curve high-impression page-1 queries", () => {
  const snap = M.assembleSnapshot({
    date: "2026-06-30",
    gsc: { range: { start: "a", end: "b" }, tracked: [
      { query: "ott tune cost", page: "/ott-tune-cost", clicks: 2, impressions: 300, ctr: 0.0066, position: 4 }, // expected 0.07, below 0.7*curve -> opportunity
      { query: "low vol", page: "/x", clicks: 0, impressions: 20, ctr: 0, position: 3 },                          // too few impressions
      { query: "healthy", page: "/y", clicks: 40, impressions: 300, ctr: 0.13, position: 2 },                     // at/above curve
    ], topPages: [] },
    webSearch: [{ query: "a", present: true }, { query: "b", present: false }],
    perplexity: [{ query: "a", citedUs: true }, { query: "b", citedUs: false }, { query: "c", citedUs: false }],
  });
  assert.equal(snap.summary.aiPresenceRate, 0.5);
  assert.equal(snap.summary.perplexityCiteRate, 0.33);
  assert.deepEqual(snap.summary.ctrOpportunities, ["ott tune cost"]);
  assert.deepEqual(snap.meta.errors, []);
});

test("assembleSnapshot surfaces below-curve high-impression page-1 topPages as pageOpportunities", () => {
  const snap = M.assembleSnapshot({
    date: "2026-06-30",
    gsc: { range: { start: "a", end: "b" }, tracked: [], topPages: [
      { page: "/supercharger", clicks: 1, impressions: 147, ctr: 0.0068, position: 8 },   // expected 0.03, below 0.7*curve -> opportunity
      { page: "/ott-tune", clicks: 9, impressions: 449, ctr: 0.020, position: 9.5 },       // below-curve, higher impressions -> sorts first
      { page: "/thin", clicks: 0, impressions: 40, ctr: 0, position: 3 },                  // too few impressions
      { page: "/healthy", clicks: 30, impressions: 200, ctr: 0.09, position: 8 },          // at/above curve
      { page: "/deep", clicks: 0, impressions: 300, ctr: 0, position: 30 },                // not page 1
    ] },
  });
  const ops = snap.summary.pageOpportunities;
  assert.equal(ops.length, 2);
  assert.equal(ops[0].page, "/ott-tune");          // sorted by impressions desc
  assert.equal(ops[1].page, "/supercharger");
  assert.equal(ops[0].impressions, 449);
  assert.equal(ops[1].expectedCtr, 0.03);
});

test("assembleSnapshot pageOpportunities is empty when there are no topPages", () => {
  const snap = M.assembleSnapshot({ date: "2026-06-30", gsc: { tracked: [] } });
  assert.deepEqual(snap.summary.pageOpportunities, []);
});

test("diffSnapshots returns baseline when there is no prior", () => {
  const d = M.diffSnapshots(null, { gsc: { tracked: [] }, summary: { aiPresenceRate: 0.5, perplexityCiteRate: 0.2 } });
  assert.equal(d.baseline, true);
});

test("diffSnapshots reports position movers and AI deltas", () => {
  const prev = { gsc: { tracked: [{ query: "ott tune cost", ctr: 0.01, position: 8 }] }, summary: { aiPresenceRate: 0.4, perplexityCiteRate: 0.2 } };
  const curr = { gsc: { tracked: [{ query: "ott tune cost", ctr: 0.02, position: 4 }] }, summary: { aiPresenceRate: 0.5, perplexityCiteRate: 0.2 } };
  const d = M.diffSnapshots(prev, curr);
  assert.equal(d.baseline, false);
  assert.equal(d.movers[0].positionDelta, 4); // 8 -> 4 is +4 (improvement)
  assert.equal(d.ai.aiPresenceDelta, 0.1);
  assert.equal(d.ai.perplexityCiteDelta, 0);
});

test("selectLatestPrior picks the newest dated file strictly before the given date", () => {
  const files = ["2026-05-01.json", "2026-06-01.json", "2026-06-30.json", "notes.txt"];
  assert.equal(M.selectLatestPrior(files, "2026-06-30"), "2026-06-01");
  assert.equal(M.selectLatestPrior(["2026-06-30.json"], "2026-06-30"), null);
});
