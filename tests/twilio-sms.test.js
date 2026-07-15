// tests/twilio-sms.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/twilio-sms.js");

const evt = (over = {}) => ({ headers: { "x-twilio-signature": "sig" },
  body: "From=%2B16125551234&Body=Interested+in+a+tune",
  rawUrl: "https://tunedyota.com/.netlify/functions/twilio-sms", ...over });

test("valid signature -> ingests an sms lead + returns Message TwiML", async () => {
  const ingested = [];
  const res = await handler(evt(), { env: { TWILIO_AUTH_TOKEN: "t" }, verify: () => true,
    ingest: async (b) => { ingested.push(b); return { ok: true }; } });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["Content-Type"], /xml/);
  assert.match(res.body, /<Message>/);
  assert.equal(ingested.length, 1);
  assert.equal(ingested[0].channel, "sms");
  assert.equal(ingested[0].phone, "+16125551234");
  assert.equal(ingested[0].goals, "Interested in a tune");
});

test("bad signature -> 403 and no ingest", async () => {
  const ingested = [];
  const res = await handler(evt(), { env: {}, verify: () => false, ingest: async (b) => { ingested.push(b); } });
  assert.equal(res.statusCode, 403);
  assert.equal(ingested.length, 0);
});

test("ingest failure still returns 200 TwiML (never break the texter)", async () => {
  const res = await handler(evt(), { env: {}, verify: () => true, ingest: async () => { throw new Error("down"); } });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /<Message>/);
});
