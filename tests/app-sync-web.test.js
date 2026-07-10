const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

test("sync-web copies the console + its assets into app/www with index.html", () => {
  execFileSync("node", ["app/scripts/sync-web.mjs"], { cwd: path.join(__dirname, "..") });
  const www = path.join(__dirname, "..", "app", "www");
  assert.ok(fs.existsSync(path.join(www, "index.html")), "index.html (from installer.html)");
  assert.ok(fs.existsSync(path.join(www, "site.css")), "site.css");
  assert.ok(fs.existsSync(path.join(www, "vendor", "zxing.min.js")), "vendor/zxing.min.js");
  const idx = fs.readFileSync(path.join(www, "index.html"), "utf8");
  assert.match(idx, /Installer Console/);
});
