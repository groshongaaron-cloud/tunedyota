// netlify/functions/twilio-call-bridge.js
// TwiML for the installer leg of click-to-call (created by twilio-call-out with
// ?to=<client E.164> in the URL — Twilio signs the full URL, and webhookUrl
// preserves the query, so the signature also covers the target number).
// First request (no Digits): press-1 gate, so an installer voicemail can never
// cause a stray call to the client. Digits=1: dial the client with the business
// caller ID. Anything else: hang up.
const { validateTwilioSignature, decodeBody, webhookUrl, escapeXml, hangupTwiml } = require("./lib/twilio.js");

const XML = '<?xml version="1.0" encoding="UTF-8"?>';
const VOICE = "Polly.Matthew-Neural";

async function handler(event, ctx = {}) {
  const env = ctx.env || process.env;
  const verify = ctx.verify || validateTwilioSignature;
  const params = decodeBody(event);
  const url = webhookUrl(event, env, "twilio-call-bridge");
  const sig = (event.headers && (event.headers["x-twilio-signature"] || event.headers["X-Twilio-Signature"])) || "";
  if (!verify(env.TWILIO_AUTH_TOKEN, url, params, sig)) return { statusCode: 403, body: "invalid signature" };

  const xml = (body) => ({ statusCode: 200, headers: { "Content-Type": "text/xml; charset=utf-8" }, body });
  const to = (String((event.rawUrl || "").split("?")[1] || "").match(/(?:^|&)to=([^&]*)/) || [])[1];
  const client = decodeURIComponent(to || "");
  if (!/^\+1\d{10}$/.test(client)) return xml(hangupTwiml());

  if (params.Digits !== undefined) {
    if (params.Digits !== "1") return xml(hangupTwiml());
    return xml(`${XML}<Response><Say voice="${VOICE}">Connecting.</Say>` +
      `<Dial answerOnBridge="true" callerId="${escapeXml(env.TWILIO_FROM_NUMBER || "")}">` +
      `<Number>${escapeXml(client)}</Number></Dial></Response>`);
  }
  return xml(`${XML}<Response><Gather action="${escapeXml(url)}" method="POST" numDigits="1" timeout="8">` +
    `<Say voice="${VOICE}">Tuned Yota click to call. Press 1 to connect to your client.</Say>` +
    `</Gather><Hangup/></Response>`);
}

module.exports = { handler };
