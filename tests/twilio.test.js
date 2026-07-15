// tests/twilio.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const T = require("../netlify/functions/lib/twilio.js");

// Official twilio-node documented test vector.
const VEC_URL = "https://mycompany.com/myapp.php?foo=1&bar=2";
const VEC_PARAMS = { CallSid: "CA1234567890ABCDE", Caller: "+14158675309", Digits: "1234", From: "+14158675309", To: "+18005551212" };
const VEC_TOKEN = "12345";
const VEC_SIG = "RSOYDt4T1cUTdK1PDd93/VVr8B8=";

test("validateTwilioSignature accepts Twilio's documented vector", () => {
  assert.equal(T.validateTwilioSignature(VEC_TOKEN, VEC_URL, VEC_PARAMS, VEC_SIG), true);
});

test("validateTwilioSignature rejects a tampered param", () => {
  const tampered = { ...VEC_PARAMS, Digits: "9999" };
  assert.equal(T.validateTwilioSignature(VEC_TOKEN, VEC_URL, tampered, VEC_SIG), false);
});

test("validateTwilioSignature fail-closed on missing token or signature", () => {
  assert.equal(T.validateTwilioSignature("", VEC_URL, VEC_PARAMS, VEC_SIG), false);
  assert.equal(T.validateTwilioSignature(VEC_TOKEN, VEC_URL, VEC_PARAMS, ""), false);
});
