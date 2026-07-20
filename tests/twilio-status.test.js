// tests/twilio-status.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/twilio-status.js");

const evt = (body, over = {}) => ({ headers: { "x-twilio-signature": "sig" },
  body, rawUrl: "https://tunedyota.com/.netlify/functions/twilio-status", ...over });

test("bad signature -> 403", async () => {
  const res = await handler(evt("MessageStatus=delivered"), { env: {}, verify: () => false });
  assert.equal(res.statusCode, 403);
});

test("delivered status -> 204, no alert", async () => {
  const alerts = [];
  const res = await handler(evt("MessageSid=SM1&MessageStatus=delivered&To=%2B15075550101"), {
    env: {}, verify: () => true, alert: async (t) => { alerts.push(t); } });
  assert.equal(res.statusCode, 204);
  assert.equal(alerts.length, 0);
});

test("failed send with 30034 -> logs + alerts owner with code meaning", async () => {
  const alerts = [], errors = [];
  const res = await handler(evt("MessageSid=SM2&MessageStatus=failed&ErrorCode=30034&To=%2B15075550101"), {
    env: {}, verify: () => true, alert: async (t) => { alerts.push(t); },
    log: { error: (...a) => errors.push(a.join(" ")) } });
  assert.equal(res.statusCode, 204);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], /30034/);
  assert.match(alerts[0], /A2P|unregistered/i);
  assert.match(alerts[0], /507-555-0101|\+15075550101/);
  assert.equal(errors.length, 1);
});

test("undelivered with 30007 -> alerts with carrier-filter meaning", async () => {
  const alerts = [];
  await handler(evt("MessageSid=SM3&MessageStatus=undelivered&ErrorCode=30007&To=%2B15075550101"), {
    env: {}, verify: () => true, alert: async (t) => { alerts.push(t); } });
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], /30007/);
  assert.match(alerts[0], /filter/i);
});

test("alert failure never breaks the callback response", async () => {
  const res = await handler(evt("MessageSid=SM4&MessageStatus=failed&ErrorCode=30034"), {
    env: {}, verify: () => true, alert: async () => { throw new Error("slack down"); } });
  assert.equal(res.statusCode, 204);
});
