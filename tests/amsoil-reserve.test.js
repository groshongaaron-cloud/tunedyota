// tests/amsoil-reserve.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { reserve, resolveKit, kitMessage, handler } = require("../netlify/functions/amsoil-reserve.js");

const GARAGE = require("../site/amsoil-garage.json");
const REAL_SKU = Object.keys(GARAGE.products)[0];
const REAL = GARAGE.products[REAL_SKU];

test("resolveKit maps SKUs to server-side names + prices, drops unknowns", () => {
  const kit = resolveKit([REAL_SKU, "NOT-A-SKU"]);
  assert.equal(kit.length, 1);
  assert.equal(kit[0].sku, REAL.sku);
  assert.equal(kit[0].price, REAL.salePrice != null ? REAL.salePrice : REAL.retailPrice);
});

test("reserve: missing contact / empty kit rejected", async () => {
  assert.deepEqual(await reserve({ kit: [REAL_SKU] }), { status: "error", error: "missing-contact" });
  assert.deepEqual(await reserve({ name: "Ana", email: "a@b.co", kit: ["NOPE"] }), { status: "error", error: "empty-kit" });
});

test("honeypot silently accepts without ingesting", async () => {
  let ingested = 0;
  const out = await reserve({ company: "spam co", name: "x", email: "x@y.z", kit: [REAL_SKU] },
    { ingest: async () => { ingested++; } });
  assert.equal(out.status, "ok");
  assert.equal(ingested, 0);
});

test("reserve composes the lead with server prices, fulfillment, and NO payment language", async () => {
  let lead;
  const out = await reserve(
    { name: "Ana Ruiz", email: "ana@example.com", vehicle: "2014 Toyota Tundra 5.7L V8",
      fulfillment: "delivery", kit: [REAL_SKU], note: "after 5pm", price: "0.01" },
    { ingest: async (b) => { lead = b; return { status: "created" }; } });
  assert.equal(out.status, "ok");
  assert.equal(lead.source, "amsoil-reserve");
  assert.equal(lead.channel, "web");
  assert.match(lead.goals, /delivery/);
  assert.match(lead.message, new RegExp(REAL.sku.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(lead.message, /MSRP total: \$\d/);
  assert.match(lead.message, /no online payment/);
  assert.match(lead.message, /after 5pm/);
  assert.doesNotMatch(lead.message, /0\.01/, "client-sent price must be ignored");
});

test("kitMessage totals server prices", () => {
  const msg = kitMessage({ vehicle: "V", fulfillment: "pickup", note: "",
    kit: [{ sku: "A", name: "Thing", price: 10 }, { sku: "B", name: "Other", price: 5.5 }] });
  assert.match(msg, /MSRP total: \$15\.50/);
  assert.match(msg, /pickup \/ install day/);
});

test("handler: POST only + bad json", async () => {
  assert.equal((await handler({ httpMethod: "GET" })).statusCode, 405);
  assert.equal((await handler({ httpMethod: "POST", body: "{" })).statusCode, 400);
});
