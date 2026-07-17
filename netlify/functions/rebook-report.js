// netlify/functions/rebook-report.js
// Weekly scheduled function (Mondays). Emails info@ the full outstanding rebook/
// waitlist backlog, grouped by location + installer.
const { cfg, listAllRecords } = require("./lib/airtable.js");
const { sendEmail } = require("./lib/resend.js");
const { notifyOwner } = require("./lib/alert.js");
const { renderRebookReport } = require("./lib/rebook-render.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";
function flatten(records) { return (records || []).map((r) => ({ ...r.fields, id: r.id })); }

async function runRebookReport(deps) {
  const { env = process.env, fetchImpl = fetch,
          listAll = (a) => listAllRecords({ fetchImpl, ...a }),
          send = sendEmail, notify = notifyOwner, log = console } = deps;
  const c = cfg(env);
  const recs = flatten(await listAll({ token: c.token, baseId: c.baseId, table: c.priority }));
  const outstanding = recs.filter((r) => !r.Notified);
  const m = renderRebookReport(outstanding, { title: "Weekly rebook backlog" });
  // A Resend failure must not 500 the scheduled run silently — alert Slack
  // (independent of Resend) so the owner knows the weekly report didn't go out.
  try {
    await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: OWNER, replyTo: OWNER,
      subject: m.subject, html: m.html, text: m.text });
  } catch (e) {
    if (log.error) log.error("rebook-report send", e.message);
    try { await notify({ fetchImpl, webhookUrl: env.SLACK_WEBHOOK_URL, text: `⚠️ Weekly rebook report FAILED to send: ${e.message}`, log }); }
    catch (e2) { if (log.error) log.error("rebook-report notify", e2.message); }
    return { ok: false, error: e.message, outstanding: outstanding.length };
  }
  if (log.info) log.info("rebook-report sent", outstanding.length);
  return { ok: true, outstanding: outstanding.length };
}
async function handler() { const r = await runRebookReport({}); return { statusCode: 200, body: JSON.stringify(r) }; }
module.exports = { handler, runRebookReport };
