// netlify/functions/record-payment.js
// Post-approval recording for EPG Lightbox checkout. The browser reports the
// approval payload here after the lightbox's transactionCreated fires; we alert
// the owner on Slack (always — money moved) and drop the buyer into the normal
// lead pipeline so install scheduling follows. EPG itself is the system of
// record for the money — this endpoint is operational awareness, so the alert
// says "verify in the EPG portal" and an unauthenticated fake report can only
// create a lead + a Slack line, never a refund or fulfillment.
const { notifyOwner } = require("./lib/alert.js");
const { processLeadIngest } = require("./lib/leads.js");
const { priceForSku } = require("./lib/magnuson-prices.js");
const { withCors } = require("./lib/cors.js");

const s = (v, n) => String(v == null ? "" : v).trim().slice(0, n);

function alertText({ sku, item, txn, txnId, sessionId, amount, mismatch, authorized }) {
  const card = (txn.card && typeof txn.card === "object") ? txn.card : {};
  const head = `${authorized ? "💳 Online payment approved" : "⛔ Payment reported NOT authorized (browser callback — do NOT fulfill)"} — $${amount || "?"} — ${item ? item.name : `UNKNOWN SKU ${sku || "(none)"}`}`;
  const cardLine = [s(card.brand, 20), card.last4 ? `···${s(card.last4, 4)}` : ""].filter(Boolean).join(" ");
  return [
    mismatch ? `⚠️ AMOUNT MISMATCH: paid $${amount}, catalog says $${item.retail.toFixed(2)} — investigate before fulfilling.` : "",
    head,
    item && item.vehicle ? `Vehicle: ${item.vehicle}` : "",
    `Txn ${txnId || "?"} · auth ${s(txn.authorizationCode, 20) || "?"}${cardLine ? ` · card ${cardLine}` : ""} · session ${sessionId || "?"}`,
    s(card.holderName, 100),
    "Reported by the browser callback — verify in the EPG portal before fulfillment.",
  ].filter(Boolean).join("\n");
}

async function recordPayment(body, deps = {}) {
  const { env = process.env,
          notify = (text) => notifyOwner({ webhookUrl: env.SLACK_WEBHOOK_URL, text }),
          ingest = (b) => processLeadIngest(b, { env }),
          price = priceForSku, log = console } = deps;
  const d = body || {};
  const a = (d.approval && typeof d.approval === "object") ? d.approval : {};
  const txn = (a.transaction && typeof a.transaction === "object") ? a.transaction : {};
  const sku = s(d.sku, 40);
  const txnId = s(txn.id, 60);
  const sessionId = s(a.sessionId, 60);
  if (!sku && !txnId) return { status: "error", error: "empty" };

  const item = sku ? price(sku) : null;
  const amount = s(txn.total && txn.total.amount, 20);
  const paid = parseFloat(amount);
  const mismatch = !!item && isFinite(paid) && paid.toFixed(2) !== item.retail.toFixed(2);
  // The client only reports approvals, so treat as authorized UNLESS the payload
  // explicitly says otherwise — that only happens on a fabricated/edge report,
  // which must not read as "approved" or mint a paid lead.
  const authorized = !(a.authorized === false || txn.isAuthorized === false);
  await notify(alertText({ sku, item, txn, txnId, sessionId, amount, mismatch, authorized }));

  // Buyer into the lead pipeline: explicit page contact wins, else the
  // cardholder name + shopper email the EPG transaction carries. Missing/failed
  // is tolerated — the alert fired. Skipped entirely on a non-authorized report.
  const c = (d.contact && typeof d.contact === "object") ? d.contact : {};
  const card = (txn.card && typeof txn.card === "object") ? txn.card : {};
  const name = s(c.name, 100) || s(card.holderName, 100);
  const phone = s(c.phone, 40);
  const email = s(c.email, 100) || s(txn.shopperEmailAddress, 100);
  let lead = "skipped";
  if (authorized && name && (phone || email)) {
    try {
      const out = await ingest({
        name, phone, email, channel: "web", source: "magnuson-purchase",
        goals: `Magnuson purchase — schedule install${item && item.vehicle ? ` (${item.vehicle})` : ""}`,
        message: `PAID online $${amount} — ${item ? item.name : sku} — txn ${txnId}`,
      });
      lead = out && out.status !== "error" ? "recorded" : "error";
    } catch (e) {
      if (log.error) log.error("record-payment lead ingest:", e.message);
      lead = "error";
    }
  }
  return { status: "ok", lead, mismatch, authorized };
}

async function handler(event) {
  if ((event.httpMethod || "GET").toUpperCase() !== "POST") return { statusCode: 405, body: "method not allowed" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: JSON.stringify({ status: "error", error: "bad-json" }) }; }
  const out = await recordPayment(body, {});
  return { statusCode: out.status === "ok" ? 200 : 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}

module.exports = { handler: withCors(handler), recordPayment };
