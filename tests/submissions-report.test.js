const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runReport } = require("../netlify/functions/submissions-report.js");

function deps(overrides = {}) {
  const notifies = [], sends = [];
  const bookings = [{ id: "b1", createdTime: "2026-06-24T00:00:00Z", fields: { City: "Omaha", "Event Date": "2026-06-28", Slot: "9:00", Name: "A", Email: "a@x.com", Installer: "noah", Status: "Booked", Vehicle: "Tacoma" } }];
  const priority = [];
  return {
    env: { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", SLACK_WEBHOOK_URL: "https://hooks.slack.test/x", RESEND_API_KEY: "re", REPORT_TO: "info@tunedyota.com" },
    now: new Date("2026-06-25T12:00:00Z"),
    listAll: async ({ table }) => (table === "Bookings" ? bookings : priority),
    notify: async (a) => { notifies.push(a); return { ok: true }; },
    send: async (a) => { sends.push(a); return { id: "e" }; },
    log: { warn() {}, error() {} },
    _notifies: notifies, _sends: sends,
    ...overrides,
  };
}

test("delivers Slack summary + email with contacts.csv attachment", async () => {
  const d = deps();
  await runReport(d);
  assert.equal(d._notifies.length, 1);
  assert.match(d._notifies[0].text, /Submissions Digest/);
  assert.equal(d._sends.length, 1);
  const att = d._sends[0].attachments[0];
  assert.equal(att.filename, "contacts.csv");
  assert.ok(att.content && att.content.length > 0);
});
test("email failure appends a Slack note and does not throw", async () => {
  const d = deps({ send: async () => { throw new Error("Resend 403"); } });
  await runReport(d);
  assert.equal(d._notifies.length, 1);
  assert.match(d._notifies[0].text, /email failed/i);
});
