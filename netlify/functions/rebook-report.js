// netlify/functions/rebook-report.js
// Weekly scheduled function (Mondays). Emails info@ the full outstanding rebook/
// waitlist backlog, grouped by location + installer.
const { cfg, listAllRecords } = require("./lib/airtable.js");
const { sendEmail } = require("./lib/resend.js");
const { renderRebookReport } = require("./lib/rebook-render.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";
function flatten(records) { return (records || []).map((r) => ({ ...r.fields, id: r.id })); }

async function runRebookReport(deps) {
  const { env = process.env, fetchImpl = fetch,
          listAll = (a) => listAllRecords({ fetchImpl, ...a }),
          send = sendEmail, log = console } = deps;
  const c = cfg(env);
  const recs = flatten(await listAll({ token: c.token, baseId: c.baseId, table: c.priority }));
  const outstanding = recs.filter((r) => !r.Notified);
  const m = renderRebookReport(outstanding, { title: "Weekly rebook backlog" });
  await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: OWNER, replyTo: OWNER,
    subject: m.subject, html: m.html, text: m.text });
  if (log.info) log.info("rebook-report sent", outstanding.length);
  return { ok: true, outstanding: outstanding.length };
}
async function handler() { const r = await runRebookReport({}); return { statusCode: 200, body: JSON.stringify(r) }; }
module.exports = { handler, runRebookReport };
