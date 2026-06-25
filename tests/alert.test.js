const { test } = require("node:test");
const assert = require("node:assert/strict");
const { notifyOwner } = require("../netlify/functions/lib/alert.js");

test("posts the text to the webhook", async () => {
  let seen;
  const fetchImpl = async (url, opts) => { seen = { url, opts }; return { ok: true }; };
  const r = await notifyOwner({ fetchImpl, webhookUrl: "https://hooks.slack.test/x", text: "hello" });
  assert.equal(r.ok, true);
  assert.equal(seen.url, "https://hooks.slack.test/x");
  assert.equal(seen.opts.method, "POST");
  assert.equal(JSON.parse(seen.opts.body).text, "hello");
});
test("no-ops (does not throw, does not fetch) when webhookUrl is falsy", async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return { ok: true }; };
  const r = await notifyOwner({ fetchImpl, webhookUrl: "", text: "x", log: { warn() {} } });
  assert.equal(r.skipped, true);
  assert.equal(called, false);
});
test("never throws when fetch rejects", async () => {
  const fetchImpl = async () => { throw new Error("network"); };
  const r = await notifyOwner({ fetchImpl, webhookUrl: "https://x", text: "x", log: { error() {} } });
  assert.equal(r.ok, false);
});
