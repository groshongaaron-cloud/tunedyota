const { test } = require("node:test");
const assert = require("node:assert/strict");
const { sendSms } = require("../netlify/functions/lib/twilio.js");

const ENV = { TWILIO_ACCOUNT_SID: "AC123", TWILIO_AUTH_TOKEN: "tok", TWILIO_FROM_NUMBER: "+16125550100" };

test("sendSms posts form-encoded message with basic auth", async () => {
  let got;
  const fetchImpl = async (url, opts) => { got = { url: String(url), opts }; return { ok: true, json: async () => ({ sid: "SM1" }) }; };
  const r = await sendSms({ to: "+15075550101", body: "hello" }, { env: ENV, fetchImpl });
  assert.equal(r.ok, true);
  assert.ok(got.url.includes("/Accounts/AC123/Messages.json"));
  assert.match(got.opts.headers.Authorization, /^Basic /);
  const params = new URLSearchParams(got.opts.body);
  assert.equal(params.get("To"), "+15075550101");
  assert.equal(params.get("From"), "+16125550100");
  assert.equal(params.get("Body"), "hello");
});

test("sendSms is a counted no-op without config and never throws", async () => {
  const r1 = await sendSms({ to: "+1", body: "x" }, { env: {}, fetchImpl: async () => { throw new Error("no"); } });
  assert.equal(r1.ok, false);
  const r2 = await sendSms({ to: "+1", body: "x" }, { env: ENV, fetchImpl: async () => { throw new Error("net down"); } });
  assert.equal(r2.ok, false);
});
