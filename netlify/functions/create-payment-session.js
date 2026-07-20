// netlify/functions/create-payment-session.js
// Elavon Converge Lightbox: mint a hosted-payments session token for a Magnuson
// SKU. The amount ALWAYS comes from the server-side catalog (lib/magnuson-prices)
// — the browser sends only the SKU; a client-sent price is ignored by design.
// NOT LIVE until the Converge env vars exist (returns 503 payments-not-configured).
// See docs/operations/online-payments-go-live.md.
const { priceForSku } = require("./lib/magnuson-prices.js");

const PROD_TOKEN_URL = "https://api.convergepay.com/hosted-payments/transaction_token";
const DEMO_TOKEN_URL = "https://api.demo.convergepay.com/hosted-payments/transaction_token";

function isDemo(env) { return String(env.CONVERGE_DEMO || "").toLowerCase() === "true"; }

async function createSession({ sku, firstName, lastName } = {}, deps = {}) {
  const { env = process.env, fetchImpl = fetch, log = console, price = priceForSku } = deps;
  const merchant = env.CONVERGE_MERCHANT_ID, user = env.CONVERGE_USER_ID, pin = env.CONVERGE_PIN;
  if (!merchant || !user || !pin) return { status: "error", error: "payments-not-configured" };
  const item = price(sku);
  if (!item) return { status: "error", error: "unknown-sku" };
  const amount = item.retail.toFixed(2);
  const form = new URLSearchParams({
    ssl_merchant_id: merchant,
    ssl_user_id: user,
    ssl_pin: pin,
    ssl_transaction_type: "CCSALE",
    ssl_amount: amount,
    ssl_invoice_number: String(sku).slice(0, 25),
  });
  if (env.CONVERGE_VENDOR_ID) form.set("ssl_vendor_id", env.CONVERGE_VENDOR_ID);
  if (firstName) form.set("ssl_first_name", String(firstName).slice(0, 50));
  if (lastName) form.set("ssl_last_name", String(lastName).slice(0, 50));
  try {
    const res = await fetchImpl(isDemo(env) ? DEMO_TOKEN_URL : PROD_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const token = (await res.text()).trim();
    // Converge returns the bare token string; anything HTML-ish or empty is a failure.
    if (!res.ok || !token || /[<>\s]/.test(token)) {
      if (log.error) log.error("create-payment-session token", res.status, token.slice(0, 120));
      return { status: "error", error: "gateway-error" };
    }
    return { status: "ok", token, sku: String(sku), name: item.name, amount, demo: isDemo(env) };
  } catch (e) {
    if (log.error) log.error("create-payment-session", e.message);
    return { status: "error", error: "gateway-error" };
  }
}

const CODES = { "payments-not-configured": 503, "unknown-sku": 404, "gateway-error": 502 };

async function handler(event) {
  if ((event.httpMethod || "GET").toUpperCase() !== "POST") return { statusCode: 405, body: "method not allowed" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: JSON.stringify({ status: "error", error: "bad-json" }) }; }
  const out = await createSession({ sku: body.sku, firstName: body.firstName, lastName: body.lastName }, {});
  const statusCode = out.status === "ok" ? 200 : CODES[out.error] || 500;
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}

module.exports = { handler, createSession, PROD_TOKEN_URL, DEMO_TOKEN_URL };
