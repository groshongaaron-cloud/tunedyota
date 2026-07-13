const { test } = require("node:test");
const assert = require("node:assert/strict");
const { resolveFluids } = require("../netlify/functions/lib/amsoil-fluids.js");

test("matches a Tacoma by engine + year and resolves products", () => {
  const r = resolveFluids("2024 Toyota Tacoma 2.4L-T I4", "2024");
  assert.ok(r, "should resolve");
  assert.equal(r.make, "Toyota");
  assert.equal(r.model, "Tacoma");
  const oil = r.systems.find((s) => s.system === "Engine Oil");
  assert.match(oil.product, /Signature Series 0W-20/);
  assert.equal(oil.stockNo, "ASMQT");
  assert.equal(oil.capacity, 4.8);
  assert.equal(oil.tunedInterval, "7,500 mi");
  assert.match(r.garageUrl, /amsoil-garage\?make=Toyota&model=Tacoma&year=2024/);
});

test("picks the year-appropriate platform row", () => {
  const r = resolveFluids("2019 Toyota Tacoma 3.5L V6", "2019");
  assert.ok(r);
  assert.equal(r.engine, "3.5L V6");
});

test("returns null for an unsupported vehicle", () => {
  assert.equal(resolveFluids("2020 Ford F-150 3.5L V6", "2020"), null);
});

test("prefers the longer model name (Land Cruiser over a stray match)", () => {
  const r = resolveFluids("2021 Toyota Land Cruiser 5.7L V8", "2021");
  assert.ok(r);
  assert.equal(r.model, "Land Cruiser");
});
