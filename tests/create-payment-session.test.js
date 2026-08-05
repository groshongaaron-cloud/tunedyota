// tests/create-payment-session.test.js — EPG (Elavon Payment Gateway) session mint
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createSession, handler, API_URLS } = require("../netlify/functions/create-payment-session.js");
const { priceMap, priceForSku } = require("../netlify/functions/lib/magnuson-prices.js");

const ENV = { EPG_MERCHANT_ALIAS: "tunedyota", EPG_SECRET_KEY: "S".repeat(40) };
const PRICE = (sku) => (sku === "01-26-57-107-BL" ? { name: "Magnuson TVS2650 Magnum Supercharger System", retail: 8295, vehicle: "Toyota Tundra" } : null);
const BASIC = "Basic " + Buffer.from(`${ENV.EPG_MERCHANT_ALIAS}:${ENV.EPG_SECRET_KEY}`).toString("base64");

// Two-call happy-path gateway: POST /orders -> order id, POST /payment-sessions -> session id.
function gatewayMock(calls) {
  return async (url, opts) => {
    calls.push({ url, opts });
    if (url.endsWith("/orders")) return { ok: true, json: async () => ({ id: "ord_1" }) };
    if (url.endsWith("/payment-sessions")) return { ok: true, json: async () => ({ id: "sess_1" }) };
    throw new Error(`unexpected url ${url}`);
  };
}

test("without EPG env -> payments-not-configured (page keeps reservation flow)", async () => {
  const out = await createSession({ sku: "01-26-57-107-BL" }, { env: {}, price: PRICE, fetchImpl: async () => { throw new Error("must not be called"); } });
  assert.deepEqual(out, { status: "error", error: "payments-not-configured" });
});

test("unknown SKU -> unknown-sku, no gateway call", async () => {
  let called = 0;
  const out = await createSession({ sku: "NOPE" }, { env: ENV, price: PRICE, fetchImpl: async () => { called++; } });
  assert.deepEqual(out, { status: "error", error: "unknown-sku" });
  assert.equal(called, 0);
});

test("mints a session: order amount comes from the CATALOG, never the caller", async () => {
  const calls = [];
  const out = await createSession({ sku: "01-26-57-107-BL", amount: "1.00" }, { env: ENV, price: PRICE, fetchImpl: gatewayMock(calls) });
  assert.equal(out.status, "ok");
  assert.equal(out.sessionId, "sess_1");
  assert.equal(out.orderId, "ord_1");
  assert.equal(out.amount, "8295.00");
  assert.equal(out.sandbox, false);

  assert.equal(calls.length, 2);
  const [orderCall, sessionCall] = calls;
  assert.equal(orderCall.url, `${API_URLS.prod}/orders`);
  assert.equal(orderCall.opts.headers.Authorization, BASIC);
  const orderBody = JSON.parse(orderCall.opts.body);
  assert.equal(orderBody.total.amount, "8295.00");
  assert.equal(orderBody.total.currencyCode, "USD");

  assert.equal(sessionCall.url, `${API_URLS.prod}/payment-sessions`);
  assert.equal(sessionCall.opts.headers.Authorization, BASIC);
  const sessionBody = JSON.parse(sessionCall.opts.body);
  assert.equal(sessionBody.order, "ord_1");
  assert.equal(sessionBody.hppType, "lightbox");
  assert.equal(sessionBody.originUrl, "https://tunedyota.com");
  // EPG defaults doCreateTransaction to FALSE (tokenize-only — the lightbox
  // returns a hosted card and no money moves; found the hard way 2026-08-04)
  assert.equal(sessionBody.doCreateTransaction, true);
  assert.equal(sessionBody.doCapture, true);
  assert.equal(sessionBody.customReference, "01-26-57-107-BL");
  assert.equal(sessionBody.invoiceNumber, "01-26-57-107-BL");
});

