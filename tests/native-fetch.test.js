const { test } = require("node:test");
const assert = require("node:assert/strict");
const nf = require("../site/native-fetch.js");

test("rewrites function URLs to the live site", () => {
  assert.equal(nf.rewriteFnUrl("/.netlify/functions/chat"), "https://tunedyota.com/.netlify/functions/chat");
});

test("leaves bundled-asset and absolute URLs alone", () => {
  assert.equal(nf.rewriteFnUrl("/vehicles.json"), "/vehicles.json");
  assert.equal(nf.rewriteFnUrl("https://fonts.googleapis.com/x"), "https://fonts.googleapis.com/x");
  assert.equal(nf.rewriteFnUrl("/book.html"), "/book.html");
});

test("install wraps window.fetch and rewrites string inputs only", async () => {
  const calls = [];
  const w = { fetch: async (url, init) => { calls.push([url, init]); return { ok: true }; } };
  nf.install(w);
  await w.fetch("/.netlify/functions/client-garage", { method: "GET" });
  await w.fetch({ url: "req-object" });
  assert.equal(calls[0][0], "https://tunedyota.com/.netlify/functions/client-garage");
  assert.deepEqual(calls[1][0], { url: "req-object" });
});

test("isNative false without Capacitor", () => {
  assert.equal(nf.isNative({}), false);
  assert.equal(nf.isNative({ Capacitor: { isNativePlatform: () => true } }), true);
});
