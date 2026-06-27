const { test } = require("node:test");
const assert = require("node:assert/strict");
const { centralParts, daysBetweenISO } = require("../netlify/functions/lib/central-time.js");

test("centralParts returns Central wall-clock hour + date (CDT)", () => {
  const p = centralParts(new Date("2026-06-25T12:00:00Z")); // 07:00 CDT
  assert.equal(p.dateISO, "2026-06-25");
  assert.equal(p.hour, 7);
});
test("centralParts handles CST (winter, UTC-6)", () => {
  const p = centralParts(new Date("2026-01-15T13:00:00Z")); // 07:00 CST
  assert.equal(p.hour, 7);
});
test("daysBetweenISO counts whole calendar days", () => {
  assert.equal(daysBetweenISO("2026-06-25", "2026-07-25"), 30);
  assert.equal(daysBetweenISO("2026-06-29", "2026-06-28"), -1);
  assert.equal(daysBetweenISO("2026-06-28", "2026-06-28"), 0);
});
