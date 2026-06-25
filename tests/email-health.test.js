const { test } = require("node:test");
const assert = require("node:assert/strict");
const { checkEmailHealth } = require("../netlify/functions/email-health.js");

const baseEnv = { RESEND_API_KEY: "re", SLACK_WEBHOOK_URL: "https://hooks.slack.test/x", CANARY_TO: "info+canary@tunedyota.com" };

test("stays quiet when the canary send succeeds", async () => {
  const notifies = [];
  const r = await checkEmailHealth({ env: baseEnv, send: async () => ({ id: "ok" }), notify: async (a) => notifies.push(a) });
  assert.equal(r.ok, true);
  assert.equal(notifies.length, 0);
});
test("alerts when the canary send fails", async () => {
  const notifies = [];
  const r = await checkEmailHealth({ env: baseEnv, send: async () => { throw new Error("Resend 403"); }, notify: async (a) => { notifies.push(a); }, log: { error() {} } });
  assert.equal(r.ok, false);
  assert.equal(notifies.length, 1);
  assert.match(notifies[0].text, /email path DOWN/i);
});
