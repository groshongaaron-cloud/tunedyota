const { test } = require("node:test");
const assert = require("node:assert/strict");
const { keyToInstaller, INSTALLERS } = require("../netlify/functions/lib/routing.js");

test("maps each known key to its installer", () => {
  assert.equal(keyToInstaller("aaron").email, "info@tunedyota.com");
  assert.equal(keyToInstaller("noah").email, "noah@tunedyota.com");
  assert.equal(keyToInstaller("cody").email, "cody@tunedyota.com");
});

test("returns name and phone for templates", () => {
  const noah = keyToInstaller("noah");
  assert.equal(noah.name, "Noah Kreis");
  assert.equal(noah.phone, "(920) 860-7050");
});

test("falls back to Aaron / info@ for unknown or empty key", () => {
  assert.equal(keyToInstaller("").email, "info@tunedyota.com");
  assert.equal(keyToInstaller("nobody").email, "info@tunedyota.com");
  assert.equal(keyToInstaller(undefined).key, "aaron");
});

test("INSTALLERS table is exported for reuse", () => {
  assert.ok(INSTALLERS.aaron && INSTALLERS.noah && INSTALLERS.cody);
});

const { smsNumberFor, parseSmsOverrides } = require("../netlify/functions/lib/routing.js");

test("smsNumberFor returns E.164 for noah with no override", () => {
  assert.equal(smsNumberFor("noah", {}), "+19208607050");
});

test("smsNumberFor returns override number for aaron when INSTALLER_SMS_NUMBERS is set", () => {
  assert.equal(smsNumberFor("aaron", { INSTALLER_SMS_NUMBERS: '{"aaron":"+16125550999"}' }), "+16125550999");
});

test("parseSmsOverrides returns empty object for invalid JSON", () => {
  assert.deepEqual(parseSmsOverrides({ INSTALLER_SMS_NUMBERS: "not json" }), {});
});

test("parseSmsOverrides returns empty object for missing env var", () => {
  assert.deepEqual(parseSmsOverrides({}), {});
});

const { normalizeInstallerKey } = require("../netlify/functions/lib/routing.js");

test("normalizeInstallerKey: canonical keys and multi-select arrays pass through", () => {
  assert.equal(normalizeInstallerKey("noah"), "noah");
  assert.equal(normalizeInstallerKey(["cody"]), "cody");
  assert.equal(normalizeInstallerKey(["AARON"]), "aaron");
});

test("normalizeInstallerKey: legacy long-label Airtable options map to the canonical key", () => {
  assert.equal(normalizeInstallerKey("Noah - Milwaukee, Green Bay, Kohler, "), "noah");
  assert.equal(normalizeInstallerKey(["Aaron - Twin Cities, Duluth, Cedar Rapids, Des Moines, Fargo, Madison, Eau Claire"]), "aaron");
  assert.equal(normalizeInstallerKey("Cody - Omaha, Lincoln, Sioux Falls, Rapid City"), "cody");
});

test("normalizeInstallerKey: unknown or empty values -> empty string", () => {
  assert.equal(normalizeInstallerKey(""), "");
  assert.equal(normalizeInstallerKey(undefined), "");
  assert.equal(normalizeInstallerKey("someone else"), "");
  assert.equal(normalizeInstallerKey([]), "");
});
