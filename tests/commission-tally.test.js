const { test } = require("node:test");
const assert = require("node:assert/strict");
const { commissionTally, prevYm } = require("../site/commission-tally.js");

const bk = (o) => Object.assign({ status: "Completed", dateISO: "2026-07-10", installer: "aaron", commission: 100 }, o);

test("current-month total, tunes, pending, byInstaller", () => {
  const t = commissionTally([
    bk({ commission: 160 }),
    bk({ commission: 250, installer: "noah" }),
    bk({ commission: null }),                        // ambiguous -> pending
    bk({ dateISO: "2026-06-15", commission: 300 }),  // last month
    bk({ status: "Booked", commission: 999 }),       // not completed -> ignored
  ], "2026-07");
  assert.equal(t.month.total, 410);
  assert.equal(t.month.tunes, 3);
  assert.equal(t.month.pending, 1);
  assert.equal(t.lastMonth.total, 300);
  assert.equal(t.lifetime.total, 710);
  assert.equal(t.byInstaller.aaron, 160);
  assert.equal(t.byInstaller.noah, 250);
});

test("$0 counts as resolved, not pending", () => {
  const t = commissionTally([bk({ commission: 0 })], "2026-07");
  assert.equal(t.month.total, 0);
  assert.equal(t.month.tunes, 1);
  assert.equal(t.month.pending, 0);
});

test("prevYm: January rolls to prior December", () => {
  assert.equal(prevYm("2026-01"), "2025-12");
  const t = commissionTally([bk({ dateISO: "2025-12-20", commission: 100 })], "2026-01");
  assert.equal(t.lastMonth.total, 100);
});

test("empty -> zeros", () => {
  const t = commissionTally([], "2026-07");
  assert.equal(t.month.total, 0);
  assert.equal(t.lifetime.total, 0);
  assert.deepEqual(t.byInstaller, {});
});
