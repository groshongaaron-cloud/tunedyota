const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processReschedule } = require("../netlify/functions/installer-reschedule.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };
const recFor = (installer, extra = {}) => ({ id: "rec1", fields: { Installer: installer, Name: "Jane", Status: "Booked", "Event Date": "2026-09-12", City: "Green Bay", ...extra } });

test("owner sets a scheduled time and adjusts the date", async () => {
  let patched;
  const out = await processReschedule({ recordId: "rec1", dateISO: "2026-09-13", time: "10:30 AM" },
    { env, key: "noah", get: async () => recFor(["noah"]), update: async (a) => { patched = a.fields; return {}; } });
  assert.equal(out.status, "ok");
  assert.equal(patched["Event Date"], "2026-09-13");
  assert.equal(patched["Scheduled Time"], "10:30 AM");
});

test("time-only update leaves the date alone", async () => {
  let patched;
  const out = await processReschedule({ recordId: "rec1", time: "9:15 AM" },
    { env, key: "noah", get: async () => recFor("noah"), update: async (a) => { patched = a.fields; return {}; } });
  assert.equal(out.status, "ok");
  assert.equal("Event Date" in patched, false);
  assert.equal(patched["Scheduled Time"], "9:15 AM");
});

test("rejects a booking owned by another installer", async () => {
  const out = await processReschedule({ recordId: "rec1", time: "9:15 AM" },
    { env, key: "noah", get: async () => recFor("cody"), update: async () => ({}) });
  assert.equal(out.status, "error");
  assert.equal(out.error, "not-yours");
});

test("admin may reschedule any installer's booking", async () => {
  let patched;
  const out = await processReschedule({ recordId: "rec1", dateISO: "2026-09-20" },
    { env, key: "aaron", admin: true, get: async () => recFor("noah"), update: async (a) => { patched = a.fields; return {}; } });
  assert.equal(out.status, "ok");
  assert.equal(patched["Event Date"], "2026-09-20");
});

test("legacy long-label Installer value still passes ownership", async () => {
  const out = await processReschedule({ recordId: "rec1", time: "1:00 PM" },
    { env, key: "noah", get: async () => recFor(["Noah - Milwaukee, Green Bay, Kohler, "]), update: async () => ({}) });
  assert.equal(out.status, "ok");
});

test("completed bookings cannot be rescheduled", async () => {
  const out = await processReschedule({ recordId: "rec1", dateISO: "2026-09-20" },
    { env, key: "noah", get: async () => recFor("noah", { Status: "Completed" }) , update: async () => ({}) });
  assert.equal(out.status, "error");
  assert.equal(out.error, "not-open");
});

test("validates inputs: bad date, nothing to change, oversize time", async () => {
  const deps = { env, key: "noah", get: async () => recFor("noah"), update: async () => ({}) };
  assert.equal((await processReschedule({ recordId: "rec1", dateISO: "9/20/2026" }, deps)).error, "bad-date");
  assert.equal((await processReschedule({ recordId: "rec1" }, deps)).error, "nothing-to-change");
  assert.equal((await processReschedule({ recordId: "rec1", time: "x".repeat(50) }, deps)).error, "bad-time");
  assert.equal((await processReschedule({}, deps)).error, "missing-record");
});
