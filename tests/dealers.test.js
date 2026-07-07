const { test } = require("node:test");
const assert = require("node:assert/strict");
const { assignRep, computeProximity, tagGroup, STATE_REP } = require("../netlify/functions/lib/dealer-zones.js");

test("assignRep maps each state to the correct rep", () => {
  assert.equal(assignRep("MN"), "aaron");
  assert.equal(assignRep("IA"), "aaron");
  assert.equal(assignRep("ND"), "aaron");
  assert.equal(assignRep("WI"), "noah");
  assert.equal(assignRep("SD"), "cody");
  assert.equal(assignRep("NE"), "cody");
  assert.equal(assignRep("mn"), "aaron"); // case-insensitive
  assert.equal(assignRep("XX"), null);    // unknown → null
});

test("computeProximity is 'close' for home-metro cities, 'mid' otherwise", () => {
  assert.equal(computeProximity("Burnsville", "aaron"), "close");
  assert.equal(computeProximity("burnsville", "aaron"), "close"); // case-insensitive
  assert.equal(computeProximity("Bemidji", "aaron"), "mid");
  assert.equal(computeProximity("Sioux Falls", "cody"), "close");
  assert.equal(computeProximity("Sheboygan", "noah"), "close");
});

test("tagGroup name-matches multi-store groups, else null", () => {
  assert.equal(tagGroup("Walser Bloomington Toyota"), "Walser");
  assert.equal(tagGroup("Luther Brookdale Toyota"), "Luther");
  assert.equal(tagGroup("Lake Country Toyota"), null);
});

const { scoreDealer, inferOwnership, STAGES } = require("../netlify/functions/lib/dealer-scoring.js");

test("inferOwnership: group present → group, else independent", () => {
  assert.equal(inferOwnership("Luther"), "group");
  assert.equal(inferOwnership(null), "independent");
});

test("scoreDealer: fully-signalled A-tier", () => {
  const r = scoreDealer({ truckVolume: "high", proximity: "close", enthusiastPosture: true, ownershipType: "independent" });
  assert.equal(r.score, 7); // 3+2+1+1
  assert.equal(r.tier, "A");
  assert.equal(r.needsSignal, false);
});

test("scoreDealer: null signals score provisionally and flag needsSignal", () => {
  const r = scoreDealer({ truckVolume: null, proximity: "mid", enthusiastPosture: null, ownershipType: "independent" });
  assert.equal(r.score, 4); // 2(null→med)+1+0+1
  assert.equal(r.tier, "B");
  assert.equal(r.needsSignal, true);
});

test("scoreDealer: group store with null signals defaults to C", () => {
  const r = scoreDealer({ truckVolume: null, proximity: "mid", enthusiastPosture: null, ownershipType: "group" });
  assert.equal(r.score, 3); // 2+1+0+0
  assert.equal(r.tier, "C");
  assert.equal(r.needsSignal, true);
});

test("scoreDealer: tier thresholds (A>=6, B 4-5, C<=3)", () => {
  assert.equal(scoreDealer({ truckVolume: "high", proximity: "close", enthusiastPosture: false, ownershipType: "group" }).tier, "B"); // 3+2+0+0=5
  assert.equal(scoreDealer({ truckVolume: "med", proximity: "close", enthusiastPosture: true, ownershipType: "independent" }).tier, "A"); // 2+2+1+1=6
});

test("STAGES enum is the pipeline order", () => {
  assert.deepEqual(STAGES, ["Prospect", "Contacted", "Kit Sent", "Pilot", "Active"]);
});

const path = require("node:path");
const fs = require("node:fs");
const { readXlsx } = require("../netlify/functions/lib/xlsx-reader.js");

test("readXlsx parses the dealer master list into row objects", () => {
  const file = path.join(__dirname, "..", "docs", "dealers", "dealer-master-list.xlsx");
  if (!fs.existsSync(file)) return; // skip if the source file isn't present
  const rows = readXlsx(file);
  assert.equal(rows.length, 77);
  const header = Object.keys(rows[0]);
  for (const col of ["State", "Abbrev", "Dealer Name", "City", "ZIP"]) {
    assert.ok(header.includes(col), `missing column ${col}`);
  }
  assert.equal(rows[0]["Dealer Name"], "Lake Country Toyota");
  assert.equal(rows[0]["Abbrev"], "MN");
});

const { STATE_REP: SR } = require("../netlify/functions/lib/dealer-zones.js");

test("registry integrity: every dealer is valid and consistently scored", () => {
  const regPath = path.join(__dirname, "..", "netlify", "functions", "lib", "dealers.json");
  if (!fs.existsSync(regPath)) return; // skip until ingest+score have run
  const dealers = JSON.parse(fs.readFileSync(regPath, "utf8"));
  assert.ok(dealers.length > 0, "registry is empty");
  for (const d of dealers) {
    assert.match(d.state, /^[A-Z]{2}$/, `bad state ${d.state} for ${d.name}`);
    assert.ok(STAGES.includes(d.stage), `bad stage ${d.stage} for ${d.name}`);
    assert.equal(d.owningRep, SR[d.state], `rep mismatch for ${d.name} (${d.state})`);
    assert.ok(["A", "B", "C"].includes(d.tier), `bad tier ${d.tier} for ${d.name}`);
    // score/tier must agree with the pure function (registry not hand-edited into inconsistency)
    const fresh = scoreDealer(d);
    assert.equal(d.score, fresh.score, `stale score for ${d.name}`);
    assert.equal(d.tier, fresh.tier, `stale tier for ${d.name}`);
  }
});
