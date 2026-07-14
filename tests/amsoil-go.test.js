const { test } = require("node:test");
const assert = require("node:assert/strict");
const { logClick, normSource, destUrl, DEST, handler } = require("../netlify/functions/amsoil-go.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };

test("destinations carry the dealer ZO", () => {
  assert.match(DEST.pc, /preferred-customer-registration-preg\/\?zo=30713116$/);
  assert.match(DEST.shop, /\/shop\/\?zo=30713116$/);
});

test("logClick records booking, destination, source, and a timestamp", async () => {
  let written;
  const ok = await logClick("recABC", "pc", "cert", { env, now: new Date("2026-07-14T12:00:00Z"),
    create: async (a) => { written = a.fields; return { id: "clk1" }; } });
  assert.equal(ok, true);
  assert.equal(written.Booking, "recABC");
  assert.equal(written.Destination, "pc");
  assert.equal(written.Source, "cert");
  assert.equal(written["Clicked At"], "2026-07-14T12:00:00.000Z");
});

test("logClick still logs the click when the Source column doesn't exist yet (tolerant)", async () => {
  let calls = 0, lastFields;
  const create = async (a) => {
    calls++; lastFields = a.fields;
    if ("Source" in a.fields) throw new Error('Unknown field name: "Source"');
    return { id: "clk2" };
  };
  const ok = await logClick("recABC", "shop", "page:tundra", { env, create });
  assert.equal(ok, true);
  assert.equal(calls, 2);                    // first attempt with Source, retry without
  assert.ok(!("Source" in lastFields));      // Source dropped, click still logged
  assert.equal(lastFields.Booking, "recABC");
});

test("a logging failure never throws (fail-open)", async () => {
  const ok = await logClick("recX", "shop", "cert", { env, create: async () => { throw new Error("airtable down"); } });
  assert.equal(ok, false);
});

test("normSource defaults booking clicks to 'cert' and anonymous clicks to 'other'", () => {
  assert.equal(normSource("", "recABC"), "cert");
  assert.equal(normSource("", ""), "other");
  assert.equal(normSource("page:4runner", ""), "page:4runner");
});
test("normSource strips unsafe characters and caps length", () => {
  assert.equal(normSource("page:<script>", ""), "page:script");
  assert.equal(normSource("a".repeat(200), "").length, 60);
});

test("destUrl honors a safe relative product path, keeping the ZO", () => {
  assert.equal(destUrl("shop", "/shop/signature-series-0w-20"),
    "https://www.amsoil.com/shop/signature-series-0w-20?zo=30713116");
});
test("destUrl preserves a product path that already carries a query (adds &zo)", () => {
  assert.equal(destUrl("shop", "/p/amsoil-oil-filter-eaoilfilt/?code=EA15K09-EA"),
    "https://www.amsoil.com/p/amsoil-oil-filter-eaoilfilt/?code=EA15K09-EA&zo=30713116");
});
test("destUrl refuses an off-site or scheme redirect and falls back to the base dest", () => {
  assert.equal(destUrl("shop", "https://evil.example.com"), DEST.shop);
  assert.equal(destUrl("pc", "//evil.example.com"), DEST.pc);
  assert.equal(destUrl("shop", "/foo//bar"), DEST.shop);   // no protocol-relative sneaking in
});

test("handler 302s and does not throw when logging is unconfigured", async () => {
  const res = await handler({ queryStringParameters: { to: "pc", s: "page:tundra" } });
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.Location, DEST.pc);
});
