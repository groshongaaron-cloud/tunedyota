const { test } = require("node:test");
const assert = require("node:assert/strict");
const { certHtmlForRecord } = require("../netlify/functions/lib/cert-render.js");

const rec = { id: "recX", fields: { Name: "Jane", Vehicle: "Tundra", Installer: ["aaron"],
  "OTT Calibration": "Medium", "Calibration Date": "2026-07-01", "Certificate Issued": "2026-07-01",
  Email: "jane@x.com" } };

test("account-portal certificate includes the attributed refer-a-friend card", () => {
  const html = certHtmlForRecord(rec, { CLIENT_SESSION_SECRET: "secret" });
  assert.match(html, /Do a friend a favor/);
  assert.match(html, /[?&]ref=/);   // personal, attributed link
});
test("no referral card without a session secret (unattributable) or without an email", () => {
  assert.doesNotMatch(certHtmlForRecord(rec, {}), /Do a friend a favor/);
  const noEmail = { id: "r", fields: { ...rec.fields, Email: "" } };
  assert.doesNotMatch(certHtmlForRecord(noEmail, { CLIENT_SESSION_SECRET: "s" }), /Do a friend a favor/);
});
