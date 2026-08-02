// netlify/functions/leads-list.js
// Scoped read of the leads pipeline. Installer token required. A regular installer sees
// only their own leads; an admin sees all (optionally filtered by ?installer= or ?scope=unassigned).
const { cfg, listAllRecords } = require("./lib/airtable.js");
const { resolveInstaller, isAdmin } = require("./lib/installer-auth.js");
const { toLeadView, scopeLeads, ACTIVE_STAGES, toBookingSummary, bookingMatchesForLead, clientForLead, staleLeads, duplicateLeadsFor } = require("./lib/leads.js");
const { withCors } = require("./lib/cors.js");

function summarize(leads, today) {
  const byChannel = {}, byStage = {};
  let dueOrOverdue = 0;
  for (const l of leads) {
    byChannel[l.channel] = (byChannel[l.channel] || 0) + 1;
    byStage[l.stage] = (byStage[l.stage] || 0) + 1;
    if (ACTIVE_STAGES.includes(l.stage) && l.nextFollowup && l.nextFollowup <= today) dueOrOverdue++;
  }
  const won = byStage.Booked || 0;
  return { byChannel, byStage, dueOrOverdue, stale: staleLeads(leads, today).length, total: leads.length,
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
  // Enrichment reads — fail-open: match suggestions, linked-booking context and
  // account info are extras; the Leads tab must render even when these tables
  // are unreachable.
  const [bookingRecs, clientRecs] = await Promise.all([
    listImpl({ token: c.token, baseId: c.baseId, table: c.bookings }).catch(() => []),
    listImpl({ token: c.token, baseId: c.baseId, table: c.clients }).catch(() => []),
  ]);
  const summaries = bookingRecs.map(toBookingSummary);
  const byId = new Map(summaries.map((b) => [b.id, b]));
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const staleDaysById = new Map(staleLeads(recs.map(toLeadView), today).map((l) => [l.id, l.staleDays]));
  const all = recs.map(toLeadView).map((l) => {
    const booking = l.bookingId ? (byId.get(l.bookingId) || null) : null;
    return { ...l, booking,
      matches: bookingMatchesForLead(l, summaries, today),
      client: clientForLead(l, booking, clientRecs),
      staleDays: staleDaysById.get(l.id),
    };
  });
  const q = (event.queryStringParameters) || {};
  const filter = q.installer || q.scope || "";
  const scoped = scopeLeads(all, { key, admin, filter });
  const leads = scoped.map((l) => ({
    ...l,
    duplicates: duplicateLeadsFor(l, scoped).map((x) => ({
      id: x.id, name: x.name, channel: x.channel, stage: x.stage, createdTime: x.createdTime,
    })),
  }));
  return { statusCode: 200, headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leads, admin, summary: admin ? summarize(all, today) : summarize(leads, today) }) };
}
module.exports = { handler: withCors(handler), summarize };
