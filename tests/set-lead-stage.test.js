// tests/set-lead-stage.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/set-lead-stage.js");

const ENV = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", INSTALLER_TOKENS: JSON.stringify({ aaron: "SECRET", cody: "CODYTOK" }), INSTALLER_ADMINS: "aaron" };
const H = { "x-installer-token": "SECRET" };
const REC = (over = {}) => ({ id: "ld1", fields: Object.assign({ Name: "Pat Lee", Phone: "612-406-7117", Installer: "aaron", Stage: "Qualified", "Activity Log": "" }, over) });

function ctx(over = {}) {
  return Object.assign({
    env: ENV, now: new Date("2026-08-06T12:00:00Z"),
    getImpl: async () => REC(),
    updateImpl: async (a) => { ctx._patch = a.fields; return { id: a.id }; },
    ingestImpl: async () => ({ status: "lead", recordId: "ldNEW", deduped: false }),
  }, over);
}

test("set-lead-stage 401s without a valid token", async () => {
  const res = await handler({ httpMethod: "POST", headers: {}, body: "{}" }, ctx());
  assert.equal(res.statusCode, 401);
});

test("set-lead-stage rejects a stage that isn't a real lead stage", async () => {
  const res = await handler({ httpMethod: "POST", headers: H, body: JSON.stringify({ leadId: "ld1", stage: "Vibing" }) }, ctx());
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).error, "bad-stage");
});

test("set-lead-stage writes Stage on an existing lead and logs it", async () => {
  const c = ctx();
  const res = await handler({ httpMethod: "POST", headers: H, body: JSON.stringify({ leadId: "ld1", stage: "Booked" }) }, c);
  assert.equal(res.statusCode, 200);
  assert.equal(ctx._patch["Stage"], "Booked");
  assert.match(ctx._patch["Activity Log"], /stage . Booked/);
  assert.equal(JSON.parse(res.body).stage, "Booked");
});

test("set-lead-stage find-or-creates a lead by phone when no leadId is given", async () => {
  let ingested = null;
  const c = ctx({ ingestImpl: async (b) => { ingested = b; return { status: "lead", recordId: "ldNEW", deduped: false }; },
    getImpl: async () => REC({}) });
  const res = await handler({ httpMethod: "POST", headers: H, body: JSON.stringify({ name: "New Person", phone: "218-555-1212", stage: "Contacted" }) }, c);
  assert.equal(res.statusCode, 200);
  assert.equal(ingested.name, "New Person");
  assert.equal(ingested.phone, "218-555-1212");
});

test("set-lead-stage blocks a non-admin from re-staging another installer's lead", async () => {
  const res = await handler({ httpMethod: "POST", headers: { "x-installer-token": "CODYTOK" },
    body: JSON.stringify({ leadId: "ld1", stage: "Booked" }) }, ctx({ getImpl: async () => REC({ Installer: "aaron" }) }));
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).error, "not-your-market");
});

test("set-lead-stage lets a non-admin stage an UNASSIGNED lead", async () => {
  const c = ctx({ getImpl: async () => REC({ Installer: "" }) });
  const res = await handler({ httpMethod: "POST", headers: { "x-installer-token": "CODYTOK" },
    body: JSON.stringify({ leadId: "ld1", stage: "Following up" }) }, c);
  assert.equal(res.statusCode, 200);
});

test("set-lead-stage returns 502 when the store is unavailable", async () => {
  const res = await handler({ httpMethod: "POST", headers: H, body: JSON.stringify({ leadId: "ld1", stage: "Booked" }) },
    ctx({ getImpl: async () => { throw new Error("boom"); } }));
  assert.equal(res.statusCode, 502);
  assert.equal(JSON.parse(res.body).error, "store-unavailable");
});

test("set-lead-stage returns the find-or-create error when no lead can be made", async () => {
  const res = await handler({ httpMethod: "POST", headers: H, body: JSON.stringify({ name: "No Contact", stage: "Contacted" }) },
    ctx({ ingestImpl: async () => ({ status: "error", error: "missing-contact" }) }));
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).error, "missing-contact");
});
