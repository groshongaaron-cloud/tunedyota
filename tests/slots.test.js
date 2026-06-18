const { test } = require("node:test");
const assert = require("node:assert/strict");
const { SLOT_TIMES, CAPACITY, computeOpen, isValidSlot, formatSlot } = require("../netlify/functions/lib/slots.js");

test("12 slots, 9:00 to 12:40", () => {
  assert.equal(CAPACITY, 12);
  assert.equal(SLOT_TIMES[0], "9:00");
  assert.equal(SLOT_TIMES[11], "12:40");
});
test("computeOpen removes taken", () => {
  const open = computeOpen(["9:00", "10:20"]);
  assert.equal(open.length, 10);
  assert.ok(!open.includes("9:00"));
});
test("isValidSlot", () => {
  assert.equal(isValidSlot("9:20"), true);
  assert.equal(isValidSlot("8:00"), false);
});
test("formatSlot to 12h am/pm", () => {
  assert.equal(formatSlot("9:00"), "9:00 AM");
  assert.equal(formatSlot("12:40"), "12:40 PM");
});
