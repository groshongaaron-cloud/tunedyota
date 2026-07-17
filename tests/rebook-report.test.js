const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runRebookReport } = require("../netlify/functions/rebook-report.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", RESEND_API_KEY: "k" };

test("a send failure alerts Slack and returns ok:false (never throws)", async () => {
  const notifies = [];
  const r = await runRebookReport({
    env: { ...env, SLACK_WEBHOOK_URL: "https://hooks.slack.test/x" },
    listAll: async () => [],
    send: async () => { throw new Error("Resend 403: domain not verified"); },
    notify: async (a) => { notifies.push(a); return { ok: true }; },
    log: { error() {}, info() {} },
  });
  assert.equal(r.ok, false);
  assert.equal(notifies.length, 1);
  assert.match(notifies[0].text, /rebook report FAILED/i);
});

test("lists outstanding priority rows and emails the owner", async () => {
  let sent = null;
  const listAll = async () => [
    { fields: { Name: "A", City: "Omaha", Installer: "cody", Reason: "Event full", Notified: false } },
    { fields: { Name: "B", City: "Omaha", Installer: "cody", Reason: "Rebook — not completed", Notified: true } }, // notified → excluded
  ];
  const send = async (m) => { sent = m; return { ok: true }; };
  const r = await runRebookReport({ env, listAll, send });
  assert.equal(r.outstanding, 1);
  assert.equal(sent.to, "info@tunedyota.com");
  assert.match(sent.subject, /Weekly rebook backlog \(1\)/);
});
