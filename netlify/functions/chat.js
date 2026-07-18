// netlify/functions/chat.js
// Website chat endpoint. POST {session, message, page} → AI reply (or escalation);
// POST {session, poll:true, since} → new turns (installer relay polling).
// Never throws at the customer: AI/storage failures degrade to a contact-info
// fallback message. Escalation fan-out mirrors book-background.js best-effort style.
const { loadSession, saveSession, isStale } = require("./lib/chat-store.js");
const { runChat } = require("./lib/chat-agent.js");
const { getMarket } = require("./lib/markets.js");
const { keyToInstaller, FALLBACK_KEY } = require("./lib/routing.js");
const { ingestLead, sendSms } = require("./lib/twilio.js");
const { sendWebPush } = require("./lib/webpush.js");
const { cfg, createRecord } = require("./lib/airtable.js");

const MAX_MESSAGES = 40;
const MAX_CHARS = 1000;
const OWNER_FALLBACK = "Sorry — I'm having trouble right now. Text or call us directly at (612) 406-7117 and a team member will help you out.";
const ESC_TABLE = (env) => env.AIRTABLE_ESCALATIONS_TABLE || "Chat Escalations";

async function defaultLogEscalation(fields, { env, fetchImpl = fetch }) {
  const c = cfg(env);
  await createRecord({ fetchImpl, token: c.token, baseId: c.baseId, table: ESC_TABLE(env), fields });
}

// Route + fan-out. Every side effect individually guarded; always returns installer.
async function escalate({ transfer, sess }, deps) {
  const { env = process.env, log = console,
    ingest = (b) => ingestLead(b, { env }),
    sms = (a) => sendSms(a, { env, log }),
    push = (k, m) => sendWebPush(k, m, { env, log }),
    logEscalation = (f) => defaultLogEscalation(f, { env }) } = deps || {};
  const market = getMarket(transfer.city);
  const inst = keyToInstaller(market ? market.inst : FALLBACK_KEY);
  const vehicle = `${transfer.modelYear} ${transfer.vehicleMake} ${transfer.vehicleModel}`;
  const contact = `${transfer.contactMethod}: ${transfer.contactValue}`;
  const transcriptTail = (sess.turns || []).slice(-12).map((t) => `${t.role}: ${t.text}`).join("\n");
  try {
    await ingest({ name: transfer.customerName, phone: transfer.contactMethod === "phone" ? transfer.contactValue : "",
      email: transfer.contactMethod === "email" ? transfer.contactValue : "",
      channel: "chat", source: "chat:widget", city: transfer.city,
      vehicle, goals: transfer.questionSummary,
      message: `Chat escalation (${transfer.reason}). ${contact}\n--- transcript ---\n${transcriptTail}` });
  } catch (e) { if (log.error) log.error("chat lead", e.message); }
  const digits = String(inst.phone || "").replace(/\D/g, "");
  try {
    await sms({ to: digits.length === 10 ? `+1${digits}` : inst.phone,
      body: `Tuned Yota chat: ${transfer.customerName} (${contact}) — ${vehicle}, ${transfer.city} ${transfer.state}. Q: ${transfer.questionSummary}. Reply to this text and it appears in their chat window.` });
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

async function processChat(body, deps) {
  const { env = process.env, log = console,
    load = (id) => loadSession(id, { env }),
    save = (s) => saveSession(s, { env }),
    ai = (s) => runChat(s, { env }),
    doEscalate = (a) => escalate(a, { env, log }) } = deps || {};
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
  if ((sess.turns || []).filter((t) => t.role === "user").length >= MAX_MESSAGES) {
    return { status: 200, body: { reply: "We've covered a lot! For the fastest next step, grab a spot at https://tunedyota.com/find-your-exact-tune or text (612) 406-7117.", capped: true } };
  }
  sess.turns.push({ role: "user", text: message, at: Date.now() });

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
    sess.vehicle = `${out.transfer.modelYear} ${out.transfer.vehicleMake} ${out.transfer.vehicleModel}`;
    sess.city = out.transfer.city;
    sess.installer = installer.key;
    escalated = true;
    reply = `${out.reply ? out.reply + " " : ""}You're set — I've sent your question to ${installer.name}, your nearest OTT installer. Their direct line is ${installer.phone}. If they reply while you're here, it'll appear right in this chat.`;
  }
  if (reply) sess.turns.push({ role: "assistant", text: reply, at: Date.now() });
  try { await save(sess); } catch (e) { if (log.error) log.error("chat save", e.message); }
  return { status: 200, body: { reply, escalated, turnCount: sess.turns.length } };
}

async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "method not allowed" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  const out = await processChat(body, {});
  return { statusCode: out.status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out.body) };
}

module.exports = { handler, processChat, escalate, MAX_MESSAGES, MAX_CHARS };
