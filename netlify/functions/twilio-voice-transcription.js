// netlify/functions/twilio-voice-transcription.js
// Async voicemail transcription callback: validate signature, fold the transcript +
// recording URL into the caller's lead (deduped by phone in the Core). Returns plain 200.
const { validateTwilioSignature, decodeBody, webhookUrl, parseTranscription, ingestLead, formatPhone } = require("./lib/twilio.js");
const { notifyOwner } = require("./lib/alert.js");

async function handler(event, ctx = {}) {
  const env = ctx.env || process.env;
  const verify = ctx.verify || validateTwilioSignature;
  const ingest = ctx.ingest || ((b) => ingestLead(b, { env }));
  const notify = ctx.notify || notifyOwner;
  const params = decodeBody(event);
  const url = webhookUrl(event, env, "twilio-voice-transcription");
  const sig = (event.headers && (event.headers["x-twilio-signature"] || event.headers["X-Twilio-Signature"])) || "";
  if (!verify(env.TWILIO_AUTH_TOKEN, url, params, sig)) return { statusCode: 403, body: "invalid signature" };
  try { await ingest(parseTranscription(params)); } catch (e) { console.error("twilio-transcription ingest failed", e && e.message); /* best-effort */ }
  try {
    const text = `📞 New voicemail from ${formatPhone(params.From || "")}: ` +
      `"${String(params.TranscriptionText || "").trim() || "(no transcription)"}"` +
      (params.RecordingUrl ? ` — recording: ${params.RecordingUrl}` : "");
    await notify({ webhookUrl: env.SLACK_WEBHOOK_URL, text });
  } catch (e) { console.error("twilio-transcription slack failed", e && e.message); /* best-effort */ }
  return { statusCode: 200, headers: { "Content-Type": "text/plain" }, body: "ok" };
}

module.exports = { handler };
