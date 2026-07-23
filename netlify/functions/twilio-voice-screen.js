// netlify/functions/twilio-voice-screen.js
// Whisper/screen leg for forwarded calls (the url attr on each <Number> in
// twilio-voice's <Dial>). First POST (no Digits): play "press 1 to accept".
// Gather action POST (Digits present): 1 -> empty <Response/> bridges the
// call; anything else -> hang up so the leg counts as unanswered and the
// caller falls through to the business voicemail, not a personal mailbox.
const { validateTwilioSignature, decodeBody, webhookUrl, screenTwiml, acceptTwiml, hangupTwiml } = require("./lib/twilio.js");

async function handler(event, ctx = {}) {
  const env = ctx.env || process.env;
  const verify = ctx.verify || validateTwilioSignature;
  const params = decodeBody(event);
  const url = webhookUrl(event, env, "twilio-voice-screen");
  const sig = (event.headers && (event.headers["x-twilio-signature"] || event.headers["X-Twilio-Signature"])) || "";
  if (!verify(env.TWILIO_AUTH_TOKEN, url, params, sig)) return { statusCode: 403, body: "invalid signature" };

  const xml = (body) => ({ statusCode: 200, headers: { "Content-Type": "text/xml; charset=utf-8" }, body });
  if (params.Digits !== undefined) {
    return xml(params.Digits === "1" ? acceptTwiml() : hangupTwiml());
  }
  // The original caller's number rides in as ?caller= (this leg's From is the
  // business callerId, not the customer). webhookUrl keeps the query, so the
  // Gather action round-trips it and signatures stay valid.
  let caller = "";
  try { caller = new URL(event.rawUrl || "").searchParams.get("caller") || ""; } catch { /* no query */ }
  return xml(screenTwiml({ action: url, caller }));
}

module.exports = { handler };
