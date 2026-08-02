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

test("completed bookings accept identity corrections — name, vehicle, model year (Aaron ask 2026-08-02: wrong engine picked at booking)", async () => {
  let patched;
  const out = await processReschedule({ recordId: "rec1", vehicle: "2016-2023 Toyota Tacoma 3.5L V6", name: "Alexander Ellis", modelYear: "2023" },
    { env, key: "noah", get: async () => recFor("noah", { Status: "Completed", Vehicle: "2016-2023 Toyota Tacoma 2.7L I4" }), update: async (a) => { patched = a.fields; return {}; } });
  assert.equal(out.status, "ok");
  assert.equal(patched.Vehicle, "2016-2023 Toyota Tacoma 3.5L V6");
  assert.equal(patched.Name, "Alexander Ellis");
  assert.equal(patched["Model Year"], "2023");
});

test("completed bookings still refuse date/time/address changes (OTT report buckets by these dates)", async () => {
  const deps = { env, key: "noah", get: async () => recFor("noah", { Status: "Completed" }), update: async () => ({}) };
  assert.equal((await processReschedule({ recordId: "rec1", dateISO: "2026-09-20" }, deps)).error, "not-open");
  assert.equal((await processReschedule({ recordId: "rec1", time: "9:00 AM" }, deps)).error, "not-open");
  assert.equal((await processReschedule({ recordId: "rec1", address: "1 Elm St" }, deps)).error, "not-open");
  // A mixed request (correction + date) is also refused — no partial writes.
  assert.equal((await processReschedule({ recordId: "rec1", vehicle: "2021 Tundra", dateISO: "2026-09-20" }, deps)).error, "not-open");
});

test("cancelled bookings stay fully locked", async () => {
  const out = await processReschedule({ recordId: "rec1", vehicle: "2021 Tundra" },
    { env, key: "noah", get: async () => recFor("noah", { Status: "Cancelled" }), update: async () => ({}) });
  assert.equal(out.error, "not-open");
});

test("model year: written on open bookings, validated, unchanged year not written", async () => {
  let patched;
  const deps = (extra) => ({ env, key: "noah", get: async () => recFor("noah", extra), update: async (a) => { patched = a.fields; return {}; } });
  const out = await processReschedule({ recordId: "rec1", modelYear: "2023" }, deps({}));
  assert.equal(out.status, "ok");
  assert.equal(patched["Model Year"], "2023");
  assert.equal(out.modelYear, "2023");
  assert.equal((await processReschedule({ recordId: "rec1", modelYear: "23" }, deps({}))).error, "bad-year");
  patched = undefined;
  const out2 = await processReschedule({ recordId: "rec1", modelYear: "2023", time: "9:00 AM" }, deps({ "Model Year": "2023" }));
  assert.equal(out2.status, "ok");
  assert.equal("Model Year" in (patched || {}), false);
});

test("validates inputs: bad date, nothing to change, oversize time/address", async () => {
  const deps = { env, key: "noah", get: async () => recFor("noah"), update: async () => ({}) };
  assert.equal((await processReschedule({ recordId: "rec1", dateISO: "9/20/2026" }, deps)).error, "bad-date");
  assert.equal((await processReschedule({ recordId: "rec1" }, deps)).error, "nothing-to-change");
  assert.equal((await processReschedule({ recordId: "rec1", time: "x".repeat(50) }, deps)).error, "bad-time");
  assert.equal((await processReschedule({ recordId: "rec1", address: "x".repeat(201) }, deps)).error, "bad-address");
  assert.equal((await processReschedule({}, deps)).error, "missing-record");
});

test("address-only update is a valid change ('once we know the address') and is echoed", async () => {
  let patched;
  const out = await processReschedule({ recordId: "rec1", address: "123 Main St, Green Bay, WI" },
    { env, key: "noah", get: async () => recFor("noah"), update: async (a) => { patched = a.fields; return {}; } });
  assert.equal(out.status, "ok");
  assert.equal(patched.Address, "123 Main St, Green Bay, WI");
  assert.equal("Event Date" in patched, false);
  assert.equal(out.address, "123 Main St, Green Bay, WI");
});

