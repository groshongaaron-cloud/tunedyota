// Lead connections: linked bookings, match suggestions, client accounts, stale bucket.
// Pure-function tests for netlify/functions/lib/leads.js additions.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  toLeadView,
} = require("../netlify/functions/lib/leads.js");

test("toLeadView prefers the Booking linked field over legacy Converted Booking", () => {
  const l = toLeadView({ id: "rec1", fields: { Name: "Eli", Booking: ["recBK9"], "Converted Booking": "recOLD" } });
  assert.equal(l.bookingId, "recBK9");
});

test("toLeadView falls back to Converted Booking text until backfill runs", () => {
  const l = toLeadView({ id: "rec1", fields: { Name: "Eli", "Converted Booking": "recOLD" } });
  assert.equal(l.bookingId, "recOLD");
});

test("toLeadView exposes waitlist fields", () => {
  const l = toLeadView({ id: "rec1", fields: { Name: "W", Reason: "Event full", "Event Date": "2026-07-26", "Requested Slot": "10:20", Notified: true } });
  assert.equal(l.reason, "Event full");
  assert.equal(l.eventDate, "2026-07-26");
  assert.equal(l.requestedSlot, "10:20");
  assert.equal(l.notified, true);
});
