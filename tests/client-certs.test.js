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
