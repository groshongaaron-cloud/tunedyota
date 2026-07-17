const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processRegister } = require("../netlify/functions/push-register.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };

test("rejects a missing token", async () => {
  const out = await processRegister({ token: "" }, { env, key: "aaron",
    list: async () => [], create: async () => ({}), update: async () => ({}) });
  assert.equal(out.status, "error");
  assert.equal(out.error, "missing-token");
});

test("a quote in the device token cannot break out of the dedupe formula", async () => {
  let formula;
  await processRegister({ token: 'tok", {Installer}!="', platform: "ios" }, { env, key: "aaron",
    list: async (a) => { formula = a.filterByFormula; return []; }, create: async () => ({}), update: async () => ({}) });
  assert.equal(formula, '{Token}="tok\\", {Installer}!=\\""');
});

test("registers a new device token scoped to the installer", async () => {
  let created;
  const out = await processRegister({ token: "devTOK", platform: "iOS" }, { env, key: "aaron",
    list: async () => [], create: async (a) => { created = a; return { id: "d1" }; }, update: async () => ({}) });
  assert.equal(out.status, "registered");
  assert.equal(created.fields.Installer, "aaron");
  assert.equal(created.fields.Token, "devTOK");
  assert.equal(created.fields.Platform, "ios");
});

test("updates (does not duplicate) an already-registered token", async () => {
  let updatedId, created = false;
  const out = await processRegister({ token: "devTOK", platform: "android" }, { env, key: "noah",
    list: async () => [{ id: "existing1", fields: { Token: "devTOK" } }],
    create: async () => { created = true; return {}; },
    update: async (a) => { updatedId = a.id; return {}; } });
  assert.equal(out.status, "updated");
  assert.equal(updatedId, "existing1");
  assert.equal(created, false);
});
