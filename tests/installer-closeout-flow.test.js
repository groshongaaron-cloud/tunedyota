// tests/installer-closeout-flow.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { CONSENT_TEXT } = require("../netlify/functions/lib/consent.js");
const html = fs.readFileSync("site/installer.html", "utf8");

test("cert panel: email ask headline + preferred contact select posted to closeout", () => {
  assert.match(html, /Where should we send your Certificate of Calibration\?/);
  assert.match(html, /preferredContact/);
  for (const opt of ["SMS", "Messenger", "Instagram"]) assert.ok(html.includes(">" + opt + "<"), opt);
});

test("consent block: verbatim versioned copy + affirmative toggle riding the signature", () => {
  assert.ok(html.includes(CONSENT_TEXT), "console must embed lib/consent.js CONSENT_TEXT verbatim");
  assert.match(html, /a2pconsent/);
  assert.match(html, /marketingConsent/);
});

test("prefills: platform from the roster's pcm protocol; VIN decode backfills a blank year", () => {
  assert.match(html, /pcm\s*&&\s*.*(vft|VFT)/, "Tuning Platform defaults from b.pcm");
  assert.match(html, /decoded\.modelYear/, "vin-decode year feeds the year field when blank");
});

test("gate + drafts: missing-field highlight and a Drafts chip", () => {
  assert.match(html, /report-fields-missing/);
  assert.match(html, /action:\s*["']draft["']|"draft"/);
  assert.match(html, /Drafts/);
});
