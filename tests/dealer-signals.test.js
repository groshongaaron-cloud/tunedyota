const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { buildWorkbook } = require("../netlify/functions/lib/xlsx-writer.js");
const { readXlsx } = require("../netlify/functions/lib/xlsx-reader.js");
const { findKey, parseTruck, parseEnth } = require("../scripts/ingest-signals.js");
const { scoreDealer } = require("../netlify/functions/lib/dealer-scoring.js");

test("parseTruck accepts high/med/low (case/space-insensitive), blank→null, rejects junk", () => {
  assert.deepEqual(parseTruck("high"), { ok: true, val: "high" });
  assert.deepEqual(parseTruck("  MED "), { ok: true, val: "med" });
  assert.deepEqual(parseTruck(""), { ok: true, val: null });
  assert.deepEqual(parseTruck(null), { ok: true, val: null });
  assert.equal(parseTruck("huge").ok, false);
});

test("parseEnth maps yes/no synonyms, blank→null, rejects junk", () => {
  assert.deepEqual(parseEnth("yes"), { ok: true, val: true });
  assert.deepEqual(parseEnth("Y"), { ok: true, val: true });
  assert.deepEqual(parseEnth("no"), { ok: true, val: false });
  assert.deepEqual(parseEnth("FALSE"), { ok: true, val: false });
  assert.deepEqual(parseEnth(""), { ok: true, val: null });
  assert.equal(parseEnth("maybe").ok, false);
});

test("findKey detects the hinted signal columns regardless of parenthetical text", () => {
  const keys = ["Rep", "Dealer", "City", "ST", "Group", "Proximity", "Truck Volume (high/med/low)", "Enthusiast? (yes/no)"];
  assert.equal(findKey(keys, /dealer/i), "Dealer");
  assert.equal(findKey(keys, /truck/i), "Truck Volume (high/med/low)");
  assert.equal(findKey(keys, /enthus/i), "Enthusiast? (yes/no)");
  assert.equal(findKey(keys, /nope/i), null);
});

test("xlsx round-trip: buildWorkbook → readXlsx preserves headers, values, and blanks", () => {
  const header = ["Dealer", "Truck Volume (high/med/low)", "Enthusiast? (yes/no)"];
  const aoa = [header, ["Kolar Toyota", "high", "yes"], ["Mills Toyota", "", ""]];
  const buf = buildWorkbook([{ name: "Signals", aoa }]);
  const tmp = path.join(os.tmpdir(), `signals-roundtrip-${process.pid}.xlsx`);
  fs.writeFileSync(tmp, buf);
  try {
    const rows = readXlsx(tmp);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]["Dealer"], "Kolar Toyota");
    assert.equal(rows[0]["Truck Volume (high/med/low)"], "high");
    assert.equal(rows[0]["Enthusiast? (yes/no)"], "yes");
    assert.equal(rows[1]["Dealer"], "Mills Toyota");
    assert.equal(rows[1]["Truck Volume (high/med/low)"], "");
    assert.equal(rows[1]["Enthusiast? (yes/no)"], "");
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

test("readXlsx reads the DATA sheet (sheet1) when a How-to sheet follows it", () => {
  const buf = buildWorkbook([
    { name: "Signals", aoa: [["Dealer", "Truck Volume (high/med/low)"], ["Kolar Toyota", "med"]] },
    { name: "How to fill", aoa: [["instructions here"]] },
  ]);
  const tmp = path.join(os.tmpdir(), `signals-twosheet-${process.pid}.xlsx`);
  fs.writeFileSync(tmp, buf);
  try {
    const rows = readXlsx(tmp);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]["Dealer"], "Kolar Toyota");
    assert.equal(rows[0]["Truck Volume (high/med/low)"], "med");
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

test("parsed signals feed the scorer: high + enthusiast on a close independent → Tier A", () => {
  const tv = parseTruck("high");
  const en = parseEnth("yes");
  const d = { truckVolume: tv.val, enthusiastPosture: en.val, proximity: "close", ownershipType: "independent" };
  const { score, tier, needsSignal } = scoreDealer(d);
  assert.equal(score, 7); // 3 truck + 2 proximity + 1 enthusiast + 1 independent
  assert.equal(tier, "A");
  assert.equal(needsSignal, false);
});
