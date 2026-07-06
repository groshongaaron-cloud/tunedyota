const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseCsv, toISO, parseEvents, getEventForCity, getEventsForCity, getCurrentEventForCity, getAllActiveEvents, flattenEvents, asArray, fetchEvents } = require("../netlify/functions/lib/events.js");
const BAKED = require("../netlify/functions/lib/events-data.js");

test("baked fallback used when no sheet; sheet overrides baked", async () => {
  const baked = { fargo: { city: "Fargo", dateISO: "2026-07-03", label: "July 3, 2026", active: true } };
  const e1 = await getEventForCity("Fargo", { fetchImpl: async () => ({ ok: false }), sheetId: "", baked });
  assert.equal(e1.dateISO, "2026-07-03");
  const fetchImpl = async () => ({ ok: true, text: async () => "Market,Date,Active\nFargo,2026-08-01,yes\n" });
  const e2 = await getEventForCity("Fargo", { fetchImpl, sheetId: "x", baked });
  assert.equal(e2.dateISO, "2026-08-01");
});
test("parseCsv handles quoted commas", () => {
  const rows = parseCsv('Market,Date\n"Sioux Falls","Jul 12, 2026"\n');
  assert.deepEqual(rows[1], ["Sioux Falls", "Jul 12, 2026"]);
});
test("toISO normalizes", () => {
  assert.equal(toISO("2026-07-12"), "2026-07-12");
  assert.equal(toISO("Jul 12, 2026"), "2026-07-12");
  assert.equal(toISO("garbage"), null);
});
test("parseEvents maps by lowercase city, honors Active", () => {
  const csv = 'Market,Date,Active\nSioux Falls,2026-07-12,yes\nOmaha,2026-08-01,no\n';
  const m = parseEvents(csv);
  assert.equal(m["sioux falls"][0].dateISO, "2026-07-12");
  assert.equal(m["omaha"][0].active, false);
});
test("getEventForCity null when inactive/unparseable/missing", async () => {
  const fetchImpl = async () => ({ ok: true, text: async () =>
    'Market,Date,Active\nOmaha,2026-08-01,no\nFargo,nope,yes\n' });
  assert.equal(await getEventForCity("Omaha", { fetchImpl, sheetId: "x" }), null);
  assert.equal(await getEventForCity("Fargo", { fetchImpl, sheetId: "x" }), null);
  assert.equal(await getEventForCity("Duluth", { fetchImpl, sheetId: "x" }), null);
});
test("getEventForCity returns active dated event", async () => {
  const fetchImpl = async () => ({ ok: true, text: async () =>
    'Market,Date,Active,Details\nSioux Falls,2026-07-12,yes,At the shop\n' });
  const e = await getEventForCity("sioux falls", { fetchImpl, sheetId: "x" });
  assert.equal(e.dateISO, "2026-07-12");
  assert.equal(e.details, "At the shop");
});
test("parseEvents reads an Address column", () => {
  const csv = "Market,Date,Active,Event,Details,Address\nGreen Bay,2026-09-12,yes,Fall OTT,,\"123 Dyno Rd, Green Bay WI\"\n";
  const map = parseEvents(csv);
  assert.equal(map["green bay"][0].address, "123 Dyno Rd, Green Bay WI");
});
test("parseEvents address defaults to empty when column absent", () => {
  const csv = "Market,Date,Active\nOmaha,2026-06-28,yes\n";
  assert.equal(parseEvents(csv)["omaha"][0].address, "");
});
test("fetchEvents backfills city from the map key for baked entries", async () => {
  const baked = { fargo: { dateISO: "2026-07-03", label: "July 3, 2026", active: true } };
  const map = await fetchEvents({ fetchImpl: async () => ({ ok: false }), sheetId: "", baked });
  assert.equal(map.fargo[0].city, "fargo");
});
test("fetchEvents gives every real baked event a routable city", async () => {
  const map = await fetchEvents({ fetchImpl: async () => ({ ok: false }), sheetId: "", baked: BAKED });
  for (const [key, arr] of Object.entries(map)) for (const ev of arr) assert.ok(ev.city, `missing city for ${key}`);
});

