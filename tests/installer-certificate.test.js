const { test } = require("node:test");
const assert = require("node:assert/strict");
const { renderCertificate } = require("../netlify/functions/installer-certificate.js");

const rec = { id: "recX", fields: {
  Installer: "aaron", Name: "Marcus Bell", Vehicle: "2024 Toyota Tacoma 2.4L-T I4",
  "Model Year": "2024", VIN: "3TMLB5JN1RM123456", "OTT Calibration": "Medium",
  "Calibration Date": "2026-07-12", "Certificate Issued": "2026-07-12", Status: "Completed" } };

test("renders a stored certificate for its owner", async () => {
  const out = await renderCertificate("recX", { key: "aaron", admin: false, get: async () => rec });
  assert.equal(out.status, "ok");
  assert.match(out.html, /Certificate of<\/span> Calibration/);
  assert.match(out.html, /AMSOIL Maintenance Reference/);
  assert.match(out.html, /Marcus Bell/);
});

test("refuses a booking the caller doesn't own", async () => {
  const out = await renderCertificate("recX", { key: "noah", admin: false, get: async () => rec });
  assert.equal(out.status, "error");
  assert.equal(out.error, "not-yours");
});

test("an admin may render any booking", async () => {
  const out = await renderCertificate("recX", { key: "aaron", admin: true, get: async () => rec });
  assert.equal(out.status, "ok");
});
