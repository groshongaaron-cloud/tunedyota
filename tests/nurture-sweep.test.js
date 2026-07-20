const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runNurtureSweep } = require("../netlify/functions/nurture-sweep.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", RESEND_API_KEY: "re", SLACK_WEBHOOK_URL: "https://hooks.slack.test/x" };
const NOW = new Date("2026-07-20T12:00:00Z");
function deps(rows, over = {}) {
  const sends = [], updates = [];
  return { env, now: NOW, list: async () => rows,
    send: async (a) => { sends.push(a); return { id: "e" }; },
    update: async (a) => { updates.push(a); return { id: a.id }; },
    notify: async () => ({ ok: true }), log: { error() {} },
    _sends: sends, _updates: updates, ...over };
}
const lead = (f, id = "r1") => ({ id, fields: { Email: "x@y.com", Stage: "New", Source: "lead-magnet", "Nurture Step": 1, "Nurture Last Sent": "2026-07-10", ...f } });

test("sends the next step to a due lead and advances the step", async () => {
  const d = deps([lead({ Name: "Ann" })]);
  const r = await runNurtureSweep(d);
  assert.equal(d._sends.length, 1);
  assert.match(d._sends[0].subject, /Stock vs tuned/);   // step 2
  assert.equal(d._updates[0].fields["Nurture Step"], 2);
  assert.equal(r.sent, 1);
});
test("skips a lead that isn't due yet (< gap)", async () => {
  const d = deps([lead({ "Nurture Last Sent": "2026-07-19" })]);
  await runNurtureSweep(d);
  assert.equal(d._sends.length, 0);
});
test("skips booked and converted leads", async () => {
  const d = deps([lead({ Stage: "Booked", "Nurture Last Sent": "2026-07-01" }, "a"),
    lead({ "Converted Booking": "recBk", "Nurture Last Sent": "2026-07-01" }, "b")]);
  await runNurtureSweep(d);
  assert.equal(d._sends.length, 0);
});
test("does not advance past the final step", async () => {
  const d = deps([lead({ "Nurture Step": 3, "Nurture Last Sent": "2026-07-01" })]);
  await runNurtureSweep(d);
  assert.equal(d._sends.length, 0);
});
