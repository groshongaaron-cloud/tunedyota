// tests/amsoil-garage-data.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const CATALOG = require("../site/amsoil-garage.json");
const { makes, models } = require("../netlify/functions/lib/vehicle-pricing.js");

function eachGeneration(cb) {
  for (const mk of Object.keys(CATALOG.vehicles))
    for (const md of Object.keys(CATALOG.vehicles[mk]))
      CATALOG.vehicles[mk][md].forEach((gen) => cb(mk, md, gen));
}

test("every system + bundle SKU exists in products", () => {
  eachGeneration((mk, md, gen) => {
    for (const s of gen.systems)
      assert.ok(CATALOG.products[s.sku], `${mk} ${md} ${gen.y}: unknown system SKU ${s.sku}`);
    for (const sku of gen.bundle)
      assert.ok(CATALOG.products[sku], `${mk} ${md} ${gen.y}: unknown bundle SKU ${sku}`);
  });
});

test("every product has an amsoil /p/ path and a positive numeric retail price", () => {
  for (const p of Object.values(CATALOG.products)) {
    assert.match(p.productPath, /^\/p\//, `${p.sku} needs an amsoil /p/ path`);
    assert.equal(typeof p.retailPrice, "number", `${p.sku} retailPrice must be a number`);
    assert.ok(p.retailPrice > 0, `${p.sku} retailPrice must be > 0`);
  }
});

test("garage vehicles are a subset of the supported Toyota/Lexus lineup", () => {
  const supportedMakes = makes();
  for (const mk of Object.keys(CATALOG.vehicles)) {
    assert.ok(supportedMakes.includes(mk), `${mk} is not a supported make`);
    const supportedModels = models(mk);
    for (const md of Object.keys(CATALOG.vehicles[mk]))
      assert.ok(supportedModels.includes(md), `${mk} ${md} is not in the supported lineup`);
  }
});

test("each generation has a year range, engine, verified flag, systems, and bundle", () => {
  eachGeneration((mk, md, gen) => {
    assert.ok(gen.y && gen.e, `${mk} ${md}: missing y/e`);
    assert.equal(typeof gen.verified, "boolean", `${mk} ${md} ${gen.y}: verified must be boolean`);
    assert.ok(Array.isArray(gen.systems) && gen.systems.length, `${mk} ${md} ${gen.y}: needs systems`);
    assert.ok(Array.isArray(gen.bundle) && gen.bundle.length, `${mk} ${md} ${gen.y}: needs a bundle`);
    for (const s of gen.systems) {
      assert.equal(typeof s.capacity, "number", `${mk} ${md} ${gen.y} ${s.system}: capacity must be a number`);
      assert.ok(s.capacity > 0, `${mk} ${md} ${gen.y} ${s.system}: capacity must be > 0`);
      assert.equal(typeof s.unit, "string", `${mk} ${md} ${gen.y} ${s.system}: unit must be a string`);
      assert.ok(s.unit.length > 0, `${mk} ${md} ${gen.y} ${s.system}: unit must not be empty`);
    }
  });
});

test("no bundle lists a duplicate SKU", () => {
  eachGeneration((mk, md, gen) => {
    assert.equal(new Set(gen.bundle).size, gen.bundle.length, `${mk} ${md} ${gen.y}: bundle has duplicate SKUs`);
  });
});

test("every product carries an official AMSOIL stockNo", () => {
  const data = require("../site/amsoil-garage.json");
  for (const [sku, p] of Object.entries(data.products)) {
    assert.ok(typeof p.stockNo === "string" && p.stockNo.trim().length > 0,
      `product ${sku} is missing stockNo`);
  }
});
