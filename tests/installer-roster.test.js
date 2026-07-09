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
  assert.match(formula, /\{Installer\}="cody"/);
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
});
