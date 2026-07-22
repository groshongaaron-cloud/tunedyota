// netlify/functions/twilio-voice.js
// Inbound call webhook AND its own <Dial> action callback (branched on DialCallStatus).
// Initial leg: log the call as a lead, ring all installer cells at once. Action leg:
// answered -> note + hang up; unanswered -> greeting + record voicemail (transcribed).
const { validateTwilioSignature, decodeBody, webhookUrl, parseInboundCall, parseForwardNumbers,
        dialTwiml, voicemailTwiml, hangupTwiml, GREETING, ingestLead, getDialedCallTo } = require("./lib/twilio.js");

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
    // "completed" alone is NOT a real answer: a carrier voicemail that picks up
    // and fails the press-1 screen still reports completed, with DialBridged=false.
    const bridged = params.DialBridged !== "false";
    if (params.DialCallStatus === "completed" && bridged) {
      try { await ingest(parseInboundCall(params, "call answered by installer")); } catch (e) { console.error("twilio-voice ingest failed (answered)", e && e.message); /* best-effort */ }
      return xml(hangupTwiml());
    }
    if (params.DialCallStatus === "completed" && !bridged && !/[?&]attempt=2\b/.test(event.rawUrl || "")) {
      // An instant pickup ate the simultaneous ring (canceling everyone else's
      // legs after ~2s) and failed screening. Give the OTHER lines a full ring.
      const numbers = parseForwardNumbers(env);
      const lookupTo = ctx.lookupTo || ((s) => getDialedCallTo(s, { env }));
      let eater = "";
      try { eater = await lookupTo(params.DialCallSid); } catch { /* best-effort */ }
      const remaining = numbers.filter((n) => n !== eater);
      if (remaining.length) {
        try { await ingest(parseInboundCall(params, "instant pickup failed the press-1 screen (voicemail box?) — ringing remaining lines")); } catch (e) { console.error("twilio-voice ingest failed (redial)", e && e.message); /* best-effort */ }
        const retryAction = url + (url.includes("?") ? "&" : "?") + "attempt=2";
        return xml(dialTwiml(remaining, { timeout: 20, action: retryAction, callerId: params.To || "",
          screenUrl: webhookUrl(event, env, "twilio-voice-screen") }));
      }
    }
    return voicemail(); // no-answer / busy / failed / canceled / screen-rejected with nobody left
  }

  // Initial inbound leg:
  try { await ingest(parseInboundCall(params, "inbound call")); } catch (e) { console.error("twilio-voice ingest failed (inbound)", e && e.message); /* best-effort */ }
  const numbers = parseForwardNumbers(env);
  if (!numbers.length) return voicemail();
  return xml(dialTwiml(numbers, { timeout: 20, action: url, callerId: params.To || "",
    screenUrl: webhookUrl(event, env, "twilio-voice-screen") }));
}

module.exports = { handler };
