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
