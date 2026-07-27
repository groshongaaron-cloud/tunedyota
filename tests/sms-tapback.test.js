const { test } = require("node:test");
const assert = require("node:assert/strict");
const { isTapbackText } = require("../netlify/functions/lib/twilio.js");
const { handler, relayInstallerReply } = require("../netlify/functions/twilio-sms.js");

const ENV = { TWILIO_AUTH_TOKEN: "t", CHAT_DISPATCHER: "aaron", INSTALLER_SMS_NUMBERS: '{"aaron":"+16126557611"}' };

test("isTapbackText matches every Apple reaction format, straight and curly quotes", () => {
  const hits = [
    'Loved "Cody here to save the day"',
    'Liked "see you at 10"',
    'Disliked "that price"',
    'Laughed at "Cody here to save the day"',
    'Emphasized "10:30 AM"',
    'Questioned "is that the V6?"',
    'Reacted 😂 to "Cody here to save the day"',
    "Loved “Cody here to save the day”",
    "Laughed at “multi\nline quote”",
  ];
  for (const s of hits) assert.equal(isTapbackText(s), true, s);
});

test("isTapbackText never matches real sentences", () => {
  const misses = [
    "Loved the tune, thanks!",
    "Liked it a lot",
    "Questioned whether it fits",
    'I Loved "the sound" of it',
    'Loved "the start" but not the end',
    "Reacted badly to the additive",
    "",
    null,
    "Emphasized",
  ];
  for (const s of misses) assert.equal(isTapbackText(s), false, String(s));
});

test("installer Tapback: consumed, stored as system note, never delivered to the client", async () => {
  let saved = null, delivered = false;
  const r = await relayInstallerReply({ from: "+16126557611", text: 'Loved "what oil did you use?"' }, {
    env: ENV,
    findSession: async () => ({ id: "sms:+15075550123", recordId: "r1", status: "escalated", installer: "aaron",
      customerName: "Mark", turns: [], lastActivity: new Date().toISOString(), lastRelayedAt: new Date().toISOString() }),
    save: async (s) => { saved = s; },
    sms: async () => { throw new Error("no sms expected"); },
    onInstallerTurn: async () => { delivered = true; },
  });
  assert.equal(r.relayed, true);
  assert.equal(delivered, false);
  assert.equal(saved.turns[0].role, "system");
  assert.match(saved.turns[0].text, /^\(reaction\) Loved/);
});

test("installer Tapback with no active thread: consumed silently", async () => {
  const r = await relayInstallerReply({ from: "+16126557611", text: 'Laughed at "ok"' }, {
    env: ENV, findSession: async () => null,
    save: async () => { throw new Error("must not save"); },
    sms: async () => { throw new Error("no sms expected"); },
  });
  assert.equal(r.relayed, true);
});

test("client Tapback: no lead, no AI/chat, transcript note when a session exists, empty TwiML", async () => {
  let ingested = false, chatCalled = false, saved = null;
  const res = await handler({ httpMethod: "POST", headers: { "x-twilio-signature": "sig" },
    body: "From=%2B15075550123&Body=" + encodeURIComponent('Laughed at "Cody here to save the day"'),
    rawUrl: "https://x/.netlify/functions/twilio-sms" }, {
    env: ENV, verify: () => true,
    ingest: async () => { ingested = true; },
    relay: async () => ({ relayed: false }),
    chat: async () => { chatCalled = true; return { status: 200, body: { reply: "nope" } }; },
    loadActive: async () => ({ id: "sms:+15075550123", recordId: "r1", status: "escalated", installer: "cody",
      turns: [{ role: "installer", text: "Cody here", at: Date.now() }], lastActivity: new Date().toISOString() }),
    save: async (s) => { saved = s; },
  });
  assert.equal(res.statusCode, 200);
  assert.ok(!res.body.includes("<Message>"), "empty TwiML — no auto-reply");
  assert.equal(ingested, false, "no lead from a reaction");
  assert.equal(chatCalled, false, "AI/relay path never runs");
  const note = saved.turns[saved.turns.length - 1];
  assert.equal(note.role, "system");
  assert.match(note.text, /^\(reaction\) Laughed at/);
});

test("client Tapback with no active session: consumed, nothing stored, no lead", async () => {
  let ingested = false;
  const res = await handler({ httpMethod: "POST", headers: { "x-twilio-signature": "sig" },
    body: "From=%2B15075550123&Body=" + encodeURIComponent('Loved "thanks"'),
    rawUrl: "https://x/.netlify/functions/twilio-sms" }, {
    env: ENV, verify: () => true,
    ingest: async () => { ingested = true; },
    relay: async () => ({ relayed: false }),
    loadActive: async () => null,
    save: async () => { throw new Error("must not save"); },
  });
  assert.equal(res.statusCode, 200);
  assert.ok(!res.body.includes("<Message>"));
  assert.equal(ingested, false);
});

test("regression: a plain client message still ingests and reaches chat", async () => {
  let ingested = false, chatCalled = false;
  await handler({ httpMethod: "POST", headers: { "x-twilio-signature": "sig" },
    body: "From=%2B15075550123&Body=Do+you+tune+4Runners%3F",
    rawUrl: "https://x/.netlify/functions/twilio-sms" }, {
    env: ENV, verify: () => true,
    ingest: async () => { ingested = true; },
    relay: async () => ({ relayed: false }),
    chat: async () => { chatCalled = true; return { status: 200, body: { reply: "Yes!" } }; },
    loadActive: async () => null,
  });
  assert.equal(ingested, true);
  assert.equal(chatCalled, true);
});
