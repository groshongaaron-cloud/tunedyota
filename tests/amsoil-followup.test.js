const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runAmsoilFollowup } = require("../netlify/functions/amsoil-followup.js");

const NOW = new Date("2026-07-20T15:00:00Z");   // fixed clock; dueBy = NOW-3 = 2026-07-17
let n = 0;
function bk(fields) { return { id: "rec" + (++n), fields }; }
function harness(rows, over = {}) {
  const sent = [], updated = [], notified = [];
  const d = {
    now: NOW, fetchImpl: async () => ({ ok: true, json: async () => ({}) }),
    env: { RESEND_API_KEY: "x", AMSOIL_FOLLOWUP_START: "2026-07-14", SLACK_WEBHOOK_URL: "w" },
    list: async () => rows,
    update: async (a) => { updated.push(a); return {}; },
    send: async (a) => { sent.push(a); },
    notify: async (a) => { notified.push(a); },
    log: { error() {} },
    ...over,
  };
  return { sent, updated, notified, d };
}
const TACOMA = { Status: "Completed", Name: "Cust One", Email: "c@example.com",
  Vehicle: "2024 Toyota Tacoma 2.4L-T I4", "Model Year": "2024" };

test("sends to an in-window completed booking and marks it", async () => {
  const { sent, updated, d } = harness([ bk({ ...TACOMA, "Calibration Date": "2026-07-16" }) ]);
  const r = await runAmsoilFollowup(d);
  assert.equal(r.sent, 1);
  assert.equal(sent[0].to, "c@example.com");
  assert.match(sent[0].html, /Signature Series 0W-20/);
  assert.equal(updated[0].fields["AMSOIL Email Sent"], "2026-07-20");
});

test("skips tunes newer than 3 days", async () => {
  const { sent, d } = harness([ bk({ ...TACOMA, "Calibration Date": "2026-07-19" }) ]);
  const r = await runAmsoilFollowup(d);
  assert.equal(r.sent, 0);
  assert.equal(sent.length, 0);
});

test("skips tunes before the backfill floor", async () => {
  const { sent, d } = harness([ bk({ ...TACOMA, "Calibration Date": "2026-07-10" }) ]);
  const r = await runAmsoilFollowup(d);
  assert.equal(r.sent, 0);
});

test("skips a non-catalog vehicle, leaving it unmarked", async () => {
  const { updated, d } = harness([ bk({ ...TACOMA, Vehicle: "2020 Ford F-150", "Calibration Date": "2026-07-16" }) ]);
  const r = await runAmsoilFollowup(d);
  assert.equal(r.sent, 0);
  assert.equal(updated.length, 0);
});

test("a send failure alerts Slack and leaves the row unmarked for retry", async () => {
  const { updated, notified, d } = harness(
    [ bk({ ...TACOMA, "Calibration Date": "2026-07-16" }) ],
    { send: async () => { throw new Error("boom"); } });
  const r = await runAmsoilFollowup(d);
  assert.equal(r.sent, 0);
  assert.equal(updated.length, 0);
  assert.equal(notified.length, 1);
});
