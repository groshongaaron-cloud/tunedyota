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

test("PAGES maps app.html to the app index and keeps installer + book", async () => {
  const { PAGES, ASSETS } = await import("../app/scripts/sync-lib.mjs");
  assert.deepEqual(PAGES.find((p) => p[1] === "index.html"), ["app.html", "index.html"]);
  assert.ok(PAGES.some((p) => p[0] === "installer.html"));
  assert.ok(PAGES.some((p) => p[0] === "book.html"));
  for (const need of ["app-shell.js", "product-lines.js", "native-fetch.js", "payment-checkout.js", "magnuson-catalog.js", "amsoil-garage-render.js", "amsoil-garage.json", "vehicles.json", "chat.js", "chat.css"]) {
    assert.ok(ASSETS.includes(need), need + " missing from bundle");
  }
});
