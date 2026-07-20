// tests/product-lines.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const lines = require("../site/product-lines.js");
const { loadCatalog, priceForSku } = require("../netlify/functions/lib/magnuson-prices.js");
const GARAGE = require(path.join(__dirname, "..", "site", "amsoil-garage.json"));

const MAG = loadCatalog();
const DATA = { magnuson: MAG, amsoil: GARAGE };
const TUNDRA = { make: "Toyota", model: "Tundra", year: "2015" };

test("ctasFor: compliance by construction", () => {
  assert.deepEqual(lines.ctasFor("converge"), ["buy"]);
  assert.deepEqual(lines.ctasFor("reserve"), ["reserve", "referral"]);
  assert.deepEqual(lines.ctasFor("referral"), ["referral"]);
});

test("amsoil line can never render a buy CTA", () => {
  const am = lines.LINES.find((l) => l.id === "amsoil");
  assert.equal(am.checkout, "reserve");
  assert.ok(!lines.ctasFor(am.checkout).includes("buy"));
});

test("magnuson fitment: 2015 Tundra gets kits, prices match server lookup", () => {
  const out = lines.linesFor(TUNDRA, DATA);
  const mag = out.find((l) => l.id === "magnuson");
  assert.ok(mag.items.length >= 1, "expected at least one kit for a 2015 Tundra");
  for (const it of mag.items) {
    const server = priceForSku(it.sku);
    assert.ok(server, `sku ${it.sku} missing from server price map`);
    assert.equal(it.price, server.retail, `price drift for ${it.sku}`);
  }
});

test("amsoil fitment: 2015 Tundra bundle resolves to priced items", () => {
  const out = lines.linesFor(TUNDRA, DATA);
  const am = out.find((l) => l.id === "amsoil");
  assert.ok(am.items.length >= 2, "expected a fluid bundle");
  for (const it of am.items) assert.equal(typeof it.price, "number");
});

test("unknown vehicle -> empty items, lines still listed", () => {
  const out = lines.linesFor({ make: "Honda", model: "Civic", year: "2020" }, DATA);
  assert.equal(out.length, lines.LINES.length);
  for (const l of out) assert.deepEqual(l.items, []);
});

test("no vehicle -> empty items (shop 'view all' handles catalog itself)", () => {
  const out = lines.linesFor(null, DATA);
  for (const l of out) assert.deepEqual(l.items, []);
});

test("garage year-option values like '2024|2.4L-T I4' resolve", () => {
  const out = lines.linesFor({ make: "Toyota", model: "Tacoma", year: "2024|2.4L-T I4" }, DATA);
  const am = out.find((l) => l.id === "amsoil");
  assert.ok(am.items.length >= 1);
});
