// netlify/functions/meta-dm.js
// Meta DM feeder webhook (spec 2026-07-20-meta-dm-feeder-design.md): Messenger
// ("page") + Instagram ("instagram") messages -> the existing chat stack.
// GET = subscription handshake. POST = HMAC-verified events; ALWAYS 200 after a
// valid signature (Meta disables webhooks that error persistently) — failures
// are logged + Slack-notified instead.
const { verifySignature, sendDm, getProfile } = require("./lib/meta-graph.js");
const { secretEquals } = require("./lib/secrets.js");
const { notifyOwner } = require("./lib/alert.js");
const { processChat } = require("./chat.js");
const { loadActiveByPrefix, saveSession } = require("./lib/chat-store.js");

const PREFIX = { facebook: "fb:", instagram: "ig:" };

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

// Compact per-request visibility: what kinds of messaging items the payload
// held ("message:2,read:1"), so a webhook that arrives but yields zero events
// is diagnosable from the function log alone (echo? read receipt? delivery?).
function eventKinds(payload) {
  const counts = {};
  for (const entry of (payload && payload.entry) || []) {
    for (const ev of entry.messaging || []) {
      const kind = ev.message ? (ev.message.is_echo ? "echo" : "message") : Object.keys(ev).find((k) => !["sender", "recipient", "timestamp"].includes(k)) || "unknown";
      counts[kind] = (counts[kind] || 0) + 1;
    }
  }
  return Object.entries(counts).map(([k, n]) => `${k}:${n}`).join(",") || "none";
}

async function handler(event, deps = {}) {
  const env = process.env;
  const log = deps.log || console.log;
  if (event.httpMethod === "GET") {
    const q = event.queryStringParameters || {};
    const tokenOk = !!env.META_VERIFY_TOKEN && secretEquals(String(q["hub.verify_token"] || ""), env.META_VERIFY_TOKEN);
    log(`meta-dm GET handshake ${tokenOk ? "ok" : "FAIL"}`);
    return tokenOk ? { statusCode: 200, body: String(q["hub.challenge"] || "") } : { statusCode: 403, body: "forbidden" };
  }
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "method not allowed" };
  const headers = event.headers || {};
  const sig = headers["x-hub-signature-256"] || headers["X-Hub-Signature-256"] || "";
  if (!verifySignature(event.body || "", sig, env.META_APP_SECRET)) {
    log("meta-dm POST sig=FAIL");
    return { statusCode: 403, body: "bad signature" };
  }

  const { processDm: processImpl = processDm, notify = (text) => notifyOwner({ webhookUrl: env.SLACK_WEBHOOK_URL, text }) } = deps;
  let payload = {};
  try { payload = JSON.parse(event.body || "{}"); } catch (e) { return { statusCode: 200, body: "ok" }; }

  // Carry-over from Task 3 review: wrap normalizeEvents so a throw from it can't
  // escape and break the always-200 guarantee.
  let events = [];
  try { events = normalizeEvents(payload); } catch (e) { console.error("meta-dm normalize", e.message); }
  log(`meta-dm POST sig=ok object=${(payload && payload.object) || "?"} events=${events.length} kinds=${eventKinds(payload)}`);
  for (const evt of events) {
    try { await processImpl(evt, {}); }
    catch (e) {
      console.error("meta-dm process", e.message);
      try { notify(`⚠ Meta DM processing failed (${evt.platform} ${evt.senderId}): ${e.message}`).catch(() => {}); } catch (e2) {}
    }
  }
  return { statusCode: 200, body: "ok" };
}

// Bridge one normalized DM event into the chat engine and deliver the reply.
async function processDm(evt, deps = {}) {
  const env = deps.env || process.env;
  const findActive = deps.findActive || ((p) => loadActiveByPrefix(p, { env }));
  const send = deps.send || ((args) => sendDm(args, { env }));
  const notify = deps.notify || ((text) => notifyOwner({ webhookUrl: env.SLACK_WEBHOOK_URL, text }));
  const profile = deps.profile || ((id) => getProfile(id, { env }));
  const now = deps.now || Date.now;

  // The mid-stamping chat default is defined here, inside processDm, so it closes
  // over `evt`. The save wrapper stamps the most-recent user turn with evt.mid so
  // that a duplicate webhook delivery of the same mid is detectable via
  // loadActiveByPrefix -> turns.some(t => t.mid === evt.mid).
  const chat = deps.chat || ((body) => processChat(body, {
    save: (s) => {
      for (let i = s.turns.length - 1; i >= 0; i--) {
        if (s.turns[i].role === "user" && !s.turns[i].mid) { s.turns[i].mid = evt.mid; break; }
      }
      return saveSession(s, { env });
    },
  }));

  const base = PREFIX[evt.platform] + evt.senderId;
  const active = await findActive(base);

  // Dedupe: if any existing turn already carries this mid, skip entirely.
  if (active && (active.turns || []).some((t) => t.mid === evt.mid)) return { skipped: "dup" };

  const isNew = !active;
  let sessionId = active ? active.id : base;
  let out = await chat({ session: sessionId, message: evt.text, page: evt.platform });

  // Expired session: re-mint with a timestamp suffix and retry once.
  if (out.body && out.body.expired) {
    sessionId = base + ":" + now();
    out = await chat({ session: sessionId, message: evt.text, page: evt.platform });
  }

  const reply = out.body && out.body.reply;
  if (reply) {
    let sendOut;
    try {
      sendOut = await send({ platform: evt.platform, recipientId: evt.senderId, text: reply });
    } catch (e) {
      notify(`⚠ Meta DM reply send threw (${evt.platform} ${evt.senderId}): ${e.message}`).catch(() => {});
    }
    if (sendOut && !sendOut.ok && !sendOut.skipped) {
      notify(`⚠ Meta DM reply send failed (${evt.platform} ${evt.senderId}): ${sendOut.error || "unknown"}`).catch(() => {});
    }
  }

  // Notify owner only on the first message of a new conversation.
  if (isNew) {
    let name = null;
    try { name = await profile(evt.senderId); } catch (e) {}
    try { await notify(`💬 New ${evt.platform} DM${name ? " from " + name : ""}: ${evt.text.slice(0, 120)}`); } catch (e) {}
  }

  return { sessionId };
}

module.exports = { handler, normalizeEvents, processDm };
