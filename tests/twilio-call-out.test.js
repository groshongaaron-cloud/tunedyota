// tests/twilio-call-out.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/twilio-call-out.js");

const ENV = { TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", TWILIO_FROM_NUMBER: "+16124067117",
  INSTALLER_TOKENS: JSON.stringify({ cody: "tok-cody" }),
  INSTALLER_SMS_NUMBERS: JSON.stringify({ cody: "+16052141335" }) };
const evt = (body, headers = { "x-installer-token": "tok-cody" }) => ({ httpMethod: "POST", headers, body,
  rawUrl: "https://tunedyota.com/.netlify/functions/twilio-call-out" });
const okTwilio = async () => ({ ok: true, json: async () => ({ sid: "CAnew" }) });

test("places the installer-first call and logs it on the lead", async () => {
  const calls = [], ingested = [];
  const res = await handler(evt(JSON.stringify({ to: "(218) 555-1234", name: "Pat Client" })),
    { env: ENV, fetchImpl: async (u, i) => { calls.push({ u, body: i.body }); return okTwilio(); },
      ingest: async (b) => { ingested.push(b); return { ok: true }; } });
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).callSid, "CAnew");
  const form = new URLSearchParams(calls[0].body);
  assert.equal(form.get("To"), "+16052141335");
  assert.equal(form.get("From"), "+16124067117");
  assert.match(form.get("Url"), /twilio-call-bridge\?to=%2B12185551234$/);
  assert.equal(ingested[0].phone, "+12185551234");
  assert.match(ingested[0].message, /click-to-call placed by cody/);
});

test("no installer token -> 401, no call placed", async () => {
  const calls = [];
  const res = await handler(evt(JSON.stringify({ to: "2185551234" }), {}),
    { env: ENV, fetchImpl: async (u, i) => { calls.push(u); return okTwilio(); }, ingest: async () => ({ ok: true }) });
  assert.equal(res.statusCode, 401);
  assert.equal(calls.length, 0);
});

test("bad phone -> 400; Twilio create failure -> 502", async () => {
  const bad = await handler(evt(JSON.stringify({ to: "911" })), { env: ENV, fetchImpl: okTwilio, ingest: async () => ({ ok: true }) });
  assert.equal(bad.statusCode, 400);
  const down = await handler(evt(JSON.stringify({ to: "2185551234" })),
    { env: ENV, fetchImpl: async () => ({ ok: false, status: 500 }), ingest: async () => ({ ok: true }) });
  assert.equal(down.statusCode, 502);
});
