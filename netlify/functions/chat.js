// netlify/functions/chat.js
// Website chat endpoint. POST {session, message, page} → AI reply (or escalation);
// POST {session, poll:true, since} → new turns (installer relay polling).
// Never throws at the customer: AI/storage failures degrade to a contact-info
// fallback message. Escalation fan-out mirrors book-background.js best-effort style.
const { loadSession, saveSession, isStale, aiPaused } = require("./lib/chat-store.js");
const { runChat } = require("./lib/chat-agent.js");
const { keyToInstaller, dispatcherKey, INSTALLERS, smsNumberFor } = require("./lib/routing.js");
const { relayClientTurn } = require("./lib/installer-relay.js");
const { ingestLead, sendSms } = require("./lib/twilio.js");
const { sendWebPush } = require("./lib/webpush.js");
const { cfg, createRecord } = require("./lib/airtable.js");
const { resolveInstaller, isAdmin } = require("./lib/installer-auth.js");
const { notifyOwner } = require("./lib/alert.js");
const { detectVisitIntent } = require("./lib/urgent-visit.js");
const chatAdmin = require("./lib/chat-admin.js");
const { withCors } = require("./lib/cors.js");

const MAX_MESSAGES = 40;
const MAX_CHARS = 1000;
const OWNER_FALLBACK = "Sorry — I'm having trouble right now. Text or call us directly at (612) 406-7117 and a team member will help you out.";
const ESC_TABLE = (env) => env.AIRTABLE_ESCALATIONS_TABLE || "Chat Escalations";

async function defaultLogEscalation(fields, { env, fetchImpl = fetch }) {
  const c = cfg(env);
  await createRecord({ fetchImpl, token: c.token, baseId: c.baseId, table: ESC_TABLE(env), fields });
}

// Lead vehicle string incl. engine size (needed to pin the flash protocol at
// booking); the agent sends "unknown" when the customer genuinely can't say.
function transferVehicle(t) {
  const eng = String(t.engineSize || "").trim();
  return `${t.modelYear} ${t.vehicleMake} ${t.vehicleModel}` + (eng && !/^unknown$/i.test(eng) ? ` ${eng}` : "");
}

// Route + fan-out. Every side effect individually guarded; always returns installer.
async function escalate({ transfer, sess }, deps) {
  const { env = process.env, log = console,
    ingest = (b) => ingestLead(b, { env }),
    sms = (a) => sendSms(a, { env, log }),
    push = (k, m) => sendWebPush(k, m, { env, log }),
    logEscalation = (f) => defaultLogEscalation(f, { env }) } = deps || {};
  // Centralized intake: every escalation lands on the dispatcher's phone; they
  // answer or dispatch (@key SMS / console Assign). Market routing no longer
  // picks the chat owner — the dispatcher does.
  const inst = keyToInstaller(dispatcherKey(env));
  const others = Object.keys(INSTALLERS).filter((k) => k !== inst.key).map((k) => "@" + k).join(" / ");
  const vehicle = transferVehicle(transfer);
  const contact = `${transfer.contactMethod}: ${transfer.contactValue}`;
  const transcriptTail = (sess.turns || []).slice(-12).map((t) => `${t.role}: ${t.text}`).join("\n");
  const ctx = String(sess.pageContext || "");
  const channel = ctx === "facebook" || ctx === "instagram" ? ctx : "chat";
  const source = channel === "chat" ? "chat:widget" : "chat:" + channel;
  try {
    await ingest({ name: transfer.customerName, phone: transfer.contactMethod === "phone" ? transfer.contactValue : "",
      email: transfer.contactMethod === "email" ? transfer.contactValue : "",
      channel, source, city: transfer.city,
      vehicle, goals: transfer.questionSummary,
      modelYear: /^(19|20)\d{2}$/.test(String(transfer.modelYear || "").trim()) ? String(transfer.modelYear).trim() : "",
      message: `Chat escalation (${transfer.reason}). ${contact}\n--- transcript ---\n${transcriptTail}` });
  } catch (e) { if (log.error) log.error("chat lead", e.message); }
  try {
    await sms({ to: smsNumberFor(inst.key, env),
      body: `Tuned Yota chat: ${transfer.customerName} (${contact}) — ${vehicle}, ${transfer.city} ${transfer.state}. Q: ${transfer.questionSummary}. Reply to this text and it appears in their chat window, or send ${others} to dispatch.` });
  } catch (e) { if (log.error) log.error("chat sms", e.message); }
  try { await push(inst.key, { title: "Live chat transfer", body: `${transfer.customerName} — ${vehicle}`, url: "/installer.html" }); }
  catch (e) { if (log.error) log.error("chat push", e.message); }
  try {
    await logEscalation({ Question: transfer.questionSummary, Reason: transfer.reason,
      "Page Context": sess.pageContext || "", "Session ID": sess.id,
      Date: new Date().toISOString(), Status: "New" });
  } catch (e) { if (log.error) log.error("chat esc log", e.message); }
  return { installer: inst };
}

