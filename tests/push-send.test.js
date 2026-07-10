const { test } = require("node:test");
const assert = require("node:assert/strict");
const { sendPush } = require("../netlify/functions/lib/push.js");

const env = { FCM_SERVICE_ACCOUNT: JSON.stringify({ project_id: "ty-proj" }) };
const fakeAuth = { async getAccessToken() { return { token: "AT123" }; } };

test("no registered tokens → no-op, no FCM calls", async () => {
  let calls = 0;
  const out = await sendPush("aaron", { title: "Hi", body: "There" }, {
    env, auth: fakeAuth, listTokens: async () => [], fetchImpl: async () => { calls++; return { ok: true }; },
  });
  assert.deepEqual(out, { sent: 0, failed: 0 });
  assert.equal(calls, 0);
});

test("posts one FCM message per token with the right URL + payload", async () => {
  const posted = [];
  const fetchImpl = async (url, opts) => { posted.push({ url, opts }); return { ok: true }; };
  const out = await sendPush("aaron", { title: "Roster ready", body: "Fargo", data: { city: "Fargo" } }, {
    env, auth: fakeAuth, listTokens: async () => ["tokA", "tokB"], fetchImpl,
  });
  assert.deepEqual(out, { sent: 2, failed: 0 });
  assert.equal(posted.length, 2);
  assert.match(posted[0].url, /projects\/ty-proj\/messages:send/);
  assert.equal(posted[0].opts.headers.Authorization, "Bearer AT123");
  const msg = JSON.parse(posted[0].opts.body).message;
  assert.equal(msg.token, "tokA");
  assert.equal(msg.notification.title, "Roster ready");
  assert.equal(msg.notification.body, "Fargo");
  assert.equal(msg.data.city, "Fargo");
});

test("a failing FCM call is counted, not thrown", async () => {
  const fetchImpl = async () => ({ ok: false, status: 500 });
  const out = await sendPush("aaron", { title: "x", body: "y" }, {
    env, auth: fakeAuth, listTokens: async () => ["t1"], fetchImpl, log: { error() {} },
  });
  assert.deepEqual(out, { sent: 0, failed: 1 });
});
