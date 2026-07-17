const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mergeVehicles, getGarage, putGarage, handler } = require("../netlify/functions/client-garage.js");
const { signSession } = require("../netlify/functions/lib/client-auth.js");

const ENV = { CLIENT_SESSION_SECRET: "s", AIRTABLE_TOKEN: "at", AIRTABLE_BASE_ID: "app1" };
const T = (make, model, year) => ({ make, model, year });

test("mergeVehicles unions by make|model|year, caps sizes, drops junk", () => {
  const out = mergeVehicles(
    [T("Toyota", "Tundra", "2021"), { bogus: true }, T("toyota", "tundra", "2021")],
    [T("Toyota", "Tacoma", "2024"), T("Toyota", "Tundra", "2021")]);
  assert.deepEqual(out, [
    { make: "Toyota", model: "Tundra", year: "2021" },
    { make: "Toyota", model: "Tacoma", year: "2024" }]);
  const long = mergeVehicles(Array.from({ length: 30 }, (_, i) => T("M" + i, "X", "")), []);
  assert.equal(long.length, 20, "bounded at 20");
  const capped = mergeVehicles([T("A".repeat(99), "B".repeat(99), "12345678901234")], []);
  assert.equal(capped[0].make.length, 40);
  assert.equal(capped[0].year.length, 10);
});

test("getGarage returns the stored vehicles (empty when no row)", async () => {
  const out = await getGarage("pat@example.com", { env: ENV,
    list: async () => [{ id: "rc1", fields: { Vehicles: JSON.stringify([T("Toyota", "Tundra", "2021")]) } }] });
  assert.deepEqual(out, { status: "ok", vehicles: [T("Toyota", "Tundra", "2021")] });
  const empty = await getGarage("pat@example.com", { env: ENV, list: async () => [] });
  assert.deepEqual(empty, { status: "ok", vehicles: [] });
});

test("putGarage writes sanitized vehicles to the existing row", async () => {
  const updated = [];
  const out = await putGarage("pat@example.com", { vehicles: [T("Toyota", "Tacoma", "2024")] },
    { env: ENV, list: async () => [{ id: "rc1", fields: {} }],
      update: async (a) => { updated.push(a); return { id: a.id }; } });
  assert.equal(out.status, "ok");
  assert.deepEqual(JSON.parse(updated[0].fields.Vehicles), [T("Toyota", "Tacoma", "2024")]);
});

test("putGarage with merge unions with what's stored", async () => {
  const updated = [];
  const out = await putGarage("pat@example.com",
    { vehicles: [T("Toyota", "Tacoma", "2024")], merge: true },
    { env: ENV,
      list: async () => [{ id: "rc1", fields: { Vehicles: JSON.stringify([T("Toyota", "Tundra", "2021")]) } }],
      update: async (a) => { updated.push(a); return { id: a.id }; } });
  assert.deepEqual(out.vehicles, [T("Toyota", "Tundra", "2021"), T("Toyota", "Tacoma", "2024")]);
  assert.deepEqual(JSON.parse(updated[0].fields.Vehicles), out.vehicles);
});

test("putGarage creates the row when the client has none yet", async () => {
  const created = [];
  const out = await putGarage("pat@example.com", { vehicles: [T("Toyota", "Tacoma", "2024")] },
    { env: ENV, list: async () => [],
      create: async (a) => { created.push(a.fields); return { id: "rc9" }; } });
  assert.equal(out.status, "ok");
  assert.equal(created[0].Email, "pat@example.com");
  assert.deepEqual(JSON.parse(created[0].Vehicles), [T("Toyota", "Tacoma", "2024")]);
});

test("putGarage reports store failure as retryable, never silent", async () => {
  const out = await putGarage("pat@example.com", { vehicles: [] },
    { env: ENV, list: async () => { throw new Error("airtable list 503"); } });
  assert.deepEqual(out, { status: "error", error: "store-unavailable" });
});

test("putGarage with merge:true but no existing row falls back to incoming vehicles", async () => {
  const created = [];
  const incoming = [T("Toyota", "Tacoma", "2024")];
  const out = await putGarage("pat@example.com",
    { vehicles: incoming, merge: true },
    { env: ENV, list: async () => [],
      create: async (a) => { created.push(a.fields); return { id: "rc9" }; } });
  assert.equal(out.status, "ok");
  assert.deepEqual(out.vehicles, [T("Toyota", "Tacoma", "2024")]);
  assert.deepEqual(JSON.parse(created[0].Vehicles), [T("Toyota", "Tacoma", "2024")]);
});

test("getGarage tolerates corrupt stored JSON, returns empty vehicles", async () => {
  const out = await getGarage("pat@example.com", { env: ENV,
    list: async () => [{ id: "rc1", fields: { Vehicles: "{not json" } }] });
  assert.deepEqual(out, { status: "ok", vehicles: [] });
});

test("handler returns 401 without token, 405 for unsupported method with valid session", async () => {
  const unauthResult = await handler({ headers: {}, httpMethod: "GET" });
  assert.equal(unauthResult.statusCode, 401);

  process.env.CLIENT_SESSION_SECRET = "s";
  try {
    const token = signSession("pat@example.com", Date.now(), { CLIENT_SESSION_SECRET: "s" });
    const methodResult = await handler({ headers: { "x-client-token": token }, httpMethod: "DELETE" });
    assert.equal(methodResult.statusCode, 405);
  } finally {
    delete process.env.CLIENT_SESSION_SECRET;
  }
});
