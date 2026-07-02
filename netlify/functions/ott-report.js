// Monthly OTT completed-calibrations report — DRAFT stage (rule #1: owner approves
// before anything goes to OTT). Scheduled on the 1st; reports the month that just
// closed. It emails the OWNER a draft + CSV with a private "approve & send" link;
// it never emails OTT. The link triggers ott-report-send.js. Pricing (rule #4) and
// the annual rollup (rule #3) are added once the pricing sheet is loaded.
const { cfg, listAllRecords } = require("./lib/airtable.js");
const { sendEmail } = require("./lib/resend.js");
const { notifyOwner } = require("./lib/alert.js");
const { flattenRecords } = require("./lib/report-sources.js");
const { priorMonth, buildOttRows, renderOttCsv, renderOwnerDraftHtml } = require("./lib/ott-report.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";

function approveUrl(env, monthKey) {
  const base = env.SITE_URL || "https://tunedyota.com";
  return `${base}/.netlify/functions/ott-report-send?month=${monthKey}&token=${encodeURIComponent(env.OTT_APPROVE_SECRET || "")}`;
}

async function runOttReport(deps) {
  const { env = process.env, now = new Date(), fetchImpl = fetch,
          listAll = (a) => listAllRecords({ fetchImpl, ...a }),
          notify = notifyOwner, send = sendEmail, log = console } = deps;
  const c = cfg(env);
  const month = priorMonth(now);

  const bRecs = await listAll({ token: c.token, baseId: c.baseId, table: c.bookings });
  const rows = buildOttRows(flattenRecords(bRecs), month);

  if (!rows.length) {
    try { await notify({ fetchImpl, webhookUrl: env.SLACK_WEBHOOK_URL, text: `Tuned Yota — OTT report (${month.label}): 0 completed calibrations — nothing to approve.`, log }); }
    catch (e) { if (log.error) log.error("ott slack", e.message); }
    return { ok: true, count: 0, drafted: false };
  }

  const csv = renderOttCsv(rows);
  const missingVin = rows.filter((r) => !r.vin).length;

  // Draft goes to the OWNER only — never to OTT at this stage.
  let draftFailed = false;
  try {
    await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: OWNER, replyTo: OWNER,
      subject: `DRAFT — OTT Calibrations (${month.label}) — review & approve`,
      html: renderOwnerDraftHtml(rows, month, approveUrl(env, month.key)),
      text: `${rows.length} completed OTT calibration(s) for ${month.label} are ready to report. Review the attached CSV, then use the approve link in the HTML email to send to OTT. Nothing has been sent yet.`,
      attachments: [{ filename: `ott-calibrations-${month.key}.csv`, content: Buffer.from(csv).toString("base64") }] });
  } catch (e) { draftFailed = true; if (log.error) log.error("ott draft email", e.message); }

  let slack = `*Tuned Yota — OTT report DRAFTED* (${month.label}): ${rows.length} completed calibration${rows.length === 1 ? "" : "s"} awaiting your approval`;
  if (missingVin) slack += ` · ${missingVin} missing VIN`;
  if (draftFailed) slack += ` — DRAFT EMAIL FAILED, check logs`;
  try { await notify({ fetchImpl, webhookUrl: env.SLACK_WEBHOOK_URL, text: slack, log }); }
  catch (e) { if (log.error) log.error("ott slack", e.message); }

  return { ok: true, count: rows.length, drafted: !draftFailed, missingVin };
}

async function handler() { const r = await runOttReport({}); return { statusCode: 200, body: JSON.stringify(r) }; }
module.exports = { handler, runOttReport };
