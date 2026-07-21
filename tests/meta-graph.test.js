// tests/meta-graph.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const mg = require("../netlify/functions/lib/meta-graph.js");

const ENV = { META_APP_SECRET: "shh", META_PAGE_TOKEN: "tok123", META_GRAPH_VERSION: "v22.0" };

test("verifySignature accepts a valid sha256 header and rejects everything else", () => {
  const body = '{"object":"page"}';
  const good = "sha256=" + crypto.createHmac("sha256", "shh").update(body).digest("hex");
  assert.equal(mg.verifySignature(body, good, "shh"), true);
  assert.equal(mg.verifySignature(body, "sha256=deadbeef", "shh"), false);
  assert.equal(mg.verifySignature(body, "", "shh"), false);
  assert.equal(mg.verifySignature(body, good, ""), false);       // no secret -> fail closed
  assert.equal(mg.verifySignature(body, good.replace("sha256=", "sha1="), "shh"), false);
});

test("sendDm posts the Graph message shape with the page token", async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => { calls.push([url, opts]); return { ok: true, json: async () => ({ message_id: "m1" }) }; };
  const out = await mg.sendDm({ platform: "facebook", recipientId: "PSID9", text: "hello" }, { env: ENV, fetchImpl });
  assert.equal(out.ok, true);
  assert.equal(calls[0][0], "https://graph.facebook.com/v22.0/me/messages?access_token=tok123");
  const body = JSON.parse(calls[0][1].body);
  assert.deepEqual(body, { recipient: { id: "PSID9" }, message: { text: "hello" } });
  assert.equal(calls[0][1].method, "POST");
});

test("sendDm fails closed without a token and never throws on network error", async () => {
  const noTok = await mg.sendDm({ platform: "facebook", recipientId: "P", text: "x" }, { env: { META_APP_SECRET: "s" }, fetchImpl: async () => { throw new Error("must not be called"); } });
  assert.deepEqual(noTok, { ok: false, skipped: true });
  const boom = await mg.sendDm({ platform: "facebook", recipientId: "P", text: "x" }, { env: ENV, fetchImpl: async () => { throw new Error("net down"); } });
  assert.equal(boom.ok, false);
  assert.match(boom.error, /net down/);
});

test("sendDm maps the outside-window Graph error to windowClosed", async () => {
  const fetchImpl = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: "This message is sent outside of allowed window.", code: 10, error_subcode: 2018278 } }) });
  const out = await mg.sendDm({ platform: "instagram", recipientId: "IG1", text: "late" }, { env: ENV, fetchImpl });
  assert.equal(out.ok, false);
  assert.equal(out.windowClosed, true);
});

test("getProfile returns a name best-effort and null on any failure", async () => {
  const fetchImpl = async (url) => ({ ok: true, json: async () => ({ first_name: "Pat", last_name: "K", name: "Pat K" }) });
  assert.equal(await mg.getProfile("PSID9", { env: ENV, fetchImpl }), "Pat K");
  assert.equal(await mg.getProfile("PSID9", { env: ENV, fetchImpl: async () => { throw new Error("x"); } }), null);
  assert.equal(await mg.getProfile("PSID9", { env: { }, fetchImpl }), null); // no token
});
