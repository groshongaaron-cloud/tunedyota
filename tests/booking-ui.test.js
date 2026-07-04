// tests/booking-ui.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const HTML = fs.readFileSync(path.join(__dirname, "..", "site", "find-your-exact-tune.html"), "utf8");

test("real review phrases are present (truthfulness parity with schema)", () => {
  for (const phrase of [
    "smoothest it's ever been",                 // S. Berry
    "throttle control and smoother gear shifts", // H. Aguirre
    "feels like a v8 now",                       // C. Vang
    "classy operation",                          // J. Mayer
  ]) {
    assert.ok(HTML.includes(phrase), `missing review phrase: ${phrase}`);
  }
});

test("conversion-polish hooks exist", () => {
  for (const hook of ["tf-proof", "tf-scarcity", "tf-success-check", 'id="proofResult"', 'id="proofBook"']) {
    assert.ok(HTML.includes(hook), `missing hook: ${hook}`);
  }
});

test("event-date urgency: hooks + tier phrases present", () => {
  assert.ok(HTML.includes("tf-urgency"), "missing tf-urgency class");
  assert.ok(/function eventUrgency/.test(HTML), "missing eventUrgency() helper");
  assert.ok(/function urgencyLine/.test(HTML), "missing urgencyLine() renderer");
  for (const phrase of ["Lock in your spot", "days left", "event is in", "Tomorrow —"]) {
    assert.ok(HTML.includes(phrase), `missing tier phrase: ${phrase}`);
  }
});

test("funnel measurement: sid + beacon hooks present", () => {
  assert.ok(/function track\(/.test(HTML), "missing track() helper");
  assert.ok(HTML.includes("sendBeacon"), "missing sendBeacon");
  assert.ok(HTML.includes("ty_sid"), "missing session id key");
  assert.ok(HTML.includes("STEP_NAMES"), "missing STEP_NAMES");
  assert.ok(/track\(6,\s*["']booked["']\)/.test(HTML), "missing terminal booked beacon");
});

test("intent=update reframes step 0 and tags source", () => {
  assert.ok(/["']intent["']/.test(HTML), "intent parse missing");
  assert.ok(HTML.includes("Free OTT Update"), "update reframe copy missing");
  assert.ok(/["']OTT Update["']/.test(HTML), "OTT Update source tag missing");
});

test("booking success copy softens when email delivery fails", () => {
  assert.ok(HTML.includes("out.emailFailed"), "missing emailFailed branch");
  assert.ok(/confirm the details by phone\/text/i.test(HTML), "missing softened fallback copy");
});

test("model-year capture: field sits between Your vehicle and Modifications", () => {
  const iVeh = HTML.indexOf('id="fVeh"');
  const iYear = HTML.indexOf('id="fYearGroup"');
  const iMods = HTML.indexOf('id="fMods"');
  assert.ok(iVeh > 0 && iYear > 0 && iMods > 0, "one of fVeh/fYearGroup/fMods missing");
  assert.ok(iVeh < iYear && iYear < iMods, "Model year field not positioned between Your vehicle and Modifications");
});

test("model-year capture: constrained select, placeholder, hidden-by-default, required", () => {
  assert.ok(/<select id="fYear"[^>]*\brequired\b/.test(HTML), "fYear should be a required <select>");
  assert.ok(HTML.includes("Select your exact year"), "missing placeholder option");
  assert.ok(/id="fYearGroup"[^>]*display:none/.test(HTML), "Model year group should be hidden by default");
});

test("model-year capture: parse + populate helpers and payload wiring present", () => {
  assert.ok(/function parseYearRange/.test(HTML), "missing parseYearRange()");
  assert.ok(/function populateModelYear/.test(HTML), "missing populateModelYear()");
  assert.ok(/populateModelYear\(\)/.test(HTML), "populateModelYear() not called (prepBooking)");
  for (const tok of ["present", "current", "newer", "now"]) {
    assert.ok(HTML.includes(tok), `parseYearRange missing open-ended token: ${tok}`);
  }
  assert.ok(/vehicle:\$\("#fVeh"\)\.value, ?modelYear/.test(HTML), "modelYear missing from /book payload");
  assert.ok(/vehicle, ?modelYear,/.test(HTML), "modelYear missing from Netlify lead fields");
  assert.ok(/select your exact model year/i.test(HTML), "missing model-year validation message");
});
