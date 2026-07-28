// tests/chat-urgent-visit.test.js — spec 2026-07-28-address-seeking-urgent-escalation
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { detectVisitIntent } = require("../netlify/functions/lib/urgent-visit.js");
const { processChat, urgentEscalate } = require("../netlify/functions/chat.js");

// --- detector -----------------------------------------------------------

test("detector: positives straight from the 2026-07-28 incident transcript", () => {
  assert.equal(detectVisitIntent("Send me that address and I’ll be on my way", {}), "visit-intent");
  assert.equal(detectVisitIntent("On my way", {}), "visit-intent");
  assert.equal(detectVisitIntent("omw", {}), "visit-intent");
  assert.equal(detectVisitIntent("https://maps.apple.com/place?coordinate=45.5,-93.2&name=Dropped%20Pin", {}), "map-pin");
  assert.equal(detectVisitIntent("18758 iden ave\nLakeville", {}), "address-fragment");
});

test("detector: more visit-intent shapes", () => {
  for (const t of ["can I swing by tonight?", "I'll stop by after work", "leaving now",
    "ok be there in 20", "heading over", "do you take walk-ins?", "see you soon"]) {
    assert.equal(detectVisitIntent(t, {}), "visit-intent", t);
  }
  assert.equal(detectVisitIntent("https://www.google.com/maps/place/somewhere", {}), "map-pin");
});

test("detector: negatives — routine business stays silent", () => {
  for (const t of ["what's the address for the Madison event?",
    "my address is 123 Oak St, Des Moines",
    "how much for a 2021 Tundra tune?",
    "where are you located?" /* address-seeking alone = Tier B, not Tier A */]) {
    assert.equal(detectVisitIntent(t, {}), "", t);
  }
});

test("detector: TY_ADDRESS_FRAGMENTS env overrides the built-in fragments", () => {
  const env = { TY_ADDRESS_FRAGMENTS: "999 condo way, 55337" };
  assert.equal(detectVisitIntent("meet you at 999 Condo Way?", env), "address-fragment");
  assert.equal(detectVisitIntent("zip is 55337 right?", env), "address-fragment");
  assert.equal(detectVisitIntent("18758 iden ave", env), "", "override replaces defaults");
});

// --- processChat tripwire -------------------------------------------------

const ENV = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", ANTHROPIC_API_KEY: "k" };
const baseDeps = (over = {}) => ({
  env: ENV, log: { error: () => {} },
  load: async () => null,
  save: async (s) => s,
  ai: async () => ({ reply: "hello there", transfer: null }),
  relay: async () => {},
  doEscalate: async () => ({ installer: { name: "Aaron Groshong", phone: "(612) 406-7117" } }),
  doUrgent: async () => {},
  ...over,
});

test("tripwire: visit-intent message escalates without the model, once", async () => {
  const saved = [], urgent = [];
  let aiCalled = false;
  const out = await processChat({ session: "sms:+16512781401", message: "Send me that address and I'll be on my way", page: "sms" },
    baseDeps({
      load: async () => ({ id: "sms:+16512781401", recordId: "r1", status: "ai", turns: [], phone: "+16512781401", lastActivity: new Date().toISOString() }),
      save: async (s) => { saved.push(JSON.parse(JSON.stringify(s))); return s; },
      ai: async () => { aiCalled = true; return { reply: "", transfer: null }; },
      doUrgent: async (a) => { urgent.push(a); },
    }));
  assert.equal(out.status, 200);
  assert.equal(out.body.urgent, true);
  assert.equal(out.body.escalated, true);
  assert.match(out.body.reply, /Aaron/);
  assert.match(out.body.reply, /don't head anywhere/i);
  assert.equal(aiCalled, false, "fixed copy, no model call");
  assert.equal(urgent.length, 1);
  assert.equal(urgent[0].why, "visit-intent");
  const s = saved[saved.length - 1];
  assert.equal(s.status, "escalated");
  assert.equal(s.installer, "", "dispatcher-first");
  assert.ok(s.lastRelayedAt, "urgent SMS counts as first relay");
  assert.ok(s.urgentAt);
  assert.equal(s.turns.length, 2); // user + fixed assistant reply
});

test("tripwire: already-escalated thread does not re-fire — normal relay handles it", async () => {
  const urgent = [], relayed = [];
  const out = await processChat({ session: "sms:+15550001111", message: "on my way", page: "sms" },
    baseDeps({
      load: async () => ({ id: "sms:+15550001111", recordId: "r2", status: "escalated", installer: "aaron", turns: [], lastActivity: new Date().toISOString(), pageContext: "sms-direct" }),
      relay: async (s, m) => { relayed.push(m); },
      doUrgent: async (a) => { urgent.push(a); },
    }));
  assert.equal(out.status, 200);
  assert.equal(urgent.length, 0);
  assert.deepEqual(relayed, ["on my way"]);
});

test("tripwire: routine event-address question flows to the AI untouched", async () => {
  const urgent = [];
  let aiCalled = false;
  const out = await processChat({ session: "s-web", message: "what's the address for the Madison event?", page: "default" },
    baseDeps({ ai: async () => { aiCalled = true; return { reply: "It's on the booking page!", transfer: null }; },
               doUrgent: async (a) => { urgent.push(a); } }));
  assert.equal(out.status, 200);
  assert.equal(urgent.length, 0);
  assert.equal(aiCalled, true);
  assert.equal(out.body.urgent, undefined);
});

// --- urgentEscalate -------------------------------------------------------

const URGENT_ENV = { CHAT_DISPATCHER: "aaron", INSTALLER_SMS_NUMBERS: JSON.stringify({ aaron: "+16126557611" }), SLACK_WEBHOOK_URL: "https://hooks.example" };

test("urgentEscalate: SMS to dispatcher carries URGENT + message + dispatch keys; push/slack/log fire", async () => {
  const sms = [], pushes = [], slacks = [], logs = [], ingested = [];
  await urgentEscalate({ sess: { id: "sms:+16512781401", phone: "+16512781401", customerName: "", pageContext: "sms" },
      message: "On my way", why: "visit-intent" },
    { env: URGENT_ENV, log: { error: () => {} },
      sms: async (a) => { sms.push(a); }, push: async (k, m) => { pushes.push({ k, m }); },
      slack: async (t) => { slacks.push(t); }, ingest: async (b) => { ingested.push(b); },
      logEscalation: async (f) => { logs.push(f); } });
  assert.equal(sms.length, 1);
  assert.equal(sms[0].to, "+16126557611");
  assert.match(sms[0].body, /URGENT/);
  assert.match(sms[0].body, /COMING TO YOU/);
  assert.match(sms[0].body, /On my way/);
  assert.match(sms[0].body, /@cody/);
  assert.match(sms[0].body, /@noah/);
  assert.equal(pushes[0].k, "aaron");
  assert.equal(slacks.length, 1);
  assert.equal(logs[0].Reason, "urgent-visit-intent");
  assert.equal(ingested[0].phone, "+16512781401");
});

test("urgentEscalate: SMS failure is loud — Slack carries the full alert instead", async () => {
  const slacks = [];
  await urgentEscalate({ sess: { id: "sms:+15550002222", phone: "+15550002222" }, message: "omw", why: "visit-intent" },
    { env: URGENT_ENV, log: { error: () => {} },
      sms: async () => { throw new Error("carrier down"); },
      push: async () => {}, slack: async (t) => { slacks.push(t); },
      ingest: async () => {}, logEscalation: async () => {} });
  assert.ok(slacks.some((t) => /SMS FAILED/.test(t) && /URGENT/.test(t)));
});
