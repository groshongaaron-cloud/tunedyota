const { test } = require("node:test");
const assert = require("node:assert/strict");
const { resolveInstaller } = require("../netlify/functions/lib/installer-auth.js");

const env = { INSTALLER_TOKENS: JSON.stringify({ aaron: "AA", noah: "NN", cody: "CC" }) };

test("maps a matching token to its installer key", () => {
  assert.equal(resolveInstaller({ "x-installer-token": "NN" }, env), "noah");
  assert.equal(resolveInstaller({ "x-installer-token": "CC" }, env), "cody");
});
test("unknown or blank token → null", () => {
  assert.equal(resolveInstaller({ "x-installer-token": "zz" }, env), null);
  assert.equal(resolveInstaller({}, env), null);
});
test("fail-closed on unset or garbage env", () => {
  assert.equal(resolveInstaller({ "x-installer-token": "NN" }, {}), null);
  assert.equal(resolveInstaller({ "x-installer-token": "NN" }, { INSTALLER_TOKENS: "{bad json" }), null);
});
