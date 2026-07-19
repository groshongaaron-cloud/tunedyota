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

// ---- Installer slot policy: Noah's markets book generic slots, not times ----
const { GENERIC_SLOTS, slotsFor, capacityFor } = require("../netlify/functions/lib/slots.js");

test("noah books 10 generic slots (Slot 1..Slot 10)", () => {
  assert.equal(GENERIC_SLOTS.length, 10);
  assert.deepEqual(slotsFor("noah"), GENERIC_SLOTS);
  assert.equal(slotsFor("noah")[0], "Slot 1");
  assert.equal(slotsFor("noah")[9], "Slot 10");
  assert.equal(capacityFor("noah"), 10);
});
test("other installers keep the 12 timed slots", () => {
  assert.deepEqual(slotsFor("aaron"), SLOT_TIMES);
  assert.deepEqual(slotsFor("cody"), SLOT_TIMES);
  assert.deepEqual(slotsFor(""), SLOT_TIMES);
  assert.equal(capacityFor("aaron"), 12);
});
test("computeOpen respects the installer's slot list", () => {
  const open = computeOpen(["Slot 1", "Slot 4"], "noah");
  assert.equal(open.length, 8);
  assert.ok(!open.includes("Slot 1"));
  assert.ok(open.includes("Slot 2"));
});
test("isValidSlot respects the installer's slot list", () => {
  assert.equal(isValidSlot("Slot 3", "noah"), true);
  assert.equal(isValidSlot("9:20", "noah"), false);
  assert.equal(isValidSlot("Slot 3"), false);
  assert.equal(isValidSlot("9:20", "aaron"), true);
});
test("formatSlot passes generic slot labels through unchanged", () => {
  assert.equal(formatSlot("Slot 7"), "Slot 7");
});
