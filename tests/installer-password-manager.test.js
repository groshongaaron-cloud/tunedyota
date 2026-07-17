const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const HTML = fs.readFileSync(path.join(__dirname, "..", "site", "installer.html"), "utf8");

// The gate must be a real login FORM so the OS/browser password manager (iOS
// Keychain, Google Password Manager) offers to save + autofill the installer
// passcode. autocomplete="off" (the old value) actively suppresses that.
test("installer gate is a form the password manager can save + autofill", () => {
  assert.ok(/<form[^>]*id="gate"/.test(HTML), "gate should be a <form id=gate> (keeps showApp's hide logic working)");
  assert.ok(/id="tok"[^>]*type="password"/.test(HTML), "passcode stays type=password");
  assert.ok(/id="tok"[^>]*autocomplete="current-password"/.test(HTML), "passcode must opt INTO current-password autofill");
  assert.ok(!/id="tok"[^>]*autocomplete="off"/.test(HTML), "passcode must not suppress autofill with autocomplete=off");
  assert.ok(/autocomplete="username"/.test(HTML), "a username field is needed for the manager to key the credential");
  assert.ok(/id="unlock"[^>]*type="submit"/.test(HTML), "unlock should submit the form (fires the save-password prompt + enables Enter)");
});
