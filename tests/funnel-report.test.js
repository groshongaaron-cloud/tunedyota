// Weekly channel-ROI funnel report (funnel audit 2026-08-02): the owner's
// answer to "which channels actually convert" — built on the attribution
// integrity shipped the same day. Leads by channel, conversion by channel,
// stage funnel, completed installs by origin.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildFunnelReport, renderFunnelEmail, runFunnelReport } = require("../netlify/functions/funnel-report.js");

const TODAY = "2026-08-10";
const daysAgo = (d) => new Date(Date.parse(TODAY + "T00:00:00Z") - d * 86400000).toISOString();

const lead = (id, over = {}) => ({ id, fields: { Name: "L" + id, Channel: "web", Stage: "New",
  Phone: "(605) 555-0" + String(100 + Number(String(id).replace(/\D/g, "") || 0)),
  "Created Time": daysAgo(10), ...over } });

test("buildFunnelReport: new-this-week and 90d conversion by channel", () => {
  const leads = [
    lead(1, { Channel: "instagram", "Created Time": daysAgo(2) }),
    lead(2, { Channel: "instagram", "Created Time": daysAgo(30), Stage: "Booked" }),
    lead(3, { Channel: "web", "Created Time": daysAgo(40) }),
    lead(4, { Channel: "web", "Created Time": daysAgo(50), Stage: "Booked" }),
    lead(5, { Channel: "web", "Created Time": daysAgo(200) }),   // outside 90d cohort
  ];
  const r = buildFunnelReport(leads, [], TODAY);
  assert.equal(r.newThisWeek.instagram, 1);
  assert.equal(r.cohort.instagram.total, 2);
  assert.equal(r.cohort.instagram.booked, 1);
  assert.equal(r.cohort.web.total, 2, "200-day-old lead excluded from cohort");
  assert.equal(r.cohort.web.booked, 1);
  assert.equal(r.stages.Booked, 2);
});

test("completed installs in the last 30 days bucket by booking origin", () => {
  const bookings = [
    { id: "b1", fields: { Status: "Completed", "Calibration Date": daysAgo(5).slice(0, 10), Source: "find-your-exact-tune" } },
    { id: "b2", fields: { Status: "Completed", "Calibration Date": daysAgo(8).slice(0, 10), Source: "lead:instagram (chat:instagram)" } },
    { id: "b3", fields: { Status: "Completed", "Calibration Date": daysAgo(90).slice(0, 10), Source: "find-your-exact-tune" } },
    { id: "b4", fields: { Status: "Booked", "Event Date": daysAgo(2).slice(0, 10), Source: "find-your-exact-tune" } },
  ];
  const r = buildFunnelReport([], bookings, TODAY);
  assert.equal(r.completed30.web, 1);
  assert.equal(r.completed30.instagram, 1);
  assert.equal(Object.values(r.completed30).reduce((a, b) => a + b, 0), 2, "old + open bookings excluded");
});

test("renderFunnelEmail: channel rows with conversion %, readable text fallback", () => {
  const r = buildFunnelReport([
    lead(1, { Channel: "instagram", "Created Time": daysAgo(30), Stage: "Booked" }),
    lead(2, { Channel: "instagram", "Created Time": daysAgo(20) }),
  ], [], TODAY);
  const m = renderFunnelEmail(r, TODAY);
  assert.match(m.html, /instagram/);
  assert.match(m.html, /50%/, "conversion percentage rendered");
  assert.match(m.text, /instagram/);
  assert.match(m.subject, /funnel/i);
});

test("runFunnelReport sends the email and one Slack line", async () => {
  const sends = [], slacks = [];
  const out = await runFunnelReport({
    env: { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", SLACK_WEBHOOK_URL: "https://x" },
    today: TODAY,
    list: async (a) => (a.table === "Priority List"
      ? [lead(1, { Channel: "sms", "Created Time": daysAgo(3) })]
      : [{ id: "b1", fields: { Status: "Completed", "Calibration Date": daysAgo(3).slice(0, 10), Source: "lead:sms" } }]),
    send: async (a) => { sends.push(a); return {}; },
    notify: async (a) => { slacks.push(a); return {}; },
  });
  assert.equal(out.ok, true);
  assert.equal(sends[0].to, "info@tunedyota.com");
  assert.match(sends[0].html, /sms/);
  assert.equal(slacks.length, 1);
  assert.match(slacks[0].text, /funnel/i);
});

test("store failure reports the error instead of sending an empty digest", async () => {
  const sends = [];
  const out = await runFunnelReport({
    env: { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" }, today: TODAY,
    list: async () => { throw new Error("airtable 503"); },
    send: async (a) => { sends.push(a); return {}; }, notify: async () => ({}) });
  assert.equal(out.ok, false);
  assert.equal(sends.length, 0);
});
