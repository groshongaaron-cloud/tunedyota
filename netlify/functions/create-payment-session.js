// netlify/functions/create-payment-session.js
// Elavon Payment Gateway (EPG) Lightbox: create an order + payment session for a
// Magnuson SKU. The amount ALWAYS comes from the server-side catalog
// (lib/magnuson-prices) — the browser sends only the SKU; a client-sent price is
// ignored by design. EPG uses Basic auth (merchant alias + secret key) with NO
// IP allowlist — the "whitelisting" is the originUrl on each payment session —
// so Netlify's dynamic egress IPs are fine (Elavon's recommendation 2026-08-03).
// NOT LIVE until the EPG env vars exist (returns 503 payments-not-configured).
// See docs/operations/online-payments-go-live.md.
const { priceForSku } = require("./lib/magnuson-prices.js");
const { withCors } = require("./lib/cors.js");

const API_URLS = {
  // Sandbox is documented; the prod base mirrors the prod lightbox host
  // (hpp.na.elavonpayments.com) — confirm with Elavon at go-live or override
  // with EPG_API_URL.
  prod: "https://api.na.elavonpayments.com",
  sandbox: "https://api.sandbox.elavonpayments.com",
};
const DEFAULT_ORIGIN = "https://tunedyota.com";

function isSandbox(env) { return String(env.EPG_SANDBOX || "").toLowerCase() === "true"; }

async function createSession({ sku } = {}, deps = {}) {
  const { env = process.env, fetchImpl = fetch, log = console, price = priceForSku } = deps;
  const alias = env.EPG_MERCHANT_ALIAS, secret = env.EPG_SECRET_KEY;
  if (!alias || !secret) return { status: "error", error: "payments-not-configured" };
  const item = price(sku);
  if (!item) return { status: "error", error: "unknown-sku" };
  const amount = item.retail.toFixed(2);

  const base = env.EPG_API_URL || (isSandbox(env) ? API_URLS.sandbox : API_URLS.prod);
  const headers = {
    "Content-Type": "application/json",
    "Accept-Version": "1",
    Authorization: "Basic " + Buffer.from(`${alias}:${secret}`).toString("base64"),
  };
  const post = async (path, body) => {
    const res = await fetchImpl(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) {
      // Keep EPG's structured error body (code/message) in the log — invaluable
      // for diagnosing a bad originUrl / creds at go-live instead of a bare status.
      const detail = typeof res.text === "function" ? await res.text().catch(() => "") : "";
      if (log.error) log.error("create-payment-session", path, res.status, String(detail).slice(0, 300));
      return null;
    }
    const data = await res.json();
    if (!data || !data.id) {
      if (log.error) log.error("create-payment-session", path, res.status, "no id in response");
      return null;
    }
    return data;
  };

  try {
    const order = await post("/orders", { total: { amount, currencyCode: "USD" } });
    if (!order) return { status: "error", error: "gateway-error" };
    const session = await post("/payment-sessions", {
      order: order.id,
      originUrl: env.EPG_ORIGIN_URL || DEFAULT_ORIGIN,
      hppType: "lightbox",
      // EPG defaults doCreateTransaction to false = tokenize-only: the modal
      // "succeeds" but no transaction exists. This MUST be a captured sale.
      doCreateTransaction: true,
      doCapture: true,
      customReference: String(sku).slice(0, 40),
      invoiceNumber: String(sku).slice(0, 25),
    });
    if (!session) return { status: "error", error: "gateway-error" };
    return { status: "ok", sessionId: session.id, orderId: order.id, sku: String(sku), name: item.name, amount, sandbox: isSandbox(env) };
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
  const out = await createSession({ sku: body.sku }, {});
  const statusCode = out.status === "ok" ? 200 : CODES[out.error] || 500;
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}

module.exports = { handler: withCors(handler), createSession, API_URLS };
