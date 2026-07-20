// netlify/functions/amsoil-reserve.js
// AMSOIL kit RESERVATION — the compliant "checkout": the customer builds their
// fluid kit on tunedyota.com and reserves it for pickup / install-day / delivery.
// NO online payment happens here (AMSOIL G-4000 §7.6 reserves online sales to
// AMSOIL INC.; payment is completed in person via Elavon card-present or a
// personal 1:1 invoice — the "personal communications" channel §7.6 sanctions).
// The reservation lands in the normal lead pipeline (Priority table + follow-up
// SLAs), so the personal confirmation IS the existing owner workflow.
// Prices/names resolve SERVER-SIDE from amsoil-garage.json — client SKUs only.
const { processLeadIngest } = require("./lib/leads.js");

const GARAGE = require("../../site/amsoil-garage.json");

function resolveKit(skus) {
  const out = [];
  for (const sku of Array.isArray(skus) ? skus : []) {
    const p = GARAGE.products[String(sku || "").trim()];
    if (!p) continue; // unknown SKUs are dropped, never guessed
    const price = p.salePrice != null ? p.salePrice : p.retailPrice;
    out.push({ sku: p.sku, name: p.name, price });
  }
  return out;
}

function kitMessage({ vehicle, fulfillment, kit, note }) {
  const lines = kit.map((k) => `- ${k.name} (${k.sku}) — $${k.price.toFixed(2)} MSRP`);
  const total = kit.reduce((s, k) => s + k.price, 0);
  return [
    `AMSOIL kit reservation${vehicle ? ` — ${vehicle}` : ""}`,
    `Fulfillment: ${fulfillment === "delivery" ? "delivery" : "pickup / install day"}`,
    ...lines,
    `MSRP total: $${total.toFixed(2)} (collect in person / personal invoice — no online payment)`,
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
    source: "amsoil-reserve",
    goals: `AMSOIL kit reservation (${fulfillment})${vehicle ? ` — ${vehicle}` : ""}`,
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
