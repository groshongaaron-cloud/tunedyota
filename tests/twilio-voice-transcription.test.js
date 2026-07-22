// tests/twilio-voice-transcription.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/twilio-voice-transcription.js");

const evt = (body) => ({ headers: { "x-twilio-signature": "sig" }, body,
  rawUrl: "https://tunedyota.com/.netlify/functions/twilio-voice-transcription" });

test("valid signature -> ingests the transcript update + returns 200", async () => {
  const ingested = [];
  const res = await handler(evt("From=%2B16125551234&TranscriptionText=Call+me+about+my+Tacoma&RecordingUrl=https%3A%2F%2Frec%2F1"),
    { env: {}, verify: () => true, ingest: async (b) => { ingested.push(b); return { ok: true }; } });
  assert.equal(res.statusCode, 200);
  assert.equal(ingested[0].phone, "+16125551234");
  assert.match(ingested[0].message, /voicemail: Call me about my Tacoma — https:\/\/rec\/1/);
});

test("bad signature -> 403 and no ingest", async () => {
  const ingested = [];
  const res = await handler(evt("From=x"), { env: {}, verify: () => false, ingest: async (b) => { ingested.push(b); } });
  assert.equal(res.statusCode, 403);
  assert.equal(ingested.length, 0);
});

test("empty transcription still returns 200 (best-effort)", async () => {
  const res = await handler(evt("From=%2B16125551234&TranscriptionText="),
    { env: {}, verify: () => true, ingest: async () => { throw new Error("down"); } });
  assert.equal(res.statusCode, 200);
});

test("voicemail Slack-pings the owner with caller, transcript, and recording link", async () => {
  const pings = [];
  const res = await handler(evt("From=%2B16125551234&TranscriptionText=Call+me+about+my+Tacoma&RecordingUrl=https%3A%2F%2Frec%2F1"),
    { env: { SLACK_WEBHOOK_URL: "https://hooks/x" }, verify: () => true,
      ingest: async () => ({ ok: true }),
      notify: async (o) => { pings.push(o); return { ok: true }; } });
  assert.equal(res.statusCode, 200);
  assert.equal(pings.length, 1);
  assert.match(pings[0].text, /voicemail/i);
  assert.match(pings[0].text, /612-555-1234/);
  assert.match(pings[0].text, /Call me about my Tacoma/);
  assert.match(pings[0].text, /https:\/\/rec\/1/);
});

test("Slack failure never breaks the 200 response", async () => {
  const res = await handler(evt("From=%2B16125551234&TranscriptionText=hi"),
    { env: { SLACK_WEBHOOK_URL: "https://hooks/x" }, verify: () => true,
      ingest: async () => ({ ok: true }), notify: async () => { throw new Error("slack down"); } });
  assert.equal(res.statusCode, 200);
});
