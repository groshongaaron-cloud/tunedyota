// tests/seo-aeo.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const SITE = path.join(__dirname, "..", "site");
const read = (f) => fs.readFileSync(path.join(SITE, f), "utf8");

test("homepage business schema names the founder as a Person", () => {
  const blocks = [...read("index.html").matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const biz = blocks.find((b) => b["@id"] === "https://tunedyota.com/#business");
  assert.ok(biz, "business node present");
  assert.ok(biz.founder, "founder present");
  assert.equal(biz.founder["@type"], "Person");
  assert.equal(biz.founder.name, "Aaron Groshong");
  assert.ok(/VFTuner/.test(biz.founder.jobTitle || ""), "founder jobTitle mentions VFTuner");
});

test("llms.txt carries citable Key Facts + FAQ", () => {
  const t = read("llms.txt");
  assert.ok(/## Key facts/i.test(t), "Key facts section");
  assert.ok(/## FAQ/i.test(t), "FAQ section");
  assert.ok(/from \$\d/i.test(t), "a 'from $' price appears");
  assert.ok(/VFTuner PRO/.test(t), "authorization mentioned");
});
