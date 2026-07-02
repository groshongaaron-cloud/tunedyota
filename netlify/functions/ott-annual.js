// Annual OTT calibration rollup — Tuned Yota INTERNAL (Track C). Runs on Jan 1 for
// the prior calendar year, and on-demand via a token-gated HTTP call (?year=YYYY)
// for the current year-to-date. Emails info@tunedyota.com ONLY — private, never OTT.
const { cfg, listAllRecords } = require("./lib/airtable.js");
const { sendEmail } = require("./lib/resend.js");
const { notifyOwner } = require("./lib/alert.js");
const { flattenRecords } = require("./lib/report-sources.js");
const { buildAnnual, renderAnnualXlsx, renderAnnualEmailHtml } = require("./lib/ott-annual.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";

async function runAnnual(year, deps) {
  const { env = process.env, fetchImpl = fetch,
          listAll = (a) => listAllRecords({ fetchImpl, ...a }),
          notify = notifyOwner, send = sendEmail, log = console } = deps;
  const c = cfg(env);
  const bRecs = await listAll({ token: c.token, baseId: c.baseId, table: c.bookings });
  const a = buildAnnual(flattenRecords(bRecs), year);
  const xlsx = renderAnnualXlsx(a);

  let emailFailed = false;
  try {
    await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: OWNER, replyTo: OWNER,
      subject: `Tuned Yota — OTT Calibration Annual Rollup (${year})`,
      html: renderAnnualEmailHtml(a),
      text: `${a.count} calibration(s) in ${year}, OTT commission total $${a.totalCommission}. Private Tuned Yota rollup attached (Summary + Detail sheets). Not sent to OTT.`,
      attachments: [{ filename: `ott-annual-${year}.xlsx`, content: Buffer.from(xlsx).toString("base64") }] });
  } catch (e) { emailFailed = true; if (log.error) log.error("annual email", e.message); }

  let slack = `*Tuned Yota — OTT annual rollup* (${year}): ${a.count} calibration${a.count === 1 ? "" : "s"} · $${a.totalCommission}`;
  if (a.unresolvedCount) slack += ` · ${a.unresolvedCount} need confirm`;
  slack += emailFailed ? " — EMAIL FAILED, check logs" : " → info@ (private)";
  try { await notify({ fetchImpl, webhookUrl: env.SLACK_WEBHOOK_URL, text: slack, log }); }
  catch (e) { if (log.error) log.error("annual slack", e.message); }
  return { ok: true, year, count: a.count, total: a.totalCommission, unresolved: a.unresolvedCount, emailFailed };
}

// Scheduled (Jan 1) only — Netlify scheduled functions aren't HTTP-invokable.
// On-demand runs for any year live in ott-annual-run.js (a token-gated HTTP fn).
async function handler() {
  const year = new Date().getUTCFullYear() - 1;
  const r = await runAnnual(year, {});
  return { statusCode: 200, body: JSON.stringify(r) };
}

module.exports = { handler, runAnnual };
