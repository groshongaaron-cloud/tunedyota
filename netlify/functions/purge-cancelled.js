// netlify/functions/purge-cancelled.js
// Daily sweep (netlify.toml @daily): permanently delete bookings that have sat
// in Status="Cancelled" for 30+ days (owner decision 2026-07-27 — soft-delete
// with a 30-day trash window). Only records STAMPED by the console's cancel
// action ("Cancelled At") are eligible — legacy/unstamped Cancelled rows are
// never touched, so nothing historical gets swept.
const { cfg, listAllRecords, deleteRecord } = require("./lib/airtable.js");

const PURGE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

async function purgeCancelled(deps = {}) {
  const { env = process.env, fetchImpl = fetch, now = Date.now, log = console,
    list = (a) => listAllRecords({ fetchImpl, ...a }),
    del = (a) => deleteRecord({ fetchImpl, ...a }) } = deps;
  const c = cfg(env);
  const recs = await list({ token: c.token, baseId: c.baseId, table: c.bookings,
    filterByFormula: `{Status}="Cancelled"`, fields: ["Cancelled At", "Name"] });
  let purged = 0;
  for (const r of recs) {
    const at = Date.parse(((r.fields || {})["Cancelled At"]) || "");
    if (!at || now() - at < PURGE_AFTER_MS) continue;
    try { await del({ token: c.token, baseId: c.baseId, table: c.bookings, id: r.id }); purged++; }
    catch (e) { if (log.error) log.error("purge-cancelled", r.id, e.message); }
  }
  if (log.log) log.log(`purge-cancelled: ${purged} purged of ${recs.length} cancelled`);
  return { purged, considered: recs.length };
}

async function handler() {
  try { const out = await purgeCancelled({}); return { statusCode: 200, body: JSON.stringify(out) }; }
  catch (e) { console.error("purge-cancelled", e.message); return { statusCode: 502, body: JSON.stringify({ error: e.message }) }; }
}

module.exports = { handler, purgeCancelled, PURGE_AFTER_MS };
