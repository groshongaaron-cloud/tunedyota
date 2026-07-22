// tests/twilio-call-bridge.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/twilio-call-bridge.js");

const RAW = "https://tunedyota.com/.netlify/functions/twilio-call-bridge?to=%2B12185551234";
const evt = (body, rawUrl = RAW) => ({ headers: { "x-twilio-signature": "sig" }, body, rawUrl });
const ENV = { TWILIO_FROM_NUMBER: "+16124067117" };

test("installer answers (no Digits) -> press-1 gate with query-preserving action", async () => {
  const res = await handler(evt("CallSid=CA1"), { env: ENV, verify: () => true });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /<Gather action="[^"]*twilio-call-bridge\?to=%2B12185551234" method="POST" numDigits="1"/);
  assert.match(res.body, /Press 1 to connect/);
  assert.match(res.body, /<\/Gather><Hangup\/>/);
});

test("press 1 -> dials the client with the business caller ID", async () => {
  const res = await handler(evt("CallSid=CA1&Digits=1"), { env: ENV, verify: () => true });
  assert.match(res.body, /<Dial answerOnBridge="true" callerId="\+16124067117"><Number>\+12185551234<\/Number><\/Dial>/);
});

test("any other digit or gather timeout -> hangup, client never dialed", async () => {
  const res = await handler(evt("CallSid=CA1&Digits=5"), { env: ENV, verify: () => true });
  assert.match(res.body, /<Response><Hangup\/><\/Response>/);
  const timeout = await handler(evt("CallSid=CA1&Digits="), { env: ENV, verify: () => true });
  assert.match(timeout.body, /<Response><Hangup\/><\/Response>/);
});

test("missing or malformed target -> hangup; bad signature -> 403", async () => {
  const noTo = await handler(evt("CallSid=CA1", "https://tunedyota.com/.netlify/functions/twilio-call-bridge"),
    { env: ENV, verify: () => true });
  assert.match(noTo.body, /<Hangup\/>/);
  const sig = await handler(evt("CallSid=CA1"), { env: ENV, verify: () => false });
  assert.equal(sig.statusCode, 403);
});
