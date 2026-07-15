// tests/leads.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const L = require("../netlify/functions/lib/leads.js");

test("normalizeChannel maps sources to one of the seven channels", () => {
  assert.equal(L.normalizeChannel("intake:facebook"), "facebook");
  assert.equal(L.normalizeChannel("installer:walk-in"), "walk-in");
  assert.equal(L.normalizeChannel("intake:instagram"), "instagram");
  assert.equal(L.normalizeChannel("intake:email"), "email");
  assert.equal(L.normalizeChannel("lead:sms"), "sms");
  assert.equal(L.normalizeChannel("some text message"), "sms");
  assert.equal(L.normalizeChannel("missed call"), "phone");
  assert.equal(L.normalizeChannel(""), "other");
  assert.equal(L.normalizeChannel(undefined), "other");
});

test("validChannel gates the allowed set", () => {
  assert.equal(L.validChannel("phone"), true);
  assert.equal(L.validChannel("carrier-pigeon"), false);
});

test("normalizePhone reduces to a last-10 key; normalizeEmail lowercases", () => {
  assert.equal(L.normalizePhone("1 (701) 426-9395"), "7014269395");
  assert.equal(L.normalizePhone("701.426.9395"), "7014269395");
  assert.equal(L.normalizePhone(""), "");
  assert.equal(L.normalizeEmail("  Kevin@Leier.com "), "kevin@leier.com");
});
