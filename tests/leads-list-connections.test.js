// leads-list enrichment: match suggestions, linked booking, client account,
// stale bucket — and the fail-open rule for the extra table reads.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/leads-list.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b",
  INSTALLER_TOKENS: '{"aaron":"atok"}', INSTALLER_ADMINS: "aaron" };
const ev = { headers: { "x-installer-token": "atok" }, queryStringParameters: {} };
const leadRows = [
  { id: "recL1", fields: { Name: "Text 619", Phone: "+16194176865", Installer: "aaron", Stage: "New", "Last Contact": "2026-07-29" } },
  { id: "recL2", fields: { Name: "Quiet Quinn", Email: "q@x.com", Installer: "aaron", Stage: "New", "Last Contact": "2026-05-01" } },
];
const bookRows = [{ id: "recB1", fields: { Name: "Eli Soetenga", Phone: "6194176865", City: "Madison",
  "Event Date": "2026-08-01", Slot: "10:20", Status: "Booked", Installer: ["aaron"] } }];
const clientRows = [{ id: "recC1", fields: { Email: "q@x.com", Vehicles: '[{"year":"2019","make":"Toyota","model":"Tacoma"}]' } }];

const listFor = (rows) => async (a) => {
  if (a.table === "Priority List") return rows.priority;
  if (a.table === "Bookings") return rows.bookings;
  if (a.table === "Clients") return rows.clients;
  return [];
};

test("leads carry matches, client, and staleDays", async () => {
  const res = await handler(ev, { env, listImpl: listFor({ priority: leadRows, bookings: bookRows, clients: clientRows }) });
  assert.equal(res.statusCode, 200);
  const out = JSON.parse(res.body);
  const l1 = out.leads.find((l) => l.id === "recL1");
  assert.equal(l1.matches.length, 1);
  assert.equal(l1.matches[0].id, "recB1");
  const l2 = out.leads.find((l) => l.id === "recL2");
  assert.equal(l2.client.email, "q@x.com");
  assert.ok(l2.staleDays >= 30);
  assert.equal(l1.staleDays, undefined);
  assert.ok(out.summary.stale >= 1);
});

test("fail-open: a dead Bookings/Clients read never blocks the Leads tab", async () => {
  const listImpl = async (a) => {
    if (a.table === "Priority List") return leadRows;
    throw new Error("airtable listAll 503");
  };
  const res = await handler(ev, { env, listImpl });
  assert.equal(res.statusCode, 200);
  const out = JSON.parse(res.body);
  assert.equal(out.leads.length, 2);
  assert.deepEqual(out.leads[0].matches, []);
  assert.equal(out.leads[0].client, null);
});

test("a linked lead resolves its booking summary instead of matches", async () => {
  const linked = [{ id: "recL3", fields: { Name: "Eli", Phone: "6194176865", Installer: "aaron", Stage: "Booked", Booking: ["recB1"] } }];
  const res = await handler(ev, { env, listImpl: listFor({ priority: linked, bookings: bookRows, clients: [] }) });
  const l = JSON.parse(res.body).leads[0];
  assert.equal(l.booking.city, "Madison");
  assert.deepEqual(l.matches, []);
});
