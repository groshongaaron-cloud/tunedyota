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
  assert.match(html, /Certificate of<\/span> Calibration/);   // uniform title, "Complete" removed
  assert.ok(!/Calibration Complete/.test(html));
  assert.ok(html.includes("Jane Driver"));
  assert.ok(html.includes("2024+ Toyota Tacoma 2.4L-T I4"));
  assert.ok(html.includes("Cody Star"));
  assert.ok(!html.includes("Sioux Falls"), "installer row shows the name only, no cities/region");
  assert.match(html, /Overland&nbsp;Tailor&nbsp;Tuning/);      // "Tune" → "Tuning"
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

test("renders the VIN when provided, em-dash when blank", () => {
  const withVin = buildCertificate({ name: "A", vehicle: "V", vin: "5TFDW5F17MX000000" }).html;
  assert.match(withVin, /VIN/);
  assert.ok(withVin.includes("5TFDW5F17MX000000"));
  const noVin = buildCertificate({ name: "A", vehicle: "V" }).html;
  assert.match(noVin, /VIN/);               // label still present
  assert.ok(noVin.includes("&mdash;"));      // value falls back to an em-dash
});

test("renders the exact model year + platform, replacing the year range", () => {
  const withYear = buildCertificate({ name: "A", vehicle: "2016-2023 Toyota Tacoma 3.5L V6", modelYear: "2019" });
  assert.ok(withYear.html.includes("2019 Toyota Tacoma 3.5L V6"), "vehicle line should read exact year + platform");
  assert.ok(!withYear.html.includes("2016-2023"), "the platform year range should be gone");
  assert.ok(withYear.subject.includes("2019 Toyota Tacoma 3.5L V6"), "subject should carry exact year + platform");
  const noYear = buildCertificate({ name: "A", vehicle: "2016-2023 Toyota Tacoma 3.5L V6" });
  assert.ok(noYear.html.includes("2016-2023 Toyota Tacoma 3.5L V6"), "range kept as fallback when no exact year");
  assert.ok(!/\(\s*\)/.test(noYear.html), "no dangling empty parens when model year is blank");
});

test("drops the 'What are you after?' selections from the vehicle line", () => {
  const { html, subject } = buildCertificate({
    name: "Louis Arvin Dimaano",
    vehicle: "2016-2023 Toyota Tacoma 2.7L I4  ·  Better shifting / rev-hang, Larger tires / overland, Sharper daily response, More power & torque",
    modelYear: "2021",
  });
  assert.ok(html.includes("2021 Toyota Tacoma 2.7L I4"), "clean year + platform");
  assert.ok(!html.includes("Better shifting"), "goal selections must not appear");
  assert.ok(!html.includes("·"), "the goals separator must not survive into the vehicle line");
  assert.ok(!subject.includes("Better shifting"), "goal selections must not leak into the subject");
});

test("drops the goals even when no exact model year was captured", () => {
  const { html } = buildCertificate({
    name: "A",
    vehicle: "2016-2023 Toyota Tacoma 2.7L I4  ·  More power & torque",
  });
  assert.ok(html.includes("2016-2023 Toyota Tacoma 2.7L I4"), "platform range retained");
  assert.ok(!html.includes("More power"), "goals dropped even without an exact year");
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
