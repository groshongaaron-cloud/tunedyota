// tests/magnuson-schema-image.test.js
// Guards the Merchant-listing "image" requirement on the Magnuson Product schema:
// every application in the catalog must resolve to a real, self-hosted product
// image (regression from 2026-07-12, where missing `image` produced 53 GSC errors).
// Exercises the ACTUAL imageForApp() from site/magnuson-schema.js (extracted from
// the browser IIFE) against the live catalog — so it fails if a new application's
// engine/vehicle isn't covered, or a referenced image file is missing.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const IMG_DIR = path.join(ROOT, "site", "images", "magnuson");

// Pull imageForApp() out of the IIFE without executing the browser script.
const src = fs.readFileSync(path.join(ROOT, "site", "magnuson-schema.js"), "utf8");
const m = src.match(/function imageForApp\(app\) \{[\s\S]*?og-image\.png";\n  \}/);
if (!m) throw new Error("imageForApp() not found in magnuson-schema.js (did its shape change?)");
const imageForApp = new Function(m[0] + "\nreturn imageForApp;")();

global.window = {};
require("../site/magnuson-catalog.js");
const apps = global.window.MAGNUSON_CATALOG.applications;

test("every Magnuson application resolves to a real self-hosted product image", () => {
  assert.ok(apps.length >= 20, `expected the full catalog, got ${apps.length} apps`);
  for (const a of apps) {
    const url = imageForApp(a);
    assert.match(url, /^https:\/\/tunedyota\.com\//, `${a.slug} ${a.years}: image not an absolute tunedyota URL`);
    const mm = url.match(/\/images\/magnuson\/(.+)$/);
    assert.ok(mm, `${a.slug} ${a.years} (${a.engine}) fell back off the Magnuson image set → ${url}`);
    assert.ok(fs.existsSync(path.join(IMG_DIR, mm[1])),
      `${a.slug} ${a.years}: image file missing on disk → ${mm[1]}`);
  }
});
