const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getAvailability } = require("../netlify/functions/availability.js");

function fakeFetch({ events, taken = [] }) {
  return async (url) => {
    if (url.includes("docs.google.com")) return { ok: true, text: async () => events };
    if (url.includes("api.airtable.com")) return { ok: true, json: async () => ({ records: taken.map((s) => ({ fields: { Slot: s } })) }) };
    throw new Error("unexpected url " + url);
  };
}
const env = { EVENTS_SHEET_ID: "x", AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };
const NOW = new Date("2026-07-01T12:00:00Z");

test("unknown city", async () => {
  const r = await getAvailability("Atlantis", { fetchImpl: fakeFetch({ events: "" }), env, now: NOW });
  assert.equal(r.hasEvent, false);
  assert.equal(r.error, "unknown-city");
});
test("no event for known city returns empty events", async () => {
  const r = await getAvailability("Omaha", { fetchImpl: fakeFetch({ events: "Market,Date,Active\nOmaha,nope,yes\n" }), env, now: NOW });
  assert.equal(r.hasEvent, false);
  assert.deepEqual(r.events, []);
});
test("event with some taken slots (single date)", async () => {
  const events = "Market,Date,Active\nSioux Falls,2026-07-12,yes\n";
  const r = await getAvailability("Sioux Falls", { fetchImpl: fakeFetch({ events, taken: ["9:00", "9:20"] }), env, now: NOW });
  assert.equal(r.hasEvent, true);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].dateISO, "2026-07-12");
  assert.equal(r.events[0].openSlots.length, 10);
  assert.equal(r.events[0].full, false);
  assert.equal(r.eventDateISO, "2026-07-12"); // back-compat mirror of soonest
});
test("two dates for one city come back soonest-first, each with its own slots", async () => {
  const events = "Market,Date,Active\nTwin Cities,2026-10-16,yes\nTwin Cities,2026-08-29,yes\n";
  const r = await getAvailability("Twin Cities", { fetchImpl: fakeFetch({ events, taken: [] }), env, now: NOW });
  assert.equal(r.events.length, 2);
  assert.deepEqual(r.events.map((e) => e.dateISO), ["2026-08-29", "2026-10-16"]);
  assert.equal(r.events[0].full, false);
});
test("full soonest date reports full", async () => {
  const events = "Market,Date,Active\nSioux Falls,2026-07-12,yes\n";
  const all = ["9:00","9:20","9:40","10:00","10:20","10:40","11:00","11:20","11:40","12:00","12:20","12:40"];
  const r = await getAvailability("Sioux Falls", { fetchImpl: fakeFetch({ events, taken: all }), env, now: NOW });
  assert.equal(r.events[0].full, true);
  assert.equal(r.events[0].openSlots.length, 0);
});

test("noah market (Green Bay) offers 10 generic slots and slotMode generic", async () => {
  const events = "Market,Date,Active\nGreen Bay,2026-09-12,yes\n";
  const r = await getAvailability("Green Bay", { fetchImpl: fakeFetch({ events, taken: ["Slot 1"] }), env, now: NOW });
  assert.equal(r.hasEvent, true);
  assert.equal(r.capacity, 10);
  assert.equal(r.slotMode, "generic");
  assert.equal(r.events[0].openSlots.length, 9);
  assert.ok(r.events[0].openSlots.includes("Slot 2"));
  assert.ok(!r.events[0].openSlots.includes("9:00"));
  assert.equal(r.slotLabels["Slot 2"], "Slot 2");
});
test("timed market still reports slotMode times", async () => {
  const events = "Market,Date,Active\nSioux Falls,2026-07-12,yes\n";
  const r = await getAvailability("Sioux Falls", { fetchImpl: fakeFetch({ events, taken: [] }), env, now: NOW });
  assert.equal(r.slotMode, "times");
  assert.equal(r.capacity, 12);
});
