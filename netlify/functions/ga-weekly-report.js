// netlify/functions/ga-weekly-report.js
// Weekly Google Analytics digest (netlify.toml, Mondays 13:00 UTC ≈ 8am Central).
// Queries the GA4 Data API as the ga-reader service account (key JSON in env
// GA_SERVICE_ACCOUNT — same auth pattern as lib/push.js FCM), compares the last
// 7 full days against the prior 7, emails the full digest to info@ (Resend) and
// posts a one-line summary to Slack. Property 323293715 (tunedyota.com); the
// tag first went live 2026-07-29, so early weeks have a thin/absent baseline.
const { GoogleAuth } = require("google-auth-library");
const { sendEmail } = require("./lib/resend.js");
const { notifyOwner } = require("./lib/alert.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";
const API = "https://analyticsdata.googleapis.com/v1beta";
const PROPERTY = (env) => env.GA_PROPERTY_ID || "323293715";

async function gaAccessToken({ env = process.env, auth } = {}) {
  const creds = JSON.parse(env.GA_SERVICE_ACCOUNT || "{}");
  const client = auth || await new GoogleAuth({ credentials: creds,
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"] }).getClient();
  const at = await client.getAccessToken();
  return (at && at.token) ? at.token : at;
}

// One batchRunReports call: [0] totals last7-vs-prior7, [1] channels, [2] top
// pages, [3] sources — all over the last 7 full days (yesterday inclusive).
const BATCH = {
  requests: [
    { dateRanges: [
        { startDate: "7daysAgo", endDate: "yesterday", name: "last7" },
        { startDate: "14daysAgo", endDate: "8daysAgo", name: "prior7" }],
      metrics: [{ name: "totalUsers" }, { name: "newUsers" }, { name: "sessions" },
        { name: "screenPageViews" }, { name: "averageSessionDuration" },
        { name: "bounceRate" }, { name: "keyEvents" }] },
    { dateRanges: [{ startDate: "7daysAgo", endDate: "yesterday" }],
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }, { name: "keyEvents" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }] },
    { dateRanges: [{ startDate: "7daysAgo", endDate: "yesterday" }],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }, { name: "sessions" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }], limit: "10" },
    { dateRanges: [{ startDate: "7daysAgo", endDate: "yesterday" }],
      dimensions: [{ name: "sessionSourceMedium" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: "10" },
  ],
};

const num = (v) => Number(v) || 0;

// Flatten the API's rows into a plain digest the renderers consume.
function buildDigest(reports) {
  const [tot, chan, pages, srcs] = reports;
  const totals = { last: {}, prior: {} };
  const names = (tot.metricHeaders || []).map((h) => h.name);
  for (const row of tot.rows || []) {
    const which = row.dimensionValues && row.dimensionValues[0] &&
      row.dimensionValues[0].value === "prior7" ? "prior" : "last";
    names.forEach((n, i) => { totals[which][n] = num(row.metricValues[i].value); });
  }
  const dims = (r) => (r.rows || []).map((row) => ({
    name: row.dimensionValues[0].value,
    values: row.metricValues.map((m) => num(m.value)),
  }));
  return { totals, channels: dims(chan), pages: dims(pages), sources: dims(srcs) };
}

// "+42%" / "-8%" / "new" (no baseline) — the tag only went live 2026-07-29.
function pct(last, prior) {
  if (!prior) return last ? "new" : "0";
  return `${last >= prior ? "+" : ""}${Math.round(((last - prior) / prior) * 100)}%`;
}

function renderSlack(d) {
  const t = d.totals.last, p = d.totals.prior;
  const topPage = d.pages[0] ? `${d.pages[0].name} (${d.pages[0].values[0]} views)` : "n/a";
  const topChan = d.channels[0] ? `${d.channels[0].name} ${d.channels[0].values[0]}` : "n/a";
  return `GA weekly: ${num(t.totalUsers)} users (${pct(num(t.totalUsers), num(p.totalUsers))} w/w), ` +
    `${num(t.sessions)} sessions, ${num(t.keyEvents)} key events — top channel ${topChan}, top page ${topPage}. ` +
    `Full digest emailed to info@.`;
}

function renderEmailHtml(d) {
  const t = d.totals.last, p = d.totals.prior;
  const row = (label, key, fmt = (v) => v) =>
    `<tr><td>${label}</td><td align="right"><b>${fmt(num(t[key]))}</b></td>` +
    `<td align="right">${fmt(num(p[key]))}</td><td align="right">${pct(num(t[key]), num(p[key]))}</td></tr>`;
  const dimTable = (title, items, unit) => `<h3>${title}</h3><table cellpadding="4">` +
    items.map((i) => `<tr><td>${i.name}</td><td align="right"><b>${i.values[0]}</b> ${unit}</td></tr>`).join("") +
    `</table>`;
  const mins = (s) => `${(s / 60).toFixed(1)}m`;
  const pc = (v) => `${(v * 100).toFixed(0)}%`;
  return `<h2>Tuned Yota — Google Analytics weekly digest</h2>
<p>Last 7 full days vs the prior 7 (property 323293715, tunedyota.com).</p>
<table cellpadding="4"><tr><th align="left">Metric</th><th>This week</th><th>Prior</th><th>Δ</th></tr>
${row("Users", "totalUsers")}
${row("New users", "newUsers")}
${row("Sessions", "sessions")}
${row("Page views", "screenPageViews")}
${row("Avg session", "averageSessionDuration", mins)}
${row("Bounce rate", "bounceRate", pc)}
${row("Key events", "keyEvents")}
</table>
${dimTable("Channels", d.channels, "sessions")}
${dimTable("Top pages", d.pages, "views")}
${dimTable("Sources", d.sources, "sessions")}`;
}

async function runReport(deps = {}) {
  const { env = process.env, fetchImpl = fetch, notify = notifyOwner,
          send = sendEmail, token, log = console } = deps;
  if (!env.GA_SERVICE_ACCOUNT) return { skipped: true };
  const accessToken = token || await gaAccessToken({ env });
  const res = await fetchImpl(`${API}/properties/${PROPERTY(env)}:batchRunReports`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(BATCH),
  });
  if (!res.ok) throw new Error(`ga batchRunReports ${res.status}`);
  const digest = buildDigest((await res.json()).reports || []);

  let emailFailed = false;
  try {
    await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM,
      to: env.REPORT_TO || "info@tunedyota.com",
      subject: "Tuned Yota — GA weekly digest",
      html: renderEmailHtml(digest) });
  } catch (e) { emailFailed = true; if (log.error) log.error("ga report email", e.message); }

  let slack = renderSlack(digest);
  if (emailFailed) slack += "\n(full digest email failed — see function logs)";
  try { await notify({ fetchImpl, webhookUrl: env.SLACK_WEBHOOK_URL, text: slack, log }); }
  catch (e) { if (log.error) log.error("ga report slack", e.message); }
  return { ok: true, emailFailed, digest };
}

async function handler() {
  try {
    const r = await runReport({});
    return { statusCode: 200, body: JSON.stringify({ ok: r.ok || false, skipped: r.skipped, emailFailed: r.emailFailed }) };
  } catch (e) {
    console.error("ga-weekly-report", e.message);
    return { statusCode: 502, body: JSON.stringify({ error: e.message }) };
  }
}

module.exports = { handler, runReport, buildDigest, renderSlack, renderEmailHtml, pct };
