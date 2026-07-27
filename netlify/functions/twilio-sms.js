// netlify/functions/twilio-sms.js
// Inbound SMS webhook: validate Twilio signature, then (a) relay an installer's
// reply into their active escalated chat session — no lead, no auto-reply — or
// (b) route the customer's text into their sms: chat session where the AI
// answers exactly as it does in Messenger (human-only threads excepted), or
// (c) if the session path fails, the original behavior: lead + canned reply.
const { validateTwilioSignature, decodeBody, webhookUrl, parseInboundSms, smsReplyTwiml, ingestLead, smsKeywordType, isTapbackText, sendSms } = require("./lib/twilio.js");
const { INSTALLERS, parseSmsOverrides, keyToInstaller, normalizeInstallerKey, smsNumberFor, dispatcherKey } = require("./lib/routing.js");
const { loadRelayTargetSession, saveSession, loadActiveByPrefix } = require("./lib/chat-store.js");
const { buildHandoffBody } = require("./lib/installer-relay.js");
const { isAdmin } = require("./lib/installer-auth.js");
const { deliverInstallerTurn } = require("./lib/meta-deliver.js");
const { processChat } = require("./chat.js");

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

// If `from` is an installer: either a dispatch command ("@cody" — dispatcher/
// admin only) or a reply into the thread that most recently relayed to their
// phone. Returns {relayed} — false means: treat as a normal lead.
async function relayInstallerReply({ from, text }, deps = {}) {
  const { env = process.env, log = console,
    findSession = (k) => loadRelayTargetSession(k, { env }),
    save = (s) => saveSession(s, { env }),
    sms = (a) => sendSms(a, { env, log }),
    onInstallerTurn = deliverInstallerTurn } = deps;
  const inst = installerForNumber(from, env);
  if (!inst) return { relayed: false };
  const clean = String(text || "").trim();
  if (!clean) return { relayed: false }; // blank/media-only texts fall through to normal handling

  // Tapback reactions (owner decision 2026-07-27): keep as a quiet transcript
  // note, never forward — 'Loved "…"' texted verbatim would read to the client
  // as a typed message. Consumed either way; a reaction is never a lead.
  if (isTapbackText(clean)) {
    let sess = null;
    try { sess = await findSession(inst.key); } catch (e) { if (log.error) log.error("reaction find", e.message); }
    if (sess) {
      sess.turns.push({ role: "system", text: `(reaction) ${clean}`, at: Date.now() });
      try { await save(sess); } catch (e) { if (log.error) log.error("reaction save", e.message); }
    }
    return { relayed: true };
  }

  // Dispatch command: "@cody" sent alone by the dispatcher or an admin. The @
  // is REQUIRED — a bare word ("Cody") always relays as chat text, so answering
  // a client's "who's my installer?" can never silently reassign the thread.
  // Any @-prefixed text from a dispatcher is command INTENT: if it isn't a
  // valid "@key" alone, it's consumed with an error SMS — never leaked to the
  // client ("@codyy", "@cody take this one").
  const mayDispatch = inst.key === dispatcherKey(env) || isAdmin(inst.key, env);
  if (mayDispatch && clean.startsWith("@")) {
    const m = /^@([a-zA-Z]+)$/.exec(clean);
    const target = m ? normalizeInstallerKey(m[1]) : "";
    if (!target || target === inst.key) {
      const keys = Object.keys(INSTALLERS).filter((k) => k !== inst.key).map((k) => "@" + k).join(" or ");
      try { await sms({ to: smsNumberFor(inst.key, env), body: `TY: dispatch commands are ${keys}, sent alone. Nothing was sent to the client.` }); } catch (e) {}
      return { relayed: true };
    }
    let sess = null;
    try { sess = await findSession(inst.key); } catch (e) { if (log.error) log.error("dispatch find", e.message); }
    if (!sess) {
      try { await sms({ to: smsNumberFor(inst.key, env), body: "TY: no active chat to dispatch right now." }); } catch (e) {}
      return { relayed: true };
    }
    sess.installer = target;
    sess.lastRelayedAt = new Date().toISOString(); // target's replies route here
    try { await save(sess); } catch (e) {
      if (log.error) log.error("dispatch save", e.message);
      try { await sms({ to: smsNumberFor(inst.key, env), body: "TY: dispatch failed to save — try again or assign in the console." }); } catch (e2) {}
      return { relayed: true };
    }
    try { await sms({ to: smsNumberFor(target, env), body: buildHandoffBody(sess) }); } catch (e) { if (log.error) log.error("dispatch handoff", e.message); }
    try { await sms({ to: smsNumberFor(inst.key, env), body: `✓ ${sess.customerName || "Chat"} → ${keyToInstaller(target).name}` }); } catch (e) {}
    return { relayed: true };
  }

  let sess = null;
  try { sess = await findSession(inst.key); } catch (e) { if (log.error) log.error("relay find", e.message); }
  if (!sess) return { relayed: false };
  if (!sess.installer) sess.installer = inst.key; // dispatcher answered → thread is theirs
  sess.turns.push({ role: "installer", text: clean, at: Date.now() });
  try { await save(sess); } catch (e) { if (log.error) log.error("relay save", e.message); return { relayed: false }; }
  const turn = sess.turns[sess.turns.length - 1];
  // MUST be awaited: Lambda freezes the container when the handler returns, so a
  // fire-and-forget Graph send never completes. Failures stay non-fatal — the
  // turn is already saved and meta-deliver Slack-notifies on its own.
  try { await onInstallerTurn(sess, turn, deps); } catch (e) {}
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

  // Client Tapback reaction: transcript note only — no lead, no AI, no relay.
  // A reaction with no active conversation is simply consumed.
  if (isTapbackText(params.Body)) {
    try {
      const loadActive = ctx.loadActive || ((p) => loadActiveByPrefix(p, { env }));
      const active = await loadActive("sms:" + String(params.From || ""));
      if (active) {
        active.turns.push({ role: "system", text: `(reaction) ${String(params.Body).trim()}`, at: Date.now() });
        await (ctx.save || ((s) => saveSession(s, { env })))(active);
      }
    } catch (e) { console.error("twilio-sms reaction note failed", e && e.message); }
    return { statusCode: 200, headers: { "Content-Type": "text/xml; charset=utf-8" }, body: EMPTY_TWIML };
  }

  // Customer text -> their sms: chat session, AI answering like any other
  // channel (silent on human-only installer-initiated threads). Lead ingest
  // stays either way. Any session/AI failure falls back to the canned reply —
  // a texter is never dropped.
  try { await ingest(parseInboundSms(params)); } catch (e) { console.error("twilio-sms ingest failed", e && e.message); /* best-effort; never break the texter */ }
  try {
    const chat = ctx.chat || ((b) => processChat(b, { env }));
    const loadActive = ctx.loadActive || ((p) => loadActiveByPrefix(p, { env }));
    const base = "sms:" + String(params.From || "");
    let active = null;
    try { active = await loadActive(base); } catch (e) { /* fresh session */ }
    let sessionId = active ? active.id : base;
    let out = await chat({ session: sessionId, message: params.Body || "", page: "sms", sid: params.MessageSid || "" });
    if (out && out.body && out.body.expired) {
      sessionId = base + ":" + Date.now();
      out = await chat({ session: sessionId, message: params.Body || "", page: "sms", sid: params.MessageSid || "" });
    }
    const reply = out && out.body && out.body.reply;
    if (out && out.status === 200 && !(out.body && out.body.degraded)) {
      return { statusCode: 200, headers: { "Content-Type": "text/xml; charset=utf-8" },
        body: reply ? smsReplyTwiml(reply) : EMPTY_TWIML };
    }
  } catch (e) { console.error("twilio-sms session path failed", e && e.message); /* fall through to canned reply */ }
  return { statusCode: 200, headers: { "Content-Type": "text/xml; charset=utf-8" }, body: smsReplyTwiml(REPLY) };
}

module.exports = { handler, relayInstallerReply, REPLY };
