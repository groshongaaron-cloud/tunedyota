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

function page(title, body) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
    `<div style="font-family:-apple-system,Arial,sans-serif;max-width:520px;margin:60px auto;padding:0 20px;color:#3A2E26"><h1 style="color:#5B4B42">${title}</h1>${body}</div>`;
}

async function handler(event) {
  const env = process.env;
  const q = (event && event.queryStringParameters) || null;
  // On-demand HTTP call (token-gated) — any year, defaults to the current YTD.
  if (q && (q.token !== undefined || q.year !== undefined)) {
    if (!env.OTT_APPROVE_SECRET || String(q.token || "") !== env.OTT_APPROVE_SECRET) {
      return { statusCode: 401, headers: { "Content-Type": "text/html; charset=utf-8" }, body: page("Not authorized", "<p>Invalid or missing token.</p>") };
    }
    const year = /^\d{4}$/.test(String(q.year || "")) ? +q.year : new Date().getUTCFullYear();
    const r = await runAnnual(year, {});
    return { statusCode: 200, headers: { "Content-Type": "text/html; charset=utf-8" }, body: page("Annual rollup sent ✓", `<p>${r.count} calibration(s) for <strong>${year}</strong> ($${r.total}) — emailed privately to ${OWNER}.${r.unresolved ? ` ${r.unresolved} need a confirmed commission.` : ""}</p>`) };
  }
  // Scheduled (Jan 1): the prior calendar year.
  const year = new Date().getUTCFullYear() - 1;
  const r = await runAnnual(year, {});
  return { statusCode: 200, body: JSON.stringify(r) };
}

module.exports = { handler, runAnnual };
