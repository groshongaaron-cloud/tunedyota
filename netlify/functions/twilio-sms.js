// netlify/functions/twilio-sms.js
// Inbound SMS webhook: validate Twilio signature, then either (a) relay an
// installer's reply into their active escalated chat session — no lead, no
// auto-reply — or (b) the original behavior: ingest a tracked lead + auto-reply.
const { validateTwilioSignature, decodeBody, webhookUrl, parseInboundSms, smsReplyTwiml, ingestLead } = require("./lib/twilio.js");
const { INSTALLERS } = require("./lib/routing.js");
const { loadEscalatedForInstaller, saveSession } = require("./lib/chat-store.js");

const REPLY = "Thanks for texting Tuned Yota! We got your message and a team member will reach out shortly. " +
  "For the fastest help, reply with your vehicle + what you're after (OTT tune, supercharger, build, or a question).";
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

const last10 = (p) => String(p || "").replace(/\D/g, "").slice(-10);

function installerForNumber(from) {
  const d = last10(from);
  return Object.values(INSTALLERS).find((i) => d && last10(i.phone) === d) || null;
}

// If `from` is an installer with an active escalated session, append their text
// as an installer turn. Returns {relayed} — false means: treat as a normal lead.
async function relayInstallerReply({ from, text }, deps = {}) {
  const { env = process.env, log = console,
    findSession = (k) => loadEscalatedForInstaller(k, { env }),
    save = (s) => saveSession(s, { env }) } = deps;
  const inst = installerForNumber(from);
  if (!inst) return { relayed: false };
  let sess = null;
  try { sess = await findSession(inst.key); } catch (e) { if (log.error) log.error("relay find", e.message); }
  if (!sess) return { relayed: false };
  const clean = String(text || "").trim();
  if (!clean) return { relayed: false }; // blank/media-only texts fall through to normal handling
  sess.turns.push({ role: "installer", text: clean, at: Date.now() });
  try { await save(sess); } catch (e) { if (log.error) log.error("relay save", e.message); return { relayed: false }; }
  return { relayed: true };
}

async function handler(event, ctx = {}) {
  const env = ctx.env || process.env;
  const verify = ctx.verify || validateTwilioSignature;
  const ingest = ctx.ingest || ((b) => ingestLead(b, { env }));
  const relay = ctx.relay || ((m) => relayInstallerReply(m, { env }));
  const params = decodeBody(event);
  const url = webhookUrl(event, env, "twilio-sms");
  const sig = (event.headers && (event.headers["x-twilio-signature"] || event.headers["X-Twilio-Signature"])) || "";
  if (!verify(env.TWILIO_AUTH_TOKEN, url, params, sig)) return { statusCode: 403, body: "invalid signature" };
  try {
    const r = await relay({ from: params.From || "", text: params.Body || "" });
    if (r && r.relayed) return { statusCode: 200, headers: { "Content-Type": "text/xml; charset=utf-8" }, body: EMPTY_TWIML };
  } catch (e) { console.error("twilio-sms relay failed", e && e.message); /* fall through to lead path */ }
  try { await ingest(parseInboundSms(params)); } catch (e) { console.error("twilio-sms ingest failed", e && e.message); /* best-effort; never break the texter */ }
  return { statusCode: 200, headers: { "Content-Type": "text/xml; charset=utf-8" }, body: smsReplyTwiml(REPLY) };
}

module.exports = { handler, relayInstallerReply, REPLY };
