const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildRoster } = require("../netlify/functions/installer-roster.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };

test("scopes to the installer, drops past events, groups + sorts", async () => {
  let formula;
  const list = async (a) => {
    formula = a.filterByFormula;
    return [
      { id: "r1", fields: { City: "Omaha", "Event Date": "2026-07-03", Slot: "9:40", Name: "B", Vehicle: "Tundra", Installer: "cody", Status: "Booked" } },
      { id: "r2", fields: { City: "Omaha", "Event Date": "2026-07-03", Slot: "9:00", Name: "A", Vehicle: "Tacoma", Installer: "cody", Status: "Booked" } },
      { id: "r3", fields: { City: "Lincoln", "Event Date": "2020-01-01", Slot: "9:00", Name: "Old", Installer: "cody", Status: "Booked" } }, // past → dropped
    ];
  };
  const out = await buildRoster({ env, key: "cody", now: new Date("2026-07-03T12:00:00Z"), list });
  assert.match(formula, /\{Installer\}="cody"/);
  assert.match(formula, /\{Status\}!="Cancelled"/);
  assert.equal(out.installer, "cody");
  assert.equal(out.events.length, 1);                 // Lincoln (past) dropped
  assert.equal(out.events[0].city, "Omaha");
  assert.equal(out.events[0].bookings[0].name, "A");  // sorted by slot: 9:00 before 9:40
  assert.equal(out.events[0].bookings[0].slotLabel, "9:00 AM");
});
