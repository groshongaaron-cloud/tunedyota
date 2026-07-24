const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseYearRange, priceVehicle, makes, models, catalog } = require("../netlify/functions/lib/vehicle-pricing.js");

const YEAR = 2026; // fixed "current year" so "2024+" style ranges are deterministic

test("parseYearRange handles ranges, open-ended, and single years", () => {
  assert.deepEqual(parseYearRange("2016-2023"), { lo: 2016, hi: 2023 });
  assert.deepEqual(parseYearRange("2024+", YEAR), { lo: 2024, hi: 2026 });
  assert.deepEqual(parseYearRange("2019"), { lo: 2019, hi: 2019 });
  assert.equal(parseYearRange("nope"), null);
});

test("catalog / makes / models expose the supported set", () => {
  assert.deepEqual(makes(), ["Toyota", "Lexus"]);
  assert.ok(models("toyota").includes("Tacoma"));
  assert.ok(catalog().Lexus.includes("GX"));
});

test("2021 Tacoma resolves both engine options; the 3.5L V6 has OTT/custom/supercharger + CARB note", () => {
  const r = priceVehicle({ make: "Toyota", model: "Tacoma", year: 2021 }, YEAR);
  assert.equal(r.supported, true);
  // that generation offers two engines (3.5L V6 and 2.7L I4)
  assert.equal(r.options.length, 2);
  const v6 = r.options.find((o) => o.engine === "3.5L V6");
  assert.ok(v6, "expected a 3.5L V6 option");
  assert.equal(v6.ottTuneFrom, 500);
  assert.equal(v6.customCalibration, 550);
  assert.deepEqual(v6.forcedInduction, { type: "Supercharger Calibration", from: 600 });
  assert.match(v6.carbNote, /CARB EO/);
});

test("case-insensitive make/model; 2024 Tacoma picks the turbo 2.4L config", () => {
  const r = priceVehicle({ make: "toyota", model: "tacoma", year: 2024 }, YEAR);
  assert.equal(r.options.length, 1);
  assert.equal(r.options[0].engine, "2.4L-T I4");
  assert.equal(r.options[0].ottTuneFrom, 650);
  assert.deepEqual(r.options[0].forcedInduction, { type: "Turbo Performance Calibration", from: 950 });
});

test("no year returns every config for the model", () => {
  const r = priceVehicle({ make: "Toyota", model: "Tacoma" }, YEAR);
  assert.equal(r.supported, true);
  assert.equal(r.options.length, 5);
});

test("a year with no listed calibration returns supported:false + available ranges", () => {
  const r = priceVehicle({ make: "Toyota", model: "Tacoma", year: 1999 }, YEAR);
  assert.equal(r.supported, false);
  assert.ok(Array.isArray(r.availableRanges) && r.availableRanges.length);
});

test("unknown make → not supported + makes list; unknown model → models list", () => {
  const badMake = priceVehicle({ make: "Ford", model: "F150" }, YEAR);
  assert.equal(badMake.supported, false);
  assert.deepEqual(badMake.makes, ["Toyota", "Lexus"]);
  const badModel = priceVehicle({ make: "Toyota", model: "Supra" }, YEAR);
  assert.equal(badModel.supported, false);
  assert.ok(badModel.models.includes("Tacoma"));
});

test("no make returns the supported catalog", () => {
  const r = priceVehicle({}, YEAR);
  assert.equal(r.supported, null);
  assert.ok(r.catalog.Toyota.includes("4Runner"));
  assert.ok(r.catalog.Lexus.includes("LX570"));
});

test("Lexus GX 2020 resolves the 2019+ 4.6L V8 config (no forced induction)", () => {
  const r = priceVehicle({ make: "Lexus", model: "GX", year: 2020 }, YEAR);
  assert.equal(r.options.length, 1);
  assert.equal(r.options[0].years, "2019+");
  assert.equal(r.options[0].engine, "4.6L V8");
  assert.equal(r.options[0].ottTuneFrom, 600);
  assert.equal(r.options[0].customCalibration, 750);
  assert.equal(r.options[0].forcedInduction, undefined);
});

test("a 2024 Land Cruiser (LC-250 launch year) prices at the new-gen $650, not the old gen", () => {
  const r = priceVehicle({ make: "Toyota", model: "Land Cruiser", year: 2024 }, YEAR);
  assert.equal(r.supported, true);
  assert.equal(r.options.length, 1);
  assert.equal(r.options[0].ottTuneFrom, 650);
});

test("new-gen trio all start at $650: 2024+ Tacoma, 2025+ 4Runner, 2024+ Land Cruiser", () => {
  [["Tacoma", 2024], ["4Runner", 2025], ["Land Cruiser", 2024]].forEach(([model, year]) => {
    const r = priceVehicle({ make: "Toyota", model, year }, YEAR);
    assert.equal(r.supported, true, `${year} ${model} must be supported`);
    assert.ok(r.options.some((o) => o.ottTuneFrom === 650), `${year} ${model} must offer $650 base`);
    assert.ok(!r.options.some((o) => o.ottTuneFrom < 650), `${year} ${model} must not fall back to an older-gen price`);
  });
});
