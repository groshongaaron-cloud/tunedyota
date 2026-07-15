// netlify/functions/twilio-sms.js
// Inbound SMS webhook: validate Twilio signature, ingest a tracked lead, auto-reply.
const { validateTwilioSignature, decodeBody, webhookUrl, parseInboundSms, smsReplyTwiml, ingestLead } = require("./lib/twilio.js");

const REPLY = "Thanks for texting Tuned Yota! We got your message and a team member will reach out shortly. " +
  "For the fastest help, reply with your vehicle + what you're after (OTT tune, supercharger, build, or a question).";

async function handler(event, ctx = {}) {
  const env = ctx.env || process.env;
  const verify = ctx.verify || validateTwilioSignature;
  const ingest = ctx.ingest || ((b) => ingestLead(b, { env }));
  const params = decodeBody(event);
  const url = webhookUrl(event, env, "twilio-sms");
  const sig = (event.headers && (event.headers["x-twilio-signature"] || event.headers["X-Twilio-Signature"])) || "";
  if (!verify(env.TWILIO_AUTH_TOKEN, url, params, sig)) return { statusCode: 403, body: "invalid signature" };
  try { await ingest(parseInboundSms(params)); } catch (e) { console.error("twilio-sms ingest failed", e && e.message); /* best-effort; never break the texter */ }
  return { statusCode: 200, headers: { "Content-Type": "text/xml; charset=utf-8" }, body: smsReplyTwiml(REPLY) };
}

module.exports = { handler, REPLY };
