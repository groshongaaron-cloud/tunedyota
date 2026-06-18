const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizePhone, sendSms } = require("../netlify/functions/lib/sms.js");

test("normalizePhone to E.164 US", () => {
  assert.equal(normalizePhone("(612) 406-7117"), "+16124067117");
  assert.equal(normalizePhone("16124067117"), "+16124067117");
  assert.equal(normalizePhone(""), null);
});
test("sendSms no-op when Twilio env unset", async () => {
  const r = await sendSms({ fetchImpl: async () => { throw new Error("should not call"); }, to: "+1612", body: "hi", env: {}, log: { warn() {} } });
  assert.equal(r.skipped, true);
});
test("sendSms posts to Twilio when configured", async () => {
  let seen;
  const fetchImpl = async (url, opts) => { seen = { url, opts }; return { ok: true, json: async () => ({ sid: "SM1" }) }; };
  const env = { TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "tok", TWILIO_FROM: "+1999" };
  const r = await sendSms({ fetchImpl, to: "+16124067117", body: "hi", env });
  assert.equal(r.sent, true);
  assert.ok(seen.url.includes("/Accounts/AC1/Messages.json"));
  assert.ok(seen.opts.body.includes("To=%2B16124067117"));
});
