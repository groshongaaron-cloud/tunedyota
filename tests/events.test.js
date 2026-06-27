const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseCsv, toISO, parseEvents, getEventForCity } = require("../netlify/functions/lib/events.js");

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
  assert.equal(m["sioux falls"].dateISO, "2026-07-12");
  assert.equal(m["omaha"].active, false);
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
  assert.equal(map["green bay"].address, "123 Dyno Rd, Green Bay WI");
});
test("parseEvents address defaults to empty when column absent", () => {
  const csv = "Market,Date,Active\nOmaha,2026-06-28,yes\n";
  assert.equal(parseEvents(csv)["omaha"].address, "");
});
