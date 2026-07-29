const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runReport, buildDigest, renderSlack, renderEmailHtml, pct } =
  require("../netlify/functions/ga-weekly-report.js");

const ENV = { GA_SERVICE_ACCOUNT: '{"client_email":"ga-reader@x"}', RESEND_API_KEY: "rk",
  SLACK_WEBHOOK_URL: "https://hooks/x" };

// Canned batchRunReports response: totals (two dateRanges), channels, pages, sources.
const mkTotals = (last, prior) => ({
  metricHeaders: [{ name: "totalUsers" }, { name: "newUsers" }, { name: "sessions" },
    { name: "screenPageViews" }, { name: "averageSessionDuration" }, { name: "bounceRate" }, { name: "keyEvents" }],
  rows: [
    { dimensionValues: [{ value: "last7" }], metricValues: last.map((v) => ({ value: String(v) })) },
    { dimensionValues: [{ value: "prior7" }], metricValues: prior.map((v) => ({ value: String(v) })) },
  ],
});
const mkDim = (pairs) => ({
  rows: pairs.map(([name, ...vals]) => ({
    dimensionValues: [{ value: name }],
    metricValues: vals.map((v) => ({ value: String(v) })),
  })),
});
const RESPONSE = { reports: [
  mkTotals([120, 90, 150, 400, 95, 0.42, 6], [100, 80, 120, 300, 80, 0.5, 4]),
  mkDim([["Organic Search", 80, 3], ["Direct", 50, 2]]),
  mkDim([["/", 120, 90], ["/find-your-exact-tune", 60, 55]]),
  mkDim([["google / organic", 80], ["(direct) / (none)", 50]]),
] };

test("buildDigest: splits last/prior totals and flattens dimension rows", () => {
  const d = buildDigest(RESPONSE.reports);
  assert.equal(d.totals.last.totalUsers, 120);
  assert.equal(d.totals.prior.sessions, 120);
  assert.equal(d.channels[0].name, "Organic Search");
  assert.equal(d.pages[0].values[0], 120);
  assert.equal(d.sources[1].name, "(direct) / (none)");
});

test("pct: w/w delta, and 'new' when there is no baseline (pre-2026-07-29 tag)", () => {
  assert.equal(pct(120, 100), "+20%");
  assert.equal(pct(80, 100), "-20%");
  assert.equal(pct(50, 0), "new");
  assert.equal(pct(0, 0), "0");
});

test("renderSlack/renderEmailHtml: headline numbers and deltas present", () => {
  const d = buildDigest(RESPONSE.reports);
  const s = renderSlack(d);
  assert.match(s, /120 users \(\+20% w\/w\)/);
  assert.match(s, /top channel Organic Search 80/);
  const h = renderEmailHtml(d);
  assert.match(h, /Users<\/td><td align="right"><b>120<\/b>/);
  assert.match(h, /1\.6m/); // 95s avg session
  assert.match(h, /42%/); // bounce
});

test("runReport: no GA_SERVICE_ACCOUNT -> skipped, no calls", async () => {
  let called = 0;
  const r = await runReport({ env: {}, fetchImpl: async () => { called++; } });
  assert.equal(r.skipped, true);
  assert.equal(called, 0);
});

test("runReport: happy path sends email + slack with the digest", async () => {
  const sent = [], slacked = [];
  const fetchImpl = async (url) => {
    assert.match(url, /properties\/323293715:batchRunReports/);
    return { ok: true, json: async () => RESPONSE };
  };
  const r = await runReport({ env: ENV, fetchImpl, token: "tok",
    send: async (m) => sent.push(m),
    notify: async (m) => slacked.push(m) });
  assert.equal(r.ok, true);
  assert.equal(r.emailFailed, false);
  assert.equal(sent[0].to, "info@tunedyota.com");
  assert.match(sent[0].subject, /GA weekly digest/);
  assert.match(slacked[0].text, /GA weekly: 120 users/);
});

test("runReport: email failure is contained and flagged in the Slack line", async () => {
  const slacked = [];
  const fetchImpl = async () => ({ ok: true, json: async () => RESPONSE });
  const r = await runReport({ env: ENV, fetchImpl, token: "tok",
    send: async () => { throw new Error("resend down"); },
    notify: async (m) => slacked.push(m), log: { error: () => {} } });
  assert.equal(r.ok, true);
  assert.equal(r.emailFailed, true);
  assert.match(slacked[0].text, /full digest email failed/);
});

test("runReport: non-200 from the Data API throws (handler maps to 502)", async () => {
  const fetchImpl = async () => ({ ok: false, status: 403 });
  await assert.rejects(() => runReport({ env: ENV, fetchImpl, token: "tok" }), /ga batchRunReports 403/);
});
