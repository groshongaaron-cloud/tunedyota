const { cfg, listAllRecords } = require("./lib/airtable.js");
const { sendEmail } = require("./lib/resend.js");
const { notifyOwner } = require("./lib/alert.js");
const { eventsList, flattenRecords } = require("./lib/report-sources.js");
const { buildReport } = require("./lib/report-metrics.js");
const { aggregateFunnel } = require("./lib/funnel.js");
const { renderSlack, renderEmailHtml, renderContactsCsv } = require("./lib/report-render.js");
const { MARKETS } = require("./lib/markets.js");
const { INSTALLERS } = require("./lib/routing.js");

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
  const bookings = flattenRecords(bRecs);
  const priority = flattenRecords(pRecs);
  const events = eventsList();
  const report = buildReport({ bookings, priority, leads: [], events, capacity: 12, now });

  try {
    const fRecs = await listAll({ token: c.token, baseId: c.baseId, table: env.AIRTABLE_FUNNEL_TABLE || "Funnel Events" });
    const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const fEvents = flattenRecords(fRecs).filter((e) => e.createdTime && new Date(e.createdTime).getTime() >= monthStart);
    const f = aggregateFunnel(fEvents);
    if (f.totalSessions > 0) report.funnel = f;
  } catch (e) { if (log.error) log.error("funnel fetch", e.message); }

  const attach = (rep) => [{ filename: "contacts.csv", content: Buffer.from(renderContactsCsv(rep)).toString("base64") }];

  // (1) Full month-to-date digest → owner box (info@). Recipient unchanged.
  const masterTo = env.REPORT_TO || "info@tunedyota.com";
  let emailFailed = false;
  try {
    await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: masterTo,
      subject: `Tuned Yota — Submissions Digest (${report.generatedFor.monthLabel})`,
      html: renderEmailHtml(report), attachments: attach(report) });
  } catch (e) { emailFailed = true; if (log.error) log.error("report email", e.message); }

  // (2) Per-installer booking reports → each installer receives only the events
  //     and bookings in their own region (markets.js city → inst). The installer
  //     whose email is the owner box already has the full digest, so skip them.
  const regionFailures = [];
  for (const inst of Object.values(INSTALLERS)) {
    if (!inst.email || inst.email.toLowerCase() === masterTo.toLowerCase()) continue;
    const cities = new Set(MARKETS.filter((m) => m.inst === inst.key).map((m) => m.city.toLowerCase()));
    const inRegion = (x) => cities.has(String(x.City || "").trim().toLowerCase());
    const iEvents = events.filter((e) => e.installerKey === inst.key);
    const iBookings = bookings.filter(inRegion);
    const iPriority = priority.filter(inRegion);
    if (!iEvents.length && !iBookings.length) continue; // nothing in this region — no email
    const iReport = buildReport({ bookings: iBookings, priority: iPriority, leads: [], events: iEvents, capacity: 12, now });
    try {
      await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: inst.email,
        subject: `Tuned Yota — ${inst.name.split(" ")[0]}'s Region Bookings (${iReport.generatedFor.monthLabel})`,
        html: renderEmailHtml(iReport), attachments: attach(iReport) });
    } catch (e) { regionFailures.push(inst.key); if (log.error) log.error("region report email", inst.key, e.message); }
  }

  report.contactsEmailFailed = emailFailed;
  let slack = renderSlack(report);
  if (emailFailed) slack += `\n(full report email failed — domain pending verification)`;
  if (regionFailures.length) slack += `\n(region report email failed for: ${regionFailures.join(", ")})`;
  try { await notify({ fetchImpl, webhookUrl: env.SLACK_WEBHOOK_URL, text: slack, log }); }
  catch (e) { if (log.error) log.error("report slack", e.message); }
  return { ok: true, emailFailed, regionFailures };
}

async function handler() { const r = await runReport({}); return { statusCode: 200, body: JSON.stringify(r) }; }
module.exports = { handler, runReport };
