// netlify/functions/lib/meta-deliver.js
// Pushes installer turns (console inbox reply or SMS relay) back out to the
// customer's Messenger/Instagram thread. No-op for web sessions. Window-lapse
// (customer silent > 24h) appends a visible system note with the fallback phone
// and Slacks the owner — the reply itself stays in the transcript either way.
const { sendDm } = require("./meta-graph.js");
const { saveSession } = require("./chat-store.js");
const { notifyOwner } = require("./alert.js");

const RE = /^(fb|ig):([^:]+)/;

function isMetaSession(id) { return RE.test(String(id || "")); }

async function deliverInstallerTurn(sess, turn, deps = {}) {
  const { env = process.env, send = (a) => sendDm(a, { env }),
    saveFn = (s) => saveSession(s, { env }),
    notify = (t) => notifyOwner({ webhookUrl: env.SLACK_WEBHOOK_URL, text: t }), log = console } = deps;
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
