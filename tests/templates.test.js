const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildInstallerEmail, buildCustomerEmail } = require("../netlify/functions/lib/templates.js");
const { keyToInstaller } = require("../netlify/functions/lib/routing.js");

const sample = {
  name: "Jane Driver", phone: "(555) 111-2222", email: "jane@example.com",
  market: "Green Bay, WI", installer_key: "noah", installer_name: "Noah Kreis",
  vehicle: "2025+ Toyota Tacoma 2.4L-T I4", goals: "More power & torque, Towing confidence",
  quote_base: "650", quote_custom: "800", quote_sc: "950",
  message: "Interested in the supercharger path.",
  referrer: "https://instagram.com/", utm_source: "ig", utm_medium: "social", utm_campaign: "tacoma-launch",
};

test("installer email includes contact, vehicle, goals, quote, attribution", () => {
  const m = buildInstallerEmail(sample, keyToInstaller(sample.installer_key));
  assert.match(m.subject, /Tacoma/);
  for (const needle of ["Jane Driver", "(555) 111-2222", "jane@example.com",
       "Green Bay, WI", "2025+ Toyota Tacoma", "More power", "650", "950",
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
