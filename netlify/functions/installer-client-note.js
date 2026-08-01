// netlify/functions/installer-client-note.js
// Append a stamped note to the CLIENT record (Leads / Priority List row) — never
// the booking. Owner rule (2026-07-31): notes travel with the client, so they're
// simply there on the second, third, or zeroth booking. Accepts {leadId, note}
// from a lead card, or {bookingId, note} from a booking card — the booking path
// resolves the client (linked lead → phone → email → mint a linked lead).
// Never bumps Last Contact: a note is not a contact, and Last Contact drives
// the stale/nurture logic. Works on Completed/Cancelled bookings — the
// report-critical-field lock protects the booking record, which this never touches.
const { cfg, getRecord, updateRecord, createRecord, createTolerant, listAllRecords } = require("./lib/airtable.js");
const { resolveInstaller, isAdmin } = require("./lib/installer-auth.js");
const { toLeadView, logLine, appendActivity, normalizePhone, normalizeEmail } = require("./lib/leads.js");
const { normalizeInstallerKey, keyToInstaller } = require("./lib/routing.js");
const { getMarket } = require("./lib/markets.js");

async function processClientNote(body, deps) {
  const { env = process.env, fetchImpl = fetch, key, admin = false, now = new Date(), log = console,
          get = (a) => getRecord({ fetchImpl, ...a }),
          list = (a) => listAllRecords({ fetchImpl, ...a }),
          update = (a) => updateRecord({ fetchImpl, ...a }),
          create = (a) => createRecord({ fetchImpl, ...a }) } = deps;
  const d = body || {};
  const note = String(d.note || "").trim();
  if (!note) return { status: "error", error: "missing-note" };
  if (note.length > 500) return { status: "error", error: "note-too-long" };
  // Stamp is server-side (time + installer key) so history can't be forged.
  const line = logLine(now, `${key}: ${note}`);
  const c = cfg(env);

  const appendTo = async (leadId, existing) => {
    const notes = appendActivity(existing || "", line);
    // Plain update, NOT updateTolerant — tolerant would silently drop the one
    // field that matters. The column is created at ship time (ensure-field.mjs).
    await update({ token: c.token, baseId: c.baseId, table: c.priority, id: leadId, fields: { "Client Notes": notes } });
    return notes;
  };

  if (d.leadId) {
    let rec;
    try { rec = await get({ token: c.token, baseId: c.baseId, table: c.priority, id: d.leadId }); }
    catch (e) { if (log.error) log.error("client-note get lead", e.message); return { status: "error", error: "store-unavailable" }; }
    const lead = toLeadView(rec);
    if (!admin && (lead.installer || "") !== key) return { status: "error", error: "not-yours" };
    try { return { status: "ok", leadId: d.leadId, notes: await appendTo(d.leadId, lead.clientNotes) }; }
    catch (e) { if (log.error) log.error("client-note update", e.message); return { status: "error", error: "store-unavailable" }; }
  }

  return { status: "error", error: "missing-target" };
}

async function handler(event) {
  const key = resolveInstaller(event.headers || {}, process.env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  const out = await processClientNote(body, { key, admin: isAdmin(key, process.env) });
  const code = out.status !== "error" ? 200
    : out.error === "not-yours" ? 403
    : out.error === "store-unavailable" ? 502 : 400;
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, processClientNote };
