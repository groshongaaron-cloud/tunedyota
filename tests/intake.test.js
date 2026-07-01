const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processIntake, authed } = require("../netlify/functions/intake.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", INTAKE_SECRET: "s3cret" };

test("authed: true only on exact secret match", () => {
  assert.equal(authed({ "x-intake-secret": "s3cret" }, env), true);
  assert.equal(authed({ "x-intake-secret": "nope" }, env), false);
  assert.equal(authed({}, env), false);
  assert.equal(authed({ "x-intake-secret": "s3cret" }, {}), false); // no secret configured → fail closed
});

test("lead mode creates a routed priority row with the channel source", async () => {
  let created = null;
  const create = async (a) => { created = a; return { id: "rec1" }; };
  const out = await processIntake(
    { mode: "lead", city: "Omaha", name: "Jane", phone: "111", vehicle: "Tundra", channel: "instagram" },
    { env, create, fetchImpl: async () => ({ ok: true, json: async () => ({ records: [] }) }) }
  );
  assert.equal(out.status, "lead");
  assert.equal(created.fields.City, "Omaha");
  assert.equal(created.fields.Installer, "cody");           // Omaha routes to cody
  assert.equal(created.fields.Source, "intake:instagram");
  assert.equal(created.fields.Reason, "No event scheduled");
});

test("book mode returns conflict with open slots when the slot is taken", async () => {
  const out = await processIntake(
    { mode: "book", city: "Omaha", name: "Jane", phone: "111", slot: "9:00" },
    {
      env,
      loadEvent: async () => ({ city: "Omaha", dateISO: "2026-07-03", label: "Jul 3" }),
      list: async () => ["9:00"],       // 9:00 already taken
      create: async () => ({ id: "x" }),
    }
  );
  assert.equal(out.status, "conflict");
  assert.ok(Array.isArray(out.openSlots) && !out.openSlots.includes("9:00"));
});

test("book mode books an open slot", async () => {
  let created = null;
  const out = await processIntake(
    { mode: "book", city: "Omaha", name: "Jane", phone: "111", slot: "9:20", channel: "walk-in" },
    {
      env,
      loadEvent: async () => ({ city: "Omaha", dateISO: "2026-07-03", label: "Jul 3" }),
      list: async () => ["9:00"],
      create: async (a) => { created = a; return { id: "b1" }; },
    }
  );
  assert.equal(out.status, "booked");
  assert.equal(out.slot, "9:20");
  assert.equal(created.fields.Status, "Booked");
  assert.equal(created.fields.Source, "intake:walk-in");
  assert.equal(created.fields.Installer, "cody");
});

test("unknown city errors", async () => {
  const out = await processIntake({ mode: "lead", city: "Nowhere", name: "X", phone: "1" }, { env, create: async () => ({}) });
  assert.equal(out.status, "error");
  assert.equal(out.error, "unknown-city");
});
