// OTT commission submission — DEADLINE REMINDER. The draft goes out on the 1st;
// the owner must approve & submit to OTT by the 7th. This scheduled nudge fires a
// couple days ahead (the 5th) and, if the month just closed has completed
// calibrations, re-surfaces the same approve link + Slack ping so the deadline
// isn't missed. It never sends anything to OTT itself — it only reminds the owner.
const { cfg, listAllRecords } = require("./lib/airtable.js");
const { sendEmail } = require("./lib/resend.js");
const { notifyOwner } = require("./lib/alert.js");
const { flattenRecords } = require("./lib/report-sources.js");
const { priorMonth, buildSubmissionRows, totalCommission, unresolved } = require("./lib/ott-report.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";
const DUE_DAY = 7;

function approveUrl(env, monthKey) {
  const base = env.SITE_URL || "https://tunedyota.com";
  return `${base}/.netlify/functions/ott-report-review?month=${monthKey}&token=${encodeURIComponent(env.OTT_APPROVE_SECRET || "")}`;
}

function reminderHtml(subRows, month, url) {
  const u = unresolved(subRows).length, total = totalCommission(subRows);
  let html = `<div style="font-family:Arial,sans-serif;color:#3A2E26;max-width:820px">`;
  html += `<h1 style="color:#3A2E26">Reminder — submit OTT commissions by the ${DUE_DAY}th</h1>`;
  html += `<p style="color:#7c8472">${month.label} · ${subRows.length} completed calibration${subRows.length === 1 ? "" : "s"} · commission total <strong>$${total}</strong></p>`;
  html += `<p>Your ${month.label} OTT commission submission hasn't been sent yet. It's due by the <strong>${DUE_DAY}th</strong>. Review the draft that went out on the 1st, then approve.</p>`;
  if (u) html += `<p style="color:#8a2a2a"><strong>${u} row(s) still need a commission confirmed</strong> before you submit.</p>`;
  html += `<p style="margin:18px 0"><a href="${url}" style="background:#5B4B42;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700">Review &amp; send to OTT</a></p>`;
  html += `<p style="color:#7c8472;font-size:13px">If you've already submitted, ignore this. This approval link is private to you — do not forward it.</p>`;
  html += `</div>`;
  return html;
}

async function runOttReminder(deps) {
  const { env = process.env, now = new Date(), fetchImpl = fetch,
          listAll = (a) => listAllRecords({ fetchImpl, ...a }),
          notify = notifyOwner, send = sendEmail, log = console } = deps;
  const c = cfg(env);
  const month = priorMonth(now);

  const bRecs = await listAll({ token: c.token, baseId: c.baseId, table: c.bookings });
  const subRows = buildSubmissionRows(flattenRecords(bRecs), month, { retailer: env.OTT_RETAILER });
  if (!subRows.length) return { ok: true, count: 0, reminded: false };

  const u = unresolved(subRows).length, total = totalCommission(subRows);
  let emailFailed = false;
  try {
    await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: OWNER, replyTo: OWNER,
      subject: `Reminder — submit OTT commissions for ${month.label} by the ${DUE_DAY}th`,
      html: reminderHtml(subRows, month, approveUrl(env, month.key)),
      text: `Reminder: your ${month.label} OTT commission submission (${subRows.length} calibration(s), $${total}${u ? `, ${u} needing confirmation` : ""}) is due by the ${DUE_DAY}th and hasn't been sent. Approve the draft to submit.` });
  } catch (e) { emailFailed = true; if (log.error) log.error("ott reminder email", e.message); }

  let slack = `*Tuned Yota — OTT submission due by the ${DUE_DAY}th* (${month.label}): ${subRows.length} calibration${subRows.length === 1 ? "" : "s"} · $${total} · not yet submitted — approve the draft`;
  if (u) slack += ` · ${u} need commission confirmed`;
  if (emailFailed) slack += ` — REMINDER EMAIL FAILED, check logs`;
  try { await notify({ fetchImpl, webhookUrl: env.SLACK_WEBHOOK_URL, text: slack, log }); }
  catch (e) { if (log.error) log.error("ott reminder slack", e.message); }

  return { ok: true, count: subRows.length, reminded: !emailFailed, unresolved: u, total };
}

async function handler() { const r = await runOttReminder({}); return { statusCode: 200, body: JSON.stringify(r) }; }
module.exports = { handler, runOttReminder, reminderHtml, DUE_DAY };
