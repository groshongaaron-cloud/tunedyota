// tests/consent.test.js — the disclosure shown at signing IS the consent evidence;
// version and copy must stay in lockstep, and the console must show it verbatim.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { CONSENT_VERSION, CONSENT_TEXT } = require("../netlify/functions/lib/consent.js");

test("consent copy carries every required A2P/TCPA element", () => {
  assert.match(CONSENT_VERSION, /^a2p-\d{4}-\d{2}$/);
  for (const req of ["Tuned Yota", "STOP", "HELP", "data rates", "not a condition", "frequency varies", "tunedyota.com"]) {
    assert.ok(CONSENT_TEXT.includes(req), `missing: ${req}`);
  }
});
