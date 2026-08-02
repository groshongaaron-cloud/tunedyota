// tests/lead-merge-endpoint.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/lead-update.js");
const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b",
  INSTALLER_TOKENS: '{"noah":"ntok","aaron":"atok"}', INSTALLER_ADMINS: "aaron" };
const ev = (token, body) => ({ headers: { "x-installer-token": token }, body: JSON.stringify(body) });
const OLD = { id: "recOld", fields: { Name: "Eli Soetenga", Installer: "noah", Phone: "6194176865",
  "Created Time": "2026-07-01T00:00:00Z", "Activity Log": "old" } };
const NEW = { id: "recNew", fields: { Name: "Text 619-417-6865", Installer: "noah", Phone: "6194176865",
  Channel: "sms", "Created Time": "2026-07-20T00:00:00Z" } };
function ctxWith(over = {}) {
  const writes = [], deletes = [];
  return { writes, deletes, ctx: { env, now: new Date("2026-08-01T15:00:00Z"),
    getImpl: async (a) => (a.id === "recNew" ? NEW : OLD),
    updateImpl: async (a) => { writes.push(a); return { id: a.id, fields: a.fields }; },
    deleteImpl: async (a) => { deletes.push(a); return {}; }, ...over } };
}

test("merge: absorbs into the earlier record and deletes the duplicate", async () => {
  const { writes, deletes, ctx } = ctxWith();
  const res = await handler(ev("ntok", { id: "recNew", action: "merge", duplicateId: "recOld" }), ctx);
  assert.equal(res.statusCode, 200);
  const out = JSON.parse(res.body);
  assert.deepEqual(out, { status: "ok", merged: true, survivorId: "recOld", deleted: true });
  assert.equal(writes[0].id, "recOld", "absorb writes the SURVIVOR even when the caller passed the newer id");
  assert.match(writes[0].fields["Activity Log"], /merged in recNew/);
  assert.deepEqual(deletes.map((x) => x.id), ["recNew"]);
});

test("merge: duplicate-not-found and self-merge are 400s; other-installer duplicate rejected", async () => {
  const a = await handler(ev("ntok", { id: "recOld", action: "merge", duplicateId: "recOld" }), ctxWith().ctx);
  assert.equal(a.statusCode, 400);
  const { ctx } = ctxWith({ getImpl: async (x) => { if (x.id === "recGone") throw new Error("airtable get 404"); return OLD; } });
  const b = await handler(ev("ntok", { id: "recOld", action: "merge", duplicateId: "recGone" }), ctx);
  assert.equal(JSON.parse(b.body).error, "duplicate-not-found");
  const { ctx: c2 } = ctxWith({ getImpl: async (x) => (x.id === "recNew" ? { ...NEW, fields: { ...NEW.fields, Installer: "cody" } } : OLD) });
  const c = await handler(ev("ntok", { id: "recOld", action: "merge", duplicateId: "recNew" }), c2);
  assert.equal(JSON.parse(c.body).error, "not-your-market");
});

test("merge: a failed delete still reports the absorb — deleted:false, retry-safe", async () => {
  const { ctx } = ctxWith({ deleteImpl: async () => { throw new Error("airtable 503"); } });
  const res = await handler(ev("ntok", { id: "recNew", action: "merge", duplicateId: "recOld" }), ctx);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { status: "ok", merged: true, survivorId: "recOld", deleted: false });
});
