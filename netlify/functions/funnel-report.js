// netlify/functions/funnel-report.js
// Weekly channel-ROI funnel report (funnel audit 2026-08-02) — the owner's
// answer to "which channels actually convert". Built on the attribution
// integrity work: leads carry Channel, bookings carry a real Source.
//   - New leads this week, by channel
//   - Trailing-90d cohort conversion (lead → Booked), by channel
//   - Stage funnel + due/stale counts
//   - Completed installs last 30d, by booking origin (channelForBooking)
// Emails info@ Mondays + one Slack line. Numbers only — no invented insight.
const { cfg, listAllRecords } = require("./lib/airtable.js");
const { sendEmail } = require("./lib/resend.js");
const { notifyOwner } = require("./lib/alert.js");
const { toLeadView, staleLeads, dueLeads, ACTIVE_STAGES, channelForBooking } = require("./lib/leads.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";
const COHORT_DAYS = 90, WEEK_DAYS = 7, COMPLETED_DAYS = 30;

function buildFunnelReport(leadRecs, bookingRecs, todayISO) {
  const today = Date.parse(todayISO + "T00:00:00Z");
  const leads = leadRecs.map(toLeadView);
  const newThisWeek = {}, cohort = {}, stages = {};
  for (const l of leads) {
    const ch = l.channel || "other";
    stages[l.stage] = (stages[l.stage] || 0) + 1;
    const t = Date.parse(l.createdTime || "");
    if (isNaN(t)) continue;
    const days = (today - t) / 86400000;
    if (days <= WEEK_DAYS) newThisWeek[ch] = (newThisWeek[ch] || 0) + 1;
    if (days <= COHORT_DAYS) {
      const c = cohort[ch] = cohort[ch] || { total: 0, booked: 0 };
      c.total++;
      if (l.stage === "Booked" || l.bookingId) c.booked++;
    }
  }
  const completed30 = {};
  for (const r of bookingRecs) {
    const f = r.fields || {};
    if (f.Status !== "Completed") continue;
    const d = Date.parse(String(f["Calibration Date"] || "").slice(0, 10) + "T00:00:00Z");
    if (isNaN(d) || (today - d) / 86400000 > COMPLETED_DAYS) continue;
    const ch = channelForBooking(f.Source);
    completed30[ch] = (completed30[ch] || 0) + 1;
  }
  const views = leads;
  return { newThisWeek, cohort, stages, completed30,
    due: Object.values(dueLeads(views, todayISO)).reduce((a, b) => a + b.length, 0),
    stale: staleLeads(views, todayISO).length,
    active: views.filter((l) => ACTIVE_STAGES.includes(l.stage)).length };
}

const pct = (b, t) => (t ? Math.round((b / t) * 100) + "%" : "—");

function renderFunnelEmail(r, todayISO) {
  const channels = [...new Set([...Object.keys(r.cohort), ...Object.keys(r.newThisWeek), ...Object.keys(r.completed30)])].sort();
  const rows = channels.map((ch) => {
    const c = r.cohort[ch] || { total: 0, booked: 0 };
    return { ch, week: r.newThisWeek[ch] || 0, total: c.total, booked: c.booked,
      conv: pct(c.booked, c.total), done: r.completed30[ch] || 0 };
  });
  const subject = `Tuned Yota — weekly funnel & channel report (${todayISO})`;
  const tr = rows.map((x) => `<tr><td style="padding:6px 10px">${x.ch}</td><td align="center">${x.week}</td><td align="center">${x.total}</td><td align="center">${x.booked}</td><td align="center"><b>${x.conv}</b></td><td align="center">${x.done}</td></tr>`).join("");
  const st = Object.entries(r.stages).map(([s, n]) => `${s}: ${n}`).join(" · ");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;max-width:640px">
<h2 style="margin:0 0 4px">Weekly funnel &amp; channel report</h2>
<p style="margin:0 0 14px;color:#666">${todayISO} · conversion = lead reached Booked, trailing 90 days</p>
<table cellspacing="0" style="border-collapse:collapse;font-size:14px;width:100%">
<tr style="background:#f2efe9;text-align:center"><th style="padding:6px 10px;text-align:left">Channel</th><th>New (7d)</th><th>Leads (90d)</th><th>Booked</th><th>Conv</th><th>Installs (30d)</th></tr>
${tr}</table>
<p style="margin:14px 0 4px"><b>Pipeline:</b> ${st || "no leads"}</p>
<p style="margin:0"><b>Needs attention:</b> ${r.due} due/overdue follow-up${r.due === 1 ? "" : "s"} · ${r.stale} stale (30d+ quiet) · ${r.active} active leads</p></div>`;
  const text = [`Weekly funnel & channel report (${todayISO})`, "",
    ...rows.map((x) => `${x.ch}: ${x.week} new this week · ${x.booked}/${x.total} booked (${x.conv}) · ${x.done} installs 30d`),
    "", `Pipeline: ${st || "no leads"}`,
    `Due follow-ups: ${r.due} · Stale: ${r.stale} · Active: ${r.active}`].join("\n");
  return { subject, html, text };
}

async function runFunnelReport(deps = {}) {
  const env = deps.env || process.env;
  const today = deps.today || new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const list = deps.list || ((a) => listAllRecords({ ...a }));
  const send = deps.send || ((a) => sendEmail(a));
  const notify = deps.notify || ((a) => notifyOwner(a));
  const c = cfg(env);
  let leadRecs, bookingRecs;
  try {
    [leadRecs, bookingRecs] = await Promise.all([
      list({ token: c.token, baseId: c.baseId, table: c.priority }),
      list({ token: c.token, baseId: c.baseId, table: c.bookings }),
    ]);
  } catch (e) { return { ok: false, error: "store-unavailable" }; }
  const r = buildFunnelReport(leadRecs, bookingRecs, today);
  const m = renderFunnelEmail(r, today);
  let emailFailed = false;
  try { await send({ apiKey: env.RESEND_API_KEY, from: FROM, to: OWNER, replyTo: OWNER, subject: m.subject, html: m.html, text: m.text }); }
  catch (e) { emailFailed = true; }
  const top = Object.entries(r.newThisWeek).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([ch, n]) => `${ch} ${n}`).join(", ") || "none";
  try {
    await notify({ webhookUrl: env.SLACK_WEBHOOK_URL,
      text: `*TY weekly funnel*: new leads 7d — ${top} · ${r.due} due follow-ups · ${r.stale} stale${emailFailed ? " — EMAIL FAILED" : " → info@"}` });
  } catch (e) { /* best-effort */ }
  return { ok: true, emailFailed };
}

async function handler() {
  const out = await runFunnelReport({});
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, runFunnelReport, buildFunnelReport, renderFunnelEmail };
