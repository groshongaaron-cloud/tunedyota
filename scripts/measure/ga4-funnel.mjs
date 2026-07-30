// scripts/measure/ga4-funnel.mjs
// GA4 booking-funnel pull for tunedyota.com: traffic, key events, and source attribution.
// Default mode hits the GA4 Data API (property 323293715). --bq queries the BigQuery
// daily export (tunedyota.analytics_323293715) for session-level detail once tables land;
// until then it reports the export as pending rather than erroring.
//
// Auth: gsc-reader SA key, from GSC_SA_KEY env (raw JSON) or gscKeyFile in
// ~/.tunedyota/measure.config.json. gsc-reader is Viewer on the GA property and
// jobUser + dataViewer on project tunedyota.
//
// Usage: node scripts/measure/ga4-funnel.mjs [--days 7] [--bq] [--json]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GoogleAuth } from "google-auth-library";

const PROPERTY = "properties/323293715";
const BQ_PROJECT = "tunedyota";
const BQ_DATASET = "analytics_323293715";
// Registered key events plus the supporting funnel events the site fires.
const KEY_EVENTS = ["purchase", "book_tune", "generate_lead", "call_click", "join_waitlist"];
const FUNNEL_EVENTS = [...KEY_EVENTS, "begin_checkout", "chat_start", "amsoil_outbound"];
const CONFIG = path.join(os.homedir(), ".tunedyota", "measure.config.json");

function loadCredentials() {
  if (process.env.GSC_SA_KEY) return JSON.parse(process.env.GSC_SA_KEY);
  if (fs.existsSync(CONFIG)) {
    const cfg = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
    if (cfg.gscKeyFile) return JSON.parse(fs.readFileSync(cfg.gscKeyFile, "utf8"));
  }
  throw new Error(`No credentials: set GSC_SA_KEY or gscKeyFile in ${CONFIG}`);
}

async function tokenGetter(scopes) {
  const auth = new GoogleAuth({ credentials: loadCredentials(), scopes });
  const client = await auth.getClient();
  return (await client.getAccessToken()).token;
}

async function callJson(url, token, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    const err = new Error(json.error?.message || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

function rowsToObjects(report) {
  const dims = (report.dimensionHeaders || []).map((h) => h.name);
  const mets = (report.metricHeaders || []).map((h) => h.name);
  return (report.rows || []).map((r) => {
    const out = {};
    dims.forEach((d, i) => { out[d] = r.dimensionValues[i].value; });
    mets.forEach((m, i) => { out[m] = Number(r.metricValues[i].value); });
    return out;
  });
}

async function pullDataApi(days) {
  const token = await tokenGetter(["https://www.googleapis.com/auth/analytics.readonly"]);
  const url = `https://analyticsdata.googleapis.com/v1beta/${PROPERTY}:runReport`;
  const dateRanges = [{ startDate: `${days - 1}daysAgo`, endDate: "today" }];
  const run = (body) => callJson(url, token, { dateRanges, ...body });

  const [traffic, events, sources] = await Promise.all([
    run({
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "screenPageViews" }],
      orderBys: [{ dimension: { dimensionName: "date" } }],
    }),
    run({
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: FUNNEL_EVENTS } } },
    }),
    run({
      dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
      metrics: [{ name: "sessions" }, { name: "keyEvents" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 15,
    }),
  ]);
  return {
    daily: rowsToObjects(traffic),
    funnelEvents: rowsToObjects(events),
    sources: rowsToObjects(sources),
  };
}

// Session-level funnel from the BigQuery export: which sources produce sessions that
// reach a funnel page, then fire a key event. Needs at least one events_ daily table.
const BQ_SQL = (days) => `
  SELECT
    event_date,
    COALESCE(traffic_source.source, '(direct)') AS source,
    COALESCE(traffic_source.medium, '(none)') AS medium,
    COUNT(DISTINCT CONCAT(user_pseudo_id, CAST((
      SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id'
    ) AS STRING))) AS sessions,
    COUNTIF(event_name = 'page_view' AND REGEXP_CONTAINS((
      SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location'
    ), r'/(find-your-exact-tune|book)')) AS funnel_page_views,
    COUNTIF(event_name IN ('${KEY_EVENTS.join("','")}')) AS key_events
  FROM \`${BQ_PROJECT}.${BQ_DATASET}.events_*\`
  WHERE _TABLE_SUFFIX >= FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE('America/Chicago'), INTERVAL ${days} DAY))
  GROUP BY event_date, source, medium
  ORDER BY event_date DESC, sessions DESC`;

async function pullBigQuery(days) {
  const token = await tokenGetter(["https://www.googleapis.com/auth/bigquery"]);
  try {
    const res = await callJson(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${BQ_PROJECT}/queries`,
      token,
      { query: BQ_SQL(days), useLegacySql: false, timeoutMs: 30000 }
    );
    const fields = res.schema.fields.map((f) => f.name);
    return (res.rows || []).map((r) => Object.fromEntries(fields.map((f, i) => [f, r.f[i].v])));
  } catch (e) {
    if (e.status === 404 || /Not found/i.test(e.message)) {
      return { pending: `Export dataset ${BQ_DATASET} has no tables yet (first daily table lands ~24h after linking).` };
    }
    throw e;
  }
}

function printSummary(data) {
  const { daily, funnelEvents, sources } = data;
  const total = (k) => daily.reduce((s, d) => s + d[k], 0);
  console.log(`Traffic (${daily.length} day(s) with data):`);
  if (!daily.length) console.log("  none yet — GA4 standard reports lag realtime by several hours");
  for (const d of daily) console.log(`  ${d.date}: ${d.sessions} sessions, ${d.activeUsers} users, ${d.screenPageViews} pageviews`);
  if (daily.length) console.log(`  TOTAL: ${total("sessions")} sessions, ${total("screenPageViews")} pageviews`);
  console.log("Funnel events:");
  const counts = Object.fromEntries(funnelEvents.map((e) => [e.eventName, e.eventCount]));
  for (const name of FUNNEL_EVENTS) console.log(`  ${name}: ${counts[name] ?? 0}`);
  console.log("Top sources:");
  if (!sources.length) console.log("  none yet");
  for (const s of sources) console.log(`  ${s.sessionSource}/${s.sessionMedium}: ${s.sessions} sessions, ${s.keyEvents} key events`);
}

async function main() {
  const args = process.argv.slice(2);
  const days = Number(args[args.indexOf("--days") + 1]) || 7;
  if (args.includes("--bq")) {
    const rows = await pullBigQuery(days);
    if (rows.pending) { console.log(rows.pending); return; }
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  const data = await pullDataApi(days);
  if (args.includes("--json")) { console.log(JSON.stringify(data, null, 2)); return; }
  printSummary(data);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
