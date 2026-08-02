const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { processWalkin } = require("../netlify/functions/installer-walkin.js");

const HTML = fs.readFileSync(path.join(__dirname, "..", "site", "installer.html"), "utf8");

// Static-wiring guard: both walk-in forms must carry a model year input wired into addWalkin.
// Anyday form (anydayWalkForm) was wired in commit 4b8abff. This guards the event form (walkAdder).
test("walkAdder (event-side walk-in form) has a model year number input", () => {
  // Isolate the walkAdder function body — stops before the next function declaration.
  const start = HTML.indexOf("function walkAdder(");
  assert.ok(start !== -1, "walkAdder function not found in installer.html");
  const end = HTML.indexOf("\n  function ", start + 1);
  const fn = end !== -1 ? HTML.slice(start, end) : HTML.slice(start, start + 4000);
  assert.ok(
    /yr\s*=\s*mkInput\(/.test(fn),
    "walkAdder: yr input not created via mkInput"
  );
  assert.ok(
    /yr\.type\s*=\s*['"]number['"]/.test(fn),
    "walkAdder: yr.type must be 'number'"
  );
  assert.ok(
    /yr\.min\s*=\s*['"]1990['"]/.test(fn),
    "walkAdder: yr.min must be '1990'"
  );
  assert.ok(
    /yr\.max\s*=\s*['"]2099['"]/.test(fn),
    "walkAdder: yr.max must be '2099'"
  );
  assert.ok(
    /modelYear\s*:\s*yr\.value/.test(fn),
    "walkAdder btn.onclick: modelYear:yr.value not passed to addWalkin"
  );
});

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };
const okCreate = async () => ({ id: "recNEW" });
// Stub deps shared by legacy tests that don't exercise ensureClient directly.
// Prevents real Airtable network calls (ensureClient default) and console noise (log default).
const silentDeps = { ensureClient: async () => ({}), log: { error() {}, warn() {} } };

test("requires name + phone", async () => {
  const out = await processWalkin({ city: "Omaha", dateISO: "2026-07-03", name: "", phone: "" }, { env, key: "cody", create: okCreate });
  assert.equal(out.status, "error");
  assert.equal(out.error, "missing-contact");
});

test("an unknown city BOOKS anyway — owned by the adding installer, city kept as typed", async () => {
  let created;
  const out = await processWalkin({ city: "Bemidji", dateISO: "2026-07-03", name: "Jo", phone: "555" },
    { ...silentDeps, env, key: "cody", create: async (a) => { created = a; return { id: "recFREE" }; } });
  assert.equal(out.status, "booked");
  assert.equal(created.fields.City, "Bemidji");
  assert.equal(created.fields.Installer, "cody");
  assert.equal(out.booking.city, "Bemidji");
  assert.equal(out.booking.installer, "cody");
});

test("an admin may direct-assign any booking to a chosen installer (overrides market routing)", async () => {
  let created;
  const out = await processWalkin({ city: "Omaha", dateISO: "2026-07-03", name: "Jo", phone: "555", installer: "noah" },
    { ...silentDeps, env, key: "aaron", admin: true, create: async (a) => { created = a; return { id: "recOVR" }; } });
  assert.equal(out.status, "booked");
  assert.equal(created.fields.Installer, "noah");
  assert.equal(out.booking.installer, "noah");
});

test("a non-admin cannot use the installer override", async () => {
  let created;
  const out = await processWalkin({ city: "Bemidji", dateISO: "2026-07-03", name: "Jo", phone: "555", installer: "noah" },
    { ...silentDeps, env, key: "cody", admin: false, create: async (a) => { created = a; return { id: "r" }; } });
  assert.equal(out.status, "booked");
  assert.equal(created.fields.Installer, "cody");   // override ignored — still the adder
});

test("an appointment time is saved to Scheduled Time and echoed back", async () => {
  let created;
  const out = await processWalkin({ city: "Omaha", dateISO: "2026-07-03", name: "Jo", phone: "555", time: "10:30 AM" },
    { ...silentDeps, env, key: "cody", create: async (a) => { created = a; return { id: "recT" }; } });
  assert.equal(out.status, "booked");
  assert.equal(created.fields["Scheduled Time"], "10:30 AM");
  assert.equal(out.booking.scheduledTime, "10:30 AM");
});

test("a full install address is saved to Address and echoed back (never required)", async () => {
  let created;
  const out = await processWalkin({ city: "Omaha", dateISO: "2026-07-03", name: "Jo", phone: "555",
    address: "  7337 L St, Omaha, NE 68127  " },
    { ...silentDeps, env, key: "cody", create: async (a) => { created = a; return { id: "recA" }; } });
  assert.equal(out.status, "booked");
  assert.equal(created.fields.Address, "7337 L St, Omaha, NE 68127");
  assert.equal(out.booking.address, "7337 L St, Omaha, NE 68127");
  // and omitting it stays clean — no Address key, empty echo
  let created2;
  const out2 = await processWalkin({ city: "Omaha", dateISO: "2026-07-03", name: "Jo", phone: "555" },
    { ...silentDeps, env, key: "cody", create: async (a) => { created2 = a; return { id: "recB" }; } });
  assert.equal("Address" in created2.fields, false);
  assert.equal(out2.booking.address, "");
});

test("rejects a city that routes to a different installer", async () => {
  const out = await processWalkin({ city: "Omaha", dateISO: "2026-07-03", name: "Jo", phone: "555" }, { env, key: "aaron", create: okCreate });
  assert.equal(out.error, "not-your-market");
});

test("rejects a malformed date", async () => {
  const out = await processWalkin({ city: "Omaha", dateISO: "07/03", name: "Jo", phone: "555" }, { env, key: "cody", create: okCreate });
  assert.equal(out.error, "bad-date");
});

test("creates a scoped walk-in booking with the right fields + Source", async () => {
  let created;
  const create = async (a) => { created = a; return { id: "recNEW" }; };
  const out = await processWalkin({ city: "Omaha", dateISO: "2026-07-03", name: "Jo", vehicle: "Tundra", phone: "555" }, { ...silentDeps, env, key: "cody", create, events: { omaha: [{ dateISO: "2026-07-03" }] } });
  assert.equal(out.status, "booked");
  assert.equal(out.recordId, "recNEW");
  assert.equal(created.fields.Installer, "cody");
  assert.equal(created.fields.City, "Omaha");
  assert.equal(created.fields["Event Date"], "2026-07-03");
  assert.equal(created.fields.Status, "Booked");
  assert.equal(created.fields.Source, "installer:walk-in");
  assert.equal(out.booking.isWalkin, true);
  assert.equal(out.booking.dateISO, "2026-07-03");
  assert.equal(out.booking.name, "Jo");
});

test("an admin may add a walk-in to another installer's market → assigned to that owner", async () => {
  let created;
  const create = async (a) => { created = a; return { id: "recADMIN" }; };
  // Aaron (admin) adds a walk-in in Omaha, which routes to cody.
  const out = await processWalkin({ city: "Omaha", dateISO: "2026-07-03", name: "Jo", phone: "555" },
    { ...silentDeps, env, key: "aaron", admin: true, create, events: { omaha: [{ dateISO: "2026-07-03" }] } });
  assert.equal(out.status, "booked");
  assert.equal(created.fields.Installer, "cody");     // owned by the market's installer, NOT the admin
  assert.equal(out.booking.installer, "cody");
});

test("a non-admin still cannot add to a market that isn't theirs", async () => {
  const out = await processWalkin({ city: "Omaha", dateISO: "2026-07-03", name: "Jo", phone: "555" },
    { env, key: "aaron", admin: false, create: okCreate, events: { omaha: [{ dateISO: "2026-07-03" }] } });
  assert.equal(out.error, "not-your-market");
});

test("accepts a walk-in on ANY date — everyday business, not only scheduled event days", async () => {
  let created;
  const out = await processWalkin({ city: "Omaha", dateISO: "2026-07-22", name: "Jo", phone: "555" },
    { ...silentDeps, env, key: "cody", create: async (a) => { created = a; return { id: "recX" }; } });
  assert.equal(out.status, "booked");
  assert.equal(created.fields["Event Date"], "2026-07-22");   // a non-event day is fine now
  assert.equal(created.fields.Source, "installer:walk-in");
});

test("defaults the walk-in date to today when none is supplied", async () => {
  let created;
  await processWalkin({ city: "Omaha", name: "Jo", phone: "555" },
    { ...silentDeps, env, key: "cody", now: new Date("2026-07-12T15:00:00Z"), create: async (a) => { created = a; return { id: "r" }; } });
  assert.equal(created.fields["Event Date"], "2026-07-12");
});

test("persists a customer email when provided", async () => {
  const created = [];
  const out = await processWalkin(
    { city: "Sioux Falls", name: "Pat R", phone: "6055551212", email: "pat@example.com", vehicle: "2021 Tundra" },
    { ...silentDeps, key: "cody", create: async (a) => { created.push(a.fields); return { id: "rec1" }; } });
  assert.equal(out.status, "booked");
  assert.equal(created[0].Email, "pat@example.com");
});

test("a clientKey matching an existing booking returns it without creating", async () => {
  let created = false;
  const existing = { id: "recX", fields: { City: "Fargo", "Event Date": "2026-08-01", Name: "Dana", Vehicle: "Tundra", Phone: "1", Email: "", Installer: "aaron", "Client Key": "ck-1" } };
  const out = await processWalkin({ city: "fargo", name: "Dana", phone: "1", clientKey: "ck-1" },
    { ...silentDeps, key: "aaron", admin: false, list: async () => [existing], create: async () => { created = true; return {}; } });
  assert.equal(out.status, "booked");
  assert.equal(out.recordId, "recX");
  assert.equal(created, false);
});

test("a new clientKey creates and writes Client Key", async () => {
  let fields;
  const out = await processWalkin({ city: "fargo", name: "Dana", phone: "1", clientKey: "ck-2" },
    { ...silentDeps, key: "aaron", admin: false, list: async () => [], create: async (a) => { fields = a.fields; return { id: "recNew" }; } });
  assert.equal(out.status, "booked");
  assert.equal(out.recordId, "recNew");
  assert.equal(fields["Client Key"], "ck-2");
});

test("a quote in the clientKey cannot break out of the dedupe formula", async () => {
  let formula;
  await processWalkin({ city: "fargo", name: "Dana", phone: "1", clientKey: 'ck", {Name}!="' },
    { ...silentDeps, key: "aaron", admin: false, list: async (a) => { formula = a.filterByFormula; return []; }, create: async () => ({ id: "recNew" }) });
  assert.equal(formula, '{Client Key}="ck\\", {Name}!=\\""');
});

test("no clientKey still creates as before (no lookup required)", async () => {
  const out = await processWalkin({ city: "fargo", name: "Dana", phone: "1" },
    { ...silentDeps, key: "aaron", admin: false, list: async () => [], create: async () => ({ id: "rec3" }) });
  assert.equal(out.status, "booked");
});

test("modelYear present → written to Model Year field on Bookings; absent → field omitted", async () => {
  let fields1;
  const out1 = await processWalkin(
    { city: "Omaha", dateISO: "2026-07-03", name: "Jo", phone: "555", modelYear: "2019" },
    { ...silentDeps, env, key: "cody", create: async (a) => { fields1 = a.fields; return { id: "recMY" }; } });
  assert.equal(out1.status, "booked");
  assert.equal(fields1["Model Year"], "2019");

  let fields2;
  const out2 = await processWalkin(
    { city: "Omaha", dateISO: "2026-07-03", name: "Jo", phone: "555" },
    { ...silentDeps, env, key: "cody", create: async (a) => { fields2 = a.fields; return { id: "recNOMY" }; } });
  assert.equal(out2.status, "booked");
  assert.equal("Model Year" in fields2, false);
});

// B3: walk-in bookings get the same first-touch CRM treatment as online bookings.
// The ensureClient dep is injected so real Airtable calls are never made in tests.
test("walk-in booking ensures a client record — awaited, fail-open", async () => {
  const calls = [];
  let resolvedBeforeProcessWalkin = false;

  const ensureClient = async (bookingId, fields, opts) => {
    calls.push({ bookingId, fields, opts });
    // Two chained yields are required: a single Promise.resolve() resolves in the same
    // microtask batch as the caller's own resolution, making the check vacuous for
    // fire-and-forget callers. A second yield ensures the stub's continuation always
    // runs AFTER an un-awaited caller has already returned.
    resolvedBeforeProcessWalkin = false;
    await Promise.resolve();
    await Promise.resolve(); // second yield — makes fire-and-forget detectable
    resolvedBeforeProcessWalkin = true;
  };

  const out = await processWalkin(
    { city: "Omaha", dateISO: "2026-07-03", name: "Jo", phone: "555-1234",
      email: "jo@x.com", vehicle: "Tundra", modelYear: "2019" },
    { env, key: "cody", create: async () => ({ id: "recB3" }),
      log: { warn() {}, error() {} }, ensureClient });

  assert.equal(out.status, "booked");

  // ensureClient must have been called exactly once, with the new booking id
  assert.equal(calls.length, 1);
  assert.equal(calls[0].bookingId, "recB3");

  // Fields must carry Name, Phone, Email, Vehicle, Installer, and Model Year
  assert.equal(calls[0].fields.Name, "Jo");
  assert.equal(calls[0].fields.Phone, "555-1234");
  assert.equal(calls[0].fields.Email, "jo@x.com");
  assert.equal(calls[0].fields.Vehicle, "Tundra");
  assert.equal(calls[0].fields.Installer, "cody");
  assert.equal(calls[0].fields["Model Year"], "2019");

  // channel must be "walk-in"
  assert.equal(calls[0].opts.channel, "walk-in");

  // AWAITED: the async stub completed before processWalkin returned
  assert.equal(resolvedBeforeProcessWalkin, true);

  // Fail-open: a throwing ensureClient must NOT reject processWalkin — walk-in still books
  const out2 = await processWalkin(
    { city: "Omaha", dateISO: "2026-07-03", name: "Jo", phone: "555" },
    { env, key: "cody", create: async () => ({ id: "recB3b" }),
      log: { warn() {}, error() {} },
      ensureClient: async () => { throw new Error("airtable timeout"); } });
  assert.equal(out2.status, "booked");
});
