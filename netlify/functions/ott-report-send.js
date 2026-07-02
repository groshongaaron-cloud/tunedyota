// OTT report — APPROVE & SEND stage (rule #1). Token-gated HTTP endpoint the owner
// hits from the draft email's approve link. Rebuilds the named month's report from
// Airtable (source of truth) and emails it to the OTT recipients (rule #2), CC owner.
const { cfg, listAllRecords } = require("./lib/airtable.js");
const { sendEmail } = require("./lib/resend.js");
const { notifyOwner } = require("./lib/alert.js");
const { flattenRecords } = require("./lib/report-sources.js");
const { monthFromKey, buildOttRows, renderOttCsv, renderOttEmailHtml, recipients } = require("./lib/ott-report.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";

async function approveAndSend(params, deps) {
  const { env = process.env, fetchImpl = fetch,
          listAll = (a) => listAllRecords({ fetchImpl, ...a }),
          notify = notifyOwner, send = sendEmail, log = console } = deps;

  // Fail closed: a secret must be configured and must match.
  if (!env.OTT_APPROVE_SECRET || String(params.token || "") !== env.OTT_APPROVE_SECRET) {
    return { status: "error", code: 401, error: "unauthorized" };
  }
  const month = monthFromKey(params.month);
  if (!month) return { status: "error", code: 400, error: "bad-month" };

  const c = cfg(env);
  const bRecs = await listAll({ token: c.token, baseId: c.baseId, table: c.bookings });
  const rows = buildOttRows(flattenRecords(bRecs), month);
  if (!rows.length) return { status: "empty", code: 200, month: month.key, label: month.label };

  const to = recipients(env);
  const csv = renderOttCsv(rows);
  try {
    await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to, cc: OWNER, replyTo: OWNER,
      subject: `Tuned Yota — Completed OTT Calibrations (${month.label})`,
      html: renderOttEmailHtml(rows, month),
      text: `${rows.length} completed OTT calibration(s) for ${month.label}. Detail attached as CSV.`,
      attachments: [{ filename: `ott-calibrations-${month.key}.csv`, content: Buffer.from(csv).toString("base64") }] });
  } catch (e) {
    if (log.error) log.error("ott send", e.message);
    return { status: "error", code: 502, error: "send-failed", detail: e.message };
  }

  try { await notify({ fetchImpl, webhookUrl: env.SLACK_WEBHOOK_URL, text: `*Tuned Yota — OTT report SENT* (${month.label}): ${rows.length} calibration${rows.length === 1 ? "" : "s"} → ${to.join(", ")} (approved by owner)`, log }); }
  catch (e) { if (log.error) log.error("ott slack", e.message); }
  return { status: "sent", code: 200, count: rows.length, month: month.key, label: month.label, to };
}

function page(title, body) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
    `<div style="font-family:-apple-system,Arial,sans-serif;max-width:520px;margin:60px auto;padding:0 20px;color:#3A2E26">` +
    `<h1 style="color:#5B4B42">${title}</h1>${body}</div>`;
}

async function handler(event) {
  const q = (event && event.queryStringParameters) || {};
  const out = await approveAndSend({ month: q.month, token: q.token }, {});
  const html =
    out.status === "sent" ? page("Report sent ✓", `<p>${out.count} calibration(s) for <strong>${out.label}</strong> were sent to OTT (${out.to.join(", ")}), CC ${OWNER}.</p>`)
    : out.status === "empty" ? page("Nothing to send", `<p>No completed calibrations found for <strong>${out.label}</strong>.</p>`)
    : out.error === "unauthorized" ? page("Not authorized", `<p>This approval link is invalid or expired.</p>`)
    : out.error === "bad-month" ? page("Bad request", `<p>Missing or invalid month.</p>`)
    : page("Send failed", `<p>The report could not be sent. It has not gone to OTT. Please try again or check the logs.</p>`);
  return { statusCode: out.code || 500, headers: { "Content-Type": "text/html; charset=utf-8" }, body: html };
}

module.exports = { handler, approveAndSend };
