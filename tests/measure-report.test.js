// tests/measure-report.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
let M;
test.before(async () => { M = await import("../scripts/measure/lib/report.mjs"); });

const SNAP = {
  date: "2026-06-30",
  summary: { aiPresenceRate: 0.55, perplexityCiteRate: 0.3, ctrOpportunities: ["ott tune cost", "is an ott tune worth it"] },
  meta: { errors: [] },
};

test("renderReport on a baseline run says baseline and shows rates", () => {
  const md = M.renderReport(SNAP, { baseline: true, movers: [], ai: { aiPresenceDelta: 0, perplexityCiteDelta: 0 } });
  assert.match(md, /baseline/i);
  assert.match(md, /55%/);
  assert.match(md, /30%/);
  assert.match(md, /ott tune cost/);
});

test("renderReport on a trend run shows deltas and top movers", () => {
  const diff = { baseline: false, movers: [{ query: "ott tune cost", positionDelta: 4, ctrDelta: 0.01 }], ai: { aiPresenceDelta: 0.1, perplexityCiteDelta: -0.05 } };
  const md = M.renderReport(SNAP, diff);
  assert.match(md, /\+10pts|\+0\.1|\+10/);
  assert.match(md, /ott tune cost/);
});

test("renderReport surfaces probe errors loudly", () => {
  const md = M.renderReport({ ...SNAP, meta: { errors: ["GSC auth failed"] } }, { baseline: true, movers: [], ai: {} });
  assert.match(md, /GSC auth failed/);
  assert.match(md, /⚠|error/i);
});

test("renderReport omits the CTR section when there are no opportunities", () => {
  const md = M.renderReport(
    { date: "2026-06-30", summary: { aiPresenceRate: 0.5, perplexityCiteRate: 0.2, ctrOpportunities: [] }, meta: { errors: [] } },
    { baseline: true, movers: [], ai: { aiPresenceDelta: 0, perplexityCiteDelta: 0 } }
  );
  assert.doesNotMatch(md, /CTR opportunities/);
});
