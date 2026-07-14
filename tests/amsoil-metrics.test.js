const { test } = require("node:test");
const assert = require("node:assert/strict");
const { aggregate, handler } = require("../netlify/functions/amsoil-metrics.js");

const NOW = new Date("2026-07-14T18:00:00Z");

const clicks = [
  { Booking: "recA", Destination: "shop", Source: "cert", "Clicked At": "2026-07-14T12:00:00Z" },
  { Booking: "recA", Destination: "pc", Source: "email", "Clicked At": "2026-07-13T12:00:00Z" },
  { Booking: "", Destination: "shop", Source: "page:tundra", "Clicked At": "2026-07-14T09:00:00Z" },
  { Booking: "", Destination: "shop", Source: "page:tundra", "Clicked At": "2026-07-14T08:00:00Z" },
  { Booking: "", Destination: "pc", Source: "page:minnesota", "Clicked At": "2026-07-02T08:00:00Z" },
];
const bookings = [
  { id: "recA", fields: { Name: "Alex B", "Certificate Sent": true, "PC Customer": true } },
  { id: "recB", fields: { Name: "Jo", "Certificate Issued": "2026-07-10" } },
  { id: "recC", fields: { Name: "Sam" } },
];

test("totals split shop vs pc and count unique clicked bookings", () => {
  const m = aggregate(clicks, bookings, NOW);
  assert.equal(m.totals.clicks, 5);
  assert.equal(m.totals.shop, 3);
  assert.equal(m.totals.pc, 2);
  assert.equal(m.totals.bookingsWithClicks, 1);   // only recA carried a booking id
});

test("bySource ranks sources and splits destinations", () => {
  const m = aggregate(clicks, bookings, NOW);
  assert.equal(m.bySource[0].source, "page:tundra");
  assert.equal(m.bySource[0].clicks, 2);
  assert.equal(m.bySource[0].shop, 2);
  const email = m.bySource.find((s) => s.source === "email");
  assert.equal(email.pc, 1);
});

test("funnel counts certs sent (either marker) and PC customers", () => {
  const m = aggregate(clicks, bookings, NOW);
  assert.equal(m.funnel.certsSent, 2);      // recA (Sent flag) + recB (Issued date)
  assert.equal(m.funnel.pcCustomers, 1);    // recA
  assert.equal(m.funnel.certClicks, 1);
});

test("daily is a 14-day window ending today, with counts bucketed by date", () => {
  const m = aggregate(clicks, bookings, NOW);
  assert.equal(m.daily.length, 14);
  assert.equal(m.daily[13].date, "2026-07-14");
  assert.equal(m.daily[13].clicks, 3);      // 3 clicks on the 14th
  assert.equal(m.daily[12].clicks, 1);      // 1 on the 13th
});

test("recent is newest-first and enriches the customer name from the booking", () => {
  const m = aggregate(clicks, bookings, NOW);
  assert.equal(m.recent[0].at, "2026-07-14T12:00:00Z");
  assert.equal(m.recent[0].name, "Alex B");
});

test("empty inputs produce a well-formed zeroed report", () => {
  const m = aggregate([], [], NOW);
  assert.equal(m.totals.clicks, 0);
  assert.deepEqual(m.bySource, []);
  assert.equal(m.funnel.certsSent, 0);
  assert.equal(m.daily.length, 14);
});

test("handler rejects a non-admin installer with 403", async () => {
  const res = await handler({ headers: { "x-installer-token": "cody-token" } });
  // no INSTALLER_TOKENS env in test -> resolveInstaller returns null -> 401 (fail-closed)
  assert.equal(res.statusCode, 401);
});
