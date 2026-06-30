const { test } = require("node:test");
const assert = require("node:assert/strict");
const { triggerBackground } = require("../netlify/functions/lib/background.js");

test("posts the payload to the named background function at the site URL", async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => { calls.push({ url, opts }); return { ok: true, status: 202 }; };
  const r = await triggerBackground({ fetchImpl, env: { URL: "https://tunedyota.com" }, name: "book-background", payload: { kind: "booking" } });
  assert.equal(r.ok, true);
  assert.equal(calls[0].url, "https://tunedyota.com/.netlify/functions/book-background");
  assert.equal(calls[0].opts.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].opts.body), { kind: "booking" });
});

test("trims a trailing slash on the base URL and falls back to deploy URLs", async () => {
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return { ok: true }; };
  await triggerBackground({ fetchImpl, env: { DEPLOY_PRIME_URL: "https://deploy--site.netlify.app/" }, name: "x", payload: {} });
  assert.equal(calls[0], "https://deploy--site.netlify.app/.netlify/functions/x");
});

test("attaches the shared secret header only when configured", async () => {
  let headers;
  const fetchImpl = async (_u, opts) => { headers = opts.headers; return { ok: true }; };
  await triggerBackground({ fetchImpl, env: { URL: "https://x" }, name: "x", payload: {} });
  assert.ok(!("x-ty-task" in headers));
  await triggerBackground({ fetchImpl, env: { URL: "https://x", INTERNAL_TASK_SECRET: "s3cret" }, name: "x", payload: {} });
  assert.equal(headers["x-ty-task"], "s3cret");
});

test("no site URL -> skipped, never throws", async () => {
  const r = await triggerBackground({ fetchImpl: async () => ({ ok: true }), env: {}, name: "x", payload: {}, log: { error() {} } });
  assert.equal(r.skipped, true);
});

test("a network error is swallowed", async () => {
  const r = await triggerBackground({ fetchImpl: async () => { throw new Error("ECONNREFUSED"); }, env: { URL: "https://x" }, name: "x", payload: {}, log: { error() {} } });
  assert.equal(r.ok, false);
  assert.match(r.error, /ECONNREFUSED/);
});
