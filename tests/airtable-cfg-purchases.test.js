const { test } = require("node:test");
const assert = require("node:assert/strict");
const { cfg } = require("../netlify/functions/lib/airtable.js");

test("cfg exposes the Purchases table, overridable via env", () => {
  assert.equal(cfg({}).purchases, "Purchases");
  assert.equal(cfg({ AIRTABLE_PURCHASES_TABLE: "Buys" }).purchases, "Buys");
});
