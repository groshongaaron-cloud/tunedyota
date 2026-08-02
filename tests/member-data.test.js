const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handler, getMemberData, putMemberLog, parseIntervalMiles, buildGauges, corsHeaders } =
  require("../netlify/functions/member-data.js");
const { signSession } = require("../netlify/functions/lib/client-auth.js");

const ENV = { CLIENT_SESSION_SECRET: "s", AIRTABLE_TOKEN: "at", AIRTABLE_BASE_ID: "app1" };
const NOW = 1800000000000;

// A 2023 Tundra i-FORCE booking — resolves against the real amsoil-garage catalog
// (Engine Oil tuned interval 7,500 mi on the 2022+ row).
const BOOKING = { id: "recB1", fields: { Vehicle: "Toyota Tundra 3.4L i-FORCE", "Model Year": "2023",
  Mileage: 61200, "OTT Calibration": "Performance Calibration", "Calibration Date": "2026-05-02" } };

// Dispatch a stub Airtable list on table name.
function listFor({ bookings = [], clients = [] }) {
  return async (a) => (a.table === "Clients" ? clients : bookings);
}

test("parseIntervalMiles reads mile intervals, null for time/inspect intervals", () => {
  assert.equal(parseIntervalMiles("7,500 mi"), 7500);
  assert.equal(parseIntervalMiles("60,000 mi"), 60000);
  assert.equal(parseIntervalMiles("severe: inspect"), null);
  assert.equal(parseIntervalMiles("5 yr"), null);
  assert.equal(parseIntervalMiles(""), null);
});

test("buildGauges: baseline from tune mileage, service log overrides, statuses match the page", () => {
  const systems = [
    { system: "Engine Oil", product: "Signature Series 0W-20", unit: "qt", tunedInterval: "7,500 mi" },
    { system: "Engine Oil Filter", product: "Oil Filter", unit: "ea", tunedInterval: "7,500 mi" },
    { system: "Transmission", product: "ATF", unit: "qt", tunedInterval: "60,000 mi" },
    { system: "Coolant", product: "Antifreeze", unit: "gal", tunedInterval: "5 yr" },
  ];
  const gauges = buildGauges(systems, 67900, 61200, { Transmission: { miles: 65000 } });
  // filter (unit ea) and time-based systems are not gauges
  assert.deepEqual(gauges.map((g) => g.system), ["Engine Oil", "Transmission"]);
  const oil = gauges[0], trans = gauges[1];
  assert.equal(oil.milesLeft, 800);            // 61200 + 7500 - 67900
  assert.equal(oil.status, "warn");            // 800 < 15% of 7500
  assert.equal(oil.intervalMiles, 7500);
  assert.equal(trans.baselineMiles, 65000);    // service log wins over tune mileage
  assert.equal(trans.milesLeft, 57100);        // 65000 + 60000 - 67900
  assert.equal(trans.status, "ok");
  // due when past the interval
  const due = buildGauges(systems.slice(0, 1), 70000, 61200, {});
  assert.equal(due[0].status, "due");
  assert.ok(due[0].milesLeft <= 0);
});

test("buildGauges: unknown when there is no odometer or no baseline; milesLeft clamps to interval", () => {
  const systems = [{ system: "Engine Oil", product: "0W-20", unit: "qt", tunedInterval: "7,500 mi" }];
  const noOdo = buildGauges(systems, null, 61200, {});
  assert.equal(noOdo[0].status, "unknown");
  assert.equal(noOdo[0].milesLeft, null);
  const noBase = buildGauges(systems, 67900, null, {});
  assert.equal(noBase[0].status, "unknown");
  // a baseline logged ahead of the odometer can't show more than a full interval
  const ahead = buildGauges(systems, 60000, 61200, {});
  assert.equal(ahead[0].milesLeft, 7500);
});

