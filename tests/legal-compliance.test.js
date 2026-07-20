"use strict";
// Guards the SMS/A2P-10DLC compliance surface. Carriers reject registration (and can
// suspend messaging) if the published privacy policy / opt-in disclosures regress, so
// these strings are load-bearing, not cosmetic.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const SITE = path.join(__dirname, "..", "site");
const read = (f) => fs.readFileSync(path.join(SITE, f), "utf8");
// Normalize to plain text so inline tags/newlines (e.g. "frequency</strong> varies")
// don't defeat phrase matching — we assert on what the reader actually sees.
const text = (f) => read(f).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

test("privacy + terms pages exist with the required SMS disclosures", () => {
  for (const f of ["privacy.html", "terms.html"]) {
    const t = text(f);
    assert.match(t, /\bSTOP\b/, `${f}: STOP opt-out`);
    assert.match(t, /\bHELP\b/, `${f}: HELP keyword`);
    assert.match(t, /message (and|&) data rates may apply/i, `${f}: rates disclosure`);
    assert.match(t, /frequency\s+varies/i, `${f}: frequency disclosure`);
    assert.match(t, /consent\b[\s\S]{0,40}not[\s\S]{0,20}condition/i, `${f}: consent-not-a-condition`);
  }
});

test("privacy policy carries the mandatory no-sharing (opt-in) language", () => {
  const t = text("privacy.html");
  // The #1 A2P rejection reason: must state SMS opt-in data is not shared with third parties.
  assert.match(t, /not\b[\s\S]{0,80}shared[\s\S]{0,60}third part/i, "no-sharing of opt-in data");
  assert.match(t, /Effective\s+July\s+20,\s+2026/i, "effective date current");
});

test("terms carry SMS program terms + governing law", () => {
  const t = text("terms.html");
  assert.match(t, /SMS|text[- ]messaging/i, "SMS program section");
  assert.match(t, /Minnesota/, "governing law");
  assert.match(read("terms.html"), /tune-warranty-emissions-legality\.html/, "links the tuning/warranty disclaimer");
});

test("privacy + terms are linked in the site footer", () => {
  for (const f of ["index.html", "find-your-exact-tune.html", "amsoil-garage.html"]) {
    const html = read(f);
    assert.ok(html.includes('href="privacy.html"'), `${f}: footer Privacy link`);
    assert.ok(html.includes('href="terms.html"'), `${f}: footer Terms link`);
  }
});

test("chat widget carries the SMS opt-in disclosure", () => {
  const js = read("chat.js");
  assert.match(js, /agree we may reply by text/i, "chat consent line");
  assert.match(js, /\bSTOP\b/, "chat STOP");
  assert.ok(js.includes('href="/privacy"') && js.includes('href="/terms"'), "chat links Privacy + Terms");
});

test("booking form shows the text-consent line at the point of phone capture", () => {
  const html = read("find-your-exact-tune.html");
  const idx = html.indexOf('id="fSubmit"');
  assert.ok(idx > 0, "booking submit present");
  const after = html.slice(idx, idx + 900);
  assert.match(after.replace(/<[^>]+>/g, " "), /text/i, "consent mentions text");
  assert.match(after, /\bSTOP\b/, "consent has STOP");
  assert.ok(after.includes('href="privacy.html"') && after.includes('href="terms.html"'), "consent links Privacy + Terms");
});
