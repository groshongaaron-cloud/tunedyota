const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildCertificate, certSerial } = require("../netlify/functions/lib/certificate.js");

test("renders the Master Certificate with merged booking data", () => {
  const { subject, html } = buildCertificate({
    name: "Jane Driver", vehicle: "2024+ Toyota Tacoma 2.4L-T I4",
    calibration: "Spicy", installer: "Cody Star", installerRegion: "Sioux Falls, Rapid City & Omaha",
    calibrationDate: "2026-09-12", certNo: "TY-2026-AB12C", issueDate: "2026-09-13",
  });
  assert.match(subject, /Certificate of Calibration/);
  assert.match(subject, /Jane Driver/);
  assert.match(html, /Certificate of/);
  assert.match(html, /Complete/);
  assert.ok(html.includes("Jane Driver"));
  assert.ok(html.includes("2024+ Toyota Tacoma 2.4L-T I4"));
  assert.ok(html.includes("Cody Star"));
  assert.ok(html.includes("Sioux Falls, Rapid City &amp; Omaha")); // region, & escaped
  assert.ok(html.includes("TY-2026-AB12C"));      // cert no
  assert.ok(html.includes("2026-09-13"));          // issued date
  assert.ok(html.includes("September 12, 2026"));  // long-formatted calibration date
  assert.match(html, /OTT Calibration/);
  assert.ok(html.includes("Spicy"));   // locked, static value from Airtable
  assert.ok(!/<select/.test(html));    // not editable once dispatched
});

test("any calibration value renders as locked static text (no dropdown)", () => {
  const { html } = buildCertificate({ name: "A", vehicle: "V", calibration: "Turbo Performance" });
  assert.ok(html.includes("Turbo Performance"));
  assert.ok(!/<select/.test(html));
});

test("blank calibration renders an em-dash, not a picker", () => {
  const { html } = buildCertificate({ name: "A", vehicle: "V" });
  assert.ok(!/<select/.test(html));
  assert.match(html, /OTT Calibration/);
  assert.ok(html.includes("—"));
});

test("escapes HTML and tolerates blank/missing fields (no 'undefined')", () => {
  const { html } = buildCertificate({ name: "A<b>", vehicle: "V&V", calibrationDate: "" });
  assert.ok(html.includes("A&lt;b&gt;"));
  assert.ok(html.includes("V&amp;V"));
  assert.ok(!/undefined/.test(html));
});

test("certSerial is deterministic: TY-{year}-{id suffix}", () => {
  assert.equal(certSerial("recABCDE12345", "2026-09-12", "2026-09-13"), "TY-2026-12345");
  assert.equal(certSerial("", "", "2027-01-02"), "TY-2027-00000");
});
