// netlify/functions/twilio-sms.js
// Inbound SMS webhook: validate Twilio signature, then either (a) relay an
// installer's reply into their active escalated chat session — no lead, no
// auto-reply — or (b) the original behavior: ingest a tracked lead + auto-reply.
const { validateTwilioSignature, decodeBody, webhookUrl, parseInboundSms, smsReplyTwiml, ingestLead, smsKeywordType } = require("./lib/twilio.js");
const { INSTALLERS, parseSmsOverrides } = require("./lib/routing.js");
const { loadEscalatedForInstaller, saveSession } = require("./lib/chat-store.js");
const { deliverInstallerTurn } = require("./lib/meta-deliver.js");

const REPLY = "Thanks for texting Tuned Yota! We got your message and a team member will reach out shortly. " +
  "For the fastest help, reply with your vehicle + what you're after (OTT tune, supercharger, build, or a question). " +
  "Msg & data rates may apply. Reply STOP to opt out, HELP for help.";
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

const last10 = (p) => String(p || "").replace(/\D/g, "").slice(-10);

function installerForNumber(from, env) {
  const d = last10(from);
  if (!d) return null;
  // Check INSTALLER_SMS_NUMBERS overrides first (real cell may differ from public Twilio number).
  const overrides = parseSmsOverrides(env);
  for (const [key, num] of Object.entries(overrides)) {
    if (last10(num) === d && INSTALLERS[key]) return INSTALLERS[key];
  }
  return Object.values(INSTALLERS).find((i) => last10(i.phone) === d) || null;
}

// If `from` is an installer with an active escalated session, append their text
// as an installer turn. Returns {relayed} — false means: treat as a normal lead.
async function relayInstallerReply({ from, text }, deps = {}) {
  const { env = process.env, log = console,
    findSession = (k) => loadEscalatedForInstaller(k, { env }),
    save = (s) => saveSession(s, { env }),
    onInstallerTurn = deliverInstallerTurn } = deps;
  const inst = installerForNumber(from, env);
  if (!inst) return { relayed: false };
  let sess = null;
  try { sess = await findSession(inst.key); } catch (e) { if (log.error) log.error("relay find", e.message); }
  if (!sess) return { relayed: false };
  const clean = String(text || "").trim();
  if (!clean) return { relayed: false }; // blank/media-only texts fall through to normal handling
  sess.turns.push({ role: "installer", text: clean, at: Date.now() });
  try { await save(sess); } catch (e) { if (log.error) log.error("relay save", e.message); return { relayed: false }; }
  const turn = sess.turns[sess.turns.length - 1];
  try { Promise.resolve(onInstallerTurn(sess, turn, deps)).catch(() => {}); } catch (e) {}
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
  // Compliance keywords (STOP/HELP/START & co.): Twilio's Advanced Opt-Out sends
  // the reply. No lead, no relay, and above all no auto-reply — auto-replying to
  // a STOP would itself violate the opt-out.
  if (smsKeywordType(params.Body)) {
    return { statusCode: 200, headers: { "Content-Type": "text/xml; charset=utf-8" }, body: EMPTY_TWIML };
  }
  try {
    const r = await relay({ from: params.From || "", text: params.Body || "" });
    if (r && r.relayed) return { statusCode: 200, headers: { "Content-Type": "text/xml; charset=utf-8" }, body: EMPTY_TWIML };
  } catch (e) { console.error("twilio-sms relay failed", e && e.message); /* fall through to lead path */ }
  try { await ingest(parseInboundSms(params)); } catch (e) { console.error("twilio-sms ingest failed", e && e.message); /* best-effort; never break the texter */ }
  return { statusCode: 200, headers: { "Content-Type": "text/xml; charset=utf-8" }, body: smsReplyTwiml(REPLY) };
}

module.exports = { handler, relayInstallerReply, REPLY };
