// tests/lead-endpoints.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const ingest = require("../netlify/functions/lead-ingest.js");

const env = { INSTALLER_TOKENS: JSON.stringify({ cody: "cody-tok" }), INTERNAL_TASK_SECRET: "task-secret",
  AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };

test("lead-ingest rejects with neither installer token nor task secret", async () => {
  const res = await ingest.handler({ headers: {}, body: "{}" }, { env });
  assert.equal(res.statusCode, 401);
});

test("lead-ingest accepts a valid installer token", async () => {
  const res = await ingest.handler(
    { headers: { "x-installer-token": "cody-tok" }, body: JSON.stringify({ name: "A", phone: "1", channel: "phone" }) },
    { env, processImpl: async () => ({ status: "lead", recordId: "r", deduped: false }) });
  assert.equal(res.statusCode, 200);
});

test("lead-ingest accepts the internal task secret (adapters)", async () => {
  const res = await ingest.handler(
    { headers: { "x-ty-task": "task-secret" }, body: JSON.stringify({ name: "A", email: "a@x.com", channel: "email" }) },
    { env, processImpl: async () => ({ status: "lead", recordId: "r", deduped: false }) });
  assert.equal(res.statusCode, 200);
});
