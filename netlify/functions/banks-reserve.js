// netlify/functions/banks-reserve.js
// Banks Power parts RESERVATION — reserve-mode checkout while dealer
// onboarding completes: the customer picks Banks parts for their vehicle in
// the app and reserves them for install-day / pickup. No online payment yet;
// the reservation lands in the normal lead pipeline (Priority table +
// follow-up SLAs) and payment is completed personally. When the Banks dealer
// price sheet arrives, checkout flips to Converge (Magnuson pattern) and this
// function retires.
// Prices/names resolve SERVER-SIDE from site/banks-catalog.json — client
// SKUs only, unknown SKUs are dropped, never guessed.
const { processLeadIngest } = require("./lib/leads.js");

const CATALOG = require("../../site/banks-catalog.json");

function resolveKit(skus) {
  const out = [];
  for (const sku of Array.isArray(skus) ? skus : []) {
    const p = CATALOG.products[String(sku || "").trim()];
    if (!p) continue; // unknown SKUs are dropped, never guessed
    out.push({ sku: p.sku, name: p.name, price: p.retail });
  }
  return out;
}

function kitMessage({ vehicle, fulfillment, kit, note }) {
  const lines = kit.map((k) => `- ${k.name} (${k.sku}) — $${k.price.toFixed(2)} retail`);
  const total = kit.reduce((s, k) => s + k.price, 0);
  return [
    `Banks Power parts reservation${vehicle ? ` — ${vehicle}` : ""}`,
    `Fulfillment: ${fulfillment === "delivery" ? "delivery" : "pickup / install day"}`,
    ...lines,
    `Retail total: $${total.toFixed(2)} (collect in person / personal invoice — no online payment)`,
    note ? `Customer note: ${note}` : "",
  ].filter(Boolean).join("\n");
}

async function reserve(body, deps = {}) {
  const { env = process.env, ingest = (b) => processLeadIngest(b, { env }) } = deps;
  const d = body || {};
  if (String(d.company || "").trim()) return { status: "ok", skipped: true }; // honeypot
  const name = String(d.name || "").trim();
  const email = String(d.email || "").trim();
  const phone = String(d.phone || "").trim();
  if (!name || (!email && !phone)) return { status: "error", error: "missing-contact" };
  const kit = resolveKit(d.kit);
  if (!kit.length) return { status: "error", error: "empty-kit" };
  const vehicle = String(d.vehicle || "").trim().slice(0, 120);
  const note = String(d.note || "").trim().slice(0, 500);
  const fulfillment = d.fulfillment === "delivery" ? "delivery" : "pickup";
  const out = await ingest({
    name, email, phone,
    channel: "web",
    source: "banks-reserve",
    goals: `Banks Power parts reservation (${fulfillment})${vehicle ? ` — ${vehicle}` : ""}`,
    message: kitMessage({ vehicle, fulfillment, kit, note }),
  });
  if (out.status === "error") return out;
  return { status: "ok", items: kit.length };
}

async function handler(event, ctx = {}) {
  if ((event.httpMethod || "GET").toUpperCase() !== "POST") return { statusCode: 405, body: "method not allowed" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: JSON.stringify({ status: "error", error: "bad-json" }) }; }
  const out = await reserve(body, ctx);
  const code = out.status !== "error" ? 200 : (out.error === "store-unavailable" ? 502 : 400);
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}

module.exports = { handler, reserve, resolveKit, kitMessage };
