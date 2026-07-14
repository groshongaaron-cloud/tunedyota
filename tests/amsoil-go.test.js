const { test } = require("node:test");
const assert = require("node:assert/strict");
const { logClick, DEST, handler } = require("../netlify/functions/amsoil-go.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };

test("destinations carry the dealer ZO", () => {
  assert.match(DEST.pc, /preferred-customer-registration-preg\/\?zo=30713116$/);
  assert.match(DEST.shop, /\/shop\/\?zo=30713116$/);
});

test("logClick records booking, destination, and a timestamp", async () => {
  let written;
  const ok = await logClick("recABC", "pc", { env, now: new Date("2026-07-14T12:00:00Z"),
    create: async (a) => { written = a.fields; return { id: "clk1" }; } });
  assert.equal(ok, true);
  assert.equal(written.Booking, "recABC");
  assert.equal(written.Destination, "pc");
  assert.equal(written["Clicked At"], "2026-07-14T12:00:00.000Z");
});

test("a logging failure never throws (fail-open)", async () => {
  const ok = await logClick("recX", "shop", { env, create: async () => { throw new Error("airtable down"); } });
  assert.equal(ok, false);
});
