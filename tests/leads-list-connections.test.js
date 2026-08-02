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

test("duplicates[] shape: same-phone leads each reference the other, scoped to caller's installer", async () => {
  // Two leads with the same phone, both belonging to aaron
  const dupLeadRows = [
    { id: "recD1", fields: { Name: "Sam Smith", Phone: "6125550100", Channel: "sms", Stage: "New",
        Installer: "aaron", "Created Time": "2026-07-01T10:00:00.000Z" } },
    { id: "recD2", fields: { Name: "Sam S", Phone: "(612) 555-0100", Channel: "phone", Stage: "Contacted",
        Installer: "aaron", "Created Time": "2026-07-10T10:00:00.000Z" } },
  ];
  const res = await handler(ev, { env, listImpl: listFor({ priority: dupLeadRows, bookings: [], clients: [] }) });
  assert.equal(res.statusCode, 200);
  const out = JSON.parse(res.body);
  const d1 = out.leads.find((l) => l.id === "recD1");
  const d2 = out.leads.find((l) => l.id === "recD2");
  // Each should see the other as a duplicate
  assert.equal(d1.duplicates.length, 1);
  assert.equal(d1.duplicates[0].id, "recD2");
  assert.equal(d1.duplicates[0].name, "Sam S");
  assert.equal(d1.duplicates[0].channel, "phone");
  assert.equal(d1.duplicates[0].stage, "Contacted");
  assert.ok("createdTime" in d1.duplicates[0]);
  assert.equal(d2.duplicates.length, 1);
  assert.equal(d2.duplicates[0].id, "recD1");
});

test("duplicates[] scoping: a non-admin installer never sees another installer's lead as a duplicate", async () => {
  // Same phone, different installers
  const crossInstLeads = [
    { id: "recE1", fields: { Name: "Jordan A", Phone: "6125550200", Channel: "sms", Stage: "New",
        Installer: "aaron", "Created Time": "2026-07-01T10:00:00.000Z" } },
    { id: "recE2", fields: { Name: "Jordan C", Phone: "(612) 555-0200", Channel: "phone", Stage: "New",
        Installer: "cody", "Created Time": "2026-07-02T10:00:00.000Z" } },
  ];
  // aaron is admin — but we need to test a non-admin installer
  const codyEnv = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b",
    INSTALLER_TOKENS: '{"cody":"ctok"}', INSTALLER_ADMINS: "aaron" };
  const codyEv = { headers: { "x-installer-token": "ctok" }, queryStringParameters: {} };
  const res = await handler(codyEv, { env: codyEnv, listImpl: listFor({ priority: crossInstLeads, bookings: [], clients: [] }) });
  assert.equal(res.statusCode, 200);
  const out = JSON.parse(res.body);
  // cody only sees their own lead (recE2) — and its duplicates[] must be empty
  // because recE1 (aaron's) is outside cody's scope
  assert.equal(out.leads.length, 1);
  assert.equal(out.leads[0].id, "recE2");
  assert.deepEqual(out.leads[0].duplicates, []);
});
