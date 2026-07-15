// netlify/functions/lead-followups.js
// Scheduled morning sweep: web-push each installer the count of their leads due today
// or overdue for follow-up, deep-linking into the console's Leads view.
const { cfg, listAllRecords } = require("./lib/airtable.js");
const { toLeadView, dueLeads } = require("./lib/leads.js");
const { sendPush } = require("./lib/push.js");

async function runFollowups(deps = {}) {
  const env = deps.env || process.env;
  const today = deps.today || new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const listImpl = deps.listImpl || ((a) => listAllRecords({ ...a }));
  const pushImpl = deps.pushImpl || sendPush;
  const c = cfg(env);
  let recs = [];
  try { recs = await listImpl({ token: c.token, baseId: c.baseId, table: c.priority }); } catch (e) { return { installersNotified: 0, error: "store-unavailable" }; }
  const groups = dueLeads(recs.map(toLeadView), today);
  let notified = 0;
  for (const [key, leads] of Object.entries(groups)) {
    if (key === "unassigned") continue;                 // no device owner to notify
    const n = leads.length;
    try {
      await pushImpl(key, { title: "Leads to follow up", body: `⏰ ${n} lead${n === 1 ? "" : "s"} to follow up today`,
        data: { url: "/installer.html#leads" } }, { env });
      notified++;
    } catch (e) { /* non-blocking */ }
  }
  return { installersNotified: notified, today };
}

async function handler() {
  const out = await runFollowups({});
  return { statusCode: 200, body: JSON.stringify(out) };
}
module.exports = { handler, runFollowups };
