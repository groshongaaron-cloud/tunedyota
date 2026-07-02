const { test } = require("node:test");
const assert = require("node:assert/strict");
const { models, years, lookup, coverage } = require("../netlify/functions/lib/calibration-reference.js");

test("models + years expose the known 5.7L platforms", () => {
  const m = models();
  assert.ok(m.includes("Tundra"));
  assert.ok(m.includes("Sequoia"));
  assert.ok(m.includes("Land Cruiser"));
  const ty = years("Tundra").map(String);
  assert.ok(ty.includes("2007"));
  assert.ok(ty.includes("2021"));
});

test("lookup resolves a vehicle config to its calibration id + narrows on options", () => {
  const y2007 = lookup({ model: "Tundra", year: 2007 });
  assert.equal(y2007.length, 4);                          // 2WD/4WD x Tow No/Yes
  assert.ok(y2007.every((r) => r["New Cal ID"]));
  const twd = lookup({ model: "Tundra", year: 2007, drivetrain: "2WD" });
  assert.equal(twd.length, 2);
  assert.ok(twd.every((r) => r.Drivetrain === "2WD"));
  const seq = lookup({ model: "Sequoia", year: 2008 });
  assert.ok(seq.length >= 1);
  assert.ok(seq.every((r) => r.Model === "Sequoia" && r["New Cal ID"]));
});

test("coverage marks 5.7L as known and lists the rest as pending owner data", () => {
  const cov = coverage();
  assert.ok(cov.covered.some((c) => c.model === "Tundra" && c.engine === "5.7"));
  assert.ok(cov.covered.every((c) => c.engine === "5.7"));          // only 5.7L known today
  assert.ok(cov.pending.length > 0);
  assert.ok(cov.pending.every((p) => p.engine !== "5.7"));          // no 5.7 in the pending list
  assert.ok(cov.pending.some((p) => p.engine === "4.0"));           // e.g. 4.0L V6 platforms pending
  assert.ok(cov.pending.some((p) => p.engine === "2.4"));           // e.g. 2.4L-T turbo platforms pending
});
