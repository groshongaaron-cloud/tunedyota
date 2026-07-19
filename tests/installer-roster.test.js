const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildRoster } = require("../netlify/functions/installer-roster.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };

test("scopes to installer, includes past + future, flags walk-ins, sorts by date", async () => {
  let formula;
  const list = async (a) => {
    formula = a.filterByFormula;
    return [
      { id: "r1", fields: { City: "Omaha", "Event Date": "2026-07-03", Slot: "9:40", Name: "B", Vehicle: "Tundra", Installer: "cody", Status: "Booked" } },
      { id: "r2", fields: { City: "Lincoln", "Event Date": "2020-01-01", Slot: "9:00", Name: "Old", Installer: "cody", Status: "Booked" } },
      { id: "r3", fields: { City: "Omaha", "Event Date": "2026-07-03", Name: "W", Installer: "cody", Status: "Booked", Source: "installer:walk-in" } },
    ];
  };
  const out = await buildRoster({ env, key: "cody", now: new Date("2026-07-03T12:00:00Z"), list });
  assert.match(formula, /FIND\("cody", LOWER\(\{Installer\}&""\)\)/);
  assert.match(formula, /\{Status\}!="Cancelled"/);
  assert.equal(out.installer, "cody");
  assert.equal(out.today, "2026-07-03");
  assert.equal(out.bookings.length, 3);
  assert.equal(out.bookings[0].dateISO, "2020-01-01");
  assert.equal(out.bookings[0].name, "Old");
  const walk = out.bookings.find((b) => b.name === "W");
  assert.equal(walk.isWalkin, true);
  const reg = out.bookings.find((b) => b.name === "B");
  assert.equal(reg.isWalkin, false);
  assert.equal(reg.slotLabel, "9:40 AM");
  assert.match(reg.flexFuelNote, /Flex Fuel Tundra/);        // Policy 0011: B drives a Tundra
  assert.equal(out.bookings.find((b) => b.name === "Old").flexFuelNote, "");   // non-Tundra → no note
  assert.equal(out.admin, false);
  assert.equal(out.bookings.find((b) => b.name === "B").installer, "cody");    // owner tagged on each booking
});

test("admin roster drops the per-installer filter and tags every owner", async () => {
  let formula;
  const list = async (a) => {
    formula = a.filterByFormula;
    return [
      { id: "r1", fields: { City: "Omaha", "Event Date": "2026-07-03", Name: "C1", Installer: "cody", Status: "Booked" } },
      { id: "r2", fields: { City: "Twin Cities", "Event Date": "2026-07-05", Name: "A1", Installer: ["aaron"], Status: "Booked" } },
      { id: "r3", fields: { City: "Green Bay", "Event Date": "2026-07-06", Name: "N1", Installer: "noah", Status: "Booked" } },
    ];
  };
  const out = await buildRoster({ env, key: "aaron", admin: true, now: new Date("2026-07-03T12:00:00Z"), list });
  assert.doesNotMatch(formula, /\{Installer\}=/);          // no per-installer scoping
  assert.match(formula, /\{Status\}!="Cancelled"/);
  assert.equal(out.admin, true);
  assert.equal(out.bookings.length, 3);                    // sees everyone
  assert.deepEqual(out.bookings.map((b) => b.installer).sort(), ["aaron", "cody", "noah"]);
});

test("roster returns the installer's own future scheduled events (past excluded, tagged owner)", async () => {
  const list = async () => [];
  const loadEvents = async () => [
    { city: "Omaha", dateISO: "2026-08-01" },        // routes to cody, future → kept
    { city: "Twin Cities", dateISO: "2026-08-02" },  // aaron's market → dropped for cody
    { city: "Omaha", dateISO: "2020-01-01" },         // past → excluded
  ];
  const out = await buildRoster({ env, key: "cody", now: new Date("2026-07-03T12:00:00Z"), list, loadEvents });
  assert.deepEqual(out.events, [{ city: "Omaha", dateISO: "2026-08-01", installer: "cody" }]);
});

test("admin roster returns every market's future scheduled events", async () => {
  const list = async () => [];
  const loadEvents = async () => [
    { city: "Omaha", dateISO: "2026-08-01" },
    { city: "Twin Cities", dateISO: "2026-08-02" },
    { city: "Green Bay", dateISO: "2026-08-03" },
  ];
  const out = await buildRoster({ env, key: "aaron", admin: true, now: new Date("2026-07-03T12:00:00Z"), list, loadEvents });
  assert.equal(out.events.length, 3);
  assert.deepEqual(out.events.map((e) => e.installer).sort(), ["aaron", "cody", "noah"]);
});

test("a roster events fetch failure degrades to an empty events list (never throws)", async () => {
  const out = await buildRoster({ env, key: "cody", now: new Date("2026-07-03T12:00:00Z"),
    list: async () => [], loadEvents: async () => { throw new Error("sheet down"); }, log: { warn() {} } });
  assert.deepEqual(out.events, []);
});

test("a STALLED events load can't hang the roster — it times out and still returns bookings", async () => {
  const bookings = [{ id: "r1", fields: { City: "Omaha", "Event Date": "2026-07-03", Name: "B", Installer: "cody", Status: "Booked" } }];
  const out = await buildRoster({ env, key: "cody", now: new Date("2026-07-03T12:00:00Z"),
    list: async () => bookings,
    loadEvents: () => new Promise(() => {}),   // never resolves
    eventsTimeoutMs: 40, log: { warn() {} } });
  assert.equal(out.bookings.length, 1);        // primary data still returns
  assert.deepEqual(out.events, []);            // events degrade to empty on timeout
});

test("mapped booking includes certDelivery from the Cert Delivery field", async () => {
  const list = async () => [
    { id: "r1", fields: { City: "Omaha", "Event Date": "2026-07-03", Name: "A", Installer: "cody", Status: "Completed", "Cert Delivery": "installer-fallback" } },
    { id: "r2", fields: { City: "Lincoln", "Event Date": "2026-07-04", Name: "B", Installer: "cody", Status: "Booked" } },
  ];
  const out = await buildRoster({ env, key: "cody", now: new Date("2026-07-03T12:00:00Z"), list });
  const a = out.bookings.find((b) => b.name === "A");
  const b = out.bookings.find((b) => b.name === "B");
  assert.equal(a.certDelivery, "installer-fallback");
  assert.equal(b.certDelivery, "");
});

test("roster booking exposes modelYear for the VIN guard", async () => {
  const out = await buildRoster({ env, key: "aaron",
    list: async () => ([{ id: "r1", fields: { Installer: "aaron", City: "X", "Event Date": "2026-07-16",
      Vehicle: "2024 Toyota Tacoma", "Model Year": "2024", Status: "Booked" } }]),
    loadEvents: async () => [] });
  assert.equal(out.bookings[0].modelYear, "2024");
});

test("roster resolves OTT commission for a completed booking", async () => {
  const out = await buildRoster({ key: "aaron",
    list: async () => ([{ id: "r1", fields: {
      Installer: "aaron", City: "X", "Event Date": "2026-07-16", Status: "Completed",
      Vehicle: "2024 Toyota Tacoma 2.4L-T I4", "Model Year": "2024",
      "Tuning Platform": "VFT", "Calibration Type": "Basic" } }]),
    loadEvents: async () => [] });
  assert.equal(typeof out.bookings[0].commission, "number");
});

test("non-completed booking has null commission", async () => {
  const out = await buildRoster({ key: "aaron",
    list: async () => ([{ id: "r2", fields: {
      Installer: "aaron", City: "X", "Event Date": "2026-07-16", Status: "Booked",
      Vehicle: "2021 Toyota Tundra" } }]),
    loadEvents: async () => [] });
  assert.equal(out.bookings[0].commission, null);
});

test("roster exposes reviewUrl from env", async () => {
  const out = await buildRoster({ key: "aaron",
    env: { GOOGLE_REVIEW_URL: "https://g.page/r/x/review" },
    list: async () => [], loadEvents: async () => [] });
  assert.equal(out.reviewUrl, "https://g.page/r/x/review");
});

test("roster reviewUrl is empty when unset", async () => {
  const out = await buildRoster({ key: "aaron",
    env: {}, list: async () => [], loadEvents: async () => [] });
  assert.equal(out.reviewUrl, "");
});

test("roster exposes vapidPublicKey from env", async () => {
  const out = await buildRoster({ key: "aaron", env: { VAPID_PUBLIC_KEY: "BPUBKEY" }, list: async () => [], loadEvents: async () => [] });
  assert.equal(out.vapidPublicKey, "BPUBKEY");
});

test("roster vapidPublicKey empty when unset", async () => {
  const out = await buildRoster({ key: "aaron", env: {}, list: async () => [], loadEvents: async () => [] });
  assert.equal(out.vapidPublicKey, "");
});

test("a booking with a stored signature is marked signed", async () => {
  const out = await buildRoster({ key: "aaron", env: {}, loadEvents: async () => [],
    list: async () => ([{ id: "r1", fields: { Installer: "aaron", Status: "Completed", "Customer Signature": "data:image/png;base64,AAAA" } }]) });
  assert.equal(out.bookings[0].signed, true);
});
test("a booking without a signature is not signed, and the roster never ships the image", async () => {
  const out = await buildRoster({ key: "aaron", env: {}, loadEvents: async () => [],
    list: async () => ([{ id: "r2", fields: { Installer: "aaron", Status: "Completed" } }]) });
  assert.equal(out.bookings[0].signed, false);
  assert.ok(!("Customer Signature" in out.bookings[0]));
  assert.ok(!("signature" in out.bookings[0]));
});

test("roster booking rows expose an ott flag from Source", async () => {
  const list = async () => [
    { id: "r1", fields: { Installer: "aaron", City: "X", "Event Date": "2026-07-16", Status: "Booked",
        Name: "Alice", Source: "lead:ott-national" } },
    { id: "r2", fields: { Installer: "aaron", City: "X", "Event Date": "2026-07-16", Status: "Booked",
        Name: "Bob", Source: "ott-national:fb-ads" } },
    { id: "r3", fields: { Installer: "aaron", City: "X", "Event Date": "2026-07-16", Status: "Booked",
        Name: "Scott", Source: "" } },
    { id: "r4", fields: { Installer: "aaron", City: "X", "Event Date": "2026-07-16", Status: "Booked",
        Name: "Dave", Source: "find-your-exact-tune" } },
    { id: "r5", fields: { Installer: "aaron", City: "X", "Event Date": "2026-07-16", Status: "Booked",
        Name: "Eve", Source: "OTT Update" } },
  ];
  const out = await buildRoster({ key: "aaron", env: {}, list, loadEvents: async () => [] });
  const alice = out.bookings.find((b) => b.name === "Alice");
  const bob   = out.bookings.find((b) => b.name === "Bob");
  const scott = out.bookings.find((b) => b.name === "Scott");
  const dave  = out.bookings.find((b) => b.name === "Dave");
  const eve   = out.bookings.find((b) => b.name === "Eve");
  assert.equal(alice.ott, true,  "lead:ott-national should be ott");
  assert.equal(bob.ott,   true,  "ott-national:fb-ads should be ott");
  assert.equal(scott.ott, false, "empty Source (Scott) should NOT be ott");
  assert.equal(dave.ott,  false, "find-your-exact-tune should NOT be ott");
  assert.equal(eve.ott,   false, "'OTT Update' re-flash source must NOT be ott");
});
test("non-admin roster formula matches legacy long-label Installer values too", async () => {
  let formula = "";
  const out = await buildRoster({ env: { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" }, key: "noah",
    list: async (a) => { formula = a.filterByFormula; return [
      { id: "r1", fields: { City: "Milwaukee", "Event Date": "2026-07-18", Name: "L", Installer: ["Noah - Milwaukee, Green Bay, Kohler, "], Status: "Booked" } },
    ]; },
    loadEvents: async () => [] });
  assert.match(formula, /FIND\("noah", LOWER\(\{Installer\}&""\)\)/);
  assert.equal(out.bookings.length, 1);
  assert.equal(out.bookings[0].installer, "noah");   // normalized, not the raw label
});
