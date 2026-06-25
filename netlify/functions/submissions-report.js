const { cfg, listAllRecords } = require("./lib/airtable.js");
const { sendEmail } = require("./lib/resend.js");
const { notifyOwner } = require("./lib/alert.js");
const { eventsList, flattenRecords } = require("./lib/report-sources.js");
const { buildReport } = require("./lib/report-metrics.js");
const { renderSlack, renderEmailHtml, renderContactsCsv } = require("./lib/report-render.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";

async function runReport(deps) {
  const { env = process.env, now = new Date(), fetchImpl = fetch,
          listAll = (a) => listAllRecords({ fetchImpl, ...a }),
          notify = notifyOwner, send = sendEmail, log = console } = deps;
  const c = cfg(env);
  const [bRecs, pRecs] = await Promise.all([
    listAll({ token: c.token, baseId: c.baseId, table: c.bookings }),
    listAll({ token: c.token, baseId: c.baseId, table: c.priority }),
  ]);
  const report = buildReport({
    bookings: flattenRecords(bRecs), priority: flattenRecords(pRecs), leads: [],
    events: eventsList(), capacity: 12, now,
  });

  const csv = renderContactsCsv(report);
  let emailFailed = false;
  try {
    await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: env.REPORT_TO || "info@tunedyota.com",
      subject: `Tuned Yota — Submissions Digest (${report.generatedFor.monthLabel})`,
      html: renderEmailHtml(report),
      attachments: [{ filename: "contacts.csv", content: Buffer.from(csv).toString("base64") }] });
  } catch (e) { emailFailed = true; if (log.error) log.error("report email", e.message); }

  report.contactsEmailFailed = emailFailed;
  let slack = renderSlack(report);
  if (emailFailed) slack += `\n(full report email failed — domain pending verification)`;
  try { await notify({ fetchImpl, webhookUrl: env.SLACK_WEBHOOK_URL, text: slack, log }); }
  catch (e) { if (log.error) log.error("report slack", e.message); }
  return { ok: true, emailFailed };
}

async function handler() { const r = await runReport({}); return { statusCode: 200, body: JSON.stringify(r) }; }
module.exports = { handler, runReport };
