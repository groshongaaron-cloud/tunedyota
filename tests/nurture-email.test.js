const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildNurtureEmail, STEPS } = require("../netlify/functions/lib/nurture-email.js");

test("three escalating steps, each with subject/html/text and the funnel CTA", () => {
  assert.equal(STEPS, 3);
  for (let s = 1; s <= 3; s++) {
    const m = buildNurtureEmail(s, { name: "Marcus Vue", vehicle: "Tacoma" });
    assert.ok(m.subject && m.html && m.text, `step ${s} complete`);
    assert.match(m.html, /find-your-exact-tune/);
    assert.match(m.text, /find-your-exact-tune/);
  }
});
test("step 1 educates, step 2 shows proof, step 3 drives to the event", () => {
  assert.match(buildNurtureEmail(1, {}).html, /gear hunting|factory-flaw|5-gas/i);
  assert.match(buildNurtureEmail(2, {}).html, /94% of owners recommend|torque/i);
  assert.match(buildNurtureEmail(3, {}).html, /event/i);
});
test("personalizes first name + vehicle, escapes html, falls back cleanly", () => {
  assert.match(buildNurtureEmail(1, { name: "Marcus Vue", vehicle: "4Runner" }).html, /Hi Marcus/);
  assert.match(buildNurtureEmail(1, {}).html, /Hi there/);
  assert.match(buildNurtureEmail(1, { vehicle: "<b>x</b>" }).html, /&lt;b&gt;/);
});
