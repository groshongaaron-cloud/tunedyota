const { test } = require("node:test");
const assert = require("node:assert/strict");
const { eventsList, flattenRecords } = require("../netlify/functions/lib/report-sources.js");

test("eventsList joins events-data with state + installer", () => {
  const list = eventsList();
  const tc = list.find((e) => e.city === "Twin Cities");
  assert.ok(tc, "Twin Cities present");
  assert.equal(tc.dateISO, "2026-06-20");
  assert.ok(tc.state && tc.installerKey, "has state + installerKey");
});
test("flattenRecords lifts fields + createdTime", () => {
  const flat = flattenRecords([{ id: "r1", createdTime: "2026-06-20T00:00:00Z", fields: { Name: "Jane", City: "Omaha" } }]);
  assert.equal(flat[0].Name, "Jane");
  assert.equal(flat[0].createdTime, "2026-06-20T00:00:00Z");
});

const { buildReport } = require("../netlify/functions/lib/report-metrics.js");

const EVTS = [
  { city: "Omaha", state: "NE", dateISO: "2026-06-28", label: "June 28, 2026", installerKey: "noah" },
  { city: "Fargo", state: "ND", dateISO: "2026-07-03", label: "July 3, 2026", installerKey: "cody" },
];
const NOW = new Date("2026-06-25T12:00:00Z"); // Omaha in 3 days, Fargo in 8
function bk(o) { return { City: "Omaha", "Event Date": "2026-06-28", Slot: "9:00", Name: "A", Phone: "1", Email: "a@x.com", Vehicle: "Tacoma", Installer: "noah", Status: "Booked", Source: "find-your-exact-tune", createdTime: "2026-06-24T00:00:00Z", ...o }; }

test("rollup totals + per-event fill + pace", () => {
  const bookings = [bk({}), bk({ Slot: "9:20", Email: "b@x.com" }), bk({ Slot: "9:40", Email: "c@x.com", Status: "Completed", "Calibration Date": "2026-06-28" })];
  const r = buildReport({ bookings, priority: [], leads: [], events: EVTS, capacity: 12, now: NOW });
  const omaha = r.events.find((e) => e.city === "Omaha");
  assert.equal(omaha.booked, 3);
  assert.equal(omaha.open, 9);
  assert.equal(omaha.fillPct, 25);
  assert.equal(omaha.pace, "slow");
  assert.equal(r.rollup.bookings, 3);
  assert.equal(r.rollup.won, 1);
});
test("cancelled slot frees capacity; won/lost/conversion", () => {
  const bookings = [bk({ Status: "Cancelled" }), bk({ Slot: "9:20", Status: "Completed", "Calibration Date": "2026-06-28" }), bk({ Slot: "9:40", Status: "No-show" })];
  const r = buildReport({ bookings, priority: [], leads: [], events: EVTS, capacity: 12, now: NOW });
  const omaha = r.events.find((e) => e.city === "Omaha");
  assert.equal(omaha.booked, 2);
  assert.equal(r.rollup.won, 1);
  assert.equal(r.rollup.lost, 2);
  assert.equal(r.rollup.conversionPct, 33);
});
test("latent demand from no-event priority; closed roster", () => {
  const priority = [{ City: "Boise", Name: "Z", Reason: "No event scheduled", Installer: "aaron", createdTime: "2026-06-24T00:00:00Z" }];
  const bookings = [bk({ Status: "Completed", "Calibration Date": "2026-06-20", Name: "Closed Carl", Installer: "noah" })];
  const r = buildReport({ bookings, priority, leads: [], events: EVTS, capacity: 12, now: NOW });
  assert.equal(r.latentDemand[0].city, "Boise");
  assert.equal(r.closedRoster[0].name, "Closed Carl");
  assert.equal(r.closedRoster[0].installer, "noah");
  assert.equal(r.closedRoster[0].calibrationDate, "2026-06-20");
});
test("contacts deduped by email then phone, newest wins", () => {
  const bookings = [
    bk({ Email: "dup@x.com", Name: "Old", createdTime: "2026-06-01T00:00:00Z" }),
    bk({ Email: "dup@x.com", Name: "New", createdTime: "2026-06-24T00:00:00Z" }),
  ];
  const r = buildReport({ bookings, priority: [], leads: [], events: EVTS, capacity: 12, now: NOW });
  const dups = r.contacts.filter((c) => c.email === "dup@x.com");
  assert.equal(dups.length, 1);
  assert.equal(dups[0].name, "New");
});
test("prior-month close emitted only early in month", () => {
  const early = buildReport({ bookings: [], priority: [], leads: [], events: EVTS, capacity: 12, now: new Date("2026-07-03T12:00:00Z") });
  assert.ok(early.priorMonthClose, "emitted on day 3");
  const mid = buildReport({ bookings: [], priority: [], leads: [], events: EVTS, capacity: 12, now: new Date("2026-07-20T12:00:00Z") });
  assert.equal(mid.priorMonthClose, null);
});
