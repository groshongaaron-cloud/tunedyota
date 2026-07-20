const { test } = require("node:test");
const assert = require("node:assert/strict");
const S = require("../site/app-shell.js");

test("parseRoute covers all views, defaults to garage", () => {
  assert.deepEqual(S.parseRoute(""), { view: "garage", arg: null });
  assert.deepEqual(S.parseRoute("#garage"), { view: "garage", arg: null });
  assert.deepEqual(S.parseRoute("#vehicle/2"), { view: "vehicle", arg: 2 });
  assert.deepEqual(S.parseRoute("#vehicle/x"), { view: "vehicle", arg: 0 });
  assert.deepEqual(S.parseRoute("#shop"), { view: "shop", arg: null });
  assert.deepEqual(S.parseRoute("#shop/magnuson"), { view: "shop", arg: "magnuson" });
  assert.deepEqual(S.parseRoute("#book"), { view: "book", arg: null });
  assert.deepEqual(S.parseRoute("#chat"), { view: "chat", arg: null });
  assert.deepEqual(S.parseRoute("#nonsense"), { view: "garage", arg: null });
});

test("tabFor maps vehicle detail to the garage tab", () => {
  assert.equal(S.tabFor("vehicle"), "garage");
  assert.equal(S.tabFor("shop"), "shop");
});

test("routeForLink: universal-link paths -> shell hash", () => {
  assert.equal(S.routeForLink("/app"), "#garage");
  assert.equal(S.routeForLink("/account"), "#garage");
  assert.equal(S.routeForLink("/magnuson-supercharger-pricing"), "#shop/magnuson");
  assert.equal(S.routeForLink("/supercharger"), "#shop/magnuson");
  assert.equal(S.routeForLink("/amsoil-garage"), "#shop/amsoil");
  assert.equal(S.routeForLink("/book"), "#book");
  assert.equal(S.routeForLink("/book/lakeville-2026-08-02"), "#book");
  assert.equal(S.routeForLink("/faq.html"), null);
});

test("garage store: load/save/add/dedup/remove via injected storage", () => {
  const mem = {}; const storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; } };
  assert.deepEqual(S.loadGarage(storage), []);
  let g = S.addVehicle([], { make: "Toyota", model: "Tundra", year: "2015" });
  g = S.addVehicle(g, { make: "toyota", model: "TUNDRA", year: "2015" }); // dupe, case-insensitive
  assert.equal(g.length, 1);
  S.saveGarage(storage, g);
  assert.deepEqual(S.loadGarage(storage), g);
  assert.deepEqual(S.removeVehicle(g, 0), []);
});

test("loadGarage survives corrupt JSON", () => {
  const storage = { getItem: () => "{not json", setItem: () => {} };
  assert.deepEqual(S.loadGarage(storage), []);
});

test("addVehicle rejects incomplete entries and caps at 20", () => {
  assert.deepEqual(S.addVehicle([], { make: "Toyota" }), []);
  let g = [];
  for (let i = 0; i < 25; i++) g = S.addVehicle(g, { make: "M" + i, model: "X", year: "2020" });
  assert.equal(g.length, 20);
});
