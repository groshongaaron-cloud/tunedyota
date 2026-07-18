// netlify/functions/lib/chat-store.js
// Chat session persistence in the Airtable "Chat Sessions" table. Pure I/O
// wrappers with injected fetch/env — the transcript lives as a JSON array in a
// long-text field; session identity is the widget-generated Session ID string.
const { cfg, escapeFormula, listRecords, createRecord, updateRecord } = require("./airtable.js");

const TABLE = (env) => env.AIRTABLE_CHAT_TABLE || "Chat Sessions";
const STALE_AI_MS = 30 * 60 * 1000;         // ai sessions close after 30 min idle
const STALE_ESCALATED_MS = 2 * 60 * 60 * 1000; // escalated sessions get 2 h

function parseTranscript(s) { try { const v = JSON.parse(s || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } }
function isStale(sess, nowMs) {
  const last = Date.parse(sess.lastActivity || "") || 0;
  const limit = sess.status === "escalated" ? STALE_ESCALATED_MS : STALE_AI_MS;
  return nowMs - last > limit;
}

function fromRecord(r) {
  const f = r.fields || {};
  return {
    id: f["Session ID"] || "", recordId: r.id, status: f.Status || "ai",
    pageContext: f["Page Context"] || "", customerName: f["Customer Name"] || "",
    phone: f.Phone || "", vehicle: f.Vehicle || "", city: f.City || "",
    installer: f.Installer || "", turns: parseTranscript(f.Transcript),
    lastActivity: f["Last Activity"] || "",
  };
}

async function loadSession(id, { env = process.env, fetchImpl = fetch } = {}) {
  const c = cfg(env);
  const recs = await listRecords({ fetchImpl, token: c.token, baseId: c.baseId, table: TABLE(env),
    filterByFormula: `{Session ID}="${escapeFormula(id)}"` });
  return recs.length ? fromRecord(recs[0]) : null;
}

// Load the most recently active escalated session for an installer key (SMS relay).
async function loadEscalatedForInstaller(key, { env = process.env, fetchImpl = fetch } = {}) {
  const c = cfg(env);
  const recs = await listRecords({ fetchImpl, token: c.token, baseId: c.baseId, table: TABLE(env),
    filterByFormula: `AND({Installer}="${escapeFormula(key)}",{Status}="escalated")` });
  const sessions = recs.map(fromRecord).filter((s) => !isStale(s, Date.now()));
  sessions.sort((a, b) => String(b.lastActivity).localeCompare(String(a.lastActivity)));
  return sessions[0] || null;
}

async function saveSession(sess, { env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  const c = cfg(env);
  const fields = {
    "Session ID": sess.id, Status: sess.status, "Page Context": sess.pageContext || "",
    "Customer Name": sess.customerName || "", Phone: sess.phone || "", Vehicle: sess.vehicle || "",
    City: sess.city || "", Installer: sess.installer || "",
    Transcript: JSON.stringify(sess.turns || []), "Last Activity": new Date(now()).toISOString(),
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

module.exports = { loadSession, loadEscalatedForInstaller, saveSession, parseTranscript, isStale, STALE_AI_MS, STALE_ESCALATED_MS, TABLE };
