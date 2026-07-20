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

test("sendSms uses MessagingServiceSid when set, no From", async () => {
  let got;
  const fetchImpl = async (url, opts) => { got = opts; return { ok: true }; };
  const env = { ...ENV, TWILIO_MESSAGING_SERVICE_SID: "MG9" };
  const r = await sendSms({ to: "+15075550101", body: "hi" }, { env, fetchImpl });
  assert.equal(r.ok, true);
  const params = new URLSearchParams(got.body);
  assert.equal(params.get("MessagingServiceSid"), "MG9");
  assert.equal(params.get("From"), null);
});

test("sendSms with Messaging Service works even without TWILIO_FROM_NUMBER", async () => {
  let got;
  const fetchImpl = async (url, opts) => { got = opts; return { ok: true }; };
  const env = { TWILIO_ACCOUNT_SID: "AC123", TWILIO_AUTH_TOKEN: "tok", TWILIO_MESSAGING_SERVICE_SID: "MG9" };
  const r = await sendSms({ to: "+15075550101", body: "hi" }, { env, fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(new URLSearchParams(got.body).get("MessagingServiceSid"), "MG9");
});

test("sendSms attaches StatusCallback when a public base is known", async () => {
  let got;
  const fetchImpl = async (url, opts) => { got = opts; return { ok: true }; };
  const env = { ...ENV, URL: "https://tunedyota.com" };
  await sendSms({ to: "+15075550101", body: "hi" }, { env, fetchImpl });
  assert.equal(new URLSearchParams(got.body).get("StatusCallback"),
    "https://tunedyota.com/.netlify/functions/twilio-status");
  // and without any base: no StatusCallback param at all
  await sendSms({ to: "+15075550101", body: "hi" }, { env: ENV, fetchImpl });
  assert.equal(new URLSearchParams(got.body).get("StatusCallback"), null);
});
