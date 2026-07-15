// tests/lead-endpoints.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const ingest = require("../netlify/functions/lead-ingest.js");

const env = { INSTALLER_TOKENS: JSON.stringify({ cody: "cody-tok" }), INTERNAL_TASK_SECRET: "task-secret",
  AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };

test("lead-ingest rejects with neither installer token nor task secret", async () => {
  const res = await ingest.handler({ headers: {}, body: "{}" }, { env });
  assert.equal(res.statusCode, 401);
});

test("lead-ingest accepts a valid installer token", async () => {
  const res = await ingest.handler(
    { headers: { "x-installer-token": "cody-tok" }, body: JSON.stringify({ name: "A", phone: "1", channel: "phone" }) },
    { env, processImpl: async () => ({ status: "lead", recordId: "r", deduped: false }) });
  assert.equal(res.statusCode, 200);
});

test("lead-ingest accepts the internal task secret (adapters)", async () => {
  const res = await ingest.handler(
    { headers: { "x-ty-task": "task-secret" }, body: JSON.stringify({ name: "A", email: "a@x.com", channel: "email" }) },
    { env, processImpl: async () => ({ status: "lead", recordId: "r", deduped: false }) });
  assert.equal(res.statusCode, 200);
});

const list = require("../netlify/functions/leads-list.js");

const listEnv = { INSTALLER_TOKENS: JSON.stringify({ cody: "cody-tok", aaron: "aaron-tok" }),
  INSTALLER_ADMINS: "aaron", AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };
const recs = [
  { id: "1", fields: { Name: "A", Installer: "cody", Stage: "New", Source: "intake:sms" } },
  { id: "2", fields: { Name: "B", Installer: "aaron", Stage: "Contacted", Source: "intake:email" } },
  { id: "3", fields: { Name: "C", Installer: "", Stage: "New", Source: "lead:phone" } },
];

test("leads-list 401 without a token", async () => {
  const res = await list.handler({ headers: {} }, { env: listEnv, listImpl: async () => recs });
  assert.equal(res.statusCode, 401);
});

test("leads-list scopes a regular installer to their own leads", async () => {
  const res = await list.handler({ headers: { "x-installer-token": "cody-tok" } }, { env: listEnv, listImpl: async () => recs });
  const body = JSON.parse(res.body);
  assert.equal(body.admin, false);
  assert.deepEqual(body.leads.map((l) => l.id), ["1"]);
});

test("leads-list gives an admin everyone + the summary", async () => {
  const res = await list.handler({ headers: { "x-installer-token": "aaron-tok" } }, { env: listEnv, listImpl: async () => recs });
  const body = JSON.parse(res.body);
  assert.equal(body.admin, true);
  assert.equal(body.leads.length, 3);
  assert.equal(body.summary.byChannel.sms, 1);
});

const upd = require("../netlify/functions/lead-update.js");

const updEnv = { INSTALLER_TOKENS: JSON.stringify({ cody: "cody-tok", aaron: "aaron-tok" }),
  INSTALLER_ADMINS: "aaron", AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };
const leadRec = { id: "recL", fields: { Name: "Dana", Phone: "1", City: "Sioux Falls", Installer: "cody", Stage: "New", "Activity Log": "" } };

test("lead-update rejects a foreign-market lead for a regular installer", async () => {
  const res = await upd.handler(
    { headers: { "x-installer-token": "cody-tok" }, body: JSON.stringify({ id: "recL", action: "setStage", stage: "Contacted" }) },
    { env: updEnv, getImpl: async () => ({ id: "recL", fields: { Installer: "aaron", Stage: "New" } }) });
  assert.equal(res.statusCode, 400);
  assert.match(res.body, /not-your-market/);
});

test("lead-update setStage patches the owning installer's lead", async () => {
  let patched;
  const res = await upd.handler(
    { headers: { "x-installer-token": "cody-tok" }, body: JSON.stringify({ id: "recL", action: "setStage", stage: "Contacted" }) },
    { env: updEnv, getImpl: async () => leadRec, updateImpl: async (a) => { patched = a.fields; return { id: a.id }; } });
  assert.equal(res.statusCode, 200);
  assert.equal(patched.Stage, "Contacted");
});

test("lead-update convert creates a booking, links it, sets Booked", async () => {
  let booking, patched;
  const res = await upd.handler(
    { headers: { "x-installer-token": "cody-tok" }, body: JSON.stringify({ id: "recL", action: "convert", dateISO: "2026-08-01" }) },
    { env: updEnv, getImpl: async () => leadRec,
      createBookingImpl: async (a) => { booking = a.fields; return { id: "recBk" }; },
      updateImpl: async (a) => { patched = a.fields; return { id: a.id }; } });
  assert.equal(res.statusCode, 200);
  assert.equal(booking.Status, "Booked");
  assert.equal(booking.City, "Sioux Falls");
  assert.equal(patched["Converted Booking"], "recBk");
  assert.equal(patched.Stage, "Booked");
});
