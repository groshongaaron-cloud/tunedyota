const { test } = require("node:test");
const assert = require("node:assert/strict");
const { relayClientTurn, relayTargetKey, relayLabel, isReturningClient, countActiveFor } = require("../netlify/functions/lib/installer-relay.js");

const ENV = { CHAT_DISPATCHER: "aaron", INSTALLER_SMS_NUMBERS: '{"aaron":"+16126557611","cody":"+16052141335"}' };

test("relayTargetKey: assigned installer, else dispatcher", () => {
  assert.equal(relayTargetKey({ installer: "cody" }, ENV), "cody");
  assert.equal(relayTargetKey({ installer: "" }, ENV), "aaron");
});

test("relayLabel: head line with NEW/RETURNING tag, warning at 2+, dispatch hint on unassigned first relay", () => {
  const sess = { customerName: "Cody Smith", vehicle: "2021 Toyota Tundra", installer: "" };
  const l1 = relayLabel(sess, { returning: false, activeCount: 1, firstRelay: true, env: ENV });
  assert.match(l1[0], /^TY · Cody Smith · 2021 Toyota Tundra · NEW$/);
  assert.ok(l1.some((x) => /@cody/.test(x) && /@noah/.test(x)), "dispatch hint lists other installers");
  const l2 = relayLabel({ ...sess, installer: "cody" }, { returning: true, activeCount: 3, firstRelay: false, env: ENV });
  assert.match(l2[0], /RETURNING$/);
  assert.ok(l2.some((x) => /3 active chats/.test(x)));
  assert.ok(!l2.some((x) => /dispatch/.test(x)), "no hint once assigned");
  const l3 = relayLabel(sess, { returning: null, activeCount: 1, firstRelay: false, env: ENV });
  assert.ok(!/NEW|RETURNING/.test(l3[0]), "unknown history -> no tag");
});

test("relayClientTurn: SMS to target's number, stamps lastRelayedAt, survives lookup failures", async () => {
  const sent = [];
  const sess = { id: "sms:+15075550123", installer: "", customerName: "Mark", vehicle: "2019 4Runner", phone: "+15075550123", turns: [] };
  await relayClientTurn(sess, "What oil did you use?", {
    env: ENV,
    sms: async (a) => { sent.push(a); return { ok: true }; },
    returningLookup: async () => { throw new Error("airtable down"); },
    activeFor: async () => 1,
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "+16126557611"); // dispatcher's cell — unassigned intake
  assert.match(sent[0].body, /TY · Mark · 2019 4Runner/);
  assert.match(sent[0].body, /What oil did you use\?/);
  assert.ok(sess.lastRelayedAt, "stamped for reply routing");
});

test("relayClientTurn: send failure propagates (caller logs; turn already safe)", async () => {
  const sess = { installer: "cody", customerName: "M", vehicle: "", phone: "", turns: [] };
  await assert.rejects(() => relayClientTurn(sess, "hi", {
    env: ENV, sms: async () => { throw new Error("twilio 500"); },
    returningLookup: async () => null, activeFor: async () => 1,
  }));
  assert.ok(!sess.lastRelayedAt, "no stamp when nothing reached the phone");
});

test("relayClientTurn: {ok:false} from sendSms counts as failure — throws, no stamp", async () => {
  const sess = { installer: "cody", customerName: "M", vehicle: "", phone: "", turns: [] };
  await assert.rejects(() => relayClientTurn(sess, "hi", {
    env: ENV, sms: async () => ({ ok: false, error: "A2P blocked" }),
    returningLookup: async () => null, activeFor: async () => 1,
  }), /A2P blocked/);
  assert.ok(!sess.lastRelayedAt);
});

test("isReturningClient: separator-stripping formula, short phone -> null without fetch", async () => {
  let url = "";
  const fetchImpl = async (u) => { url = decodeURIComponent(String(u)); return { ok: true, status: 200, json: async () => ({ records: [{ id: "r", fields: {} }] }) }; };
  const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };
  const r = await isReturningClient({ phone: "+15075550123" }, { env, fetchImpl });
  assert.equal(r, true);
  assert.match(url, /SUBSTITUTE/);
  assert.match(url, /5075550123/);
  assert.match(url, /\{Status\}="Completed"/);
  let fetched = false;
  const r2 = await isReturningClient({ phone: "555012" }, { env, fetchImpl: async () => { fetched = true; } });
  assert.equal(r2, null);
  assert.equal(fetched, false);
});

test("countActiveFor: dispatcher filter includes unassigned; stale sessions excluded", async () => {
  const now = Date.now();
  const fresh = new Date(now - 60 * 60 * 1000).toISOString();
  const dead = new Date(now - 80 * 60 * 60 * 1000).toISOString();
  let url = "";
  const fetchImpl = async (u) => { url = decodeURIComponent(String(u)); return { ok: true, status: 200, json: async () => ({ records: [
    { id: "1", fields: { "Session ID": "a", "Last Activity": fresh } },
    { id: "2", fields: { "Session ID": "b", "Last Activity": dead } },
  ] }) }; };
  const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", CHAT_DISPATCHER: "aaron" };
  const n = await countActiveFor("aaron", { env, fetchImpl });
  assert.equal(n, 1); // stale one dropped
  assert.match(url, /\{Installer\}=""/); // unassigned included for dispatcher
  await countActiveFor("cody", { env, fetchImpl });
  assert.ok(!/\{Installer\}=""/.test(url), "non-dispatcher scoped to own key only");
});

test("relayClientTurn truncates long messages with a visible marker", async () => {
  const sent = [];
  const sess = { installer: "cody", customerName: "M", vehicle: "", phone: "", turns: [] };
  await relayClientTurn(sess, "x".repeat(400), {
    env: ENV, sms: async (a) => { sent.push(a); return { ok: true }; },
    returningLookup: async () => null, activeFor: async () => 1,
  });
  assert.match(sent[0].body, /x{10}\.\.\."$/);
  assert.ok(sent[0].body.length < 400);
});
