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

test("unknown city", async () => {
  const r = await getAvailability("Atlantis", { fetchImpl: fakeFetch({ events: "" }), env });
  assert.equal(r.hasEvent, false);
  assert.equal(r.error, "unknown-city");
});
test("no event for known city", async () => {
  const r = await getAvailability("Omaha", { fetchImpl: fakeFetch({ events: "Market,Date,Active\nOmaha,nope,yes\n" }), env });
  assert.equal(r.hasEvent, false);
});
test("event with some taken slots", async () => {
  const events = "Market,Date,Active\nSioux Falls,2026-07-12,yes\n";
  const r = await getAvailability("Sioux Falls", { fetchImpl: fakeFetch({ events, taken: ["9:00", "9:20"] }), env });
  assert.equal(r.hasEvent, true);
  assert.equal(r.eventDateISO, "2026-07-12");
  assert.equal(r.openSlots.length, 10);
  assert.equal(r.full, false);
});
test("full event", async () => {
  const events = "Market,Date,Active\nSioux Falls,2026-07-12,yes\n";
  const all = ["9:00","9:20","9:40","10:00","10:20","10:40","11:00","11:20","11:40","12:00","12:20","12:40"];
  const r = await getAvailability("Sioux Falls", { fetchImpl: fakeFetch({ events, taken: all }), env });
  assert.equal(r.full, true);
  assert.equal(r.openSlots.length, 0);
});
