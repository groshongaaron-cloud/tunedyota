// tests/meta-dm.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { handler, normalizeEvents } = require("../netlify/functions/meta-dm.js");

const SECRET = "shh";
const ENV_KEYS = { META_APP_SECRET: SECRET, META_VERIFY_TOKEN: "vt-1" };
function withEnv(fn) {
  const prev = {};
  for (const [k, v] of Object.entries(ENV_KEYS)) { prev[k] = process.env[k]; process.env[k] = v; }
  return Promise.resolve(fn()).finally(() => {
    for (const k of Object.keys(ENV_KEYS)) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; }
  });
}
const sign = (body) => "sha256=" + crypto.createHmac("sha256", SECRET).update(body).digest("hex");

const PAGE_EVENT = JSON.stringify({ object: "page", entry: [{ id: "PAGE1", time: 1, messaging: [
  { sender: { id: "PSID9" }, recipient: { id: "PAGE1" }, timestamp: 1, message: { mid: "m_1", text: "do you tune 4runners?" } },
] }] });
const IG_EVENT = JSON.stringify({ object: "instagram", entry: [{ id: "IGB1", time: 2, messaging: [
  { sender: { id: "IGSID7" }, recipient: { id: "IGB1" }, timestamp: 2, message: { mid: "aW_2", text: "price on tundra tune?" } },
] }] });

