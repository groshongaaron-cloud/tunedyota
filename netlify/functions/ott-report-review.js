// OTT commission submission — ONLINE REVIEW (token-gated HTTP). The owner opens
// this from the draft/reminder email to review the month's report in the browser,
// download the exact .xlsx that will go to OTT, and — from here — send it. It does
// NOT send anything itself; the "Send to OTT" button points at ott-report-send.js.
//   ?month=YYYY-MM&token=…            → HTML review page
//   ?month=YYYY-MM&token=…&format=xlsx → downloads the OTT workbook (.xlsx)
const { cfg, listAllRecords } = require("./lib/airtable.js");
const { flattenRecords } = require("./lib/report-sources.js");
const { monthFromKey, priorMonth, buildSubmissionRows, renderOttXlsx, subTable, totalCommission, unresolved, recipients } = require("./lib/ott-report.js");

function base(env) { return env.SITE_URL || "https://tunedyota.com"; }
function reviewUrl(env, monthKey) {
  return `${base(env)}/.netlify/functions/ott-report-review?month=${monthKey}&token=${encodeURIComponent(env.OTT_APPROVE_SECRET || "")}`;
}

function page(title, body) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
    `<div style="font-family:-apple-system,Arial,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;color:#3A2E26"><h1 style="color:#5B4B42">${title}</h1>${body}</div>`;
}

function reviewPageHtml(subRows, month, env) {
  const u = unresolved(subRows).length, total = totalCommission(subRows), to = recipients(env);
  const tok = encodeURIComponent(env.OTT_APPROVE_SECRET || "");
  const xlsxUrl = `${base(env)}/.netlify/functions/ott-report-review?month=${month.key}&token=${tok}&format=xlsx`;
  const sendUrl = `${base(env)}/.netlify/functions/ott-report-send?month=${month.key}&token=${tok}`;
  let body = `<p style="color:#7c8472">${month.label} · ${subRows.length} completed calibration${subRows.length === 1 ? "" : "s"} · commission total <strong>$${total}</strong></p>`;
  body += `<p><strong>Nothing has been sent to OTT yet.</strong> Review the rows below, download the Excel workbook to check it, then send.</p>`;
  if (u) body += `<p style="color:#8a2a2a"><strong>${u} row(s) need a commission confirmed</strong> — the amount was ambiguous or the platform was bench (BB). Fix the close-out data or edit those cells in the downloaded .xlsx before submitting.</p>`;
  body += subTable(subRows);
  body += `<div style="margin:26px 0;display:flex;gap:12px;flex-wrap:wrap">`;
  body += `<a href="${xlsxUrl}" style="background:#efeae4;color:#3A2E26;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700;border:1px solid #d8d0c6">⬇ Download Excel (.xlsx)</a>`;
  body += `<a href="${sendUrl}" onclick="return confirm('Send the ${month.label} OTT commission submission to OTT (${to.join(', ')})? This emails OTT the workbook.')" style="background:#5B4B42;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700">Send to OTT →</a>`;
  body += `</div>`;
  body += `<p style="color:#7c8472;font-size:13px">Sending emails the workbook to ${to.join(", ")} (CC you). This page is private to you — do not forward the link.</p>`;
  return page(`OTT Commission Review — ${month.label}`, body);
}

async function review(params, deps) {
  const { env = process.env, now = new Date(), fetchImpl = fetch,
          listAll = (a) => listAllRecords({ fetchImpl, ...a }) } = deps;
  if (!env.OTT_APPROVE_SECRET || String(params.token || "") !== env.OTT_APPROVE_SECRET) {
    return { status: "error", code: 401, error: "unauthorized" };
  }
  const month = params.month ? monthFromKey(params.month) : priorMonth(now);
  if (!month) return { status: "error", code: 400, error: "bad-month" };

  const c = cfg(env);
  const bRecs = await listAll({ token: c.token, baseId: c.baseId, table: c.bookings });
  const subRows = buildSubmissionRows(flattenRecords(bRecs), month, { retailer: env.OTT_RETAILER });

  if (String(params.format || "").toLowerCase() === "xlsx") {
    if (!subRows.length) return { status: "empty", code: 200, month };
    return { status: "xlsx", code: 200, month, buffer: renderOttXlsx(subRows) };
  }
  return { status: "page", code: 200, month, subRows };
}

async function handler(event) {
  const q = (event && event.queryStringParameters) || {};
  const out = await review({ month: q.month, token: q.token, format: q.format }, {});
  if (out.status === "xlsx") {
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="ott-commissions-${out.month.key}.xlsx"`,
      },
      body: out.buffer.toString("base64"),
      isBase64Encoded: true,
    };
  }
  const html =
    out.status === "page" && out.subRows.length ? reviewPageHtml(out.subRows, out.month, process.env)
    : out.status === "page" || out.status === "empty" ? page(`OTT Commission Review — ${out.month.label}`, `<p>No completed calibrations found for <strong>${out.month.label}</strong>. Nothing to submit.</p>`)
    : out.error === "unauthorized" ? page("Not authorized", "<p>This link is invalid or the token is missing.</p>")
    : page("Bad request", "<p>Missing or invalid month.</p>");
  return { statusCode: out.code || 500, headers: { "Content-Type": "text/html; charset=utf-8" }, body: html };
}

module.exports = { handler, review, reviewPageHtml, reviewUrl };
