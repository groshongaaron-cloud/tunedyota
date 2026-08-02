const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

test("sync-web assembles the client shell as index.html in app/www", () => {
  execFileSync("node", ["app/scripts/sync-web.mjs"], { cwd: path.join(__dirname, "..") });
  const www = path.join(__dirname, "..", "app", "www");
  assert.ok(fs.existsSync(path.join(www, "index.html")), "index.html (from app.html)");
  assert.ok(fs.existsSync(path.join(www, "installer.html")), "installer.html");
  assert.ok(fs.existsSync(path.join(www, "book.html")), "book.html");
  assert.ok(fs.existsSync(path.join(www, "site.css")), "site.css");
  assert.ok(fs.existsSync(path.join(www, "vendor", "zxing.min.js")), "vendor/zxing.min.js");
  const idx = fs.readFileSync(path.join(www, "index.html"), "utf8");
  assert.match(idx, /TUNED YOTA/);
  // native-fetch bridge must be injected into bundled HTML
  assert.ok(idx.includes('<script src="/native-fetch.js"></script>'), "native-fetch injection");
});

test("sync-web bundles the my-tuned-yota member page with its fonts", () => {
  execFileSync("node", ["app/scripts/sync-web.mjs"], { cwd: path.join(__dirname, "..") });
  const www = path.join(__dirname, "..", "app", "www");
  const page = fs.readFileSync(path.join(www, "my-tuned-yota.html"), "utf8");
  assert.ok(page.includes('<script src="/native-fetch.js"></script>'), "native-fetch injection");
  // no placeholder prices or sample vehicles may ship in the bundle
  assert.ok(!/\$\d/.test(page), "no hardcoded dollar amounts");
  assert.ok(!page.includes("previewbar"), "preview switch removed");
  // every @font-face source must exist in the bundle (root-absolute paths so
  // they resolve from the extensionless /my-tuned-yota route too)
  const fontRefs = [...page.matchAll(/url\('\/assets\/fonts\/([^']+)'\)/g)];
  assert.ok(fontRefs.length >= 7, "all seven font faces declared with root-absolute sources");
  for (const m of fontRefs) {
    assert.ok(fs.existsSync(path.join(www, "assets", "fonts", m[1])), `missing font: ${m[1]}`);
  }
  // the clean URL must resolve inside the bundle like privacy/terms do
  assert.ok(fs.existsSync(path.join(www, "my-tuned-yota", "index.html")), "extensionless /my-tuned-yota route");
  // outbound links must be absolute and routed through the in-app browser
  for (const m of page.matchAll(/<a[^>]*data-external[^>]*href="([^"]+)"/g)) {
    assert.match(m[1], /^https:\/\//, `data-external link not absolute: ${m[1]}`);
  }
});

test("every root-relative static asset the console references exists in app/www", () => {
  execFileSync("node", ["app/scripts/sync-web.mjs"], { cwd: path.join(__dirname, "..") });
  const www = path.join(__dirname, "..", "app", "www");
  // Check installer.html (the console) for bundled asset refs
  const installer = fs.readFileSync(path.join(www, "installer.html"), "utf8");
  const refs = new Set();
  for (const m of installer.matchAll(/(?:src|href)="(\/[^"]+)"/g)) refs.add(m[1]);
  for (const m of installer.matchAll(/serviceWorker\.register\('(\/[^']+)'\)/g)) refs.add(m[1]);
  for (const ref of refs) {
    if (ref.startsWith("/.netlify/")) continue; // runtime API call, not a bundled asset
    if (ref.endsWith(".html")) continue; // page links resolve against the live site
    if (!ref.includes(".")) continue; // bare paths like /amsoil-garage are web routes, not files
    assert.ok(fs.existsSync(path.join(www, ref.slice(1))), `missing bundled asset: ${ref}`);
  }
});