// Lean urgent path (spec 2026-07-28): unlike escalate(), this never waits for
// the structured transfer payload — a customer already acting doesn't do
// intake. Every delivery is individually failure-guarded and the SMS failure
// mode is LOUD (full alert re-routed to Slack), because this is the one alert
// that must not die silently.
async function urgentEscalate({ sess, message, why }, deps) {
  const { env = process.env, log = console,
    sms = (a) => sendSms(a, { env, log }),
    push = (k, m) => sendWebPush(k, m, { env, log }),
    slack = (t) => notifyOwner({ webhookUrl: env.SLACK_WEBHOOK_URL, text: t }),
    ingest = (b) => ingestLead(b, { env }),
    logEscalation = (f) => defaultLogEscalation(f, { env }) } = deps || {};
  const inst = keyToInstaller(dispatcherKey(env));
  const others = Object.keys(INSTALLERS).filter((k) => k !== inst.key).map((k) => "@" + k).join(" / ");
  const who = [sess.customerName, sess.phone || sess.id].filter(Boolean).join(" · ");
  const snippet = String(message || "").slice(0, 160);
  const body = `⚠ URGENT — customer may be COMING TO YOU. "${snippet}" — ${who} — thread is open in the console. Reply to this text to reach them, or ${others} to dispatch.`;
  try { await sms({ to: smsNumberFor(inst.key, env), body }); }
  catch (e) {
    if (log.error) log.error("urgent sms", e.message);
    try { await slack(`⚠ URGENT visit-intent SMS FAILED (${e.message}) — act on this from the console:\n${body}`); } catch (e2) {}
  }
  try { await push(inst.key, { title: "URGENT: possible walk-up", body: snippet.slice(0, 90), url: "/installer.html#chats" }); } catch (e) {}
  try { await slack(`⚠ URGENT visit-intent (${why}) on ${sess.id}: "${snippet}"`); } catch (e) {}
  try {
    await ingest({ name: sess.customerName || "", phone: sess.phone || "",
      channel: /^sms:/.test(String(sess.id)) ? "phone" : "chat", source: "chat:urgent-visit",
      message: `URGENT visit-intent (${why}): ${String(message || "").slice(0, 300)}` });
  } catch (e) {}
  try {
    await logEscalation({ Question: snippet, Reason: "urgent-visit-intent",
      "Page Context": sess.pageContext || "", "Session ID": sess.id,
      Date: new Date().toISOString(), Status: "New" });
  } catch (e) {}
}

