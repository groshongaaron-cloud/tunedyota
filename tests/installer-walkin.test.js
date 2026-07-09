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
  const out = await processWalkin({ city: "Omaha", dateISO: "2026-07-03", name: "Jo", vehicle: "Tundra", phone: "555" }, { env, key: "cody", create });
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
