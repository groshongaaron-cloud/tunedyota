// netlify/functions/lib/chat-admin.js
// Installer-side chat operations for the console Chats inbox. Deps-injected
// like every lib here. Replies write the IDENTICAL turn shape the SMS relay
// writes (twilio-sms.js relayInstallerReply) — one conversation, two channels.
const { cfg, escapeFormula, listRecords, listAllRecords } = require("./airtable.js");
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

// Airtable predicate selecting a single channel by Session ID prefix.
const CHANNEL_PRED = {
  facebook: `LEFT({Session ID},3)="fb:"`,
  instagram: `LEFT({Session ID},3)="ig:"`,
  text: `LEFT({Session ID},4)="sms:"`,
  web: `AND(LEFT({Session ID},3)!="fb:", LEFT({Session ID},3)!="ig:", LEFT({Session ID},4)!="sms:")`,
};

// The inbox query per view. `scope` = mine-or-unassigned. The Chats tab is an
// all-encompassing home for conversations (owner spec 2026-08-06: "like an
// iPhone — all chats live and fluid regardless of booking status"), so the
// default "All" view surfaces every real conversation at ANY status — closing a
// chat marks it done but never removes it from the list. That's every customer
// channel thread (fb/ig/sms, any status incl closed) plus any web thread a human
// touched or finished (escalated/closed); still-anonymous in-progress website AI
// chats stay out of the main list as noise (they appear once escalated/closed, or
// via the Web filter). A channel view is that channel at any status. "completed"
// = closed only (last 90 days) for focused review. listSessions caps the
// non-completed views to the 20 most recent so the list stays focused.
function listFilter(view, scope) {
  if (view === "completed") {
    return `AND({Status}="closed", ${scope}, IS_AFTER({Last Activity}, DATEADD(TODAY(), -90, 'days')))`;
  }
  if (CHANNEL_PRED[view]) return `AND(${scope}, ${CHANNEL_PRED[view]})`;
  return `AND(${scope}, OR(LEFT({Session ID},3)="fb:", LEFT({Session ID},3)="ig:", LEFT({Session ID},4)="sms:", {Status}!="ai"))`;
}

async function listSessions(installerKey, { env = process.env, fetchImpl = fetch, view = "open" } = {}) {
  const c = cfg(env);
  const key = escapeFormula(String(installerKey || ""));
  const scope = `OR({Installer}="${key}", {Installer}="")`;
  const query = {
    fetchImpl, token: c.token, baseId: c.baseId, table: TABLE(env),
    filterByFormula: listFilter(view, scope),
    fields: ["Session ID", "Status", "Customer Name", "Phone", "Vehicle", "City", "Installer", "Transcript", "Last Activity"],
    // Newest-first, capped to a focused top-20 — Airtable does the ordering so the
    // most-recent conversations are never lost behind its 100-record page cap.
    sort: [{ field: "Last Activity", direction: "desc" }],
    maxRecords: 20,
  };
  // Completed spans 90 days of closed threads — paginate so the newest aren't
  // lost behind Airtable's 100-record page cap, then keep the most recent 50.
  const recs = view === "completed" ? await listAllRecords(query) : await listRecords(query);
  const rows = recs.map((r) => {
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
  return view === "completed" ? rows.slice(0, 50) : rows;
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
