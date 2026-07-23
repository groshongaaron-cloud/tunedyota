// netlify/functions/lib/meta-deliver.js
// Pushes installer turns (console inbox reply or SMS relay) back out to the
// customer's thread on their channel: Messenger/Instagram via the Graph API,
// sms: sessions via the Twilio Send API. No-op for web sessions. Delivery
// failures append a visible system note and Slack the owner — the reply itself
// stays in the transcript either way.
const { sendDm } = require("./meta-graph.js");
const { sendSms } = require("./twilio.js");
const { saveSession } = require("./chat-store.js");
const { notifyOwner } = require("./alert.js");

const RE = /^(fb|ig):([^:]+)/;
const SMS_RE = /^sms:(\+\d{11,15})/;

function isMetaSession(id) { return RE.test(String(id || "")); }

async function deliverInstallerTurn(sess, turn, deps = {}) {
  const { env = process.env, send = (a) => sendDm(a, { env }),
    sendText = (a) => sendSms(a, { env }),
    saveFn = (s) => saveSession(s, { env }),
    notify = (t) => notifyOwner({ webhookUrl: env.SLACK_WEBHOOK_URL, text: t }), log = console } = deps;

  const sms = SMS_RE.exec(String(sess && sess.id || ""));
  if (sms) {
    let out;
    try { out = await sendText({ to: sms[1], body: turn.text }); }
    catch (e) { out = { ok: false, error: e.message }; }
    if (!out || out.ok !== true) {
      try {
        sess.turns.push({ role: "system", text: "⚠ not delivered — SMS sending is pending carrier approval (A2P). The message is saved; re-send it once texting is live.", at: Date.now() });
        await saveFn(sess);
      } catch (e) { if (log.error) log.error("sms-deliver note", e.message); }
      try { notify(`⚠ SMS reply not delivered for ${sess.customerName || sess.id} (A2P pending or send error).`).catch(() => {}); } catch (e) {}
    }
    return out;
  }

  const m = RE.exec(String(sess && sess.id || ""));
  if (!m) return { skipped: true };
  const platform = m[1] === "fb" ? "facebook" : "instagram";
  let out;
  try { out = await send({ platform, recipientId: m[2], text: turn.text }); }
  catch (e) { out = { ok: false, error: e.message }; }
  if (out && out.windowClosed) {
    try {
      sess.turns.push({ role: "system", text: `⚠ ${platform} window closed — this reply was NOT delivered. Reach the customer at ${sess.phone || "their listed contact"}.`, at: Date.now() });
      await saveFn(sess);
    } catch (e) { if (log.error) log.error("meta-deliver note", e.message); }
    try { notify(`⚠ Meta reply window closed for ${sess.customerName || sess.id} — installer reply not delivered; fallback: ${sess.phone || "n/a"}`).catch(() => {}); } catch (e) {}
  } else if (out && out.ok === false && !out.skipped) {
    try { notify(`⚠ Meta reply send failed for ${sess.id}: ${out.error || "unknown"}`).catch(() => {}); } catch (e) {}
  }
  return out;
}

module.exports = { deliverInstallerTurn, isMetaSession };
