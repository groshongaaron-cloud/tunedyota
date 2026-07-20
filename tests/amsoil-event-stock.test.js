// tests/amsoil-event-stock.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");

async function mod() { return import("../scripts/amsoil-event-stock.mjs"); }

const TACOMA = { Name: "Ana Ruiz", Vehicle: "2016-2023 Toyota Tacoma 3.5L V6 · Better shifting", "Model Year": "2020", "Event Date": "2026-08-16", City: "Rochester", Status: "Confirmed" };
const TUNDRA = { Name: "Marcus Bell", Vehicle: "2010-2017 Toyota Tundra 5.7L V8", "Model Year": "2014", "Event Date": "2026-08-16", City: "Rochester", Status: "Confirmed" };
const MYSTERY = { Name: "Pat Doe", Vehicle: "1987 Yugo GV", "Event Date": "2026-08-16", City: "Rochester", Status: "Confirmed" };

test("kitForBooking: qt quantities are ceil(verified capacity); filter is 1 ea; transmission excluded", async () => {
  const { kitForBooking } = await mod();
  const kit = kitForBooking(TACOMA);
  assert.equal(kit.unresolved, undefined);
  const oil = kit.items.find((i) => i.system === "Engine Oil");
  assert.equal(oil.qty, 7); // 6.2 qt verified -> buy 7
  const filter = kit.items.find((i) => /filter/i.test(i.system));
  assert.deepEqual([filter.qty, filter.unit], [1, "ea"]);
  assert.ok(!kit.items.some((i) => i.system === "Transmission"), "transmission never stocked by qty");
});

test("buildStockList aggregates SKUs across trucks and isolates unresolved vehicles", async () => {
  const { buildStockList } = await mod();
  const events = buildStockList([TACOMA, TUNDRA, MYSTERY]);
  const key = Object.keys(events)[0];
  assert.match(key, /2026-08-16 — Rochester/);
  const ev = events[key];
  assert.equal(ev.trucks.length, 2);
  assert.deepEqual(ev.unresolved, ["Pat Doe — 1987 Yugo GV"]);
  // Tacoma (6.2->7) + Tundra 5.7 (7.9->8) share the oil-quart product family only
  // if the same SKU; assert totals are the SUM of the per-truck ceils per SKU.
  const totalQty = Object.values(ev.totals).reduce((s, t) => s + t.qty, 0);
  const perTruck = ev.trucks.flatMap((t) => t.items).reduce((s, i) => s + i.qty, 0);
  assert.equal(totalQty, perTruck);
});

test("renderStockList emits aggregate, per-truck, and SOP reminder", async () => {
  const { buildStockList, renderStockList } = await mod();
  const out = renderStockList(buildStockList([TACOMA]));
  assert.match(out, /STOCK TO BRING/);
  assert.match(out, /Ana Ruiz — Toyota Tacoma/);
  assert.match(out, /sop-install-day-amsoil-pitch/);
});
