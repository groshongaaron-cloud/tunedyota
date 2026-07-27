const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processCloseout } = require("../netlify/functions/installer-closeout.js");

const ENV = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };
const deps = (fields, over) => ({ env: ENV, key: "cody", admin: false,
  get: async () => ({ id: "rec1", fields }), update: async (a) => { deps.updated = a; return {}; },
  create: async () => ({}), send: async () => {}, ...over });

test("cancel: sets Cancelled + stamps who/when", async () => {
  const d = deps({ Installer: "cody", Status: "Booked", Name: "M" });
  const out = await processCloseout({ recordId: "rec1", action: "cancel" }, d);
  assert.equal(out.status, "cancelled");
  assert.equal(deps.updated.fields.Status, "Cancelled");
  assert.ok(deps.updated.fields["Cancelled At"]);
  assert.equal(deps.updated.fields["Cancelled By"], "cody");
});

test("cancel: not-yours and locked statuses refused", async () => {
  const notMine = await processCloseout({ recordId: "r", action: "cancel" }, deps({ Installer: "noah", Status: "Booked" }));
  assert.equal(notMine.error, "not-yours");
  const done = await processCloseout({ recordId: "r", action: "cancel" }, deps({ Installer: "cody", Status: "Completed" }));
  assert.equal(done.error, "not-open");
  const twice = await processCloseout({ recordId: "r", action: "cancel" }, deps({ Installer: "cody", Status: "Cancelled" }));
  assert.equal(twice.error, "not-open");
});

test("uncancel: restores Booked and clears the stamps; only from Cancelled", async () => {
  const d = deps({ Installer: "cody", Status: "Cancelled", "Cancelled At": "2026-07-27T00:00:00Z", "Cancelled By": "cody" });
  const out = await processCloseout({ recordId: "rec1", action: "uncancel" }, d);
  assert.equal(out.status, "uncancelled");
  assert.equal(deps.updated.fields.Status, "Booked");
  assert.equal(deps.updated.fields["Cancelled At"], null);
  assert.equal(deps.updated.fields["Cancelled By"], null);
  const nope = await processCloseout({ recordId: "r", action: "uncancel" }, deps({ Installer: "cody", Status: "Booked" }));
  assert.equal(nope.error, "not-cancelled");
});

test("admin may cancel another installer's booking", async () => {
  const d = deps({ Installer: "noah", Status: "Booked" }, { admin: true });
  const out = await processCloseout({ recordId: "rec1", action: "cancel" }, d);
  assert.equal(out.status, "cancelled");
});