test("getMemberData assembles vehicle, odometer, gauges and fluid sheet from the latest booking", async () => {
  const older = { id: "recB0", fields: { Vehicle: "Toyota Tacoma 3.5L", "Model Year": "2018",
    Mileage: 90000, "Calibration Date": "2025-01-15" } };
  const out = await getMemberData("pat@example.com", { env: ENV,
    list: listFor({ bookings: [older, BOOKING],
      clients: [{ id: "rc1", fields: { Odometer: 67900, "Odometer Date": "2026-07-30" } }] }) });
  assert.equal(out.status, "ok");
  assert.equal(out.vehicle.vehicle, "Toyota Tundra 3.4L i-FORCE");
  assert.equal(out.vehicle.modelYear, "2023");
  assert.match(out.vehicle.engine, /i-FORCE/);
  assert.equal(out.calibration.name, "Performance Calibration");
  assert.equal(out.calibration.recordId, "recB1");
  assert.deepEqual(out.odometer, { miles: 67900, date: "2026-07-30", source: "member" });
  const oil = out.gauges.find((g) => g.system === "Engine Oil");
  assert.equal(oil.milesLeft, 800);
  assert.equal(oil.status, "warn");
  assert.ok(out.fluidSheet.length >= 5, "full sheet, not just gauge systems");
  assert.ok(out.fluidSheet.every((s) => s.product && s.system));
  assert.match(out.garageUrl, /amsoil-garage/);
});

test("getMemberData: booking mileage is the odometer when the member never logged one (and wins if higher)", async () => {
  const out = await getMemberData("pat@example.com", { env: ENV,
    list: listFor({ bookings: [BOOKING], clients: [] }) });
  assert.deepEqual(out.odometer, { miles: 61200, date: "2026-05-02", source: "booking" });
  const stale = await getMemberData("pat@example.com", { env: ENV,
    list: listFor({ bookings: [BOOKING],
      clients: [{ id: "rc1", fields: { Odometer: 50000, "Odometer Date": "2026-01-01" } }] }) });
  assert.equal(stale.odometer.miles, 61200, "odometer never goes backwards");
});

test("getMemberData falls back to the garage vehicle when there is no completed booking", async () => {
  const out = await getMemberData("pat@example.com", { env: ENV,
    list: listFor({ bookings: [], clients: [{ id: "rc1", fields: {
      Vehicles: JSON.stringify([{ make: "Toyota", model: "Tundra", year: "2023" }]), Odometer: 30000 } }] }) });
  assert.equal(out.status, "ok");
  assert.equal(out.vehicle.vehicle, "Toyota Tundra");
  assert.equal(out.vehicle.source, "garage");
  assert.equal(out.calibration, null);
  assert.ok(out.fluidSheet.length > 0, "fluid sheet still resolves from the catalog");
  assert.ok(out.gauges.every((g) => g.status === "unknown"), "no service baseline without a booking");
});

test("getMemberData: no booking and no garage -> empty payload for the setup state", async () => {
  const out = await getMemberData("pat@example.com", { env: ENV, list: listFor({}) });
  assert.deepEqual(out, { status: "ok", vehicle: null, calibration: null, odometer: null,
    gauges: [], fluidSheet: [], garageUrl: "", orderUrl: "" });
});

test("getMemberData tolerates corrupt Service Log JSON and reports store failure", async () => {
  const out = await getMemberData("pat@example.com", { env: ENV,
    list: listFor({ bookings: [BOOKING],
      clients: [{ id: "rc1", fields: { Odometer: 67900, "Service Log": "{not json" } }] }) });
  assert.equal(out.status, "ok");
  const down = await getMemberData("pat@example.com", { env: ENV,
    list: async () => { throw new Error("airtable list 503"); } });
  assert.deepEqual(down, { status: "error", error: "store-unavailable" });
});

test("putMemberLog writes the odometer to the existing row and stamps the date", async () => {
  const updated = [];
  const out = await putMemberLog("pat@example.com", { odometer: 68012 }, { env: ENV, now: NOW,
    list: listFor({ clients: [{ id: "rc1", fields: {} }] }),
    update: async (a) => { updated.push(a); return { id: a.id }; } });
  assert.equal(out.status, "ok");
  assert.equal(updated[0].id, "rc1");
  assert.equal(updated[0].fields.Odometer, 68012);
  assert.equal(updated[0].fields["Odometer Date"], new Date(NOW).toISOString().slice(0, 10));
});

