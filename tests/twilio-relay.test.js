const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handler, relayInstallerReply } = require("../netlify/functions/twilio-sms.js");

test("relayInstallerReply appends installer turn to active escalated session", async () => {
  let saved;
  const r = await relayInstallerReply({ from: "+16124067117", text: "Aaron here — yes it fits." }, {
    findSession: async (key) => key === "aaron" ? { id: "s1", recordId: "r", status: "escalated", turns: [], lastActivity: new Date().toISOString() } : null,
    save: async (s) => { saved = s; return s; },
  });
  assert.equal(r.relayed, true);
  assert.equal(saved.turns[0].role, "installer");
  assert.match(saved.turns[0].text, /yes it fits/);
});

test("relayInstallerReply passes through non-installer numbers and installers with no session", async () => {
  const r1 = await relayInstallerReply({ from: "+15079999999", text: "hi" }, { findSession: async () => null, save: async () => {} });
  assert.equal(r1.relayed, false);
  const r2 = await relayInstallerReply({ from: "+16124067117", text: "hi" }, { findSession: async () => null, save: async () => {} });
  assert.equal(r2.relayed, false);
});

test("handler: installer relay returns empty TwiML (no auto-reply, no lead)", async () => {
  let ingested = false;
  const res = await handler({ httpMethod: "POST", headers: { "x-twilio-signature": "sig" },
    body: "From=%2B16124067117&Body=on+my+way", rawUrl: "https://x/.netlify/functions/twilio-sms" }, {
    env: { TWILIO_AUTH_TOKEN: "t" }, verify: () => true,
    ingest: async () => { ingested = true; },
    relay: async () => ({ relayed: true }),
  });
  assert.equal(ingested, false);
  assert.ok(!res.body.includes("<Message>"));
});

test("handler: normal SMS unchanged — ingests lead and auto-replies", async () => {
  let ingested = false;
  const res = await handler({ httpMethod: "POST", headers: { "x-twilio-signature": "sig" },
    body: "From=%2B15075550123&Body=price%3F", rawUrl: "https://x/.netlify/functions/twilio-sms" }, {
    env: { TWILIO_AUTH_TOKEN: "t" }, verify: () => true,
    ingest: async () => { ingested = true; },
    relay: async () => ({ relayed: false }),
  });
  assert.equal(ingested, true);
  assert.ok(res.body.includes("<Message>"));
});
