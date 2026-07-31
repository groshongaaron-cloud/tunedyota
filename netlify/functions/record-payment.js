// netlify/functions/record-payment.js
// Post-approval recording for Converge Lightbox checkout. The browser reports
// the approval payload here after PayWithConverge's onApproval fires; we alert
// the owner on Slack (always — money moved) and drop the buyer into the normal
// lead pipeline so install scheduling follows. Converge itself is the system of
// record for the money — this endpoint is operational awareness, so the alert
// says "verify in Converge" and an unauthenticated fake report can only create
// a lead + a Slack line, never a refund or fulfillment.
const { notifyOwner } = require("./lib/alert.js");
const { processLeadIngest } = require("./lib/leads.js");
const { priceForSku } = require("./lib/magnuson-prices.js");

const s = (v, n) => String(v == null ? "" : v).trim().slice(0, n);

function alertText({ sku, item, a, mismatch }) {
  const amount = s(a.ssl_amount, 20) || "?";
  const head = `💳 Online payment approved — $${amount} — ${item ? item.name : `UNKNOWN SKU ${sku || "(none)"}`}`;
  return [
    mismatch ? `⚠️ AMOUNT MISMATCH: paid $${amount}, catalog says $${item.retail.toFixed(2)} — investigate before fulfilling.` : "",
    head,
    item && item.vehicle ? `Vehicle: ${item.vehicle}` : "",
    `Txn ${s(a.ssl_txn_id, 60) || "?"} · approval ${s(a.ssl_approval_code, 20) || "?"} · card ${s(a.ssl_card_number, 30) || "?"}`,
    [s(a.ssl_first_name, 50), s(a.ssl_last_name, 50)].filter(Boolean).join(" "),
    "Reported by the browser callback — verify in Converge before fulfillment.",
  ].filter(Boolean).join("\n");
}

async function recordPayment(body, deps = {}) {
  const { env = process.env,
          notify = (text) => notifyOwner({ webhookUrl: env.SLACK_WEBHOOK_URL, text }),
          ingest = (b) => processLeadIngest(b, { env }),
          price = priceForSku, log = console } = deps;
  const d = body || {};
  const a = (d.approval && typeof d.approval === "object") ? d.approval : {};
  const sku = s(d.sku, 40);
  if (!sku && !s(a.ssl_txn_id, 60)) return { status: "error", error: "empty" };

  const item = sku ? price(sku) : null;
  const paid = parseFloat(a.ssl_amount);
  const mismatch = !!item && isFinite(paid) && paid.toFixed(2) !== item.retail.toFixed(2);
  await notify(alertText({ sku, item, a, mismatch }));

  // Buyer into the lead pipeline: explicit page contact wins, else whatever the
  // approval payload carries. Missing/failed is tolerated — the alert fired.
  const c = (d.contact && typeof d.contact === "object") ? d.contact : {};
  const name = s(c.name, 100) || [s(a.ssl_first_name, 50), s(a.ssl_last_name, 50)].filter(Boolean).join(" ");
  const phone = s(c.phone, 40) || s(a.ssl_phone, 40);
  const email = s(c.email, 100) || s(a.ssl_email, 100);
  let lead = "skipped";
  if (name && (phone || email)) {
    try {
      const out = await ingest({
        name, phone, email, channel: "web", source: "magnuson-purchase",
        goals: `Magnuson purchase — schedule install${item && item.vehicle ? ` (${item.vehicle})` : ""}`,
        message: `PAID online $${s(a.ssl_amount, 20)} — ${item ? item.name : sku} — txn ${s(a.ssl_txn_id, 60)}`,
      });
      lead = out && out.status !== "error" ? "recorded" : "error";
    } catch (e) {
      if (log.error) log.error("record-payment lead ingest:", e.message);
      lead = "error";
    }
  }
  return { status: "ok", lead, mismatch };
}

async function handler(event) {
  if ((event.httpMethod || "GET").toUpperCase() !== "POST") return { statusCode: 405, body: "method not allowed" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: JSON.stringify({ status: "error", error: "bad-json" }) }; }
  const out = await recordPayment(body, {});
  return { statusCode: out.status === "ok" ? 200 : 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}

module.exports = { handler, recordPayment };
