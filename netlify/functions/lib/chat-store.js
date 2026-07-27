// netlify/functions/lib/chat-store.js
// Chat session persistence in the Airtable "Chat Sessions" table. Pure I/O
// wrappers with injected fetch/env — the transcript lives as a JSON array in a
// long-text field; session identity is the widget-generated Session ID string.
const { cfg, escapeFormula, listRecords, createRecord, updateRecord } = require("./airtable.js");

const TABLE = (env) => env.AIRTABLE_CHAT_TABLE || "Chat Sessions";
const STALE_AI_MS = 30 * 60 * 1000;         // ai sessions close after 30 min idle
const STALE_ESCALATED_MS = 72 * 60 * 60 * 1000; // escalated sessions live 72 h (matches AI pause)

function parseTranscript(s) { try { const v = JSON.parse(s || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } }
function isStale(sess, nowMs) {
  const last = Date.parse(sess.lastActivity || "") || 0;
  const limit = sess.status === "escalated" ? STALE_ESCALATED_MS : STALE_AI_MS;
  return nowMs - last > limit;
}

// 72-hour human-takeover pause. "auto" (default): the AI goes quiet for 72 h
// after the installer's LATEST reply, rolling. Manual "on"/"off" (console
// toggle) beat the clock in both directions.
const AI_PAUSE_MS = 72 * 60 * 60 * 1000;
function aiPaused(sess, nowMs) {
  if (sess.aiMode === "off") return true;
  if (sess.aiMode === "on") return false;
  let lastInstallerAt = 0;
  for (const t of sess.turns || []) {
    if (t.role === "installer" && (t.at || 0) > lastInstallerAt) lastInstallerAt = t.at;
  }
  return !!lastInstallerAt && nowMs - lastInstallerAt < AI_PAUSE_MS;
}

function fromRecord(r) {
  const f = r.fields || {};
  return {
    id: f["Session ID"] || "", recordId: r.id, status: f.Status || "ai",
    pageContext: f["Page Context"] || "", customerName: f["Customer Name"] || "",
    phone: f.Phone || "", vehicle: f.Vehicle || "", city: f.City || "",
    installer: f.Installer || "", turns: parseTranscript(f.Transcript),
    lastActivity: f["Last Activity"] || "",
    lastRelayedAt: f["Last Relayed At"] || "",
    aiMode: ["on", "off"].includes(f["AI Mode"]) ? f["AI Mode"] : "auto",
  };
}

async function loadSession(id, { env = process.env, fetchImpl = fetch } = {}) {
  const c = cfg(env);
  const recs = await listRecords({ fetchImpl, token: c.token, baseId: c.baseId, table: TABLE(env),
    filterByFormula: `{Session ID}="${escapeFormula(id)}"` });
  if (recs.length > 1) recs.sort((a, b) => (String((a.fields || {}).Created || "") < String((b.fields || {}).Created || "") ? -1 : 1));
  return recs.length ? fromRecord(recs[0]) : null;
}

// Load the most recently active escalated session for an installer key (SMS relay).
async function loadEscalatedForInstaller(key, { env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  const c = cfg(env);
  const recs = await listRecords({ fetchImpl, token: c.token, baseId: c.baseId, table: TABLE(env),
    filterByFormula: `AND({Installer}="${escapeFormula(key)}",{Status}="escalated")` });
  const sessions = recs.map(fromRecord).filter((s) => !isStale(s, now()));
  sessions.sort((a, b) => (a.lastActivity < b.lastActivity ? 1 : -1));
  return sessions[0] || null;
}

async function saveSession(sess, { env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  const c = cfg(env);
  const fields = {
    "Session ID": sess.id, Status: sess.status, "Page Context": sess.pageContext || "",
    "Customer Name": sess.customerName || "", Phone: sess.phone || "", Vehicle: sess.vehicle || "",
    City: sess.city || "", Installer: sess.installer || "",
    Transcript: JSON.stringify(sess.turns || []), "Last Activity": new Date(now()).toISOString(),
    "Last Relayed At": sess.lastRelayedAt || "", "AI Mode": sess.aiMode || "auto",
  };
  if (!sess.recordId) {
    fields.Created = new Date(now()).toISOString();
    const r = await createRecord({ fetchImpl, token: c.token, baseId: c.baseId, table: TABLE(env), fields });
    sess.recordId = r.id;
    return sess;
  }
  await updateRecord({ fetchImpl, token: c.token, baseId: c.baseId, table: TABLE(env), id: sess.recordId, fields });
  return sess;
}

// DM feeder: latest non-closed session for a sender (ids "fb:<PSID>" or
// "fb:<PSID>:<ts>"). Best-effort: null on store failure — caller starts fresh.
async function loadActiveByPrefix(prefix, { env = process.env, fetchImpl = fetch } = {}) {
  const c = cfg(env);
  const p = escapeFormula(String(prefix || ""));
  try {
    const recs = await listRecords({
      fetchImpl, token: c.token, baseId: c.baseId, table: TABLE(env),
      filterByFormula: `AND(OR({Session ID}="${p}",FIND("${p}:", {Session ID})=1), {Status}!="closed")`,
      fields: ["Session ID", "Status", "Transcript", "Page Context", "Customer Name", "Phone", "Vehicle", "City", "Installer", "Last Activity", "Last Relayed At", "AI Mode"],
    });
    if (!recs.length) return null;
    const sessions = recs.map(fromRecord).filter((s) => s.status !== "closed").sort((a, b) => (a.lastActivity < b.lastActivity ? 1 : -1));
    return sessions[0] || null;
  } catch (e) { return null; }
}

module.exports = { loadSession, loadEscalatedForInstaller, loadActiveByPrefix, saveSession, parseTranscript, isStale, aiPaused, STALE_AI_MS, STALE_ESCALATED_MS, AI_PAUSE_MS, TABLE };
