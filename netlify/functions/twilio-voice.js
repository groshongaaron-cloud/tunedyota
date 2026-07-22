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

  // Dial-action leg: Twilio re-POSTs the action URL with DialCallStatus once the dial ends.
  if (params.DialCallStatus) {
    if (params.DialCallStatus === "completed") {
      try { await ingest(parseInboundCall(params, "call answered by installer")); } catch (e) { console.error("twilio-voice ingest failed (answered)", e && e.message); /* best-effort */ }
      return xml(hangupTwiml());
    }
    return voicemail(); // no-answer / busy / failed / canceled
  }

  // Initial inbound leg:
  try { await ingest(parseInboundCall(params, "inbound call")); } catch (e) { console.error("twilio-voice ingest failed (inbound)", e && e.message); /* best-effort */ }
  const numbers = parseForwardNumbers(env);
  if (!numbers.length) return voicemail();
  return xml(dialTwiml(numbers, { timeout: 20, action: url, callerId: params.To || "",
    screenUrl: webhookUrl(event, env, "twilio-voice-screen") }));
}

module.exports = { handler };
