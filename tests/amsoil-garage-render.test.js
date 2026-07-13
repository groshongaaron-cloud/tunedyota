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
    { make: "Toyota", model: "Tundra", year: 2024 });
  assert.deepEqual(G.parseVehicleParams(""), { make: null, model: null, year: null });
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
