// netlify/functions/lib/chat-admin.js
// Installer-side chat operations for the console Chats inbox. Deps-injected
// like every lib here. Replies write the IDENTICAL turn shape the SMS relay
// writes (twilio-sms.js relayInstallerReply) — one conversation, two channels.
const { cfg, escapeFormula, listRecords } = require("./airtable.js");
const { loadSession, saveSession, parseTranscript, loadActiveByPrefix, aiPaused, AI_MODES, TABLE } = require("./chat-store.js");
const { deliverInstallerTurn } = require("./meta-deliver.js");
const { normalizeInstallerKey, smsNumberFor } = require("./routing.js");
const { buildHandoffBody } = require("./installer-relay.js");
const { sendSms } = require("./twilio.js");

// Installer-initiated SMS thread for a Priority List client. Find-or-create by
// phone; new sessions are marked human-only via pageContext "sms-direct" — the
// AI never speaks in a conversation an installer started.
async function openSmsThread(body, installerKey, deps = {}) {
  const { env = process.env, loadActive = (p) => loadActiveByPrefix(p, { env, ...deps }),
          loadFn = (i) => loadSession(i, { env, ...deps }),
          saveFn = saveSession } = deps;
  const digits = String((body && body.phone) || "").replace(/\D/g, "").slice(-10);
  if (digits.length !== 10) return { status: "error", error: "bad-phone" };
  const id = `sms:+1${digits}`;
  let active = null;
  try { active = await loadActive(id); } catch (e) { /* store hiccup -> create fresh */ }
  if (active) return { status: "ok", session: active.id, isNew: false };
  // A closed thread with this number is REOPENED in place, never shadowed:
  // Airtable has no unique constraint, and loadSession reads oldest-first, so
  // a second record under the same Session ID would route every reply to the
  // closed record, which installerReply rejects as not-escalated (surfaced
  // live 2026-07-28 via the Calls tab). Reopening also keeps the transcript.
  let prior = null;
  try { prior = await loadFn(id); } catch (e) { /* store hiccup -> create fresh */ }
  if (prior) {
    prior.status = "escalated";
    prior.installer = prior.installer || installerKey;
    if (!prior.customerName && body && body.name) prior.customerName = String(body.name).slice(0, 80);
    if (!prior.vehicle && body && body.vehicle) prior.vehicle = String(body.vehicle).slice(0, 80);
    await saveFn(prior, deps);
    return { status: "ok", session: prior.id, isNew: false };
  }
  const sess = { id, status: "escalated", pageContext: "sms-direct", installer: installerKey,
    customerName: String((body && body.name) || "").slice(0, 80),
    vehicle: String((body && body.vehicle) || "").slice(0, 80),
    phone: `+1${digits}`, turns: [] };
  await saveFn(sess, deps);
  return { status: "ok", session: id, isNew: true };
}

// Source-of-record channel from the Session ID prefix (ids: fb:/ig:/sms:, else web).
function channelOf(id) {
  const s = String(id || "");
  if (s.startsWith("fb:")) return "facebook";
  if (s.startsWith("ig:")) return "instagram";
  if (s.startsWith("sms:")) return "text";
  return "web";
}

async function listSessions(installerKey, { env = process.env, fetchImpl = fetch } = {}) {
  const c = cfg(env);
  const key = escapeFormula(String(installerKey || ""));
  const recs = await listRecords({
    fetchImpl, token: c.token, baseId: c.baseId, table: TABLE(env),
    // The console inbox = escalated threads (mine or unassigned) PLUS every LIVE
    // Facebook/Instagram DM thread (mine or unassigned). Meta DMs must be visible
    // and answerable the moment they arrive — not only once the AI emits a
    // structured hand-off, which it frequently never does (it free-texts a fake
    // "someone will be with you shortly" and the thread stays in "ai" status).
    // That gap is why FB PMs never reached this inbox.
    filterByFormula:
      `OR(` +
        `AND({Status}="escalated", OR({Installer}="${key}", {Installer}="")),` +
        `AND({Status}!="closed", OR(LEFT({Session ID},3)="fb:", LEFT({Session ID},3)="ig:"), OR({Installer}="${key}", {Installer}=""))` +
      `)`,
    fields: ["Session ID", "Status", "Customer Name", "Phone", "Vehicle", "City", "Installer", "Transcript", "Last Activity"],
  });
  return recs.map((r) => {
    const f = r.fields || {};
    const turns = parseTranscript(f.Transcript);
    const last = turns[turns.length - 1] || null;
    return {
      id: f["Session ID"] || "", status: f.Status || "ai",
      channel: channelOf(f["Session ID"]),
      customerName: f["Customer Name"] || "", phone: f.Phone || "",
      vehicle: f.Vehicle || "", city: f.City || "", installer: f.Installer || "",
      lastActivity: f["Last Activity"] || "", turnCount: turns.length,
      lastRole: last ? last.role : "", lastText: last ? String(last.text || "").slice(0, 120) : "",
    };
  }).sort((a, b) => (a.lastActivity < b.lastActivity ? 1 : -1));
}

