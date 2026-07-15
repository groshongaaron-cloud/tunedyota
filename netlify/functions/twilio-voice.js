// netlify/functions/twilio-voice.js
// Inbound call webhook AND its own <Dial> action callback (branched on DialCallStatus).
// Initial leg: log the call as a lead, ring all installer cells at once. Action leg:
// answered -> note + hang up; unanswered -> greeting + record voicemail (transcribed).
const { validateTwilioSignature, decodeBody, webhookUrl, parseInboundCall, parseForwardNumbers,
        dialTwiml, voicemailTwiml, hangupTwiml, GREETING, ingestLead } = require("./lib/twilio.js");

async function handler(event, ctx = {}) {
  const env = ctx.env || process.env;
  const verify = ctx.verify || validateTwilioSignature;
  const ingest = ctx.ingest || ((b) => ingestLead(b, { env }));
  const params = decodeBody(event);
  const url = webhookUrl(event, env, "twilio-voice");
  const sig = (event.headers && (event.headers["x-twilio-signature"] || event.headers["X-Twilio-Signature"])) || "";
  if (!verify(env.TWILIO_AUTH_TOKEN, url, params, sig)) return { statusCode: 403, body: "invalid signature" };

  const xml = (body) => ({ statusCode: 200, headers: { "Content-Type": "text/xml; charset=utf-8" }, body });
  const voicemail = () => xml(voicemailTwiml({ greeting: GREETING, transcribeCallback: webhookUrl(event, env, "twilio-voice-transcription") }));

  // Dial-action leg is handled in Task 7. Initial inbound leg:
  try { await ingest(parseInboundCall(params, "inbound call")); } catch (e) { /* best-effort */ }
  const numbers = parseForwardNumbers(env);
  if (!numbers.length) return voicemail();
  return xml(dialTwiml(numbers, { timeout: 20, action: url, callerId: params.To || "" }));
}

module.exports = { handler };
