// tests/sync-web.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");

test("injectNativeFetch adds the bootstrap tag once, right after <head>", async () => {
  const { injectNativeFetch } = await import("../app/scripts/sync-lib.mjs");
  const html = "<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body></html>";
  const out = injectNativeFetch(html);
  assert.ok(out.includes('<script src="/native-fetch.js"></script>'));
  assert.ok(out.indexOf("native-fetch.js") < out.indexOf("<meta"), "bootstrap must load before page scripts");
  assert.equal(injectNativeFetch(out), out, "idempotent");
});

test("book.html fonts are self-hosted — bundle carries them, page hits no font CDN", async () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const { FONTS } = await import("../app/scripts/sync-lib.mjs");
  const html = fs.readFileSync(path.join(__dirname, "..", "site", "book.html"), "utf8");
  assert.ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html),
    "book.html must not load fonts from Google — the bundled page has to render offline");
  for (const f of ["lato-400.woff2", "lato-700.woff2", "lato-900.woff2",
    "spectral-400.woff2", "spectral-500.woff2", "spectral-600.woff2", "spectral-700.woff2"]) {
    assert.ok(FONTS.includes(f), f + " missing from FONTS");
  }
});

test("PAGES maps app.html to the app index and keeps installer + book + privacy/terms/calibration", async () => {
  const { PAGES, ASSETS } = await import("../app/scripts/sync-lib.mjs");
  assert.deepEqual(PAGES.find((p) => p[1] === "index.html"), ["app.html", "index.html"]);
  assert.ok(PAGES.some((p) => p[0] === "installer.html"));
  assert.ok(PAGES.some((p) => p[0] === "book.html"));
  assert.ok(PAGES.some((p) => p[0] === "privacy.html" && p[1] === "privacy.html"), "privacy.html in PAGES");
  assert.ok(PAGES.some((p) => p[0] === "terms.html" && p[1] === "terms.html"), "terms.html in PAGES");
  assert.ok(PAGES.some((p) => p[0] === "calibration.html" && p[1] === "calibration.html"), "calibration.html in PAGES");
  for (const need of ["app-shell.js", "product-lines.js", "native-fetch.js", "payment-checkout.js", "magnuson-catalog.js", "amsoil-garage-render.js", "amsoil-garage.json", "vehicles.json", "chat.js", "chat.css"]) {
    assert.ok(ASSETS.includes(need), need + " missing from bundle");
  }
});
