const { test } = require("node:test");
const assert = require("node:assert/strict");
const { dispatcherKey } = require("../netlify/functions/lib/routing.js");

test("dispatcherKey: env override, default aaron, garbage falls back", () => {
  assert.equal(dispatcherKey({ CHAT_DISPATCHER: "cody" }), "cody");
  assert.equal(dispatcherKey({}), "aaron");
  assert.equal(dispatcherKey({ CHAT_DISPATCHER: "nobody" }), "aaron");
  assert.equal(dispatcherKey(), "aaron");
  assert.equal(dispatcherKey(null), "aaron");
});

const { relayInstallerReply } = require("../netlify/functions/twilio-sms.js");
const ENV = { CHAT_DISPATCHER: "aaron", INSTALLER_SMS_NUMBERS: '{"aaron":"+16126557611","cody":"+16052141335","noah":"+19208607050"}' };
const mkSess = (over) => ({ id: "sms:+15075550123", recordId: "r1", status: "escalated", installer: "",
  customerName: "Mark", vehicle: "2019 4Runner", phone: "+15075550123",
  turns: [{ role: "user", text: "what oil?", at: Date.now() }],
  lastActivity: new Date().toISOString(), lastRelayedAt: new Date().toISOString(), ...over });

test("@cody from dispatcher assigns thread + handoff SMS to cody + confirm to aaron", async () => {
  const sent = []; let saved = null;
  const r = await relayInstallerReply({ from: "+16126557611", text: "@cody" }, {
    env: ENV, findSession: async () => mkSess(), save: async (s) => { saved = s; },
    sms: async (a) => { sent.push(a); },
  });
  assert.equal(r.relayed, true);
  assert.equal(saved.installer, "cody");
  const handoff = sent.find((a) => a.to === "+16052141335");
  assert.match(handoff.body, /Mark/); assert.match(handoff.body, /what oil\?/);
  assert.ok(sent.find((a) => a.to === "+16126557611" && /✓/.test(a.body)), "confirmation back to dispatcher");
});

test("@cody from a NON-dispatcher non-admin is not a command (falls through as reply text)", async () => {
  let saved = null;
  const r = await relayInstallerReply({ from: "+19208607050", text: "@cody" }, {
    env: ENV, findSession: async () => mkSess({ installer: "noah" }), save: async (s) => { saved = s; },
    sms: async () => {}, onInstallerTurn: async () => {},
  });
  assert.equal(r.relayed, true);
  assert.equal(saved.installer, "noah", "no reassignment");
  assert.equal(saved.turns[saved.turns.length - 1].text, "@cody");
});

test("dispatch with no active thread -> polite SMS back, consumed (no lead)", async () => {
  const sent = [];
  const r = await relayInstallerReply({ from: "+16126557611", text: "@cody" }, {
    env: ENV, findSession: async () => null, save: async () => {}, sms: async (a) => { sent.push(a); },
  });
  assert.equal(r.relayed, true);
  assert.match(sent[0].body, /no active chat/i);
});

test("plain dispatcher reply on unassigned thread claims it", async () => {
  let saved = null;
  await relayInstallerReply({ from: "+16126557611", text: "Yes that fits your truck." }, {
    env: ENV, findSession: async () => mkSess(), save: async (s) => { saved = s; }, sms: async () => {},
    onInstallerTurn: async () => {},
  });
  assert.equal(saved.installer, "aaron");
  assert.equal(saved.turns[saved.turns.length - 1].role, "installer");
});

const { loadRelayTargetSession } = require("../netlify/functions/lib/chat-store.js");

test("loadRelayTargetSession picks greatest Last Relayed At; dispatcher also sees unassigned", async () => {
  const now = new Date().toISOString();
  const rec = (id, installer, relayedAt) => ({ id: "rec" + id, fields: { "Session ID": id, Status: "escalated",
    Installer: installer, Transcript: "[]", "Last Activity": now, "Last Relayed At": relayedAt } });
  const fetchImpl = async (url) => ({ ok: true, status: 200, json: async () => ({ records:
    decodeURIComponent(String(url)).includes('{Installer}=""')
      ? [rec("A", "", "2026-07-27T10:00:00.000Z"), rec("B", "aaron", "2026-07-27T12:00:00.000Z")]
      : [rec("B", "aaron", "2026-07-27T12:00:00.000Z")] }) });
  const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", CHAT_DISPATCHER: "aaron" };
  const s = await loadRelayTargetSession("aaron", { env, fetchImpl });
  assert.equal(s.id, "B"); // most recently relayed wins, unassigned included in the pool
});
