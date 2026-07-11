const { test } = require("node:test");
const assert = require("node:assert/strict");
const { deriveVehicle, vehicleType, lookupCommission } = require("../netlify/functions/lib/ott-commission.js");

test("deriveVehicle parses type/year/engine from a booking's free-text vehicle", () => {
  // Policy 0012: the 2.4L turbo trucks report as 2.4T (gas) / 2.4TH (iForce Max hybrid)
  assert.deepEqual(deriveVehicle("2024+ Toyota Tacoma 2.4L-T I4"), { vehicleType: "Tacoma", year: 2024, engine: "2.4T" });
  assert.deepEqual(deriveVehicle("2025 Toyota Tundra 2.4L Hybrid iForce Max"), { vehicleType: "Tundra", year: 2025, engine: "2.4TH" });
  assert.deepEqual(deriveVehicle("2007-2021 Toyota Tundra 5.7L V8"), { vehicleType: "Tundra", year: 2007, engine: "5.7" });
  assert.deepEqual(deriveVehicle("2019 Lexus GX 460 4.6L V8"), { vehicleType: "GX460", year: 2019, engine: "4.6" });
});

test("vehicleType matches Policy 0012 picklist incl. the space in 'RAV 4', ES350, LS460", () => {
  assert.equal(vehicleType("2010 Toyota RAV4 3.5L"), "RAV 4");
  assert.equal(vehicleType("2015 Lexus ES350 3.5L V6"), "ES350");
  assert.equal(vehicleType("2012 Lexus LS460 4.6L V8"), "LS460");
  assert.equal(vehicleType("2020 Toyota Land Cruiser 5.7L"), "Land Cruiser");
});

test("commissionCandidates: 4th Gen Tacoma offers Stage 1 (default) / Stage 1 Custom / Stage 3 Custom", () => {
  const { commissionCandidates } = require("../netlify/functions/lib/ott-commission.js");
  const c = commissionCandidates({ vehicleType: "Tacoma", engine: "2.4T", year: 2024, tuningPlatform: "VFT" });
  assert.deepEqual(c.map((x) => [x.label, x.amount]), [["Stage 1", 160], ["Stage 1 Custom", 250], ["Stage 3 Custom", 350]]);
  assert.equal(c[0].amount, 160, "Stage 1 is the default");
  assert.deepEqual(commissionCandidates({ vehicleType: "Tacoma", engine: "2.4TH", year: 2025, tuningPlatform: "VFT" }).length, 3);   // hybrid too
  assert.deepEqual(commissionCandidates({ vehicleType: "Tacoma", engine: "3.5", year: 2021 }), []);   // not 4th gen
  assert.deepEqual(commissionCandidates({ vehicleType: "Tundra", engine: "5.7", year: 2020 }), []);
});

test("engine round-trips: the DERIVED 2.4T engine resolves the 4th Gen Tacoma commission (regression)", () => {
  // deriveVehicle emits "2.4T"; feeding that straight back to lookupCommission must
  // still match the price sheet (it silently returned nothing before the idempotency fix).
  const dv = deriveVehicle("2024 Toyota Tacoma 2.4L-T I4");
  assert.equal(dv.engine, "2.4T");
  assert.equal(lookupCommission({ vehicleType: "Tacoma", year: 2024, engine: dv.engine, tuningPlatform: "VFT", calibrationType: "Basic" }).commission, 160);
});

test("lookupCommission resolves an unambiguous Basic calibration to its OTT Commission", () => {
  // 4th Gen Tacoma 2.4 VFT Base (OE Spec + Stage 1 both = 160; the MAF upgrade row is excluded)
  const a = lookupCommission({ vehicleType: "Tacoma", year: 2024, engine: "2.4", tuningPlatform: "VFT", calibrationType: "Basic" });
  assert.equal(a.commission, 160);
  // Tundra 5.7 VFT Base = 110 ; PCM Base = 160
  assert.equal(lookupCommission({ vehicleType: "Tundra", year: 2015, engine: "5.7", tuningPlatform: "VFT", calibrationType: "Basic" }).commission, 110);
  assert.equal(lookupCommission({ vehicleType: "Tundra", year: 2015, engine: "5.7", tuningPlatform: "PCM", calibrationType: "Basic" }).commission, 160);
});

test("VFT/PCM Basic resolves to the plain Base amount (CE/CARB-update row excluded)", () => {
  // 3rd Gen Tacoma 3.5 VFT Basic = Base $110 (the $35 CE Update variant is not "Basic")
  assert.equal(lookupCommission({ vehicleType: "Tacoma", year: 2018, engine: "3.5", tuningPlatform: "VFT", calibrationType: "Basic" }).commission, 110);
  // 3rd Gen Tacoma 2.7 has PCM Base = $160 (the 3.5L has no PCM option)
  assert.equal(lookupCommission({ vehicleType: "Tacoma", year: 2018, engine: "2.7", tuningPlatform: "PCM", calibrationType: "Basic" }).commission, 160);
});

test("resolveCommission: 9.2 Update is free ($0); otherwise the price-sheet amount", () => {
  const { resolveCommission } = require("../netlify/functions/lib/ott-commission.js");
  assert.equal(resolveCommission({ vehicleType: "Tacoma", year: 2019, engine: "3.5", tuningPlatform: "VFT", calibrationType: "9.2 Update" }), 0);
  assert.equal(resolveCommission({ vehicleType: "Tacoma", year: 2019, engine: "3.5", tuningPlatform: "VFT", calibrationType: "Basic" }), 110);
  assert.equal(resolveCommission({ vehicleType: "Tacoma", year: 2024, engine: "2.4T", tuningPlatform: "VFT", calibrationType: "Basic" }), 160);
});

test("lookupCommission won't auto-match a bench (BB) platform", () => {
  const r = lookupCommission({ vehicleType: "Tundra", year: 2015, engine: "5.7", tuningPlatform: "BB", calibrationType: "Basic" });
  assert.equal(r.commission, null);
  assert.equal(r.confidence, "none");
});

test("lookupCommission matches a Supercharger row by model", () => {
  // Tundra 5.7 VFT supercharger stage 1 = 410
  const r = lookupCommission({ vehicleType: "Tundra", year: 2015, engine: "5.7", tuningPlatform: "VFT", calibrationType: "Supercharger" });
  assert.ok(r.candidates.every((c) => /supercharg/i.test(c.model)));
  assert.ok(r.candidates.length >= 1);
});
