const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processWalkin } = require("../netlify/functions/installer-walkin.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };
const okCreate = async () => ({ id: "recNEW" });

test("requires name + phone", async () => {
  const out = await processWalkin({ city: "Omaha", dateISO: "2026-07-03", name: "", phone: "" }, { env, key: "cody", create: okCreate });
  assert.equal(out.status, "error");
  assert.equal(out.error, "missing-contact");
});

test("rejects an unknown city", async () => {
  const out = await processWalkin({ city: "Nowhere", dateISO: "2026-07-03", name: "Jo", phone: "555" }, { env, key: "cody", create: okCreate });
  assert.equal(out.error, "unknown-city");
});

test("rejects a city that routes to a different installer", async () => {
  const out = await processWalkin({ city: "Omaha", dateISO: "2026-07-03", name: "Jo", phone: "555" }, { env, key: "aaron", create: okCreate });
  assert.equal(out.error, "not-your-market");
});

test("rejects a malformed date", async () => {
  const out = await processWalkin({ city: "Omaha", dateISO: "07/03", name: "Jo", phone: "555" }, { env, key: "cody", create: okCreate });
  assert.equal(out.error, "bad-date");
});

test("creates a scoped walk-in booking with the right fields + Source", async () => {
  let created;
  const create = async (a) => { created = a; return { id: "recNEW" }; };
  const out = await processWalkin({ city: "Omaha", dateISO: "2026-07-03", name: "Jo", vehicle: "Tundra", phone: "555" }, { env, key: "cody", create, events: { omaha: [{ dateISO: "2026-07-03" }] } });
  assert.equal(out.status, "booked");
  assert.equal(out.recordId, "recNEW");
  assert.equal(created.fields.Installer, "cody");
  assert.equal(created.fields.City, "Omaha");
  assert.equal(created.fields["Event Date"], "2026-07-03");
  assert.equal(created.fields.Status, "Booked");
  assert.equal(created.fields.Source, "installer:walk-in");
  assert.equal(out.booking.isWalkin, true);
  assert.equal(out.booking.dateISO, "2026-07-03");
  assert.equal(out.booking.name, "Jo");
});

test("an admin may add a walk-in to another installer's market → assigned to that owner", async () => {
  let created;
  const create = async (a) => { created = a; return { id: "recADMIN" }; };
  // Aaron (admin) adds a walk-in in Omaha, which routes to cody.
  const out = await processWalkin({ city: "Omaha", dateISO: "2026-07-03", name: "Jo", phone: "555" },
    { env, key: "aaron", admin: true, create, events: { omaha: [{ dateISO: "2026-07-03" }] } });
  assert.equal(out.status, "booked");
  assert.equal(created.fields.Installer, "cody");     // owned by the market's installer, NOT the admin
  assert.equal(out.booking.installer, "cody");
});

test("a non-admin still cannot add to a market that isn't theirs", async () => {
  const out = await processWalkin({ city: "Omaha", dateISO: "2026-07-03", name: "Jo", phone: "555" },
    { env, key: "aaron", admin: false, create: okCreate, events: { omaha: [{ dateISO: "2026-07-03" }] } });
  assert.equal(out.error, "not-your-market");
});

test("accepts a walk-in on ANY date — everyday business, not only scheduled event days", async () => {
  let created;
  const out = await processWalkin({ city: "Omaha", dateISO: "2026-07-22", name: "Jo", phone: "555" },
    { env, key: "cody", create: async (a) => { created = a; return { id: "recX" }; } });
  assert.equal(out.status, "booked");
  assert.equal(created.fields["Event Date"], "2026-07-22");   // a non-event day is fine now
  assert.equal(created.fields.Source, "installer:walk-in");
});

test("defaults the walk-in date to today when none is supplied", async () => {
  let created;
  await processWalkin({ city: "Omaha", name: "Jo", phone: "555" },
    { env, key: "cody", now: new Date("2026-07-12T15:00:00Z"), create: async (a) => { created = a; return { id: "r" }; } });
  assert.equal(created.fields["Event Date"], "2026-07-12");
});

test("persists a customer email when provided", async () => {
  const created = [];
  const out = await processWalkin(
    { city: "Sioux Falls", name: "Pat R", phone: "6055551212", email: "pat@example.com", vehicle: "2021 Tundra" },
    { key: "cody", create: async (a) => { created.push(a.fields); return { id: "rec1" }; } });
  assert.equal(out.status, "booked");
  assert.equal(created[0].Email, "pat@example.com");
});

test("a clientKey matching an existing booking returns it without creating", async () => {
  let created = false;
  const existing = { id: "recX", fields: { City: "Fargo", "Event Date": "2026-08-01", Name: "Dana", Vehicle: "Tundra", Phone: "1", Email: "", Installer: "aaron", "Client Key": "ck-1" } };
  const out = await processWalkin({ city: "fargo", name: "Dana", phone: "1", clientKey: "ck-1" },
    { key: "aaron", admin: false, list: async () => [existing], create: async () => { created = true; return {}; } });
  assert.equal(out.status, "booked");
  assert.equal(out.recordId, "recX");
  assert.equal(created, false);
});

test("a new clientKey creates and writes Client Key", async () => {
  let fields;
  const out = await processWalkin({ city: "fargo", name: "Dana", phone: "1", clientKey: "ck-2" },
    { key: "aaron", admin: false, list: async () => [], create: async (a) => { fields = a.fields; return { id: "recNew" }; } });
  assert.equal(out.status, "booked");
  assert.equal(out.recordId, "recNew");
  assert.equal(fields["Client Key"], "ck-2");
});

test("a quote in the clientKey cannot break out of the dedupe formula", async () => {
  let formula;
  await processWalkin({ city: "fargo", name: "Dana", phone: "1", clientKey: 'ck", {Name}!="' },
    { key: "aaron", admin: false, list: async (a) => { formula = a.filterByFormula; return []; }, create: async () => ({ id: "recNew" }) });
  assert.equal(formula, '{Client Key}="ck\\", {Name}!=\\""');
});

test("no clientKey still creates as before (no lookup required)", async () => {
  const out = await processWalkin({ city: "fargo", name: "Dana", phone: "1" },
    { key: "aaron", admin: false, list: async () => [], create: async () => ({ id: "rec3" }) });
  assert.equal(out.status, "booked");
});