test("GET handshake echoes hub.challenge only with the right verify token", () => withEnv(async () => {
  const ok = await handler({ httpMethod: "GET", queryStringParameters: { "hub.mode": "subscribe", "hub.verify_token": "vt-1", "hub.challenge": "12345" } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body, "12345");
  const bad = await handler({ httpMethod: "GET", queryStringParameters: { "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "x" } });
  assert.equal(bad.statusCode, 403);
}));

test("GET fails closed when META_VERIFY_TOKEN is unset", async () => {
  const prev = process.env.META_VERIFY_TOKEN; delete process.env.META_VERIFY_TOKEN;
  const res = await handler({ httpMethod: "GET", queryStringParameters: { "hub.verify_token": "", "hub.challenge": "x" } });
  if (prev !== undefined) process.env.META_VERIFY_TOKEN = prev;
  assert.equal(res.statusCode, 403);
});

test("POST rejects a bad signature and never processes it", () => withEnv(async () => {
  const res = await handler({ httpMethod: "POST", headers: { "x-hub-signature-256": "sha256=bad" }, body: PAGE_EVENT });
  assert.equal(res.statusCode, 403);
}));

test("normalizeEvents extracts page and instagram messages, skips echo/read/delivery", () => {
  const page = normalizeEvents(JSON.parse(PAGE_EVENT));
  assert.deepEqual(page, [{ platform: "facebook", senderId: "PSID9", mid: "m_1", text: "do you tune 4runners?" }]);
  const ig = normalizeEvents(JSON.parse(IG_EVENT));
  assert.deepEqual(ig, [{ platform: "instagram", senderId: "IGSID7", mid: "aW_2", text: "price on tundra tune?" }]);
  const noise = normalizeEvents({ object: "page", entry: [{ messaging: [
    { sender: { id: "P" }, message: { mid: "m", text: "self", is_echo: true } },
    { sender: { id: "P" }, read: { watermark: 1 } },
    { sender: { id: "P" }, delivery: { mids: [] } },
  ] }] });
  assert.deepEqual(noise, []);
});

test("attachment-only messages normalize to the [attachment] marker", () => {
  const out = normalizeEvents({ object: "page", entry: [{ messaging: [
    { sender: { id: "P2" }, message: { mid: "m_9", attachments: [{ type: "image" }] } },
  ] }] });
  assert.deepEqual(out, [{ platform: "facebook", senderId: "P2", mid: "m_9", text: "[attachment]" }]);
});

test("POST with valid signature always returns 200 even when processing throws", () => withEnv(async () => {
  const res = await handler({ httpMethod: "POST", headers: { "x-hub-signature-256": sign(PAGE_EVENT) }, body: PAGE_EVENT },
    { processDm: async () => { throw new Error("boom"); }, notify: async () => {} });
  assert.equal(res.statusCode, 200);
}));

const { processDm } = require("../netlify/functions/meta-dm.js");

function bridgeDeps(over = {}) {
  const sent = [], notified = [], saved = [];
  return {
    refs: { sent, notified, saved },
    deps: Object.assign({
      env: { META_PAGE_TOKEN: "tok", SLACK_WEBHOOK_URL: "https://hooks.example" },
      findActive: async () => null,
      chat: async (body) => ({ status: 200, body: { reply: "Happy to help!", escalated: false } }),
      send: async (args) => { sent.push(args); return { ok: true }; },
      notify: async (text) => { notified.push(text); },
      profile: async () => "Pat K",
      now: () => 1752900000000,
    }, over),
  };
}

test("processDm: new sender -> new session id, chat called, reply delivered, owner notified once", async () => {
  const { deps, refs } = bridgeDeps();
  const chatCalls = [];
  deps.chat = async (body) => { chatCalls.push(body); return { status: 200, body: { reply: "Yes we tune those!", escalated: false } }; };
  await processDm({ platform: "facebook", senderId: "PSID9", mid: "m_1", text: "do you tune 4runners?" }, deps);
  assert.deepEqual(chatCalls[0], { session: "fb:PSID9", message: "do you tune 4runners?", page: "facebook" });
  assert.deepEqual(refs.sent[0], { platform: "facebook", recipientId: "PSID9", text: "Yes we tune those!" });
  assert.equal(refs.notified.length, 1);
  assert.match(refs.notified[0], /New facebook DM/i);
  assert.match(refs.notified[0], /Pat K/);
});

test("processDm: existing active session reuses its id and does NOT re-notify", async () => {
  const { deps, refs } = bridgeDeps({ findActive: async () => ({ id: "fb:PSID9:1752800000000", turns: [{ role: "user", text: "hi", at: 1, mid: "m_0" }] }) });
  const chatCalls = [];
  deps.chat = async (body) => { chatCalls.push(body); return { status: 200, body: { reply: "ok", escalated: true } }; };
  await processDm({ platform: "facebook", senderId: "PSID9", mid: "m_2", text: "still there?" }, deps);
  assert.equal(chatCalls[0].session, "fb:PSID9:1752800000000");
  assert.equal(refs.notified.length, 0);
});

test("processDm: duplicate mid is skipped entirely", async () => {
  const { deps, refs } = bridgeDeps({ findActive: async () => ({ id: "fb:PSID9", turns: [{ role: "user", text: "hi", at: 1, mid: "m_dup" }] }) });
  let chatCalled = false;
  deps.chat = async () => { chatCalled = true; return { status: 200, body: { reply: "x" } }; };
  await processDm({ platform: "facebook", senderId: "PSID9", mid: "m_dup", text: "hi" }, deps);
  assert.equal(chatCalled, false);
  assert.equal(refs.sent.length, 0);
});

test("processDm: expired session re-mints a suffixed id and retries once", async () => {
  const { deps, refs } = bridgeDeps();
  const sessions = [];
  deps.chat = async (body) => {
    sessions.push(body.session);
    return sessions.length === 1
      ? { status: 200, body: { expired: true, reply: "" } }
      : { status: 200, body: { reply: "fresh start", escalated: false } };
  };
  await processDm({ platform: "instagram", senderId: "IG7", mid: "m_3", text: "hey" }, deps);
  assert.equal(sessions[0], "ig:IG7");
  assert.equal(sessions[1], "ig:IG7:1752900000000");
  assert.deepEqual(refs.sent[0], { platform: "instagram", recipientId: "IG7", text: "fresh start" });
});

test("processDm: capped reply still gets delivered; empty reply sends nothing", async () => {
  const { deps, refs } = bridgeDeps();
  deps.chat = async () => ({ status: 200, body: { reply: "We've covered a lot!", capped: true } });
  await processDm({ platform: "facebook", senderId: "P", mid: "m4", text: "x" }, deps);
  assert.equal(refs.sent.length, 1);
  const d2 = bridgeDeps(); d2.deps.chat = async () => ({ status: 200, body: { reply: "", degraded: true } });
  await processDm({ platform: "facebook", senderId: "P", mid: "m5", text: "x" }, d2.deps);
  assert.equal(d2.refs.sent.length, 0);
});

test("processDm: send returns {ok:false} -> send-failure alert fires AND new-DM notify fires", async () => {
  const { deps, refs } = bridgeDeps();
  deps.send = async () => ({ ok: false, error: "graph 500" });
  await processDm({ platform: "facebook", senderId: "PSID9", mid: "m_alert1", text: "hi" }, deps);
  const sendFail = refs.notified.filter((t) => /send.fail/i.test(t) || /reply.*fail/i.test(t) || /graph 500/.test(t));
  assert.ok(sendFail.length >= 1, `expected a send-failure alert; notified=${JSON.stringify(refs.notified)}`);
  const newDm = refs.notified.filter((t) => /New facebook DM/i.test(t));
  assert.ok(newDm.length >= 1, `expected a new-DM notify; notified=${JSON.stringify(refs.notified)}`);
});

test("processDm: send returns {ok:false, skipped:true} -> NO send-failure alert", async () => {
  const { deps, refs } = bridgeDeps();
  deps.send = async () => ({ ok: false, skipped: true });
  await processDm({ platform: "facebook", senderId: "PSID9", mid: "m_alert2", text: "hi" }, deps);
  const sendFail = refs.notified.filter((t) => /send.fail/i.test(t) || /reply.*fail/i.test(t));
  assert.equal(sendFail.length, 0, `should NOT alert on skipped; notified=${JSON.stringify(refs.notified)}`);
});
