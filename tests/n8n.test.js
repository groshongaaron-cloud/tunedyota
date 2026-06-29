const { test } = require("node:test");
const assert = require("node:assert/strict");
const { pingN8n } = require("../netlify/functions/lib/n8n.js");

test("POSTs the payload as JSON to the url", async () => {
  let seen;
  const fetchImpl = async (url, opts) => { seen = { url, opts }; return { ok: true }; };
  const r = await pingN8n({ fetchImpl, url: "https://ty.app.n8n.cloud/webhook/ty-booking", payload: { event: "booking", name: "Jane" } });
  assert.equal(r.ok, true);
  assert.equal(seen.url, "https://ty.app.n8n.cloud/webhook/ty-booking");
  assert.equal(seen.opts.method, "POST");
  assert.equal(seen.opts.headers["Content-Type"], "application/json");
  assert.equal(JSON.parse(seen.opts.body).name, "Jane");
});
test("no-ops (does not throw, does not fetch) when url is falsy", async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return { ok: true }; };
  const r = await pingN8n({ fetchImpl, url: "", payload: { x: 1 } });
  assert.equal(r.skipped, true);
  assert.equal(called, false);
});
test("never throws when fetch rejects — swallows the error", async () => {
  const fetchImpl = async () => { throw new Error("network down"); };
  const r = await pingN8n({ fetchImpl, url: "https://x", payload: { x: 1 }, log: { error() {} } });
  assert.equal(r.ok, false);
  assert.equal(r.error, "network down");
});
