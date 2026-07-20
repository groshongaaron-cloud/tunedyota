const { test } = require("node:test");
const assert = require("node:assert/strict");
const { listCerts, renderClientCert } = require("../netlify/functions/client-certs.js");

const ENV = { CLIENT_SESSION_SECRET: "s", AIRTABLE_TOKEN: "at", AIRTABLE_BASE_ID: "app1" };

const REC = { id: "recX", fields: {
  Installer: "aaron", Name: "Marcus Bell", Vehicle: "2024 Toyota Tacoma 2.4L-T I4",
  "Model Year": "2024", VIN: "3TMLB5JN1RM123456", "OTT Calibration": "Medium",
  "Calibration Date": "2026-07-12", "Certificate Issued": "2026-07-12",
  Status: "Completed", Email: "Marcus@Example.com" } };

test("listCerts filters by the session email, case-insensitively, completed only", async () => {
  let formula = "";
  const out = await listCerts("marcus@example.com",
    { env: ENV, list: async (a) => { formula = a.filterByFormula; return [REC]; } });
  assert.match(formula, /LOWER\(\{Email\}\)="marcus@example\.com"/);
  assert.match(formula, /\{Status\}="Completed"/);
  assert.equal(out.certs.length, 1);
  assert.deepEqual(out.certs[0], {
    recordId: "recX", name: "Marcus Bell", vehicle: "2024 Toyota Tacoma 2.4L-T I4",
    modelYear: "2024", calibration: "Medium", calibrationDate: "2026-07-12",
    certIssued: "2026-07-12" });
});

test("renderClientCert renders when the booking email matches the session", async () => {
  const out = await renderClientCert("recX", "marcus@example.com",
    { env: ENV, get: async () => REC });
  assert.equal(out.status, "ok");
  assert.match(out.html, /Marcus Bell/);
  assert.match(out.html, /AMSOIL Maintenance Reference/);
});

test("renderClientCert refuses another client's booking", async () => {
  const out = await renderClientCert("recX", "other@example.com",
    { env: ENV, get: async () => REC });
  assert.deepEqual(out, { status: "error", error: "not-yours" });
});

test("renderClientCert reports store failures as retryable", async () => {
  const out = await renderClientCert("recX", "marcus@example.com",
    { env: ENV, get: async () => { throw new Error("airtable get 503"); } });
  assert.deepEqual(out, { status: "error", error: "store-unavailable" });
});

test("handler list response carries the signed-in customer's referral link", async () => {
  const { handler } = require("../netlify/functions/client-certs.js");
  const { signSession, verifyReferral } = require("../netlify/functions/lib/client-auth.js");
  const saved = { CLIENT_SESSION_SECRET: process.env.CLIENT_SESSION_SECRET,
    AIRTABLE_TOKEN: process.env.AIRTABLE_TOKEN, AIRTABLE_BASE_ID: process.env.AIRTABLE_BASE_ID };
  const savedFetch = global.fetch;
  process.env.CLIENT_SESSION_SECRET = "s";
  process.env.AIRTABLE_TOKEN = "at";
  process.env.AIRTABLE_BASE_ID = "app1";
  global.fetch = async () => ({ ok: true, json: async () => ({ records: [REC] }) });
  try {
    const token = signSession("marcus@example.com", Date.now(), { CLIENT_SESSION_SECRET: "s" });
    const res = await handler({ headers: { "x-client-token": token }, queryStringParameters: {} });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.match(body.referralLink, /^https:\/\/tunedyota\.com\/find-your-exact-tune\?ref=/);
    const rt = new URL(body.referralLink).searchParams.get("ref");
    assert.deepEqual(verifyReferral(rt, Date.now(), { CLIENT_SESSION_SECRET: "s" }), { email: "marcus@example.com" });
  } finally {
    global.fetch = savedFetch;
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});
