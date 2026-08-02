// tests/installer-closeout-propagation.test.js
// The close-out is the moment the client record becomes retail-funnel-complete:
// email/preferred-contact/year flow to the lead; consent ONLY with a signature.
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

const SIG = "data:image/png;base64,iVBORw0KGgo=";

function propDeps(leadRows, over = {}) {
  const leadPatches = [];
  return { leadPatches, deps: deps({
    list: async () => leadRows,
    update: async (a) => { if (a.table === "Priority List") leadPatches.push(a); return {}; },
    ...over }) };
}

test("complete propagates email + preferred contact + year to the linked client record", async () => {
  const lead = { id: "recL1", fields: { Name: "Sam", Phone: "6125550100", Installer: "cody", Booking: ["recB1"] } };
  const { leadPatches, deps: d } = propDeps([lead]);
  await processCloseout({ recordId: "recB1", action: "complete", ...FULL,
    customerEmail: "sam@x.com", preferredContact: "SMS" }, d);
  const patch = leadPatches.find((p) => p.id === "recL1");
  assert.equal(patch.fields.Email, "sam@x.com");
  assert.equal(patch.fields["Preferred Contact"], "SMS");
  assert.equal(patch.fields["Model Year"], "2019");
});

test("consent recorded only with signature + toggle; evidence names the booking + version", async () => {
  const lead = { id: "recL1", fields: { Phone: "6125550100", Installer: "cody", Booking: ["recB1"] } };
  const on = propDeps([lead]);
  await processCloseout({ recordId: "recB1", action: "complete", ...FULL,
    marketingConsent: true, signature: SIG }, on.deps);
  const p1 = on.leadPatches.find((p) => p.id === "recL1");
  assert.equal(p1.fields["Marketing Consent"], "2026-08-01");
  assert.match(p1.fields["Consent Version"], /^a2p-/);
  assert.match(p1.fields["Activity Log"], /consent .* booking recB1/);
  const off = propDeps([lead]);
  await processCloseout({ recordId: "recB1", action: "complete", ...FULL, marketingConsent: true }, off.deps);
  const p2 = off.leadPatches.find((p) => p.id === "recL1");
  assert.equal((p2 && p2.fields["Marketing Consent"]) || undefined, undefined, "no signature → no consent");
});

test("no client record → propagation mints one; propagation failure never blocks completion", async () => {
  const creates = [];
  const { deps: d } = propDeps([], { create: async (a) => { creates.push(a); return { id: "recMint" }; } });
  const out = await processCloseout({ recordId: "recB1", action: "complete", ...FULL, customerEmail: "sam@x.com" }, d);
  assert.equal(out.status, "completed");
  assert.ok(creates.some((a) => a.fields && a.fields.Booking));
  const boom = deps({ list: async () => { throw new Error("airtable down"); } });
  const out2 = await processCloseout({ recordId: "recB1", action: "complete", ...FULL }, boom);
  assert.equal(out2.status, "completed", "propagation is fail-open");
});
