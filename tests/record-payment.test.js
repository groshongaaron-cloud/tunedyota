// tests/record-payment.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { recordPayment, handler } = require("../netlify/functions/record-payment.js");

const PRICE = (sku) => (sku === "01-26-57-107-BL" ? { name: "Magnuson TVS2650 Magnum Supercharger System", retail: 8295, vehicle: "Toyota Tundra" } : null);

const APPROVAL = {
  ssl_result: "0", ssl_result_message: "APPROVAL", ssl_txn_id: "TXN-123",
  ssl_approval_code: "OK9999", ssl_amount: "8295.00", ssl_card_number: "41**********1111",
  ssl_first_name: "Marcus", ssl_last_name: "Webb",
};

function deps(overrides = {}) {
  const calls = { notify: [], ingest: [] };
  return {
    calls,
    price: PRICE,
    notify: async (text) => { calls.notify.push(text); return { ok: true }; },
    ingest: async (b) => { calls.ingest.push(b); return { status: "lead", recordId: "rec1" }; },
    log: { error: () => {} },
    ...overrides,
  };
}

test("approval -> Slack alert carries amount, kit name, txn id + verify-in-Converge line", async () => {
  const d = deps();
  const out = await recordPayment({ sku: "01-26-57-107-BL", approval: APPROVAL }, d);
  assert.equal(out.status, "ok");
  assert.equal(d.calls.notify.length, 1);
  const text = d.calls.notify[0];
  assert.match(text, /8,?295\.00/);
  assert.match(text, /Magnuson TVS2650/);
  assert.match(text, /TXN-123/);
  assert.match(text, /[Vv]erify in Converge/);
});

test("approval amount differing from catalog retail -> alert flags MISMATCH", async () => {
  const d = deps();
  await recordPayment({ sku: "01-26-57-107-BL", approval: { ...APPROVAL, ssl_amount: "1.00" } }, d);
  assert.match(d.calls.notify[0], /MISMATCH/);
});

test("unknown SKU with a real txn id -> still notifies (money moved), flags unknown", async () => {
  const d = deps();
  const out = await recordPayment({ sku: "NOPE", approval: APPROVAL }, d);
  assert.equal(out.status, "ok");
  assert.equal(d.calls.notify.length, 1);
  assert.match(d.calls.notify[0], /unknown/i);
});

test("cardholder contact from the approval payload -> lands in the lead pipeline", async () => {
  const d = deps();
  const out = await recordPayment(
    { sku: "01-26-57-107-BL", approval: { ...APPROVAL, ssl_email: "marcus@example.com" } }, d);
  assert.equal(out.lead, "recorded");
  assert.equal(d.calls.ingest.length, 1);
  const b = d.calls.ingest[0];
  assert.equal(b.name, "Marcus Webb");
  assert.equal(b.email, "marcus@example.com");
  assert.equal(b.source, "magnuson-purchase");
});

test("explicit contact from the page wins over payload fields", async () => {
  const d = deps();
  await recordPayment({
    sku: "01-26-57-107-BL", approval: { ...APPROVAL, ssl_email: "payload@example.com" },
    contact: { name: "Real Name", phone: "612-555-0100" },
  }, d);
  assert.equal(d.calls.ingest[0].name, "Real Name");
  assert.equal(d.calls.ingest[0].phone, "612-555-0100");
});

test("no reachable contact -> no lead ingest, but the Slack alert still fires", async () => {
  const d = deps();
  const out = await recordPayment({ sku: "01-26-57-107-BL", approval: { ...APPROVAL, ssl_first_name: "", ssl_last_name: "" } }, d);
  assert.equal(out.lead, "skipped");
  assert.equal(d.calls.ingest.length, 0);
  assert.equal(d.calls.notify.length, 1);
});

test("lead-store failure is tolerated — alert already fired, status stays ok", async () => {
  const d = deps({ ingest: async () => { throw new Error("airtable down"); } });
  const out = await recordPayment(
    { sku: "01-26-57-107-BL", approval: { ...APPROVAL, ssl_email: "m@example.com" } }, d);
  assert.equal(out.status, "ok");
  assert.equal(out.lead, "error");
  assert.equal(d.calls.notify.length, 1);
});

test("empty report (no sku, no txn id) -> rejected without notifying (spam guard)", async () => {
  const d = deps();
  const out = await recordPayment({ approval: {} }, d);
  assert.equal(out.status, "error");
  assert.equal(d.calls.notify.length, 0);
});

test("handler: non-POST -> 405, bad JSON -> 400", async () => {
  assert.equal((await handler({ httpMethod: "GET" })).statusCode, 405);
  assert.equal((await handler({ httpMethod: "POST", body: "{nope" })).statusCode, 400);
});
