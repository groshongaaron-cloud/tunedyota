const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processOptin } = require("../netlify/functions/nurture-optin.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", RESEND_API_KEY: "re" };

test("valid opt-in creates a lead-magnet lead, stamps step 1, sends step 1", async () => {
  let ingested, patched, sentMsg;
  const out = await processOptin({ email: "new@lead.com", name: "Pat", vehicle: "Tacoma" },
    { env, ingest: async (b) => { ingested = b; return { status: "lead", recordId: "recN" }; },
      update: async (a) => { patched = a.fields; return {}; },
      send: async (m) => { sentMsg = m; return { ok: true }; } });
  assert.equal(out.status, "ok");
  assert.equal(out.recordId, "recN");
  assert.equal(out.sent, true);
  assert.equal(ingested.source, "lead-magnet");
  assert.equal(patched["Nurture Step"], 1);
  assert.ok(patched["Nurture Last Sent"]);
  assert.equal(sentMsg.to, "new@lead.com");
});
test("rejects a bad email without touching the store", async () => {
  let touched = false;
  const out = await processOptin({ email: "notanemail" },
    { env, ingest: async () => { touched = true; return {}; }, update: async () => ({}), send: async () => ({}) });
  assert.equal(out.error, "bad-email");
  assert.equal(touched, false);
});
test("a bot honeypot is silently ignored", async () => {
  const out = await processOptin({ email: "x@y.com", bot_field: "spam" },
    { env, ingest: async () => ({}), update: async () => ({}), send: async () => ({}) });
  assert.equal(out.status, "ignored");
});
test("a send failure still returns ok (lead captured) with sent:false", async () => {
  const out = await processOptin({ email: "a@b.co" },
    { env, ingest: async () => ({ status: "lead", recordId: "r1" }), update: async () => ({}),
      send: async () => { throw new Error("resend down"); }, log: { error() {} } });
  assert.equal(out.status, "ok");
  assert.equal(out.sent, false);
});
