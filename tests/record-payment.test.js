// tests/record-payment.test.js — EPG approval recording
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { recordPayment, handler } = require("../netlify/functions/record-payment.js");

const PRICE = (sku) => (sku === "01-26-57-107-BL" ? { name: "Magnuson TVS2650 Magnum Supercharger System", retail: 8295, vehicle: "Toyota Tundra" } : null);

// Shape reported by site/payment-checkout.js after the EPG lightbox fires
// transactionCreated — matches a real sandbox transaction (2026-08-04).
const APPROVAL = {
  sessionId: "sess_1",
  authorized: true,
  transaction: {
    id: "txn_123",
    state: "authorized",
    isAuthorized: true,
    total: { amount: "8295.00", currencyCode: "USD" },
    card: { holderName: "Marcus Webb", last4: "1119", brand: "Visa Credit" },
    shopperEmailAddress: "marcus@example.com",
    authorizationCode: "DU6ULN",
    invoiceNumber: "01-26-57-107-BL",
  },
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

test("approval -> Slack alert carries amount, kit name, txn id + verify-in-EPG line", async () => {
  const d = deps();
  const out = await recordPayment({ sku: "01-26-57-107-BL", approval: APPROVAL }, d);
  assert.equal(out.status, "ok");
  assert.equal(d.calls.notify.length, 1);
  const text = d.calls.notify[0];
  assert.match(text, /8,?295\.00/);
  assert.match(text, /Magnuson TVS2650/);
  assert.match(text, /txn_123/);
  assert.match(text, /1119/);
  assert.match(text, /DU6ULN/);
  assert.match(text, /Marcus Webb/);
  assert.match(text, /verify in the EPG portal/i);
});

test("approval amount differing from catalog retail -> alert flags MISMATCH", async () => {
  const d = deps();
  await recordPayment({ sku: "01-26-57-107-BL", approval: { ...APPROVAL, transaction: { id: "txn_123", total: { amount: "1.00" } } } }, d);
  assert.match(d.calls.notify[0], /MISMATCH/);
});

test("unknown SKU with a real txn id -> still notifies (money moved), flags unknown", async () => {
  const d = deps();
  const out = await recordPayment({ sku: "NOPE", approval: APPROVAL }, d);
  assert.equal(out.status, "ok");
  assert.equal(d.calls.notify.length, 1);
  assert.match(d.calls.notify[0], /unknown/i);
});

test("explicit contact from the page -> lands in the lead pipeline", async () => {
  const d = deps();
  const out = await recordPayment({
    sku: "01-26-57-107-BL", approval: APPROVAL,
    contact: { name: "Marcus Webb", phone: "612-555-0100", email: "marcus@example.com" },
  }, d);
  assert.equal(out.lead, "recorded");
  assert.equal(d.calls.ingest.length, 1);
  const b = d.calls.ingest[0];
  assert.equal(b.name, "Marcus Webb");
  assert.equal(b.phone, "612-555-0100");
  assert.equal(b.email, "marcus@example.com");
  assert.equal(b.source, "magnuson-purchase");
  assert.match(b.message, /txn_123/);
});

test("no page contact -> cardholder name + shopper email from the transaction land in the lead pipeline", async () => {
  const d = deps();
  const out = await recordPayment({ sku: "01-26-57-107-BL", approval: APPROVAL }, d);
  assert.equal(out.lead, "recorded");
  assert.equal(d.calls.ingest[0].name, "Marcus Webb");
  assert.equal(d.calls.ingest[0].email, "marcus@example.com");
});

test("no reachable contact anywhere -> no lead ingest, but the Slack alert still fires", async () => {
  const d = deps();
  const bare = { ...APPROVAL, transaction: { id: "txn_123", isAuthorized: true, total: { amount: "8295.00" } } };
  const out = await recordPayment({ sku: "01-26-57-107-BL", approval: bare }, d);
  assert.equal(out.lead, "skipped");
  assert.equal(d.calls.ingest.length, 0);
  assert.equal(d.calls.notify.length, 1);
});

test("lead-store failure is tolerated — alert already fired, status stays ok", async () => {
  const d = deps({ ingest: async () => { throw new Error("airtable down"); } });
  const out = await recordPayment(
    { sku: "01-26-57-107-BL", approval: APPROVAL, contact: { name: "M", email: "m@example.com" } }, d);
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

test("explicit decline (authorized:false) -> alert flags NOT authorized, no ghost lead", async () => {
  const d = deps();
  const declined = {
    sessionId: "sess_x", authorized: false,
    transaction: { id: "txn_x", isAuthorized: false, total: { amount: "8295.00" },
      card: { holderName: "Marcus Webb", last4: "1119", brand: "Visa Credit" }, shopperEmailAddress: "marcus@example.com" },
  };
  const out = await recordPayment(
    { sku: "01-26-57-107-BL", approval: declined, contact: { name: "Marcus Webb", email: "marcus@example.com" } }, d);
  assert.equal(out.status, "ok");
  assert.equal(out.authorized, false);
  assert.equal(d.calls.notify.length, 1);
  assert.doesNotMatch(d.calls.notify[0], /payment approved/i);
  assert.match(d.calls.notify[0], /not authorized/i);
  assert.equal(out.lead, "skipped");        // a decline must never mint a "paid" lead
  assert.equal(d.calls.ingest.length, 0);
});

test("handler: non-POST -> 405, bad JSON -> 400", async () => {
  assert.equal((await handler({ httpMethod: "GET" })).statusCode, 405);
  assert.equal((await handler({ httpMethod: "POST", body: "{nope" })).statusCode, 400);
});
