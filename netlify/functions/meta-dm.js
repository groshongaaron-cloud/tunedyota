// netlify/functions/meta-dm.js
// Meta DM feeder webhook (spec 2026-07-20-meta-dm-feeder-design.md): Messenger
// ("page") + Instagram ("instagram") messages -> the existing chat stack.
// GET = subscription handshake. POST = HMAC-verified events; ALWAYS 200 after a
// valid signature (Meta disables webhooks that error persistently) — failures
// are logged + Slack-notified instead.
const { verifySignature, sendDm, getProfile } = require("./lib/meta-graph.js");
const { secretEquals } = require("./lib/secrets.js");
const { notifyOwner } = require("./lib/alert.js");

function normalizeEvents(payload) {
  const platform = payload && payload.object === "instagram" ? "instagram" : payload && payload.object === "page" ? "facebook" : null;
  if (!platform) return [];
  const out = [];
  for (const entry of payload.entry || []) {
    for (const ev of entry.messaging || []) {
      const m = ev.message;
      if (!m || m.is_echo || ev.read || ev.delivery) continue;
      const text = (m.text && String(m.text).trim()) || (Array.isArray(m.attachments) && m.attachments.length ? "[attachment]" : "");
      if (!text || !ev.sender || !ev.sender.id || !m.mid) continue;
      out.push({ platform, senderId: String(ev.sender.id), mid: String(m.mid), text });
    }
  }
  return out;
}

async function handler(event, deps = {}) {
  const env = process.env;
  if (event.httpMethod === "GET") {
    const q = event.queryStringParameters || {};
    const tokenOk = !!env.META_VERIFY_TOKEN && secretEquals(String(q["hub.verify_token"] || ""), env.META_VERIFY_TOKEN);
    return tokenOk ? { statusCode: 200, body: String(q["hub.challenge"] || "") } : { statusCode: 403, body: "forbidden" };
  }
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "method not allowed" };
  const headers = event.headers || {};
  const sig = headers["x-hub-signature-256"] || headers["X-Hub-Signature-256"] || "";
  if (!verifySignature(event.body || "", sig, env.META_APP_SECRET)) return { statusCode: 403, body: "bad signature" };

  const { processDm: processImpl = processDm, notify = (text) => notifyOwner({ webhookUrl: env.SLACK_WEBHOOK_URL, text }) } = deps;
  let payload = {};
  try { payload = JSON.parse(event.body || "{}"); } catch (e) { return { statusCode: 200, body: "ok" }; }
  for (const evt of normalizeEvents(payload)) {
    try { await processImpl(evt, {}); }
    catch (e) {
      console.error("meta-dm process", e.message);
      try { notify(`⚠ Meta DM processing failed (${evt.platform} ${evt.senderId}): ${e.message}`).catch(() => {}); } catch (e2) {}
    }
  }
  return { statusCode: 200, body: "ok" };
}

// processDm lands in Task 4; stub keeps Task 3 shippable.
async function processDm(evt, deps) { throw new Error("not implemented"); }

module.exports = { handler, normalizeEvents, processDm };
