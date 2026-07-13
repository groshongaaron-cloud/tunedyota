const { test } = require("node:test");
const assert = require("node:assert/strict");
const { sendWebPush } = require("../netlify/functions/lib/webpush.js");

const env = { VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv", VAPID_SUBJECT: "mailto:info@tunedyota.com" };

test("no subscriptions -> no-op, no send", async () => {
  let calls = 0;
  const out = await sendWebPush("aaron", { title: "a", body: "b" }, { env, listSubs: async () => [], send: async () => { calls++; } });
  assert.deepEqual(out, { sent: 0, failed: 0 });
  assert.equal(calls, 0);
});

test("no VAPID env -> no-op", async () => {
  const out = await sendWebPush("aaron", { title: "a", body: "b" }, { env: {}, listSubs: async () => [{ id: "1", sub: {} }], send: async () => {} });
  assert.deepEqual(out, { sent: 0, failed: 0 });
});

test("sends one per subscription with the right payload", async () => {
  const sent = [];
  const out = await sendWebPush("aaron", { title: "Roster", body: "Fargo", url: "/x" },
    { env, listSubs: async () => [{ id: "1", sub: { endpoint: "e1" } }, { id: "2", sub: { endpoint: "e2" } }],
      send: async (sub, payload) => { sent.push({ sub, payload }); } });
  assert.deepEqual(out, { sent: 2, failed: 0 });
  const p = JSON.parse(sent[0].payload);
  assert.equal(p.title, "Roster"); assert.equal(p.body, "Fargo"); assert.equal(p.url, "/x");
});

test("a 410 deletes the expired subscription", async () => {
  const deleted = [];
  const out = await sendWebPush("aaron", { title: "a", body: "b" },
    { env, listSubs: async () => [{ id: "dead", sub: { endpoint: "e" } }],
      send: async () => { const e = new Error("gone"); e.statusCode = 410; throw e; },
      del: async (id) => { deleted.push(id); }, log: { error() {} } });
  assert.deepEqual(out, { sent: 0, failed: 1 });
  assert.deepEqual(deleted, ["dead"]);
});

test("a non-expiry failure is counted, not thrown, sub kept", async () => {
  const deleted = [];
  const out = await sendWebPush("aaron", { title: "a", body: "b" },
    { env, listSubs: async () => [{ id: "x", sub: {} }],
      send: async () => { const e = new Error("500"); e.statusCode = 500; throw e; },
      del: async (id) => { deleted.push(id); }, log: { error() {} } });
  assert.deepEqual(out, { sent: 0, failed: 1 });
  assert.deepEqual(deleted, []);
});
