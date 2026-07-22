// tests/twilio-voice-screen.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/twilio-voice-screen.js");

const evt = (body, over = {}) => ({ headers: { "x-twilio-signature": "sig" }, body,
  rawUrl: "https://tunedyota.com/.netlify/functions/twilio-voice-screen", ...over });

test("answered leg (no Digits) -> gather with press-1 whisper, hangup fallback", async () => {
  const res = await handler(evt("CallSid=CA123&From=%2B16124067117"), { env: {}, verify: () => true });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /<Gather action="[^"]*twilio-voice-screen" method="POST" numDigits="1" timeout="5">/);
  assert.match(res.body, /Press 1 to accept/);
  assert.match(res.body, /<\/Gather><Hangup\/>/);
});

test("pressed 1 -> empty response bridges the call", async () => {
  const res = await handler(evt("CallSid=CA123&Digits=1"), { env: {}, verify: () => true });
  assert.match(res.body, /<Response\/>/);
});

test("pressed anything else -> hangup (leg counts as unanswered)", async () => {
  const res = await handler(evt("CallSid=CA123&Digits=5"), { env: {}, verify: () => true });
  assert.match(res.body, /<Response><Hangup\/><\/Response>/);
});

test("gather timeout posts empty Digits -> hangup, voicemail machines can't press", async () => {
  const res = await handler(evt("CallSid=CA123&Digits="), { env: {}, verify: () => true });
  assert.match(res.body, /<Response><Hangup\/><\/Response>/);
});

test("bad signature -> 403", async () => {
  const res = await handler(evt("CallSid=CA123"), { env: {}, verify: () => false });
  assert.equal(res.statusCode, 403);
});
