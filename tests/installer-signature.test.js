const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getSignature } = require("../netlify/functions/installer-signature.js");

const rec = (fields) => ({ id: "r1", fields });
const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };

test("missing id -> error", async () => {
  const out = await getSignature("", { env, key: "aaron", admin: false, get: async () => rec({}) });
  assert.equal(out.status, "error");
  assert.equal(out.error, "missing-id");
});

test("owner installer gets their signature", async () => {
  const out = await getSignature("r1", { env, key: "aaron", admin: false,
    get: async () => rec({ Installer: "aaron", "Customer Signature": "data:image/png;base64,AAAA" }) });
  assert.equal(out.status, "ok");
  assert.equal(out.signature, "data:image/png;base64,AAAA");
});

test("a different installer is refused", async () => {
  const out = await getSignature("r1", { env, key: "noah", admin: false,
    get: async () => rec({ Installer: "aaron", "Customer Signature": "data:image/png;base64,AAAA" }) });
  assert.equal(out.status, "error");
  assert.equal(out.error, "not-yours");
});

test("admin can view any installer's signature", async () => {
  const out = await getSignature("r1", { env, key: "aaron", admin: true,
    get: async () => rec({ Installer: "noah", "Customer Signature": "data:image/png;base64,BBBB" }) });
  assert.equal(out.status, "ok");
  assert.equal(out.signature, "data:image/png;base64,BBBB");
});

test("no signature on the record -> none", async () => {
  const out = await getSignature("r1", { env, key: "aaron", admin: false,
    get: async () => rec({ Installer: "aaron" }) });
  assert.equal(out.status, "none");
});
