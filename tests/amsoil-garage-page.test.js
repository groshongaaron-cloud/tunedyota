// tests/amsoil-garage-page.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const html = fs.readFileSync(path.join(__dirname, "..", "site", "amsoil-garage.html"), "utf8");

test("loads the shared chrome + the three garage modules + data", () => {
  assert.match(html, /site\.css/);
  assert.match(html, /amsoil-referral\.js/);
  assert.match(html, /amsoil-garage-render\.js/);
  assert.match(html, /amsoil-garage\.json/);
});
test("has the conversion band linking PC and Dealer enrollment", () => {
  assert.match(html, /Preferred Customer/i);
  assert.match(html, /\/offers\/pc\//);
  assert.match(html, /\/lander\/join\//);
});
test("offers a full-catalog escape hatch", () => {
  assert.match(html, /full AMSOIL catalog/i);
});
test("declares itself an Authorized AMSOIL Dealer", () => {
  assert.match(html, /Authorized AMSOIL Dealer/i);
});
test("is registered for SEO (HEAD_PAGES)", async () => {
  const SD = await import("../scripts/lib/seo-data.mjs");
  assert.ok(SD.HEAD_PAGES.includes("amsoil-garage.html"), "add amsoil-garage.html to HEAD_PAGES");
});
