const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildInstallerEmail, buildCustomerEmail } = require("../netlify/functions/lib/templates.js");
const { keyToInstaller } = require("../netlify/functions/lib/routing.js");

const sample = {
  name: "Jane Driver", phone: "(555) 111-2222", email: "jane@example.com",
  market: "Green Bay, WI", installer_key: "noah", installer_name: "Noah Kreis",
  vehicle: "2024+ Toyota Tacoma 2.4L-T I4", goals: "More power & torque, Towing confidence",
  quote_base: "650", quote_custom: "800", quote_sc: "950",
  message: "Interested in the supercharger path.",
  referrer: "https://instagram.com/", utm_source: "ig", utm_medium: "social", utm_campaign: "tacoma-launch",
};

test("installer email includes contact, vehicle, goals, quote, attribution", () => {
  const m = buildInstallerEmail(sample, keyToInstaller(sample.installer_key));
  assert.match(m.subject, /Tacoma/);
  for (const needle of ["Jane Driver", "(555) 111-2222", "jane@example.com",
       "Green Bay, WI", "2024+ Toyota Tacoma", "More power", "650", "950",
       "supercharger path", "ig", "tacoma-launch", "instagram.com"]) {
    assert.ok(m.text.includes(needle), `text missing: ${needle}`);
    assert.ok(m.html.includes(needle), `html missing: ${needle}`);
  }
});

test("customer email names the assigned installer and phone", () => {
  const m = buildCustomerEmail(sample, keyToInstaller(sample.installer_key));
  assert.match(m.subject, /Tuned Yota/);
  assert.ok(m.text.includes("Noah Kreis"));
  assert.ok(m.text.includes("(920) 860-7050"));
  assert.ok(m.html.includes("Noah Kreis"));
});

test("templates tolerate missing optional fields", () => {
  const bare = { name: "X", phone: "", email: "x@y.com", market: "Not selected",
    installer_key: "", vehicle: "2020-2024 4Runner", goals: "", quote_base: "600",
    quote_custom: "", quote_sc: "", message: "", referrer: "", utm_source: "",
    utm_medium: "", utm_campaign: "" };
  const inst = keyToInstaller(bare.installer_key);
  assert.doesNotThrow(() => buildInstallerEmail(bare, inst));
  assert.doesNotThrow(() => buildCustomerEmail(bare, inst));
});

const tB = require("../netlify/functions/lib/templates.js");

const dB = { name: "Jane Doe", phone: "(612) 406-7117", email: "jane@x.com", vehicle: "2024+ Toyota Tacoma", goals: "Power" };
const instB = { key: "cody", name: "Cody Star", email: "cody@tunedyota.com", phone: "(605) 214-1335" };
const marketB = { city: "Sioux Falls", state: "SD" };
const eventB = { dateISO: "2026-07-12", label: "Jul 12, 2026" };

test("booking customer email names slot + date", () => {
  const m = tB.buildBookingCustomerEmail({ ...dB, slot: "9:20" }, instB, marketB, eventB);
  assert.ok(m.subject.toLowerCase().includes("booked"));
  assert.ok(m.text.includes("9:20"));
  assert.ok(m.text.includes("Sioux Falls"));
});
test("booking installer email lists details", () => {
  const m = tB.buildBookingInstallerEmail({ ...dB, slot: "9:20" }, instB, marketB, eventB);
  assert.ok(m.subject.includes("Sioux Falls"));
  assert.ok(m.text.includes("Jane Doe"));
  assert.ok(m.text.includes("9:20"));
});
test("installer emails surface Free OTT Update request type when source set", () => {
  const b = tB.buildBookingInstallerEmail({ ...dB, slot: "9:20", source: "OTT Update" }, instB, marketB, eventB);
  assert.ok(b.text.includes("Free OTT Update"), "booking text row missing");
  assert.ok(b.html.includes("Free OTT Update"), "booking html row missing");
  const p = tB.buildPriorityInstallerEmail({ ...dB, source: "OTT Update" }, instB, marketB, "no-event");
  assert.ok(p.text.includes("Free OTT Update"), "priority text row missing");
  const plain = tB.buildBookingInstallerEmail({ ...dB, slot: "9:20" }, instB, marketB, eventB);
  assert.ok(!plain.text.includes("Free OTT Update"), "no row when source absent");
});
test("priority emails reflect reason", () => {
  const full = tB.buildPriorityCustomerEmail(dB, instB, marketB, "full");
  assert.ok(full.text.toLowerCase().includes("priority"));
  const inE = tB.buildPriorityInstallerEmail(dB, instB, marketB, "no-event");
  assert.ok(inE.subject.toLowerCase().includes("priority"));
  // full-event wait list carries the requested time
  assert.ok(tB.buildPriorityCustomerEmail({ ...dB, slot: "9:20" }, instB, marketB, "full").text.includes("9:20"));
  assert.ok(tB.buildPriorityInstallerEmail({ ...dB, slot: "9:20" }, instB, marketB, "full").text.includes("9:20"));
});