const NOW = new Date("2026-07-01T12:00:00Z");
test("asArray normalizes object, array, and empty", () => {
  assert.deepEqual(asArray({ a: 1 }), [{ a: 1 }]);
  assert.deepEqual(asArray([{ a: 1 }]), [{ a: 1 }]);
  assert.deepEqual(asArray(null), []);
});
test("single-object baked entry normalizes to a one-element array", async () => {
  const baked = { fargo: { dateISO: "2026-07-03", label: "July 3, 2026", active: true } };
  const map = await fetchEvents({ fetchImpl: async () => ({ ok: false }), sheetId: "", baked });
  assert.ok(Array.isArray(map.fargo));
  assert.equal(map.fargo.length, 1);
});
test("array baked entry passes through with two dates", async () => {
  const baked = { "twin cities": [
    { dateISO: "2026-08-29", label: "August 29, 2026", active: true },
    { dateISO: "2026-10-16", label: "October 16, 2026", active: true },
  ] };
  const list = await getEventsForCity("Twin Cities", { fetchImpl: async () => ({ ok: false }), sheetId: "", baked }, NOW);
  assert.equal(list.length, 2);
  assert.equal(list[0].dateISO, "2026-08-29"); // soonest first
});
test("getEventsForCity drops past + inactive and sorts ascending", async () => {
  const baked = { duluth: [
    { dateISO: "2026-06-01", label: "past", active: true },
    { dateISO: "2026-09-01", label: "later", active: true },
    { dateISO: "2026-08-01", label: "sooner", active: true },
    { dateISO: "2026-08-15", label: "inactive", active: false },
  ] };
  const list = await getEventsForCity("Duluth", { fetchImpl: async () => ({ ok: false }), sheetId: "", baked }, NOW);
  assert.deepEqual(list.map((e) => e.dateISO), ["2026-08-01", "2026-09-01"]);
});
test("getCurrentEventForCity returns soonest future or null", async () => {
  const baked = { duluth: [{ dateISO: "2026-08-01", label: "x", active: true }] };
  const deps = { fetchImpl: async () => ({ ok: false }), sheetId: "", baked };
  assert.equal((await getCurrentEventForCity("Duluth", deps, NOW)).dateISO, "2026-08-01");
  assert.equal(await getCurrentEventForCity("Nowhere", deps, NOW), null);
});
test("getAllActiveEvents flattens every active dated event across cities (no future filter)", async () => {
  const baked = {
    duluth: [{ dateISO: "2026-06-01", label: "past-but-active", active: true }],
    fargo: [{ dateISO: "2026-08-01", label: "x", active: true }, { dateISO: "2026-09-01", label: "y", active: true }],
    omaha: [{ dateISO: "2026-08-01", label: "off", active: false }],
  };
  const all = await getAllActiveEvents({ fetchImpl: async () => ({ ok: false }), sheetId: "", baked });
  assert.equal(all.length, 3); // duluth(1, past kept) + fargo(2); omaha inactive dropped
  assert.ok(all.every((e) => e.city));
});
test("sheet duplicate-city rows append instead of overwrite", () => {
  const m = parseEvents("Market,Date,Active\nTwin Cities,2026-08-29,yes\nTwin Cities,2026-10-16,yes\n");
  assert.equal(m["twin cities"].length, 2);
});
test("a configured sheet replaces the baked entry for that city", async () => {
  const baked = { fargo: { dateISO: "2026-07-03", active: true } };
  const fetchImpl = async () => ({ ok: true, text: async () => "Market,Date,Active\nFargo,2026-08-01,yes\n" });
  const list = await getEventsForCity("Fargo", { fetchImpl, sheetId: "x", baked }, NOW);
  assert.deepEqual(list.map((e) => e.dateISO), ["2026-08-01"]);
});
