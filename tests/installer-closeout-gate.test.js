// tests/installer-closeout-gate.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processCloseout } = require("../netlify/functions/installer-closeout.js");
const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", RESEND_API_KEY: "k" };
const FULL = { calibration: "Medium", vin: "1GCHK23274F212345", tuningPlatform: "VFT",
  calibrationType: "Basic", ecuId: "AUTO", gearSize: "3.90", mileage: "88000", modelYear: "2019" };
const booking = (fields) => ({ id: "recB1", fields: { Name: "Sam", Installer: ["cody"], City: "Madison",
  "Event Date": "2026-08-01", Vehicle: "Tacoma 3.5L", ...fields } });
const deps = (over = {}) => ({ env, key: "cody", admin: false, now: new Date("2026-08-01T20:00:00Z"),
  get: async () => booking(over.bookingFields || {}),
  update: async () => ({}), create: async () => ({ id: "x" }), send: async () => ({}),
  list: async () => [], ...over });

test("non-admin completion missing report fields → report-fields-missing with the list", async () => {
  const { mileage, ...rest } = FULL;
  const out = await processCloseout({ recordId: "recB1", action: "complete", ...rest }, deps());
  assert.equal(out.status, "error");
  assert.equal(out.error, "report-fields-missing");
  assert.deepEqual(out.missing, ["Mileage"]);
});

test("fields already on the booking satisfy the gate", async () => {
  const { vin, ...rest } = FULL;
  const out = await processCloseout({ recordId: "recB1", action: "complete", ...rest },
    deps({ bookingFields: { VIN: "1GCHK23274F212345" } }));
  assert.equal(out.status, "completed");
});

test("admin bypasses the gate (never-block-the-owner)", async () => {
  const out = await processCloseout({ recordId: "recB1", action: "complete", calibration: "Medium" },
    deps({ key: "aaron", admin: true }));
  assert.equal(out.status, "completed");
});

test("modelYear backfills a blank booking Model Year, never overwrites", async () => {
  const writes = [];
  const d = deps({ update: async (a) => { writes.push(a); return {}; } });
  await processCloseout({ recordId: "recB1", action: "complete", ...FULL }, d);
  assert.equal(writes[0].fields["Model Year"], "2019");
  writes.length = 0;
  const d2 = deps({ bookingFields: { "Model Year": "2018" }, update: async (a) => { writes.push(a); return {}; } });
  await processCloseout({ recordId: "recB1", action: "complete", ...FULL }, d2);
  assert.equal(writes[0].fields["Model Year"], undefined);
});
