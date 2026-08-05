// tests/contacts-index.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeName, personKey, splitName } = require("../netlify/functions/lib/contacts-index.js");

test("normalizeName lowercases, trims, collapses whitespace", () => {
  assert.equal(normalizeName("  Aaron   Groshong "), "aaron groshong");
  assert.equal(normalizeName(null), "");
});

test("personKey prefers phone, then email, then name+vehicle", () => {
  assert.equal(personKey({ phone: "(612) 406-7117", email: "a@b.com", name: "Aaron", vehicle: "4Runner" }), "p:6124067117");
  assert.equal(personKey({ email: "A@B.com", name: "Aaron", vehicle: "4Runner" }), "e:a@b.com");
  assert.equal(personKey({ name: "Aaron", vehicle: "4Runner" }), "n:aaron|4runner");
  assert.equal(personKey({}), ""); // nothing identifies the person
});

test("splitName splits first/last, handles single and empty", () => {
  assert.deepEqual(splitName("Aaron Groshong"), { firstName: "Aaron", lastName: "Groshong" });
  assert.deepEqual(splitName("Cher"), { firstName: "Cher", lastName: "" });
  assert.deepEqual(splitName("  "), { firstName: "", lastName: "" });
});

const { buildContactIndex } = require("../netlify/functions/lib/contacts-index.js");

const getMarket = (city) => (String(city).toLowerCase() === "duluth" ? { city: "Duluth", state: "MN", inst: "aaron" } : null);

test("buildContactIndex merges the same person across sources into one row", () => {
  const contribs = [
    { source: "booking", recordId: "bk1", name: "Aaron Groshong", phone: "612-406-7117", vehicle: "2021 4Runner", modelYear: "2021", city: "Duluth", installer: "aaron", activityDate: "2026-07-01" },
    { source: "lead", recordId: "ld1", name: "Aaron G", phone: "(612) 406 7117", email: "aaron@x.com", city: "Duluth", installer: "aaron", activityDate: "2026-08-04" },
  ];
  const out = buildContactIndex(contribs, { getMarket });
  assert.equal(out.length, 1);
  const c = out[0];
  assert.equal(c.phone.replace(/\D/g, "").slice(-10), "6124067117");
  assert.equal(c.email, "aaron@x.com");            // filled from the lead
  assert.equal(c.firstName, "Aaron");
  assert.equal(c.lastName, "G");                   // newest (lead) name wins
  assert.equal(c.territory, "aaron");              // assigned installer
  assert.equal(c.lastActivity, "2026-08-04");      // max date
  assert.deepEqual(c.sources.bookingIds, ["bk1"]);
  assert.deepEqual(c.sources.leadIds, ["ld1"]);
});

test("buildContactIndex derives territory from city when no installer is assigned", () => {
  const out = buildContactIndex([
    { source: "lead", recordId: "ld2", name: "Pat Lee", phone: "218-555-0000", city: "Duluth", installer: "", activityDate: "2026-08-01" },
  ], { getMarket });
  assert.equal(out[0].territory, "aaron"); // from getMarket("Duluth")
});

test("buildContactIndex drops keyless contributions and sorts by last name", () => {
  const out = buildContactIndex([
    { source: "client", recordId: "c1", name: "", phone: "", email: "", vehicle: "" }, // keyless -> dropped
    { source: "lead", recordId: "l1", name: "Zed Zephyr", phone: "111", installer: "", activityDate: "2026-01-01" },
    { source: "lead", recordId: "l2", name: "Amy Adams", phone: "222", installer: "", activityDate: "2026-01-01" },
  ], { getMarket });
  assert.equal(out.length, 2);
  assert.equal(out[0].lastName, "Adams"); // alphabetical by last name
  assert.equal(out[1].lastName, "Zephyr");
});
