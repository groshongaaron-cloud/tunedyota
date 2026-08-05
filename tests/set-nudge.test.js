// tests/set-nudge.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/set-nudge.js");

const ENV = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", INSTALLER_TOKENS: JSON.stringify({ aaron: "SECRET", cody: "CODYTOK" }), INSTALLER_ADMINS: "aaron" };
const H = { "x-installer-token": "SECRET" };
const REC = (over = {}) => ({ id: "ld1", fields: Object.assign({ Name: "Pat Lee", Phone: "612-406-7117", Installer: "aaron", Stage: "Qualified", "Activity Log": "" }, over) });

function ctx(over = {}) {
  return Object.assign({
    env: ENV, now: new Date("2026-08-05T12:00:00Z"),
    getImpl: async () => REC(),
    updateImpl: async (a) => { ctx._patch = a.fields; return { id: a.id }; },
    ingestImpl: async () => ({ status: "lead", recordId: "ldNEW", deduped: false }),
  }, over);
}

test("set-nudge 401s without a valid token", async () => {
  const res = await handler({ httpMethod: "POST", headers: {}, body: "{}" }, ctx());
  assert.equal(res.statusCode, 401);
});

test("set-nudge rejects a bad date", async () => {
  const res = await handler({ httpMethod: "POST", headers: H, body: JSON.stringify({ leadId: "ld1", date: "soon" }) }, ctx());
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).error, "bad-date");
});

test("set-nudge writes Next Follow-up + message on an existing lead", async () => {
  const c = ctx();
  const res = await handler({ httpMethod: "POST", headers: H, body: JSON.stringify({ leadId: "ld1", date: "2026-10-01", message: "check supercharger build" }) }, c);
  assert.equal(res.statusCode, 200);
  assert.equal(ctx._patch["Next Follow-up"], "2026-10-01");
  assert.equal(ctx._patch["Follow-up Message"], "check supercharger build");
  assert.equal(JSON.parse(res.body).leadId, "ld1");
});

test("set-nudge find-or-creates a lead when no leadId is given", async () => {
  let ingestedName = null;
  const c = ctx({ ingestImpl: async (b) => { ingestedName = b.name; return { status: "lead", recordId: "ldNEW", deduped: false }; },
    getImpl: async (a) => REC({}) });
  const res = await handler({ httpMethod: "POST", headers: H, body: JSON.stringify({ name: "New Person", phone: "218-555-1212", date: "2026-09-01" }) }, c);
  assert.equal(res.statusCode, 200);
  assert.equal(ingestedName, "New Person");   // ingest was called to create the lead
});

test("set-nudge blocks a non-admin from nudging another installer's lead", async () => {
  const res = await handler({ httpMethod: "POST", headers: { "x-installer-token": "CODYTOK" },
    body: JSON.stringify({ leadId: "ld1", date: "2026-10-01" }) }, ctx({ getImpl: async () => REC({ Installer: "aaron" }) }));
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).error, "not-your-market");
});

test("set-nudge returns 502 when the store is unavailable", async () => {
  const res = await handler({ httpMethod: "POST", headers: H, body: JSON.stringify({ leadId: "ld1", date: "2026-10-01" }) },
    ctx({ getImpl: async () => { throw new Error("boom"); } }));
  assert.equal(res.statusCode, 502);
  assert.equal(JSON.parse(res.body).error, "store-unavailable");
});

test("set-nudge returns 400 when find-or-create yields no lead", async () => {
  const res = await handler({ httpMethod: "POST", headers: H, body: JSON.stringify({ name: "No Contact", date: "2026-10-01" }) },
    ctx({ ingestImpl: async () => ({ status: "error", error: "missing-contact" }) }));
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).error, "missing-contact");
});

test("set-nudge lets a non-admin nudge an UNASSIGNED lead", async () => {
  const c = ctx({ getImpl: async () => REC({ Installer: "" }) });
  const res = await handler({ httpMethod: "POST", headers: { "x-installer-token": "CODYTOK" },
    body: JSON.stringify({ leadId: "ld1", date: "2026-10-01" }) }, c);
  assert.equal(res.statusCode, 200);
});
