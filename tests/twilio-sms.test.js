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

// --- STOP/HELP/START guard: Twilio Advanced Opt-Out owns these replies; our
// webhook must produce no lead and no auto-reply (an auto-reply to STOP would
// itself violate the opt-out).
for (const kw of ["STOP", "stop", " Stop ", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "HELP", "help", "INFO", "START", "YES", "UNSTOP", "Stop."]) {
  test(`keyword "${kw}" -> empty TwiML, no lead, no relay`, async () => {
    const ingested = [], relayed = [];
    const res = await handler(evt({ body: `From=%2B16125551234&Body=${encodeURIComponent(kw)}` }), {
      env: {}, verify: () => true,
      ingest: async (b) => { ingested.push(b); },
      relay: async (m) => { relayed.push(m); return { relayed: false }; } });
    assert.equal(res.statusCode, 200);
    assert.doesNotMatch(res.body, /<Message>/);
    assert.equal(ingested.length, 0, "must not create a lead");
    assert.equal(relayed.length, 0, "must not hit the relay path");
  });
}

test("keyword embedded in a real message is NOT swallowed", async () => {
  const ingested = [];
  const res = await handler(evt({ body: "From=%2B16125551234&Body=" + encodeURIComponent("Please stop by Saturday, does 10am work?") }), {
    env: {}, verify: () => true, ingest: async (b) => { ingested.push(b); } });
  assert.equal(ingested.length, 1);
  assert.match(res.body, /<Message>/);
});

// --- sms: chat sessions (AI parity on inbound texts) ---

test("customer text routes into an sms: session and the AI reply goes back as TwiML", async () => {
  const chats = [];
  const res = await handler(evt(), { env: { TWILIO_AUTH_TOKEN: "t" }, verify: () => true,
    ingest: async () => ({ ok: true }), relay: async () => ({ relayed: false }),
    loadActive: async () => null,
    chat: async (b) => { chats.push(b); return { status: 200, body: { reply: "Yes — we tune 4Runners! What year is yours?" } }; } });
  assert.equal(chats[0].session, "sms:+16125551234");
  assert.equal(chats[0].page, "sms");
  assert.match(res.body, /<Message>Yes — we tune 4Runners! What year is yours\?<\/Message>/);
});

test("human-only thread (installer-initiated): customer text saved, NO auto-reply", async () => {
  const res = await handler(evt(), { env: { TWILIO_AUTH_TOKEN: "t" }, verify: () => true,
    ingest: async () => ({ ok: true }), relay: async () => ({ relayed: false }),
    loadActive: async () => ({ id: "sms:+16125551234" }),
    chat: async () => ({ status: 200, body: { reply: "", escalated: true } }) });
  assert.match(res.body, /<Response><\/Response>/);
});

test("expired session re-mints with a timestamp suffix and retries once", async () => {
  const sessions = [];
  const res = await handler(evt(), { env: { TWILIO_AUTH_TOKEN: "t" }, verify: () => true,
    ingest: async () => ({ ok: true }), relay: async () => ({ relayed: false }),
    loadActive: async () => ({ id: "sms:+16125551234" }),
    chat: async (b) => { sessions.push(b.session);
      return sessions.length === 1 ? { status: 200, body: { expired: true, reply: "" } }
        : { status: 200, body: { reply: "Fresh thread reply" } }; } });
  assert.equal(sessions.length, 2);
  assert.match(sessions[1], /^sms:\+16125551234:\d+$/);
  assert.match(res.body, /Fresh thread reply/);
});

test("degraded AI falls back to the canned SMS reply, not the web fallback text", async () => {
  const res = await handler(evt(), { env: { TWILIO_AUTH_TOKEN: "t" }, verify: () => true,
    ingest: async () => ({ ok: true }), relay: async () => ({ relayed: false }),
    loadActive: async () => null,
    chat: async () => ({ status: 200, body: { reply: "Sorry — I'm having trouble right now.", degraded: true } }) });
  assert.match(res.body, /Thanks for texting Tuned Yota!/);
});
