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
