// tests/ott-email.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseOttLeadEmail } = require("../netlify/functions/lib/ott-email.js");

// A normalized message as lib/gmail.getMessage() would produce. Replace the body with
// the real tests/fixtures/ott-lead-sample.txt contents once captured, and adjust asserts.
const msg = {
  id: "m1", threadId: "t-abc",
  headers: { from: "Overland Tailor <info@overlandtailor.com>", cc: "Aaron Groshong <info@tunedyota.com>",
    replyTo: "", subject: "A New Lead From Facebook Ads", messageId: "<lead-abc@mail>", date: "Tue, 15 Jul 2026 09:00:00 -0500" },
  textBody: "Full Name: Jane Customer\nPhone: 6125550147\nEmail: jane@example.com\nVehicle: 2022 Tundra\n\nThank you for contacting Overland Tailor Tuning.",
};

test("parseOttLeadEmail extracts contact fields + always the email refs + ott-national tag", () => {
  const p = parseOttLeadEmail(msg);
  assert.equal(p.channel, "ott-national");
  assert.equal(p.source, "ott-national:fb-ads");
  assert.equal(p.threadId, "t-abc");
  assert.equal(p.messageIdHeader, "<lead-abc@mail>");
  assert.equal(p.name, "Jane Customer");
  assert.equal(p.phone, "6125550147");
  assert.equal(p.email, "jane@example.com");
  assert.equal(p.vehicle, "2022 Tundra");
  assert.equal(p.replyTo, "info@overlandtailor.com"); // falls back to From when Reply-To absent
});

test("parseOttLeadEmail on a boilerplate-only email still yields refs + a fallback name", () => {
  const bare = { ...msg, textBody: "Thank you for contacting Overland Tailor Tuning." };
  const p = parseOttLeadEmail(bare);
  assert.equal(p.threadId, "t-abc");
  assert.equal(p.channel, "ott-national");
  assert.ok(p.name && p.name.length > 0); // e.g. "OTT National Lead"
});
