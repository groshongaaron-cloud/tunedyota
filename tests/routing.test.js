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
