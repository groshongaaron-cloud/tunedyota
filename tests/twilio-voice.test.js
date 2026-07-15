// tests/twilio-voice.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/twilio-voice.js");

const evt = (body, over = {}) => ({ headers: { "x-twilio-signature": "sig" }, body,
  rawUrl: "https://tunedyota.com/.netlify/functions/twilio-voice", ...over });

test("inbound call (no DialCallStatus) -> ingests + dials all forward numbers", async () => {
  const ingested = [];
  const res = await handler(evt("From=%2B16125551234&To=%2B16124067117"),
    { env: { TWILIO_FORWARD_NUMBERS: "+1611,+1622,+1633" }, verify: () => true,
      ingest: async (b) => { ingested.push(b); return { ok: true }; } });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /<Dial [^>]*timeout="20"/);
  assert.match(res.body, /callerId="\+16124067117"/);
  assert.match(res.body, /<Number>\+1611<\/Number><Number>\+1622<\/Number><Number>\+1633<\/Number>/);
  assert.equal(ingested[0].channel, "phone");
  assert.equal(ingested[0].message, "inbound call");
});

test("inbound call with NO forward numbers -> straight to voicemail", async () => {
  const res = await handler(evt("From=%2B16125551234&To=%2B16124067117"),
    { env: {}, verify: () => true, ingest: async () => ({ ok: true }) });
  assert.match(res.body, /<Record transcribe="true"/);
});

test("bad signature -> 403", async () => {
  const res = await handler(evt("From=x"), { env: {}, verify: () => false, ingest: async () => {} });
  assert.equal(res.statusCode, 403);
});