test("an empty address leaves the stored Address untouched and echoes the existing one", async () => {
  let patched;
  const out = await processReschedule({ recordId: "rec1", time: "9:15 AM" },
    { env, key: "noah", get: async () => recFor("noah", { Address: "44 Oak Ave" }), update: async (a) => { patched = a.fields; return {}; } });
  assert.equal(out.status, "ok");
  assert.equal("Address" in patched, false);
  assert.equal(out.address, "44 Oak Ave");
});

test("owner can correct the customer name (Aaron ask 2026-07-30: placeholder names on real bookings)", async () => {
  let patched;
  const out = await processReschedule({ recordId: "rec1", name: "  Mike Larson  " },
    { env, key: "noah", get: async () => recFor("noah", { Name: "Text 763-516-4782" }), update: async (a) => { patched = a.fields; return {}; } });
  assert.equal(out.status, "ok");
  assert.equal(patched.Name, "Mike Larson");
  assert.equal(out.name, "Mike Larson");
});

test("name-only update counts as a change; unchanged name is not written", async () => {
  let patched;
  const out = await processReschedule({ recordId: "rec1", name: "Jane" },
    { env, key: "noah", get: async () => recFor("noah"), update: async (a) => { patched = a.fields; return {}; } });
  assert.equal(out.status, "ok");
  assert.equal("Name" in (patched || {}), false);
});

test("overlong name rejected", async () => {
  const out = await processReschedule({ recordId: "rec1", name: "x".repeat(81) },
    { env, key: "noah", get: async () => recFor("noah"), update: async () => ({}) });
  assert.equal(out.status, "error");
  assert.equal(out.error, "bad-name");
});

test("console Edit panel wires the name field into the reschedule call", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const HTML = fs.readFileSync(path.join(__dirname, "..", "site", "installer.html"), "utf8");
  assert.ok(HTML.includes("rn_'+b.id"), "name input rendered");
  assert.ok(/name:nameChanged\?n:''/.test(HTML), "name sent only when changed");
  assert.ok(HTML.includes("rv_'+b.id"), "vehicle input rendered");
  assert.ok(/vehicle:vehChanged\?veh:''/.test(HTML), "vehicle sent only when changed");
  assert.ok(/if\(vehChanged\) load\(\);/.test(HTML), "vehicle change refreshes derived roster data");
});

test("owner can correct the vehicle", async () => {
  let patched;
  const out = await processReschedule({ recordId: "rec1", vehicle: "  2021 Tundra 5.7L  " },
    { env, key: "noah", get: async () => recFor("noah", { Vehicle: "" }), update: async (a) => { patched = a.fields; return {}; } });
  assert.equal(out.status, "ok");
  assert.equal(patched.Vehicle, "2021 Tundra 5.7L");
  assert.equal(out.vehicle, "2021 Tundra 5.7L");
});

test("unchanged vehicle is not written; vehicle-only update counts as a change", async () => {
  let patched;
  const out = await processReschedule({ recordId: "rec1", vehicle: "2020 4Runner" },
    { env, key: "noah", get: async () => recFor("noah", { Vehicle: "2020 4Runner" }), update: async (a) => { patched = a.fields; return {}; } });
  assert.equal(out.status, "ok");
  assert.equal("Vehicle" in (patched || {}), false);
});

test("overlong vehicle rejected", async () => {
  const out = await processReschedule({ recordId: "rec1", vehicle: "x".repeat(121) },
    { env, key: "noah", get: async () => recFor("noah"), update: async () => ({}) });
  assert.equal(out.status, "error");
  assert.equal(out.error, "bad-vehicle");
});
