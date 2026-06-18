const { test } = require("node:test");
const assert = require("node:assert/strict");
const { dtLocal, buildIcs } = require("../netlify/functions/lib/ics.js");

test("dtLocal builds floating local datetime + adds minutes", () => {
  assert.equal(dtLocal("2026-07-12", "9:20"), "20260712T092000");
  assert.equal(dtLocal("2026-07-12", "12:40", 20), "20260712T130000");
});
test("buildIcs contains VEVENT fields", () => {
  const s = buildIcs({ uid: "u1", dateISO: "2026-07-12", slot: "9:20", summary: "Tuned Yota — Sioux Falls", location: "Sioux Falls, SD", description: "x", stamp: "20260101T000000Z" });
  assert.ok(s.includes("BEGIN:VEVENT"));
  assert.ok(s.includes("DTSTART:20260712T092000"));
  assert.ok(s.includes("DTEND:20260712T094000"));
  assert.ok(s.includes("UID:u1"));
});
