// tests/ott-email.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseOttLeadEmail } = require("../netlify/functions/lib/ott-email.js");

// Load the sanitized real-format fixture; strip the leading '#' comment lines.
const raw = fs.readFileSync(path.join(__dirname, "fixtures", "ott-lead-sample.txt"), "utf8");
const body = raw.split("\n").filter((l) => !l.startsWith("#")).join("\n");

// A normalized message as lib/gmail.getMessage() produces for the forwarded OTT email.
const msg = {
  id: "m1", threadId: "t-abc",
  headers: { from: "Overland Tailor <info@overlandtailor.com>", cc: "Aaron Groshong <info@tunedyota.com>",
    replyTo: "", subject: "Fw: A New Lead From Facebook Ads - Jane Sample",
    messageId: "<lead-abc@mail>", date: "Sun, 12 Apr 2026 02:20:11 +0000" },
  textBody: body,
};

test("parseOttLeadEmail extracts the real labeled fields + email refs + ott-national tag", () => {
  const p = parseOttLeadEmail(msg);
  assert.equal(p.channel, "ott-national");
  assert.equal(p.source, "ott-national:fb-ads");
  assert.equal(p.threadId, "t-abc");
  assert.equal(p.messageIdHeader, "<lead-abc@mail>");
  assert.equal(p.name, "Jane Sample");
  assert.equal(p.email, "jane.sample@example.com");
  assert.equal(p.phone, "+13205550147");              // first format, cleaned
  assert.equal(p.vehicle, "2026 Toyota Tacoma");      // Year + Make + Model
  assert.equal(p.replyTo, "info@overlandtailor.com"); // falls back to From
  assert.match(p.goals, /Kerkhoven, MN/);             // location context
  assert.match(p.goals, /Engine 2.4/);
  assert.match(p.goals, /Trans automatic/);
  assert.doesNotMatch(p.goals, /Non/);                // "Non" modifications suppressed
});

test("parseOttLeadEmail on a boilerplate-only email still yields refs + a fallback name", () => {
  const bare = { ...msg, textBody: "Thank you for contacting Overland Tailor Tuning." };
  const p = parseOttLeadEmail(bare);
  assert.equal(p.threadId, "t-abc");
  assert.equal(p.channel, "ott-national");
  assert.equal(p.name, "OTT National Lead");
  assert.equal(p.phone, "");
});

const SAMPLE = [
  "Name: Quinn Coutley", "Email: qcoutley@gmail.com",
  "Phone: +19207375148 | (920) 737-5148", "Lead: Overland Tuning",
  "City: Green Bay", "State: WI", "Country: US",
  "Transmission Type: automatic_", "Vehicle Year: 2006", "Vehicle Make: Lexus",
  "Vehicle Model: Gx470", "Engine Size: 4.7", "Engine modifications: None",
  "Campaign name:", "Adset name:",
  "GHL Link: https://app.gohighlevel.com/v2/location/xyz/opportunities/list",
].join("\n");

test("parses the 2026-07 OTT label vocabulary incl. GHL link", () => {
  const out = parseOttLeadEmail({ headers: { from: "OTT <info@overlandtailor.com>" }, textBody: SAMPLE, threadId: "t1" });
  assert.equal(out.name, "Quinn Coutley");
  assert.equal(out.phone, "+19207375148");
  assert.equal(out.vehicle, "2006 Lexus Gx470");
  assert.equal(out.city, "Green Bay");
  assert.equal(out.ghlLink, "https://app.gohighlevel.com/v2/location/xyz/opportunities/list");
  assert.equal(out.channel, "ott-national");
});

// Regression: OTT sends "None" (4 letters) which /^non$/i missed → "Mods None" leaked into goals.
test('suppresses "Mods None" when engine modifications field is "None"', () => {
  const body = SAMPLE; // already contains "Engine modifications: None"
  const out = parseOttLeadEmail({ headers: { from: "OTT <info@overlandtailor.com>" }, textBody: body, threadId: "t2" });
  assert.doesNotMatch(out.goals, /Mods None/i);
});

test('includes mods in goals when engine modifications field has real content', () => {
  const bodyWithMods = SAMPLE.replace("Engine modifications: None", "Engine modifications: Intake+exhaust");
  const out = parseOttLeadEmail({ headers: { from: "OTT <info@overlandtailor.com>" }, textBody: bodyWithMods, threadId: "t3" });
  assert.match(out.goals, /Mods Intake\+exhaust/);
});
