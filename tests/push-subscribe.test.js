const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processSubscribe } = require("../netlify/functions/push-subscribe.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };
const sub = { endpoint: "https://push.example/abc", keys: { p256dh: "k", auth: "a" } };

test("rejects a missing subscription", async () => {
  const out = await processSubscribe({}, { env, key: "aaron", list: async () => [], create: async () => ({}), update: async () => ({}) });
  assert.equal(out.status, "error");
  assert.equal(out.error, "missing-subscription");
});

test("registers a new subscription scoped to the installer", async () => {
  let created;
  const out = await processSubscribe({ subscription: sub }, { env, key: "aaron",
    list: async () => [], create: async (a) => { created = a; return { id: "s1" }; }, update: async () => ({}) });
  assert.equal(out.status, "registered");
  assert.equal(created.fields.Installer, "aaron");
  assert.equal(created.fields.Endpoint, sub.endpoint);
  assert.equal(JSON.parse(created.fields.Subscription).endpoint, sub.endpoint);
});

test("a quote in the endpoint cannot break out of the dedupe formula", async () => {
  let formula;
  await processSubscribe({ subscription: { endpoint: 'https://push.example/x", {Installer}!="' } }, { env, key: "aaron",
    list: async (a) => { formula = a.filterByFormula; return []; }, create: async () => ({}), update: async () => ({}) });
  assert.equal(formula, '{Endpoint}="https://push.example/x\\", {Installer}!=\\""');
});

test("updates (does not duplicate) a known endpoint", async () => {
  let updatedId, created = false;
  const out = await processSubscribe({ subscription: sub }, { env, key: "noah",
    list: async () => [{ id: "existing1", fields: { Endpoint: sub.endpoint } }],
    create: async () => { created = true; return {}; }, update: async (a) => { updatedId = a.id; return {}; } });
  assert.equal(out.status, "updated");
  assert.equal(updatedId, "existing1");
  assert.equal(created, false);
});
