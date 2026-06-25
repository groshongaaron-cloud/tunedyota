const { test } = require("node:test");
const assert = require("node:assert/strict");
const { notifyOwner } = require("../netlify/functions/lib/alert.js");

test("posts the text to the webhook", async () => {
  let seen;
  const fetchImpl = async (url, opts) => { seen = { url, opts }; return { ok: true }; };
  const r = await notifyOwner({ fetchImpl, webhookUrl: "https://hooks.slack.test/x", text: "hello" });
  assert.equal(r.ok, true);
  assert.equal(JSON.parse(seen.opts.body).text, "hello");
});
test("no-ops when webhookUrl falsy; never throws on reject", async () => {
  const skip = await notifyOwner({ fetchImpl: async () => ({ ok: true }), webhookUrl: "", text: "x", log: { warn() {} } });
  assert.equal(skip.skipped, true);
  const errd = await notifyOwner({ fetchImpl: async () => { throw new Error("net"); }, webhookUrl: "https://x", text: "x", log: { error() {} } });
  assert.equal(errd.ok, false);
});
