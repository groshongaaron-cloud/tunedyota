// tests/installer-closeout-draft.test.js — a draft never loses data, never
// blocks, never completes, never sends a cert.
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

test("draft saves whatever was entered + Closeout Draft flag; Status untouched; no cert", async () => {
  const writes = []; let sent = 0;
  const d = deps({ update: async (a) => { writes.push(a); return {}; }, send: async () => { sent++; } });
  const out = await processCloseout({ recordId: "recB1", action: "draft", vin: "1GCHK23274F212345", mileage: "88000" }, d);
  assert.equal(out.status, "draft");
  assert.equal(writes[0].fields["Closeout Draft"], true);
  assert.equal(writes[0].fields.VIN, "1GCHK23274F212345");
  assert.equal(writes[0].fields.Mileage, 88000);
  assert.equal(writes[0].fields.Status, undefined);
  assert.equal(sent, 0);
});

test("draft with no fields still flags; completed/cancelled bookings refuse drafts", async () => {
  const out = await processCloseout({ recordId: "recB1", action: "draft" }, deps());
  assert.equal(out.status, "draft");
  const done = await processCloseout({ recordId: "recB1", action: "draft" }, deps({ bookingFields: { Status: "Completed" } }));
  assert.equal(done.error, "not-open");
});

test("complete clears the draft flag", async () => {
  const writes = [];
  await processCloseout({ recordId: "recB1", action: "complete", ...FULL },
    deps({ bookingFields: { "Closeout Draft": true }, update: async (a) => { writes.push(a); return {}; } }));
  assert.equal(writes[0].fields["Closeout Draft"], false);
});
