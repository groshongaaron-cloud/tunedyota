const { test } = require("node:test");
const assert = require("node:assert/strict");
const { aggregateFunnel } = require("../netlify/functions/lib/funnel.js");

// s1 completes; s2 drops at config; s3 back-navigates (dedup); s4 bounces at make.
const events = [
  ...[0,1,2,3,4,5,6].map((Step) => ({ Session: "s1", Step })),
  ...[0,1,2].map((Step) => ({ Session: "s2", Step })),
  ...[0,1,1,2].map((Step) => ({ Session: "s3", Step })),
  { Session: "s4", Step: 0 },
];

test("distinct sessions per step + drop-off, dedup back-nav", () => {
  const f = aggregateFunnel(events);
  assert.equal(f.totalSessions, 4);
  const by = Object.fromEntries(f.steps.map((s) => [s.step, s.sessions]));
  assert.deepEqual([by[0], by[1], by[2], by[3], by[4], by[5], by[6]], [4, 3, 3, 1, 1, 1, 1]);
  const step1 = f.steps.find((s) => s.step === 1);
  assert.equal(step1.name, "model");
  assert.equal(step1.dropPct, 25);
  assert.equal(step1.overallPct, 75);
  const step2 = f.steps.find((s) => s.step === 2);
  assert.equal(step2.dropPct, 0);
});
test("empty input → zeros, no throw", () => {
  const f = aggregateFunnel([]);
  assert.equal(f.totalSessions, 0);
  assert.equal(f.steps[0].sessions, 0);
  assert.equal(f.steps[0].dropPct, 0);
});
