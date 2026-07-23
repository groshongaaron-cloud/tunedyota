// netlify/functions/twilio-voice.js
// Inbound call webhook AND its own <Dial> action callback (branched on DialCallStatus).
// Initial leg: log the call as a lead; if the caller's ACTIVE lead is assigned to an
// installer, ring that installer's cell directly (?routed=1), else ring the default
// forward numbers. Action leg: answered+bridged -> note + hang up; routed miss or a
// screen-rejected instant pickup -> one retry on the default lines (?attempt=2);
// exhausted -> greeting + record voicemail (transcribed).
const { validateTwilioSignature, decodeBody, webhookUrl, parseInboundCall, parseForwardNumbers,
        dialTwiml, voicemailTwiml, hangupTwiml, GREETING, ingestLead, getDialedCallTo } = require("./lib/twilio.js");
const { installerKeyForPhone } = require("./lib/leads.js");
const { smsNumberFor } = require("./lib/routing.js");

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
  // The screen leg's From is our callerId, so the customer's number rides along
  // as ?caller= for the whisper. webhookUrl may already carry ?routed/?attempt.
  const screenUrl = (() => {
    const base = webhookUrl(event, env, "twilio-voice-screen");
    return base + (base.includes("?") ? "&" : "?") + "caller=" + encodeURIComponent(params.From || "");
  })();

  // Dial-action leg: Twilio re-POSTs the action URL with DialCallStatus once the dial ends.
  if (params.DialCallStatus) {
    // "completed" alone is NOT a real answer: a carrier voicemail that picks up
    // and fails the press-1 screen still reports completed, with DialBridged=false.
    const bridged = params.DialBridged !== "false";
    const attempt2 = /[?&]attempt=2\b/.test(event.rawUrl || "");
    const routed = /[?&]routed=1\b/.test(event.rawUrl || "");
    const unbridged = params.DialCallStatus === "completed" && !bridged;
    if (params.DialCallStatus === "completed" && bridged) {
      try { await ingest(parseInboundCall(params, "call answered by installer")); } catch (e) { console.error("twilio-voice ingest failed (answered)", e && e.message); /* best-effort */ }
      return xml(hangupTwiml());
    }
    // One retry on the default lines when (a) an instant pickup ate the ring and
    // failed screening (canceling everyone else's legs after ~2s), or (b) the
    // assigned installer of a routed call didn't take it.
    if (!attempt2 && (unbridged || routed)) {
      const numbers = parseForwardNumbers(env);
      let eater = "";
      if (unbridged) {
        const lookupTo = ctx.lookupTo || ((s) => getDialedCallTo(s, { env }));
        try { eater = await lookupTo(params.DialCallSid); } catch { /* best-effort */ }
      }
      const remaining = numbers.filter((n) => n !== eater);
      if (remaining.length) {
        const note = unbridged
          ? "instant pickup failed the press-1 screen (voicemail box?) — ringing remaining lines"
          : "assigned installer did not answer — ringing the default lines";
        try { await ingest(parseInboundCall(params, note)); } catch (e) { console.error("twilio-voice ingest failed (redial)", e && e.message); /* best-effort */ }
        const retryAction = url + (url.includes("?") ? "&" : "?") + "attempt=2";
        return xml(dialTwiml(remaining, { timeout: 20, action: retryAction, callerId: params.To || "",
          screenUrl }));
      }
    }
    return voicemail(); // no-answer / busy / failed / canceled / screen-rejected with nobody left
  }

  // Initial inbound leg: route to the assigned installer when the caller's ACTIVE
  // lead has one; fail-open to the default forward numbers on any lookup miss.
  const numbers = parseForwardNumbers(env);
  let routedKey = "";
  try { routedKey = await (ctx.lookupInstaller || ((p) => installerKeyForPhone(p, { env })))(params.From); } catch { /* fail-open */ }
  const assigned = routedKey ? smsNumberFor(routedKey, env) : "";
  const note = assigned ? `inbound call — routed to assigned installer ${routedKey}` : "inbound call";
  try { await ingest(parseInboundCall(params, note)); } catch (e) { console.error("twilio-voice ingest failed (inbound)", e && e.message); /* best-effort */ }
  if (!assigned && !numbers.length) return voicemail();
  const targets = assigned ? [assigned] : numbers;
  const action = assigned ? `${url}?routed=1` : url;
  return xml(dialTwiml(targets, { timeout: 20, action, callerId: params.To || "",
    screenUrl }));
}

module.exports = { handler };
