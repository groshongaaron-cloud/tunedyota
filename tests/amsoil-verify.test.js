"use strict";
// Unit tests for the AMSOIL platform verify helper (scripts/amsoil/lib/verify.mjs).
// Pure functions only — every test runs on a deep CLONE of the catalog, so nothing
// touches site/amsoil-garage.json on disk.
const test = require("node:test");
const assert = require("node:assert");
const CAT = require("../site/amsoil-garage.json");

const clone = () => structuredClone(CAT);
async function V() { return import("../scripts/amsoil/lib/verify.mjs"); }

test("platforms() rolls up every model with verified counts", async () => {
  const { platforms } = await V();
  const rows = platforms(clone());
  const models = Object.values(CAT.vehicles).reduce((n, m) => n + Object.keys(m).length, 0);
  assert.equal(rows.length, models);
  assert.ok(rows.every((r) => r.total === r.years.length));
});

test("findModel resolves 'Make Model' and a bare unique model; throws on unknown", async () => {
  const { findModel } = await V();
  const cat = clone();
  assert.equal(findModel(cat, "Toyota Tundra").model, "Tundra");
  assert.equal(findModel(cat, "tundra").model, "Tundra");        // case-insensitive, bare
  assert.throws(() => findModel(cat, "Ford Raptor"), /No platform matches/);
});

test("review() resolves SKUs to product names", async () => {
  const { review } = await V();
  const r = review(clone(), "Toyota Tundra");
  assert.equal(r.name, "Toyota Tundra");
  const oil = r.generations[0].systems.find((s) => s.system === "Engine Oil");
  assert.match(oil.product, /Signature Series/);
});

test("setVerified flips all generations, is idempotent, and can unverify", async () => {
  const { setVerified, findModel } = await V();
  const cat = clone();
  const r1 = setVerified(cat, "Toyota Tundra", { value: true });
  const gens = findModel(cat, "Toyota Tundra").gens;
  assert.equal(r1.changed.length, gens.length);
  assert.ok(gens.every((g) => g.verified === true));
  const r2 = setVerified(cat, "Toyota Tundra", { value: true });   // idempotent
  assert.equal(r2.changed.length, 0);
  setVerified(cat, "Toyota Tundra", { value: false });
  assert.ok(gens.every((g) => g.verified === false));
});

test("setVerified with a year targets exactly one generation", async () => {
  const { setVerified, findModel } = await V();
  const cat = clone();
  const someYear = findModel(cat, "Toyota Tundra").gens[0].y;
  const r = setVerified(cat, "Toyota Tundra", { year: someYear, value: true });
  assert.deepEqual(r.changed, [someYear]);
  const verifiedCount = findModel(cat, "Toyota Tundra").gens.filter((g) => g.verified).length;
  assert.equal(verifiedCount, 1);
  assert.throws(() => setVerified(cat, "Toyota Tundra", { year: "1999", value: true }), /No .* generation with year/);
});

test("setCapacity edits one system and rejects bad input", async () => {
  const { setCapacity, findModel } = await V();
  const cat = clone();
  const g0 = findModel(cat, "Toyota Tundra").gens[0];
  const r = setCapacity(cat, "Toyota Tundra", g0.y, "Engine Oil", 7.5);
  assert.equal(r.after, 7.5);
  assert.equal(findModel(cat, "Toyota Tundra").gens[0].systems.find((s) => s.system === "Engine Oil").capacity, 7.5);
  assert.throws(() => setCapacity(cat, "Toyota Tundra", g0.y, "Engine Oil", -1), /positive number/);
  assert.throws(() => setCapacity(cat, "Toyota Tundra", g0.y, "Flux Capacitor", 5), /No system/);
});