async function processChat(body, deps) {
  const { env = process.env, log = console,
    load = (id) => loadSession(id, { env }),
    save = (s) => saveSession(s, { env }),
    ai = (s) => runChat(s, { env }),
    doEscalate = (a) => escalate(a, { env, log }),
    doUrgent = (a) => urgentEscalate(a, { env, log }),
    relay = (s, m) => relayClientTurn(s, m, { env, log }),
    notifyRelayFailure = (s, e) => notifyOwner({ webhookUrl: env.SLACK_WEBHOOK_URL, text: `⚠ Chat relay to installer phone failed for ${s.customerName || s.id}: ${e.message}` }),
    notify = (sess, text) => sendWebPush(sess.installer, { title: "Chat: " + (sess.customerName || "customer"), body: String(text).slice(0, 90), url: "/installer.html#chats" }, { env, log }) } = deps || {};
  const id = String(body.session || "").slice(0, 64);
  if (!id) return { status: 400, body: { error: "missing session" } };

  let sess = null;
  try { sess = await load(id); } catch (e) { if (log.error) log.error("chat load", e.message); }
  if (sess && (sess.status === "closed" || isStale(sess, Date.now()))) {
    return { status: 200, body: { expired: true, reply: "" } };
  }

  // Poll mode: return turns the widget hasn't seen (installer relay polling).
  if (body.poll) {
    const turns = sess ? (sess.turns || []).slice(Number(body.since) || 0) : [];
    return { status: 200, body: { turns, escalated: !!sess && sess.status === "escalated" } };
  }

  const message = String(body.message || "").trim();
  if (!message) return { status: 400, body: { error: "missing message" } };
  if (message.length > MAX_CHARS) return { status: 400, body: { error: "message too long" } };

  if (!sess) sess = { id, status: "ai", turns: [], pageContext: String(body.page || "default").slice(0, 32) };

  // Redelivered webhook (Twilio retries carry the same MessageSid — mirrors
  // the Meta channel's `mid` dedup): already processed → no AI, no relay,
  // nothing stored.
  const sid = String(body.sid || "").slice(0, 64);
  if (sid && (sess.turns || []).some((t) => t.sid === sid)) {
    return { status: 200, body: { reply: "", duplicate: true, escalated: sess.status === "escalated", turnCount: sess.turns.length } };
  }

  if ((sess.turns || []).filter((t) => t.role === "user").length >= MAX_MESSAGES) {
    return { status: 200, body: { reply: "We've covered a lot! For the fastest next step, grab a spot at https://tunedyota.com/find-your-exact-tune or text (612) 406-7117.", capped: true } };
  }
  sess.turns.push({ role: "user", text: message, at: Date.now(), ...(sid ? { sid } : {}) });

  // Urgent visit-intent tripwire (spec 2026-07-28-address-seeking-urgent-
  // escalation): deterministic and model-independent — fires before the AI on
  // every channel. Escalated threads already relay every turn to a phone, so
  // the tripwire only arms on un-escalated ones (that's also the once-per-
  // thread guard: tripping sets escalated). The reply is fixed copy; the model
  // never gets a say on this turn.
  const urgentWhy = sess.status !== "escalated" ? detectVisitIntent(message, env) : "";
  if (urgentWhy) {
    sess.status = "escalated";
    sess.installer = "";                                 // dispatcher-first: dispatch assigns
    sess.lastRelayedAt = new Date().toISOString();       // urgent SMS = first relay
    sess.urgentAt = new Date().toISOString();
    try { await doUrgent({ sess, message, why: urgentWhy }); }
    catch (e) { if (log.error) log.error("chat urgent", e.message); }
    const reply = "I've flagged this straight to Aaron — he'll reach you directly in a few minutes. Please don't head anywhere until you hear from him; nothing is confirmed except through him.";
    sess.turns.push({ role: "assistant", text: reply, at: Date.now() });
    try { await save(sess); } catch (e) { if (log.error) log.error("chat save", e.message); }
    return { status: 200, body: { reply, escalated: true, urgent: true, turnCount: sess.turns.length } };
  }

  // Escalated thread: forward the customer's message to the phone of whoever is
  // working it (assigned installer, else the dispatcher). MUST be awaited —
  // Lambda freezes un-awaited work (252428c). A relay failure never blocks the
  // turn: it's saved below and the console still shows it — but it must be
  // VISIBLE (delivery-failure pattern, mirrors meta-deliver.js): a system turn
  // in the transcript + a Slack notify, so nobody assumes the phone got it.
  if (sess.status === "escalated") {
    try { await relay(sess, message); } catch (e) {
      if (log.error) log.error("chat relay", e.message);
      sess.turns.push({ role: "system", text: "⚠ not relayed to the installer's phone (" + e.message + ") — reply from the console.", at: Date.now() });
      try { notifyRelayFailure(sess, e).catch(function () {}); } catch (e2) {}
    }
    if (sess.installer) { try { notify(sess, message).catch(function () {}); } catch (e) {} }
  }

  // Human-only threads (installer-initiated SMS, pageContext "sms-direct"): the
  // AI never speaks in a conversation an installer started. Save the customer
  // turn, let the notify above do its job, and return no reply.
  if (sess.pageContext === "sms-direct") {
    try { await save(sess); } catch (e) { if (log.error) log.error("chat save", e.message); }
    return { status: 200, body: { reply: "", escalated: sess.status === "escalated", turnCount: sess.turns.length } };
  }

  // Human-takeover pause: manual off, or auto within 72 h of the installer's
  // latest reply. The client's turn is already relayed; it's saved here and the AI stays quiet.
  if (aiPaused(sess, Date.now())) {
    try { await save(sess); } catch (e) { if (log.error) log.error("chat save", e.message); }
    return { status: 200, body: { reply: "", escalated: sess.status === "escalated", turnCount: sess.turns.length } };
  }

  let out;
  try { out = await ai({ turns: sess.turns, pageContext: sess.pageContext }); }
  catch (e) {
    if (log.error) log.error("chat ai", e.message);
    sess.turns.push({ role: "assistant", text: OWNER_FALLBACK, at: Date.now() });
    try { await save(sess); } catch {}
    return { status: 200, body: { reply: OWNER_FALLBACK, degraded: true } };
  }

  let reply = out.reply, escalated = sess.status === "escalated";
  if (out.transfer && sess.status !== "escalated") {
    const { installer } = await doEscalate({ transfer: out.transfer, sess });
    sess.status = "escalated";
    sess.customerName = out.transfer.customerName;
    sess.phone = out.transfer.contactMethod === "phone" ? out.transfer.contactValue : "";
    sess.vehicle = transferVehicle(out.transfer);
    sess.city = out.transfer.city;
    sess.installer = "";                                   // dispatcher-first: dispatch assigns
    sess.lastRelayedAt = new Date().toISOString();          // escalation SMS = first relay
    escalated = true;
    reply = `${out.reply ? out.reply + " " : ""}You're set — I've sent your question straight to ${installer.name} at Tuned Yota. Their direct line is ${installer.phone}. If they reply while you're here, it'll appear right in this chat.`;
  }
  if (reply) sess.turns.push({ role: "assistant", text: reply, at: Date.now() });
  try { await save(sess); } catch (e) { if (log.error) log.error("chat save", e.message); }
  return { status: 200, body: { reply, escalated, turnCount: sess.turns.length } };
}