test("EPG_SANDBOX=true -> sandbox base URL, sandbox:true in the response", async () => {
  const calls = [];
  const out = await createSession({ sku: "01-26-57-107-BL" }, { env: { ...ENV, EPG_SANDBOX: "true" }, price: PRICE, fetchImpl: gatewayMock(calls) });
  assert.equal(out.sandbox, true);
  assert.equal(calls[0].url, `${API_URLS.sandbox}/orders`);
});

test("EPG_API_URL and EPG_ORIGIN_URL override the defaults", async () => {
  const calls = [];
  await createSession({ sku: "01-26-57-107-BL" },
    { env: { ...ENV, EPG_API_URL: "https://api.example.test", EPG_ORIGIN_URL: "https://store.tunedyota.com" }, price: PRICE, fetchImpl: gatewayMock(calls) });
  assert.equal(calls[0].url, "https://api.example.test/orders");
  assert.equal(JSON.parse(calls[1].opts.body).originUrl, "https://store.tunedyota.com");
});

test("gateway failure on either call -> gateway-error", async () => {
  const orderFail = await createSession({ sku: "01-26-57-107-BL" },
    { env: ENV, price: PRICE, log: { error: () => {} }, fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}) }) });
  assert.deepEqual(orderFail, { status: "error", error: "gateway-error" });

  const sessionFail = await createSession({ sku: "01-26-57-107-BL" },
    { env: ENV, price: PRICE, log: { error: () => {} }, fetchImpl: async (url) => (
      url.endsWith("/orders") ? { ok: true, json: async () => ({ id: "ord_1" }) } : { ok: false, status: 400, json: async () => ({}) }) });
  assert.deepEqual(sessionFail, { status: "error", error: "gateway-error" });

  const down = await createSession({ sku: "01-26-57-107-BL" },
    { env: ENV, price: PRICE, log: { error: () => {} }, fetchImpl: async () => { throw new Error("net"); } });
  assert.deepEqual(down, { status: "error", error: "gateway-error" });
});

test("missing id in a gateway response -> gateway-error", async () => {
  const out = await createSession({ sku: "01-26-57-107-BL" },
    { env: ENV, price: PRICE, log: { error: () => {} }, fetchImpl: async () => ({ ok: true, json: async () => ({}) }) });
  assert.deepEqual(out, { status: "error", error: "gateway-error" });
});

test("handler: POST only; JSON errors mapped to status codes", async () => {
  assert.equal((await handler({ httpMethod: "GET" })).statusCode, 405);
  assert.equal((await handler({ httpMethod: "POST", body: "{nope" })).statusCode, 400);
  // no env in process -> 503 not-configured through the real path
  const saved = {};
  for (const k of ["EPG_MERCHANT_ALIAS", "EPG_SECRET_KEY"]) { saved[k] = process.env[k]; delete process.env[k]; }
  try {
    const res = await handler({ httpMethod: "POST", body: JSON.stringify({ sku: "01-26-57-107-BL" }) });
    assert.equal(res.statusCode, 503);
    assert.equal(JSON.parse(res.body).error, "payments-not-configured");
  } finally {
    for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;
  }
});

// ---- price parity: the server map IS the site catalog (no second table to drift) ----
test("PARITY: every catalog kit resolves server-side at the exact site price", () => {
  global.window = {};
  require("../site/magnuson-catalog.js");
  const apps = global.window.MAGNUSON_CATALOG.applications;
  delete global.window;
  const map = priceMap();
  let kits = 0;
  for (const app of apps) for (const kit of app.kits || []) {
    if (!kit.sku || typeof kit.retail !== "number") continue;
    kits++;
    assert.ok(map[kit.sku], `server map missing ${kit.sku}`);
    assert.equal(map[kit.sku].retail, kit.retail, `price drift on ${kit.sku}`);
  }
  assert.ok(kits > 10, "catalog should have a real number of kits");
  assert.equal(priceForSku("01-26-57-107-BL").retail, 8295);
});
