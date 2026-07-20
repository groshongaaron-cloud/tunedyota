// tests/create-payment-session.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createSession, handler, DEMO_TOKEN_URL, PROD_TOKEN_URL } = require("../netlify/functions/create-payment-session.js");
const { priceMap, priceForSku } = require("../netlify/functions/lib/magnuson-prices.js");

const ENV = { CONVERGE_MERCHANT_ID: "123456", CONVERGE_USER_ID: "apiuser", CONVERGE_PIN: "P".repeat(64) };
const PRICE = (sku) => (sku === "01-26-57-107-BL" ? { name: "Magnuson TVS2650 Magnum Supercharger System", retail: 8295, vehicle: "Toyota Tundra" } : null);

test("without Converge env -> payments-not-configured (page keeps reservation flow)", async () => {
  const out = await createSession({ sku: "01-26-57-107-BL" }, { env: {}, price: PRICE, fetchImpl: async () => { throw new Error("must not be called"); } });
  assert.deepEqual(out, { status: "error", error: "payments-not-configured" });
});

test("unknown SKU -> unknown-sku, no gateway call", async () => {
  let called = 0;
  const out = await createSession({ sku: "NOPE" }, { env: ENV, price: PRICE, fetchImpl: async () => { called++; } });
  assert.deepEqual(out, { status: "error", error: "unknown-sku" });
  assert.equal(called, 0);
});

test("mints a token: amount comes from the CATALOG, never the caller", async () => {
  let got;
  const out = await createSession({ sku: "01-26-57-107-BL", firstName: "Marcus", amount: "1.00", ssl_amount: "1.00" },
    { env: ENV, price: PRICE, fetchImpl: async (url, opts) => { got = { url, opts }; return { ok: true, text: async () => "TOKEN123" }; } });
  assert.equal(out.status, "ok");
  assert.equal(out.token, "TOKEN123");
  assert.equal(out.amount, "8295.00");
  const form = new URLSearchParams(got.opts.body);
  assert.equal(form.get("ssl_amount"), "8295.00");
  assert.equal(form.get("ssl_transaction_type"), "CCSALE");
  assert.equal(form.get("ssl_merchant_id"), "123456");
  assert.equal(form.get("ssl_invoice_number"), "01-26-57-107-BL");
  assert.equal(form.get("ssl_first_name"), "Marcus");
  assert.equal(got.url, PROD_TOKEN_URL);
});

test("CONVERGE_DEMO=true -> demo endpoint, demo:true in the response", async () => {
  let url;
  const out = await createSession({ sku: "01-26-57-107-BL" },
    { env: { ...ENV, CONVERGE_DEMO: "true" }, price: PRICE, fetchImpl: async (u) => { url = u; return { ok: true, text: async () => "T" }; } });
  assert.equal(url, DEMO_TOKEN_URL);
  assert.equal(out.demo, true);
});

test("gateway failure or HTML-ish response -> gateway-error", async () => {
  const html = await createSession({ sku: "01-26-57-107-BL" },
    { env: ENV, price: PRICE, log: { error: () => {} }, fetchImpl: async () => ({ ok: true, text: async () => "<html>error</html>" }) });
  assert.deepEqual(html, { status: "error", error: "gateway-error" });
  const down = await createSession({ sku: "01-26-57-107-BL" },
    { env: ENV, price: PRICE, log: { error: () => {} }, fetchImpl: async () => { throw new Error("net"); } });
  assert.deepEqual(down, { status: "error", error: "gateway-error" });
});

test("handler: POST only; JSON errors mapped to status codes", async () => {
  assert.equal((await handler({ httpMethod: "GET" })).statusCode, 405);
  assert.equal((await handler({ httpMethod: "POST", body: "{nope" })).statusCode, 400);
  // no env in process -> 503 not-configured through the real path
  const saved = {};
  for (const k of ["CONVERGE_MERCHANT_ID", "CONVERGE_USER_ID", "CONVERGE_PIN"]) { saved[k] = process.env[k]; delete process.env[k]; }
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
