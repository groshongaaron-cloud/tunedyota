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
  const screen = 'url="https://tunedyota\\.com/\\.netlify/functions/twilio-voice-screen"';
  assert.match(res.body, new RegExp(`<Number ${screen}>\\+1611</Number><Number ${screen}>\\+1622</Number><Number ${screen}>\\+1633</Number>`));
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

test("dial action completed -> notes 'answered' + hangs up", async () => {
  const ingested = [];
  const res = await handler(evt("From=%2B16125551234&DialCallStatus=completed"),
    { env: {}, verify: () => true, ingest: async (b) => { ingested.push(b); return { ok: true }; } });
  assert.match(res.body, /<Hangup\/>/);
  assert.equal(ingested[0].message, "call answered by installer");
});

test("dial action no-answer -> voicemail with transcription callback", async () => {
  const res = await handler(evt("From=%2B16125551234&DialCallStatus=no-answer"),
    { env: {}, verify: () => true, ingest: async () => ({ ok: true }) });
  assert.match(res.body, /<Say voice="Polly\.Matthew-Neural">/);
  assert.match(res.body, /<Record transcribe="true" transcribeCallback="[^"]*twilio-voice-transcription"/);
});

test("dial action busy -> voicemail (any non-completed status)", async () => {
  const res = await handler(evt("From=%2B16125551234&DialCallStatus=busy"),
    { env: {}, verify: () => true, ingest: async () => ({ ok: true }) });
  assert.match(res.body, /<Record transcribe="true"/);
});

test("ingest failure on the inbound leg still returns 200 Dial TwiML", async () => {
  const res = await handler(evt("From=%2B16125551234&To=%2B16124067117"),
    { env: { TWILIO_FORWARD_NUMBERS: "+1611" }, verify: () => true, ingest: async () => { throw new Error("down"); } });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /<Dial /);
});

// --- press-1 screening aftermath (DialBridged discriminates real answers) ---

test("completed but DialBridged=false (attempt 1) -> redials others, excluding the instant-pickup line", async () => {
  const ingested = [];
  const res = await handler(evt("From=%2B16125551234&To=%2B16124067117&DialCallStatus=completed&DialBridged=false&DialCallSid=CAchild"),
    { env: { TWILIO_FORWARD_NUMBERS: "+1611,+1622,+1633" }, verify: () => true,
      ingest: async (b) => { ingested.push(b); return { ok: true }; },
      lookupTo: async (sid) => (sid === "CAchild" ? "+1622" : "") });
  assert.match(res.body, /<Dial /);
  assert.match(res.body, /action="[^"]*twilio-voice\?attempt=2"/);
  assert.match(res.body, /<Number [^>]*>\+1611<\/Number><Number [^>]*>\+1633<\/Number>/);
  assert.doesNotMatch(res.body, /\+1622</);
  assert.match(ingested[0].message, /voicemail box/);
});

test("completed but DialBridged=false on attempt 2 -> business voicemail, no more redials", async () => {
  const res = await handler(evt("From=%2B16125551234&DialCallStatus=completed&DialBridged=false&DialCallSid=CAchild",
    { rawUrl: "https://tunedyota.com/.netlify/functions/twilio-voice?attempt=2" }),
    { env: { TWILIO_FORWARD_NUMBERS: "+1611,+1622,+1633" }, verify: () => true,
      ingest: async () => ({ ok: true }), lookupTo: async () => "+1622" });
  assert.match(res.body, /<Record transcribe="true"/);
});

test("completed but DialBridged=false with unknown eater -> redials all (degraded), still capped", async () => {
  const res = await handler(evt("From=%2B16125551234&DialCallStatus=completed&DialBridged=false&DialCallSid=CAchild"),
    { env: { TWILIO_FORWARD_NUMBERS: "+1611,+1622" }, verify: () => true,
      ingest: async () => ({ ok: true }), lookupTo: async () => "" });
  assert.match(res.body, /<Number [^>]*>\+1611<\/Number><Number [^>]*>\+1622<\/Number>/);
  assert.match(res.body, /attempt=2/);
});

test("completed but DialBridged=false when the eater was the ONLY forward number -> voicemail", async () => {
  const res = await handler(evt("From=%2B16125551234&DialCallStatus=completed&DialBridged=false&DialCallSid=CAchild"),
    { env: { TWILIO_FORWARD_NUMBERS: "+1622" }, verify: () => true,
      ingest: async () => ({ ok: true }), lookupTo: async () => "+1622" });
  assert.match(res.body, /<Record transcribe="true"/);
});

test("completed with DialBridged=true -> real answer, notes + hangs up", async () => {
  const ingested = [];
  const res = await handler(evt("From=%2B16125551234&DialCallStatus=completed&DialBridged=true"),
    { env: {}, verify: () => true, ingest: async (b) => { ingested.push(b); return { ok: true }; } });
  assert.match(res.body, /<Hangup\/>/);
  assert.equal(ingested[0].message, "call answered by installer");
});
