// tests/amsoil-garage-render.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const G = require("../site/amsoil-garage-render.js");

const CATALOG = {
  products: {
    A: { sku: "A", retailPrice: 10, salePrice: null },
    B: { sku: "B", retailPrice: 20, salePrice: 15 }
  },
  vehicles: {
    Toyota: {
      Tundra: [
        { y: "2022+", e: "V6", verified: true, systems: [{ system: "Engine Oil", sku: "A" }], bundle: ["A", "B"] },
        { y: "2007-2021", e: "V8", verified: false, systems: [], bundle: ["A"] }
      ]
    }
  }
};

test("parseVehicleParams reads v=Make:Model and y=YYYY", () => {
  assert.deepEqual(G.parseVehicleParams("?v=Toyota:Tundra&y=2024"),
    { make: "Toyota", model: "Tundra", year: 2024, engine: null });
  assert.deepEqual(G.parseVehicleParams(""), { make: null, model: null, year: null, engine: null });
});

test("inRange handles ranges, open-ended, and null year", () => {
  assert.equal(G.inRange("2022+", 2024, 2026), true);
  assert.equal(G.inRange("2007-2021", 2024, 2026), false);
  assert.equal(G.inRange("2007-2021", null, 2026), true);
});

test("resolveVehicle returns the matching VERIFIED generation", () => {
  const r = G.resolveVehicle({ make: "toyota", model: "tundra", year: 2024 }, CATALOG, 2026);
  assert.equal(r.make, "Toyota");
  assert.equal(r.model, "Tundra");
  assert.equal(r.gen.y, "2022+");
});

test("resolveVehicle skips unverified generations", () => {
  const r = G.resolveVehicle({ make: "Toyota", model: "Tundra", year: 2015 }, CATALOG, 2026);
  assert.equal(r, null);
});

test("resolveVehicle includes unverified generations when opted in", () => {
  const r = G.resolveVehicle({ make: "Toyota", model: "Tundra", year: 2015 }, CATALOG, 2026, true);
  assert.ok(r, "should resolve the unverified generation");
  assert.equal(r.gen.y, "2007-2021");
  assert.equal(r.gen.verified, false);
});

test("resolveVehicle returns null for unknown make/model", () => {
  assert.equal(G.resolveVehicle({ make: "Ford", model: "F150", year: 2024 }, CATALOG, 2026), null);
});

test("bundleTotal sums sale price where present, else retail", () => {
  const gen = CATALOG.vehicles.Toyota.Tundra[0];
  assert.equal(G.bundleTotal(gen, CATALOG.products), 25); // A retail 10 + B sale 15
});

// --- Engine disambiguation (rows sharing a year range, e.g. 4Runner 05-09 V6 vs V8) ---

const SPLIT_CATALOG = {
  products: {},
  vehicles: {
    Toyota: {
      "4Runner": [
        { y: "2005-2009", e: "4.0L V6", verified: true, systems: [], bundle: [] },
        { y: "2005-2009", e: "4.7L V8", verified: true, systems: [], bundle: [] }
      ],
      Tacoma: [
        { y: "2016-2023", e: "3.5L V6", verified: true, systems: [], bundle: [] }
      ]
    }
  }
};

test("parseVehicleParams reads the e= engine param", () => {
  assert.deepEqual(G.parseVehicleParams("?v=Toyota:4Runner&y=2007&e=4.7L%20V8"),
    { make: "Toyota", model: "4Runner", year: 2007, engine: "4.7L V8" });
  assert.equal(G.parseVehicleParams("").engine, null);
});

test("resolveVehicle picks the row matching the engine param", () => {
  const r = G.resolveVehicle({ make: "Toyota", model: "4Runner", year: 2007, engine: "4.7" }, SPLIT_CATALOG, 2026);
  assert.equal(r.gen.e, "4.7L V8");
});

test("resolveVehicle without engine returns first match plus all candidates", () => {
  const r = G.resolveVehicle({ make: "Toyota", model: "4Runner", year: 2007 }, SPLIT_CATALOG, 2026);
  assert.equal(r.gen.e, "4.0L V6");
  assert.equal(r.matches.length, 2);
});

test("resolveVehicle matches list is singular when the year is unambiguous", () => {
  const r = G.resolveVehicle({ make: "Toyota", model: "Tacoma", year: 2020 }, SPLIT_CATALOG, 2026);
  assert.equal(r.matches.length, 1);
});

test("yearOptions qualifies duplicate year ranges with the engine", () => {
  const opts = G.yearOptions(SPLIT_CATALOG.vehicles.Toyota["4Runner"]);
  assert.deepEqual(opts, [
    { value: "2005-2009|4.0L V6", label: "2005-2009 · 4.0L V6" },
    { value: "2005-2009|4.7L V8", label: "2005-2009 · 4.7L V8" }
  ]);
  const single = G.yearOptions(SPLIT_CATALOG.vehicles.Toyota.Tacoma);
  assert.deepEqual(single, [{ value: "2016-2023", label: "2016-2023" }]);
});

test("genForOption resolves plain and engine-qualified option values", () => {
  const gens = SPLIT_CATALOG.vehicles.Toyota["4Runner"];
  assert.equal(G.genForOption(gens, "2005-2009|4.7L V8").e, "4.7L V8");
  assert.equal(G.genForOption(gens, "2005-2009").e, "4.0L V6");
  assert.equal(G.genForOption(gens, ""), null);
});

test("optionForGen round-trips with yearOptions values", () => {
  const gens = SPLIT_CATALOG.vehicles.Toyota["4Runner"];
  assert.equal(G.optionForGen(gens, gens[1]), "2005-2009|4.7L V8");
  const tac = SPLIT_CATALOG.vehicles.Toyota.Tacoma;
  assert.equal(G.optionForGen(tac, tac[0]), "2016-2023");
});
