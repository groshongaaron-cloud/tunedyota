// netlify/functions/leads-list.js
// Scoped read of the leads pipeline. Installer token required. A regular installer sees
// only their own leads; an admin sees all (optionally filtered by ?installer= or ?scope=unassigned).
const { cfg, listAllRecords } = require("./lib/airtable.js");
const { resolveInstaller, isAdmin } = require("./lib/installer-auth.js");
const { toLeadView, scopeLeads } = require("./lib/leads.js");

function summarize(leads) {
  const byChannel = {}, byStage = {};
  let dueOrOverdue = 0;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  for (const l of leads) {
    byChannel[l.channel] = (byChannel[l.channel] || 0) + 1;
    byStage[l.stage] = (byStage[l.stage] || 0) + 1;
    if (["New", "Contacted", "Following up"].includes(l.stage) && l.nextFollowup && l.nextFollowup <= today) dueOrOverdue++;
  }
  const won = byStage.Booked || 0;
  return { byChannel, byStage, dueOrOverdue, total: leads.length,
    conversionRate: leads.length ? Math.round((won / leads.length) * 100) : 0 };
}

async function handler(event, ctx = {}) {
  const env = ctx.env || process.env;
  const listImpl = ctx.listImpl || ((a) => listAllRecords({ ...a }));
  const key = resolveInstaller(event.headers || {}, env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  const admin = isAdmin(key, env);
  const c = cfg(env);
  let recs;
  try { recs = await listImpl({ token: c.token, baseId: c.baseId, table: c.priority }); }
  catch (e) { return { statusCode: 502, body: JSON.stringify({ error: "store-unavailable" }) }; }
  const all = recs.map(toLeadView);
  const q = (event.queryStringParameters) || {};
  const filter = q.installer || q.scope || "";
  const leads = scopeLeads(all, { key, admin, filter });
  return { statusCode: 200, headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leads, admin, summary: admin ? summarize(all) : summarize(leads) }) };
}
module.exports = { handler, summarize };
