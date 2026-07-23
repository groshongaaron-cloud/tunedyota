// netlify/functions/lib/chat-admin.js
// Installer-side chat operations for the console Chats inbox. Deps-injected
// like every lib here. Replies write the IDENTICAL turn shape the SMS relay
// writes (twilio-sms.js relayInstallerReply) — one conversation, two channels.
const { cfg, escapeFormula, listRecords } = require("./airtable.js");
const { loadSession, saveSession, parseTranscript, loadActiveByPrefix, TABLE } = require("./chat-store.js");
const { deliverInstallerTurn } = require("./meta-deliver.js");

// Installer-initiated SMS thread for a Priority List client. Find-or-create by
// phone; new sessions are marked human-only via pageContext "sms-direct" — the
// AI never speaks in a conversation an installer started.
async function openSmsThread(body, installerKey, deps = {}) {
  const { env = process.env, loadActive = (p) => loadActiveByPrefix(p, { env, ...deps }),
          saveFn = saveSession } = deps;
  const digits = String((body && body.phone) || "").replace(/\D/g, "").slice(-10);
  if (digits.length !== 10) return { status: "error", error: "bad-phone" };
  const id = `sms:+1${digits}`;
  let active = null;
  try { active = await loadActive(id); } catch (e) { /* store hiccup -> create fresh */ }
  if (active) return { status: "ok", session: active.id, isNew: false };
  const sess = { id, status: "escalated", pageContext: "sms-direct", installer: installerKey,
    customerName: String((body && body.name) || "").slice(0, 80),
    vehicle: String((body && body.vehicle) || "").slice(0, 80),
    phone: `+1${digits}`, turns: [] };
  await saveFn(sess, deps);
  return { status: "ok", session: id, isNew: true };
}

async function listSessions(installerKey, { env = process.env, fetchImpl = fetch } = {}) {
  const c = cfg(env);
  const key = escapeFormula(String(installerKey || ""));
  const recs = await listRecords({
    fetchImpl, token: c.token, baseId: c.baseId, table: TABLE(env),
    filterByFormula: `AND({Status}="escalated", OR({Installer}="${key}", {Installer}=""))`,
    fields: ["Session ID", "Status", "Customer Name", "Phone", "Vehicle", "City", "Installer", "Transcript", "Last Activity"],
  });
  return recs.map((r) => {
    const f = r.fields || {};
    const turns = parseTranscript(f.Transcript);
    const last = turns[turns.length - 1] || null;
    return {
      id: f["Session ID"] || "", customerName: f["Customer Name"] || "", phone: f.Phone || "",
      vehicle: f.Vehicle || "", city: f.City || "", installer: f.Installer || "",
      lastActivity: f["Last Activity"] || "", turnCount: turns.length,
      lastRole: last ? last.role : "", lastText: last ? String(last.text || "").slice(0, 120) : "",
    };
  }).sort((a, b) => (a.lastActivity < b.lastActivity ? 1 : -1));
}

async function getTranscript(sessionId, deps = {}) {
  const { loadFn = loadSession } = deps;
  const sess = await loadFn(sessionId, deps);
  if (!sess) return null;
  return { id: sess.id, status: sess.status, customerName: sess.customerName, phone: sess.phone, vehicle: sess.vehicle, city: sess.city, turns: sess.turns };
}

async function installerReply(sessionId, installerKey, text, deps = {}) {
  const { loadFn = loadSession, saveFn = saveSession, now = Date.now,
    onInstallerTurn = deliverInstallerTurn } = deps;
  const clean = String(text || "").trim().slice(0, 1000);
  if (!clean) return { status: "error", error: "empty" };
  const sess = await loadFn(sessionId, deps);
  if (!sess) return { status: "error", error: "not-found" };
  if (sess.status !== "escalated") return { status: "error", error: "not-escalated" };
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

async function closeSession(sessionId, deps = {}) {
  const { loadFn = loadSession, saveFn = saveSession } = deps;
  const sess = await loadFn(sessionId, deps);
  if (!sess) return { status: "error", error: "not-found" };
  sess.status = "closed";
  await saveFn(sess, deps);
  return { status: "ok" };
}

module.exports = { listSessions, getTranscript, installerReply, closeSession, openSmsThread };
