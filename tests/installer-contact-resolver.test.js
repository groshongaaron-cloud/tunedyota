// Static wiring: the number-only booking resolver — apply an existing contact's
// identity, or mint a market-routed lead (owner ask 2026-07-30, "Text 763-516-4782").
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const HTML = fs.readFileSync(path.join(__dirname, "..", "site", "installer.html"), "utf8");

test("placeholder detector covers Text/Caller/Unknown and digit-only names", () => {
  const fn = HTML.slice(HTML.indexOf("function isPlaceholderName"));
  assert.ok(fn.slice(0, 500).includes("(text|caller|unknown)"), "prefix patterns");
  assert.ok(fn.slice(0, 500).includes("nd.length>=7"), "digits-as-name check");
});

test("the who-strip renders only on placeholder-named open bookings", () => {
  assert.ok(HTML.includes("isPlaceholderName(b)?'<div id=\"who_'"), "gated container");
  assert.ok(HTML.includes("renderWhoStrip(c,b);"), "wired in rowCard");
});

test("apply-existing posts the matched name through installer-reschedule", () => {
  const fn = HTML.slice(HTML.indexOf("function renderWhoStrip"));
  assert.ok(fn.slice(0, 2500).includes("knownIdentityFor(b.phone"), "match lookup");
  assert.ok(fn.slice(0, 2500).includes("installer-reschedule"), "name applied via reschedule");
});

test("new-contact save routes through ingestLead with a city and Caller fallback name", () => {
  const fn = HTML.slice(HTML.indexOf("function renderWhoStrip"));
  assert.ok(fn.includes("ingestLead({name:name"), "lead-ingest reuse");
  assert.ok(fn.includes("city:ct.value"), "market assignment");
  assert.ok(fn.includes("'Caller '+fmtCallPhone(b.phone)"), "adapter naming convention");
});
