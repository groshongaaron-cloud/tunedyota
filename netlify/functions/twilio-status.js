// netlify/functions/twilio-status.js
// Delivery status callback for outbound SMS (wired via StatusCallback in
// lib/twilio.js sendSms). Failed/undelivered sends are logged and Slack-alerted
// so a carrier block after A2P go-live is visible instead of silent.
const { validateTwilioSignature, decodeBody, webhookUrl, formatPhone } = require("./lib/twilio.js");
const { notifyOwner } = require("./lib/alert.js");

// The two codes the runbook cares about, plus a readable default for the rest.
const CODE_MEANING = {
  "30034": "A2P 10DLC: sent from an unregistered/pending number — campaign not approved or number not in the Messaging Service",
  "30007": "carrier filtered the message (spam/content block)",
  "30003": "destination unreachable/off",
  "30005": "unknown destination number",
  "30006": "landline or unreachable carrier",
};
const BAD = new Set(["failed", "undelivered"]);

async function handler(event, ctx = {}) {
  const env = ctx.env || process.env;
  const verify = ctx.verify || validateTwilioSignature;
  const log = ctx.log || console;
  const alert = ctx.alert || ((text) => notifyOwner({ webhookUrl: env.SLACK_WEBHOOK_URL, text, log }));
  const params = decodeBody(event);
  const url = webhookUrl(event, env, "twilio-status");
  const sig = (event.headers && (event.headers["x-twilio-signature"] || event.headers["X-Twilio-Signature"])) || "";
  if (!verify(env.TWILIO_AUTH_TOKEN, url, params, sig)) return { statusCode: 403, body: "invalid signature" };

  const status = String(params.MessageStatus || "").toLowerCase();
  if (BAD.has(status)) {
    const code = String(params.ErrorCode || "");
    const meaning = CODE_MEANING[code] || "see twilio.com/docs/api/errors";
    const text = `⚠️ SMS ${status} to ${formatPhone(params.To) || "unknown"} — error ${code || "?"} (${meaning}). Sid ${params.MessageSid || "?"}`;
    if (log.error) log.error("twilio-status", text);
    try { await alert(text); } catch (e) { if (log.error) log.error("twilio-status alert failed", e && e.message); }
  }
  return { statusCode: 204, body: "" };
}

module.exports = { handler };
