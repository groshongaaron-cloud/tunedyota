const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ecuCandidates, is3rdGenTacoma, defaultGear, gearForTransmission } = require("../netlify/functions/lib/ecu-ids.js");

test("ecuCandidates maps 3rd Gen Tacoma 3.5L year → Auto/Manual IDs (Auto first)", () => {
  const c = ecuCandidates({ vehicleType: "Tacoma", engine: "3.5", year: 2022 });
  assert.equal(c.length, 2);
  assert.equal(c[0].id, "04C22"); assert.equal(c[0].transmission, "Auto");   // most likely first
  assert.equal(c[1].id, "04C31"); assert.equal(c[1].transmission, "Manual");
  assert.equal(ecuCandidates({ vehicleType: "Tacoma", engine: "3.5", year: 2017 })[0].id, "04B06");
  assert.equal(ecuCandidates({ vehicleType: "Tacoma", engine: "3.5", year: 2019 })[0].id, "04B34");
});

test("ecuCandidates returns [] for vehicles we have no data for", () => {
  assert.deepEqual(ecuCandidates({ vehicleType: "Tacoma", engine: "2.7", year: 2019 }), []);   // 2.7L not mapped
  assert.deepEqual(ecuCandidates({ vehicleType: "Tundra", engine: "5.7", year: 2020 }), []);
  assert.deepEqual(ecuCandidates({ vehicleType: "Tacoma", engine: "3.5", year: 2015 }), []);   // 2nd gen, out of range
});

test("is3rdGenTacoma + gear defaults follow the owner rule", () => {
  assert.equal(is3rdGenTacoma({ vehicleType: "Tacoma", engine: "3.5", year: 2021 }), true);
  assert.equal(is3rdGenTacoma({ vehicleType: "Tacoma", engine: "2.7", year: 2021 }), false);
  assert.equal(defaultGear({ vehicleType: "Tacoma", engine: "3.5", year: 2021 }), "3.90");  // auto 3rd gen Tacoma
  assert.equal(defaultGear({ vehicleType: "Tundra", engine: "5.7", year: 2020 }), "4.30");  // everything else
  assert.equal(gearForTransmission({ vehicleType: "Tacoma", engine: "3.5", year: 2021 }, "Manual"), "4.30");
  assert.equal(gearForTransmission({ vehicleType: "Tacoma", engine: "3.5", year: 2021 }, "Auto"), "3.90");
});
