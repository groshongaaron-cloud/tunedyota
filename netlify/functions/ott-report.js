// Monthly OTT commission submission — DRAFT stage (rule #1: owner approves before
// anything goes to OTT). Scheduled on the 1st for the month just closed. Emails the
// OWNER a filled .xlsx (OTT's 14-column format) + a private approve link; never
// emails OTT. The link triggers ott-report-send.js.
const { cfg, listAllRecords } = require("./lib/airtable.js");
const { sendEmail } = require("./lib/resend.js");
const { notifyOwner } = require("./lib/alert.js");
const { flattenRecords } = require("./lib/report-sources.js");
const { priorMonth, buildSubmissionRows, renderOttXlsx, renderOwnerDraftHtml, totalCommission, unresolved } = require("./lib/ott-report.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";

// Points at the online REVIEW page (review → download .xlsx → send), not straight
// at the send endpoint, so the owner reviews before anything reaches OTT.
function approveUrl(env, monthKey) {
  const base = env.SITE_URL || "https://tunedyota.com";
  return `${base}/.netlify/functions/ott-report-review?month=${monthKey}&token=${encodeURIComponent(env.OTT_APPROVE_SECRET || "")}`;
}

async function runOttReport(deps) {
  const { env = process.env, now = new Date(), fetchImpl = fetch,
          listAll = (a) => listAllRecords({ fetchImpl, ...a }),
          notify = notifyOwner, send = sendEmail, log = console } = deps;
  const c = cfg(env);
  const month = priorMonth(now);

  const bRecs = await listAll({ token: c.token, baseId: c.baseId, table: c.bookings });
  const subRows = buildSubmissionRows(flattenRecords(bRecs), month, { retailer: env.OTT_RETAILER, sendDate: "" });

  if (!subRows.length) {
    try { await notify({ fetchImpl, webhookUrl: env.SLACK_WEBHOOK_URL, text: `Tuned Yota — OTT commission draft (${month.label}): 0 completed calibrations — nothing to approve.`, log }); }
    catch (e) { if (log.error) log.error("ott slack", e.message); }
    return { ok: true, count: 0, drafted: false };
  }

  const xlsx = renderOttXlsx(subRows);
  const u = unresolved(subRows).length, total = totalCommission(subRows);

  let draftFailed = false;
  try {
    await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: OWNER, replyTo: OWNER,
      subject: `DRAFT — OTT Commissions (${month.label}) — review & approve`,
      html: renderOwnerDraftHtml(subRows, month, approveUrl(env, month.key)),
      text: `${subRows.length} completed calibration(s) for ${month.label}, commission total $${total}${u ? `, ${u} needing confirmation` : ""}. Review the attached .xlsx or open the online review link to check it, download the Excel, and send to OTT. Nothing has been sent yet.`,
      attachments: [{ filename: `ott-commissions-${month.key}.xlsx`, content: Buffer.from(xlsx).toString("base64") }] });
  } catch (e) { draftFailed = true; if (log.error) log.error("ott draft email", e.message); }

  let slack = `*Tuned Yota — OTT commission DRAFTED* (${month.label}): ${subRows.length} calibration${subRows.length === 1 ? "" : "s"} · $${total} · awaiting your approval`;
  if (u) slack += ` · ${u} need commission confirmed`;
  if (draftFailed) slack += ` — DRAFT EMAIL FAILED, check logs`;
  try { await notify({ fetchImpl, webhookUrl: env.SLACK_WEBHOOK_URL, text: slack, log }); }
  catch (e) { if (log.error) log.error("ott slack", e.message); }

  return { ok: true, count: subRows.length, drafted: !draftFailed, unresolved: u, total };
}

async function handler() { const r = await runOttReport({}); return { statusCode: 200, body: JSON.stringify(r) }; }
module.exports = { handler, runOttReport };
