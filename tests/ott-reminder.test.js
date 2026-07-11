const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runOttReminder, DUE_DAY } = require("../netlify/functions/ott-report-reminder.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", RESEND_API_KEY: "k", OTT_APPROVE_SECRET: "sec", SLACK_WEBHOOK_URL: "http://slack" };
const completed = (extra = {}) => ({
  id: "recABCDE12345", Name: "Jane", Vehicle: "2015 Toyota Tundra 5.7L V8", VIN: "5TFDW5F17MX000000",
  "OTT Calibration": "Spicy", "Calibration Date": "2026-06-15", Installer: ["cody"], Status: "Completed",
  "Tuning Platform": "PCM", "Calibration Type": "Basic", ...extra,
});
const recs = (rows) => rows.map((f) => ({ id: f.id || "rec1", fields: f }));

test("reminds the owner (email + Slack) when the prior month has calibrations to submit", async () => {
  let sent = null, slack = null;
  const out = await runOttReminder({
    env, now: new Date("2026-07-05T13:00:00Z"),
    listAll: async () => recs([completed()]),
    send: async (m) => { sent = m; return { ok: true }; },
    notify: async (a) => { slack = a.text; return {}; },
  });
  assert.equal(out.reminded, true);
  assert.equal(out.count, 1);
  assert.match(sent.subject, new RegExp(`by the ${DUE_DAY}th`));
  assert.match(sent.subject, /June 2026/);
  assert.ok(sent.html.includes("ott-report-review?month=2026-06"), "carries the online review link for June");
  assert.ok(sent.to === "info@tunedyota.com", "reminder goes to the owner only, never OTT");
  assert.match(slack, /due by the 7th/);
});

test("stays silent when there is nothing to submit", async () => {
  let sent = false, slack = false;
  const out = await runOttReminder({
    env, now: new Date("2026-07-05T13:00:00Z"),
    listAll: async () => recs([completed({ Status: "Booked" })]),  // not completed
    send: async () => { sent = true; return {}; },
    notify: async () => { slack = true; return {}; },
  });
  assert.equal(out.reminded, false);
  assert.equal(out.count, 0);
  assert.equal(sent, false, "no email when nothing to submit");
  assert.equal(slack, false, "no Slack when nothing to submit");
});

test("a reminder email failure still fires Slack and never throws", async () => {
  let slack = null;
  const out = await runOttReminder({
    env, now: new Date("2026-07-05T13:00:00Z"),
    listAll: async () => recs([completed()]),
    send: async () => { throw new Error("resend down"); },
    notify: async (a) => { slack = a.text; return {}; },
    log: { error() {} },
  });
  assert.equal(out.reminded, false);
  assert.match(slack, /REMINDER EMAIL FAILED/);
});
