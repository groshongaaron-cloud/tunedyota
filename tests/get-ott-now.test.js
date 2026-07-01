const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

test("netlify.toml redirects /get-ott-now into the funnel with the campaign tag", () => {
  const t = read("netlify.toml");
  assert.match(t, /from\s*=\s*"\/get-ott-now"/);
  assert.match(t, /to\s*=\s*"\/find-your-exact-tune\?[^"]*utm_campaign=get-ott-now/);
});
test("homepage has the Get OTT Now CTA, a share trigger, and the share script", () => {
  const h = read("site/index.html");
  assert.match(h, /Get OTT Now!/);
  assert.match(h, /data-share-ott/);
  assert.match(h, /share\.js/);
});
test("funnel page has a share trigger and the share script", () => {
  const h = read("site/find-your-exact-tune.html");
  assert.match(h, /data-share-ott/);
  assert.match(h, /share\.js/);
});
