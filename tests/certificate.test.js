const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildCertificate } = require("../netlify/functions/lib/certificate.js");

test("pre-fills known fields, blanks the installer fields, names customer in subject", () => {
  const { subject, html } = buildCertificate({ name: "Jane Driver", retailer: "Cody Star", vehicle: "2025+ Toyota Tacoma", calibrationDate: "2026-06-28" });
  assert.match(subject, /Certificate of Authenticity/);
  assert.match(subject, /Jane Driver/);
  assert.ok(html.includes("Jane Driver"));
  assert.ok(html.includes("Cody Star"));
  assert.ok(html.includes("2026-06-28"));
  assert.ok(html.includes("2025+ Toyota Tacoma"));
  for (const label of ["VIN", "Vehicle Year", "Vehicle Type", "Engine Size", "Mileage"]) {
    assert.ok(html.includes(label), `missing field label: ${label}`);
  }
  assert.match(html, /contenteditable/);
});
test("escapes HTML and tolerates a blank calibration date", () => {
  const { html } = buildCertificate({ name: "A<b>", retailer: "R", vehicle: "V&V", calibrationDate: "" });
  assert.ok(html.includes("A&lt;b&gt;"));
  assert.ok(html.includes("V&amp;V"));
  assert.ok(!/undefined/.test(html));
});
