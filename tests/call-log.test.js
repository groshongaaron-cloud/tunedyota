// tests/call-log.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/call-log.js");

const ENV = { TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t",
  INSTALLER_TOKENS: JSON.stringify({ cody: "tok-cody" }) };
const evt = (headers = { "x-installer-token": "tok-cody" }, method = "GET") =>
  ({ httpMethod: method, headers });
const twilioOk = (calls) => async () => ({ ok: true, json: async () => ({ calls }) });

test("lists calls newest-first and folds bridged child legs into the parent row", async () => {
  const calls = [
    { sid: "CA1", direction: "inbound", from: "+12185551234", to: "+16124067117",
      status: "completed", start_time: "Tue, 28 Jul 2026 14:00:00 +0000", duration: "95" },
    { sid: "CA2", direction: "outbound-api", from: "+16124067117", to: "+16052141335",
      status: "completed", start_time: "Tue, 28 Jul 2026 13:00:00 +0000", duration: "60" },
    { sid: "CA3", parent_call_sid: "CA2", direction: "outbound-dial", from: "+16124067117",
      to: "+14025556789", status: "completed", duration: "48" },
  ];
  let auth;
  const res = await handler(evt(), { env: ENV,
    fetchImpl: async (u, i) => { auth = i.headers.Authorization; return twilioOk(calls)(); } });
  assert.equal(res.statusCode, 200);
  assert.equal(auth, "Basic " + Buffer.from("AC1:t").toString("base64"));
  const out = JSON.parse(res.body).calls;
  assert.equal(out.length, 2, "child leg must not render as its own row");
  assert.equal(out[0].sid, "CA1");
  assert.equal(out[0].direction, "inbound");
  assert.equal(out[0].duration, 95);
  assert.equal(out[1].direction, "outbound");
  assert.equal(out[1].bridgedTo, "+14025556789", "client number folded in from the child leg");
});

test("no installer token -> 401, Twilio never called", async () => {
  let called = false;
  const res = await handler(evt({}), { env: ENV, fetchImpl: async () => { called = true; } });
  assert.equal(res.statusCode, 401);
  assert.equal(called, false);
});

test("non-GET -> 405", async () => {
  const res = await handler(evt(undefined, "POST"), { env: ENV, fetchImpl: async () => {} });
  assert.equal(res.statusCode, 405);
});

test("telephony not configured -> 502", async () => {
  const res = await handler(evt(), { env: { INSTALLER_TOKENS: ENV.INSTALLER_TOKENS },
    fetchImpl: async () => {} });
  assert.equal(res.statusCode, 502);
});

test("Twilio error -> 502, no body leak", async () => {
  const res = await handler(evt(), { env: ENV, fetchImpl: async () => ({ ok: false, status: 429 }) });
  assert.equal(res.statusCode, 502);
  assert.equal(res.body, "call list failed");
});
