// tests/slot-window.test.js — per-event slot windows (e.g. a 10-to-noon event)
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { windowSlots, SLOT_TIMES, GENERIC_SLOTS } = require("../netlify/functions/lib/slots.js");

test("no window -> full grid unchanged", () => {
  assert.deepEqual(windowSlots(SLOT_TIMES, {}), SLOT_TIMES);
  assert.deepEqual(windowSlots(SLOT_TIMES, null), SLOT_TIMES);
});

test("10:00-11:40 window keeps only in-window times (10-to-noon event)", () => {
  const w = windowSlots(SLOT_TIMES, { firstSlot: "10:00", lastSlot: "11:40" });
  assert.deepEqual(w, ["10:00", "10:20", "10:40", "11:00", "11:20", "11:40"]);
});

test("open-ended window bounds one side only", () => {
  assert.equal(windowSlots(SLOT_TIMES, { firstSlot: "12:00" }).length, 3);
  assert.equal(windowSlots(SLOT_TIMES, { lastSlot: "9:40" }).length, 3);
});

test("generic (non-time) slot labels are never filtered", () => {
  assert.deepEqual(windowSlots(GENERIC_SLOTS, { firstSlot: "10:00", lastSlot: "11:40" }), GENERIC_SLOTS);
});
