// tests/contacts.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/contacts.js");

const ENV = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", INSTALLER_TOKENS: JSON.stringify({ aaron: "SECRET" }), INSTALLER_ADMINS: "aaron" };
const H = { "x-installer-token": "SECRET" };

// listImpl is called once per table; route by table name.
function mkList(env) {
  const c = require("../netlify/functions/lib/airtable.js").cfg(env);
  const bookings = [{ id: "bk1", fields: { Name: "Aaron Groshong", Phone: "612-406-7117", Vehicle: "2021 4Runner", "Model Year": "2021", City: "Duluth", Installer: "aaron", "Event Date": "2026-07-01", Status: "Completed" } }];
  const leads = [{ id: "ld1", fields: { Name: "Aaron G", Phone: "(612) 406-7117", Email: "aaron@x.com", City: "Duluth", Installer: "aaron", "Last Contact": "2026-08-04", Stage: "Qualified" } }];
  const clients = [{ id: "cl1", fields: { Email: "newbie@x.com", Vehicles: JSON.stringify([{ make: "Toyota", model: "Tacoma", year: "2023" }]) } }];
  return async ({ table }) => (table === c.bookings ? bookings : table === c.priority ? leads : clients);
}

test("contacts 401s without a valid installer token", async () => {
  const res = await handler({ httpMethod: "GET", headers: {} }, { env: ENV, listImpl: mkList(ENV) });
  assert.equal(res.statusCode, 401);
});

test("contacts dedupes across bookings+leads and includes client-only people", async () => {
  const res = await handler({ httpMethod: "GET", headers: H }, { env: ENV, listImpl: mkList(ENV) });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.status, "ok");
  const byName = Object.fromEntries(body.contacts.map((c) => [c.displayName, c]));
  // Aaron appears once (booking+lead merged by phone)
  const aaron = body.contacts.find((c) => (c.phone || "").replace(/\D/g, "").slice(-10) === "6124067117");
  assert.ok(aaron);
  assert.equal(aaron.email, "aaron@x.com");
  assert.deepEqual(aaron.sources.bookingIds, ["bk1"]);
  assert.deepEqual(aaron.sources.leadIds, ["ld1"]);
  // Client-only person (no booking/lead) still appears, keyed by email
  assert.ok(body.contacts.some((c) => c.email === "newbie@x.com" && c.vehicle.includes("Tacoma")));
});