// Installer-authed inbox operations (console Chats panel).
async function installerOp(body, installerKey, deps = {}) {
  const opStatus = (r) => r.status === "ok" ? 200 : (r.error === "not-found" ? 404 : 400);
  const { list = chatAdmin.listSessions, transcript = chatAdmin.getTranscript,
          reply = chatAdmin.installerReply, close = chatAdmin.closeSession,
          openSms = chatAdmin.openSmsThread, assign = chatAdmin.assignSession,
          admin = false } = deps;
  if (body.op === "list") return { status: 200, body: { sessions: await list(installerKey, deps) } };
  if (body.op === "openSms") {
    const r = await openSms(body, installerKey, deps);
    return { status: r.status === "ok" ? 200 : 400, body: r };
  }
  if (body.op === "transcript") {
    const t = await transcript(String(body.session || ""), deps);
    return t ? { status: 200, body: t } : { status: 404, body: { error: "not-found" } };
  }
  if (body.op === "reply") {
    const r = await reply(String(body.session || ""), installerKey, body.text, deps);
    return { status: r.status === "ok" ? 200 : 400, body: r };
  }
  if (body.op === "close") {
    const r = await close(String(body.session || ""), deps);
    return { status: r.status === "ok" ? 200 : 404, body: r };
  }
  if (body.op === "assign") {
    const r = await assign(String(body.session || ""), String(body.installer || ""), installerKey, admin, deps);
    return { status: opStatus(r), body: r };
  }
  if (body.op === "aiMode") {
    const r = await (deps.setAi || chatAdmin.setAiMode)(String(body.session || ""), String(body.mode || ""), deps);
    return { status: opStatus(r), body: r };
  }
  return { status: 400, body: { error: "bad-op" } };
}

async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "method not allowed" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  if (body && body.installer) {
    const key = resolveInstaller(event.headers || {}, process.env);
    if (!key) return { statusCode: 401, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "unauthorized" }) };
    const out = await installerOp(body, key, { admin: isAdmin(key, process.env) });
    return { statusCode: out.status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out.body) };
  }
  const out = await processChat(body, {});
  return { statusCode: out.status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out.body) };
}

module.exports = { handler: withCors(handler), processChat, escalate, urgentEscalate, installerOp, MAX_MESSAGES, MAX_CHARS };
