const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const HTML = fs.readFileSync(path.join(__dirname, "..", "site", "installer.html"), "utf8");

// Owner decision 2026-08-01: no biometric gate. The phone's lock screen is the
// security boundary; the passcode is entered once per device, ever.
test("no biometric lock remains", () => {
  assert.ok(!/nativeLock/.test(HTML), "nativeLock must be gone (call and definition)");
  assert.ok(!/BiometricAuth/.test(HTML), "BiometricAuth plugin must not be referenced");
});

// A single 401 must never wipe the passcode — only a CONFIRMED rotation (recheck
// also 401s) or an explicit logout may clear it.
test("exactly two wipe paths: confirmed rotation + explicit logout", () => {
  const wipes = HTML.match(/removeItem\('ty_installer_token'\)/g) || [];
  assert.equal(wipes.length, 2, "only handle401 (confirmed) and the logout handler may wipe the token");
  assert.ok(/function handle401\(/.test(HTML), "shared handle401 must exist");
  const inline = HTML.match(/res\.status===401\)\{ await handle401\(\); return; \}/g) || [];
  assert.ok(inline.length >= 10, "all data-call 401 sites must delegate to handle401 (found " + inline.length + ")");
});

test("gate breadcrumb explains why the gate appeared", () => {
  assert.ok(/id="gatewhy"/.test(HTML), "gate needs the #gatewhy element");
  assert.ok(/ty_gate_reason/.test(HTML), "wipe paths must record a gate reason");
  assert.ok(/passcode was changed/.test(HTML), "rotation copy must be present");
});

test("console shows who is logged in", () => {
  assert.ok(/id="whoami"/.test(HTML), "header needs the #whoami element");
  assert.ok(/Logged in as/.test(HTML), "'Logged in as' render must be present");
});
