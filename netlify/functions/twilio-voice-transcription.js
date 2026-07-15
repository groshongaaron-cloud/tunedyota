// netlify/functions/twilio-voice-transcription.js
// Async voicemail transcription callback: validate signature, fold the transcript +
// recording URL into the caller's lead (deduped by phone in the Core). Returns plain 200.
const { validateTwilioSignature, decodeBody, webhookUrl, parseTranscription, ingestLead } = require("./lib/twilio.js");

async function handler(event, ctx = {}) {
  const env = ctx.env || process.env;
  const verify = ctx.verify || validateTwilioSignature;
  const ingest = ctx.ingest || ((b) => ingestLead(b, { env }));
  const params = decodeBody(event);
  const url = webhookUrl(event, env, "twilio-voice-transcription");
  const sig = (event.headers && (event.headers["x-twilio-signature"] || event.headers["X-Twilio-Signature"])) || "";
  if (!verify(env.TWILIO_AUTH_TOKEN, url, params, sig)) return { statusCode: 403, body: "invalid signature" };
  try { await ingest(parseTranscription(params)); } catch (e) { /* best-effort */ }
  return { statusCode: 200, headers: { "Content-Type": "text/plain" }, body: "ok" };
}

module.exports = { handler };
