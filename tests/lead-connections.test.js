// Lead connections: linked bookings, match suggestions, client accounts, stale bucket.
// Pure-function tests for netlify/functions/lib/leads.js additions.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  toLeadView, toBookingSummary, bookingMatchesForLead,
} = require("../netlify/functions/lib/leads.js");

const bk = (id, f) => toBookingSummary({ id, fields: f });

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

test("toBookingSummary flattens a Bookings record", () => {
  const b = bk("recB1", { Name: "Eli Soetenga", Phone: "6194176865", Email: "e@x.com", City: "Madison",
    "Event Date": "2026-08-01", Slot: "10:20", Status: "Booked", Installer: ["aaron"], Vehicle: "Tacoma" });
  assert.deepEqual(b, { id: "recB1", name: "Eli Soetenga", phone: "6194176865", email: "e@x.com",
    city: "Madison", dateISO: "2026-08-01", slot: "10:20", scheduledTime: "", status: "Booked",
    installer: "aaron", vehicle: "Tacoma" });
});

test("bookingMatchesForLead matches +1-format phone against bare 10 digits", () => {
  const lead = { phone: "+16194176865", email: "", bookingId: "" };
  const hits = bookingMatchesForLead(lead, [bk("recB1", { Phone: "6194176865", Status: "Booked" })], "2026-07-30");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, "recB1");
});

test("bookingMatchesForLead matches email case-insensitively", () => {
  const lead = { phone: "", email: "Eli@X.com", bookingId: "" };
  const hits = bookingMatchesForLead(lead, [bk("recB1", { Email: "eli@x.com", Status: "Booked" })], "2026-07-30");
  assert.equal(hits.length, 1);
});

test("bookingMatchesForLead excludes Cancelled and returns nothing for contactless or linked leads", () => {
  const rows = [bk("recB1", { Phone: "6194176865", Status: "Cancelled" })];
  assert.equal(bookingMatchesForLead({ phone: "6194176865", email: "", bookingId: "" }, rows, "2026-07-30").length, 0);
  assert.equal(bookingMatchesForLead({ phone: "", email: "", bookingId: "" }, rows, "2026-07-30").length, 0);
  assert.equal(bookingMatchesForLead({ phone: "6194176865", email: "", bookingId: "recX" }, rows, "2026-07-30").length, 0);
});

test("bookingMatchesForLead sorts upcoming-soonest first, then most recent past", () => {
  const rows = [
    bk("past2", { Phone: "6194176865", Status: "Completed", "Event Date": "2026-06-01" }),
    bk("up2",   { Phone: "6194176865", Status: "Booked", "Event Date": "2026-08-15" }),
    bk("past1", { Phone: "6194176865", Status: "Completed", "Event Date": "2026-07-01" }),
    bk("up1",   { Phone: "6194176865", Status: "Booked", "Event Date": "2026-08-01" }),
  ];
  const ids = bookingMatchesForLead({ phone: "6194176865", email: "", bookingId: "" }, rows, "2026-07-30").map((b) => b.id);
  assert.deepEqual(ids, ["up1", "up2", "past1", "past2"]);
});
