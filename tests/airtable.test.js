const { test } = require("node:test");
const assert = require("node:assert/strict");
const { cfg, listRecords, createRecord } = require("../netlify/functions/lib/airtable.js");

test("cfg reads env with defaults", () => {
  const c = cfg({ AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" });
  assert.equal(c.token, "t");
  assert.equal(c.bookings, "Bookings");
  assert.equal(c.priority, "Priority List");
});
test("listRecords builds url + parses records", async () => {
  let seen;
  const fetchImpl = async (url, opts) => { seen = { url, opts }; return { ok: true, json: async () => ({ records: [{ id: "1", fields: { Slot: "9:00" } }] }) }; };
  const recs = await listRecords({ fetchImpl, token: "t", baseId: "b", table: "Bookings", filterByFormula: "1=1", fields: ["Slot"] });
  assert.equal(recs[0].fields.Slot, "9:00");
  assert.ok(seen.url.includes("/b/Bookings"));
  assert.ok(seen.url.includes("filterByFormula"));
  assert.equal(seen.opts.headers.Authorization, "Bearer t");
});
test("createRecord posts fields, throws on non-ok", async () => {
  const ok = async (url, opts) => { const body = JSON.parse(opts.body); assert.equal(body.fields.Name, "Jane"); return { ok: true, json: async () => ({ id: "r1" }) }; };
  const r = await createRecord({ fetchImpl: ok, token: "t", baseId: "b", table: "Bookings", fields: { Name: "Jane" } });
  assert.equal(r.id, "r1");
  const bad = async () => ({ ok: false, status: 422, text: async () => "bad" });
  await assert.rejects(() => createRecord({ fetchImpl: bad, token: "t", baseId: "b", table: "Bookings", fields: {} }));
});
test("updateRecord PATCHes the record by id with typecast", async () => {
  let seen;
  const fetchImpl = async (url, opts) => { seen = { url, opts }; return { ok: true, json: async () => ({ id: "r1" }) }; };
  const { updateRecord } = require("../netlify/functions/lib/airtable.js");
  const r = await updateRecord({ fetchImpl, token: "t", baseId: "b", table: "Bookings", id: "r1", fields: { "Email Status": "FAILED" } });
  assert.equal(r.id, "r1");
  assert.equal(seen.opts.method, "PATCH");
  assert.ok(seen.url.endsWith("/b/Bookings/r1"));
  const body = JSON.parse(seen.opts.body);
  assert.equal(body.fields["Email Status"], "FAILED");
  assert.equal(body.typecast, true);
});