test("putMemberLog creates the Clients row when the member has none yet", async () => {
  const created = [];
  const out = await putMemberLog("pat@example.com", { odometer: 68012 }, { env: ENV, now: NOW,
    list: listFor({}), create: async (a) => { created.push(a.fields); return { id: "rc9" }; } });
  assert.equal(out.status, "ok");
  assert.equal(created[0].Email, "pat@example.com");
  assert.equal(created[0].Odometer, 68012);
});

test("putMemberLog merges a fluid service into the Service Log", async () => {
  const updated = [];
  const out = await putMemberLog("pat@example.com",
    { service: { system: "Engine Oil", miles: 67500 } },
    { env: ENV, now: NOW,
      list: listFor({ clients: [{ id: "rc1", fields: { "Service Log":
        JSON.stringify({ Transmission: { miles: 65000, date: "2026-06-01" } }) } }] }),
      update: async (a) => { updated.push(a); return { id: a.id }; } });
  assert.equal(out.status, "ok");
  const log = JSON.parse(updated[0].fields["Service Log"]);
  assert.equal(log["Engine Oil"].miles, 67500);
  assert.equal(log.Transmission.miles, 65000, "existing entries survive");
});

test("putMemberLog rejects junk before touching the store", async () => {
  for (const body of [{}, { odometer: -5 }, { odometer: "abc" }, { odometer: 9e9 },
    { service: { system: "", miles: 100 } }, { service: { system: "Engine Oil", miles: -1 } }]) {
    const out = await putMemberLog("pat@example.com", body,
      { env: ENV, list: async () => { throw new Error("must not be called"); } });
    assert.equal(out.status, "error", JSON.stringify(body));
    assert.equal(out.error, "bad-request");
  }
});

test("corsHeaders echoes an allowed origin, falls back to the site origin otherwise", () => {
  assert.equal(corsHeaders("capacitor://localhost")["Access-Control-Allow-Origin"], "capacitor://localhost");
  assert.equal(corsHeaders("http://localhost")["Access-Control-Allow-Origin"], "http://localhost");
  assert.equal(corsHeaders("https://localhost")["Access-Control-Allow-Origin"], "https://localhost",
    "Capacitor 6 Android default scheme is https — its WebView origin must be allowed");
  assert.equal(corsHeaders("https://evil.example")["Access-Control-Allow-Origin"], "https://tunedyota.com");
  assert.equal(corsHeaders(undefined)["Access-Control-Allow-Origin"], "https://tunedyota.com");
  const h = corsHeaders("capacitor://localhost");
  assert.match(h["Access-Control-Allow-Headers"], /Authorization/);
  assert.match(h["Access-Control-Expose-Headers"], /x-renewed-token/);
  assert.equal(h.Vary, "Origin");
});

test("handler: OPTIONS preflight is open, everything else is 401 without a session — all with CORS", async () => {
  const pre = await handler({ httpMethod: "OPTIONS", headers: { origin: "capacitor://localhost" } });
  assert.equal(pre.statusCode, 204);
  assert.equal(pre.headers["Access-Control-Allow-Origin"], "capacitor://localhost");
  const unauth = await handler({ httpMethod: "GET", headers: { origin: "capacitor://localhost" } });
  assert.equal(unauth.statusCode, 401);
  assert.equal(unauth.headers["Access-Control-Allow-Origin"], "capacitor://localhost");
});

test("handler: bearer session authenticates; bad method 405; bad body 400", async () => {
  process.env.CLIENT_SESSION_SECRET = "s";
  try {
    const token = signSession("pat@example.com", Date.now(), { CLIENT_SESSION_SECRET: "s" });
    const headers = { origin: "capacitor://localhost", authorization: "Bearer " + token };
    const method = await handler({ httpMethod: "DELETE", headers });
    assert.equal(method.statusCode, 405);
    const badJson = await handler({ httpMethod: "POST", headers, body: "{not json" });
    assert.equal(badJson.statusCode, 400);
    const badOdo = await handler({ httpMethod: "POST", headers, body: JSON.stringify({ odometer: -5 }) });
    assert.equal(badOdo.statusCode, 400);
    assert.equal(badOdo.headers["Access-Control-Allow-Origin"], "capacitor://localhost");
  } finally {
    delete process.env.CLIENT_SESSION_SECRET;
  }
});