async function getTranscript(sessionId, deps = {}) {
  const { loadFn = loadSession, now = Date.now } = deps;
  const sess = await loadFn(sessionId, deps);
  if (!sess) return null;
  return { id: sess.id, status: sess.status, customerName: sess.customerName, phone: sess.phone, vehicle: sess.vehicle, city: sess.city, installer: sess.installer || "", turns: sess.turns,
    aiMode: sess.aiMode || "auto", aiActive: !aiPaused(sess, now()) };
}

async function installerReply(sessionId, installerKey, text, deps = {}) {
  const { loadFn = loadSession, saveFn = saveSession, now = Date.now,
    onInstallerTurn = deliverInstallerTurn } = deps;
  const clean = String(text || "").trim().slice(0, 1000);
  if (!clean) return { status: "error", error: "empty" };
  const sess = await loadFn(sessionId, deps);
  if (!sess) return { status: "error", error: "not-found" };
  const isMeta = /^(fb|ig):/.test(String(sess.id || ""));
  if (sess.status !== "escalated") {
    // A live Facebook/Instagram DM is answerable before the AI escalates it: an
    // installer replying IS the human takeover, so promote + claim the thread
    // (future client turns then relay to them, and aiPaused silences the AI for
    // 72 h off this installer turn). Website "ai" threads and any closed thread
    // are still refused — only live Meta DMs get this fast path.
    if (!isMeta || sess.status === "closed") return { status: "error", error: "not-escalated" };
    sess.status = "escalated";
  }
  if (!sess.installer) sess.installer = installerKey; // claim unassigned
  sess.turns.push({ role: "installer", text: clean, at: now() });
  await saveFn(sess, deps);
  const turn = sess.turns[sess.turns.length - 1];
  // MUST be awaited: Lambda freezes the container when the handler returns, so a
  // fire-and-forget Graph send never completes. Failures stay non-fatal — the
  // turn is already saved and meta-deliver Slack-notifies on its own.
  try { await onInstallerTurn(sess, turn, deps); } catch (e) {}
  return { status: "ok", turnCount: sess.turns.length };
}

// Assign a chat to an installer (owner ask 2026-07-24: once a chat's market is
// known, route the thread to its installer). Admin may assign to anyone; a
// regular installer may only claim a chat for themselves. Assignment scopes the
// inbox: listSessions shows "mine + unassigned", so assigning to X moves the
// thread into X's inbox and out of everyone else's. Parity with the @key SMS
// dispatch (twilio-sms.js): stamp lastRelayedAt so the assignee's phone replies
// route to THIS thread, and text them the same handoff SMS — a console-assigned
// installer must learn about the thread without opening the console.
// Self-claims skip the SMS (you already know); the send is awaited (Lambda
// freeze) and failure-guarded — assignment succeeds even if the text doesn't.
async function assignSession(sessionId, targetKey, byKey, isAdminFlag, deps = {}) {
  const { loadFn = loadSession, saveFn = saveSession, env = process.env, log = console,
    sms = (a) => sendSms(a, { env }) } = deps;
  const target = normalizeInstallerKey(targetKey);
  if (!target) return { status: "error", error: "bad-installer" };
  if (!isAdminFlag && target !== byKey) return { status: "error", error: "admin-only" };
  const sess = await loadFn(sessionId, deps);
  if (!sess) return { status: "error", error: "not-found" };
  sess.installer = target;
  sess.lastRelayedAt = new Date().toISOString(); // target's phone replies route here
  await saveFn(sess, deps);
  if (target !== byKey) {
    try { await sms({ to: smsNumberFor(target, env), body: buildHandoffBody(sess) }); }
    catch (e) { if (log.error) log.error("assign handoff sms", e.message); }
  }
  return { status: "ok", installer: target };
}

async function closeSession(sessionId, deps = {}) {
  const { loadFn = loadSession, saveFn = saveSession } = deps;
  const sess = await loadFn(sessionId, deps);
  if (!sess) return { status: "error", error: "not-found" };
  sess.status = "closed";
  await saveFn(sess, deps);
  return { status: "ok" };
}

// Console AI toggle: "on"/"off" are manual overrides; "auto" restores the
// 72h-pause-after-installer-reply default. Takes effect on the next client message.
async function setAiMode(sessionId, mode, deps = {}) {
  const { loadFn = loadSession, saveFn = saveSession } = deps;
  const m = String(mode || "").toLowerCase();
  if (!AI_MODES.includes(m)) return { status: "error", error: "bad-mode" };
  const sess = await loadFn(sessionId, deps);
  if (!sess) return { status: "error", error: "not-found" };
  sess.aiMode = m;
  await saveFn(sess, deps);
  return { status: "ok", aiMode: m };
}

module.exports = { listSessions, getTranscript, installerReply, closeSession, openSmsThread, assignSession, setAiMode };
