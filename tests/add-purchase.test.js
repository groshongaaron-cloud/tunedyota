const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/add-purchase.js");

const ENV = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", INSTALLER_TOKENS: JSON.stringify({ aaron: "S" }), INSTALLER_ADMINS: "aaron" };
const H = { "x-installer-token": "S" };

test("add-purchase 401s without a token", async () => {
  const res = await handler({ httpMethod: "POST", headers: {}, body: "{}" }, { env: ENV });
  assert.equal(res.statusCode, 401);
});

test("add-purchase 400s without item or contact", async () => {
  const res = await handler({ httpMethod: "POST", headers: H, body: JSON.stringify({ category: "Banks" }) }, { env: ENV, createImpl: async () => ({ id: "x" }) });
  assert.equal(res.statusCode, 400);
});

test("add-purchase creates a Purchases row with the installer stamped", async () => {
  let created = null;
  const res = await handler({ httpMethod: "POST", headers: H,
    body: JSON.stringify({ phone: "612-406-7117", category: "Banks", item: "PedalMonster", amount: 349, date: "2026-08-01" }) },
    { env: ENV, createImpl: async (a) => { created = a; return { id: "p1" }; } });
  assert.equal(res.statusCode, 200);
  assert.equal(created.fields.Category, "Banks");
  assert.equal(created.fields.Item, "PedalMonster");
  assert.equal(created.fields.Installer, "aaron");
  assert.equal(created.fields.Amount, 349);
});
