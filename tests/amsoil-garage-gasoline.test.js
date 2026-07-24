// tests/amsoil-garage-gasoline.test.js
// Guards the /amsoil-garage mega-store (per-category groups injected between
// AMSOIL:MEGASTORE markers): broad coverage, cards only for products meeting
// the quality bar (internal landing page + SELF-HOSTED image — never an
// amsoil.com hotlink), referral outbound links, hub link per group,
// scrape-dated price note, and no borrowed ratings in structured data.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SITE = path.join(__dirname, "..", "site");

test("garage mega-store renders per-category groups with self-hosted images", () => {
  const html = fs.readFileSync(path.join(SITE, "amsoil-garage.html"), "utf8");
  const block = (html.match(/<!-- AMSOIL:MEGASTORE:START -->([\s\S]*?)<!-- AMSOIL:MEGASTORE:END -->/) || [])[1];
  assert.ok(block, "AMSOIL:MEGASTORE block missing");
  const cards = (block.match(/class="gaso-card"/g) || []).length;
  const groups = (block.match(/class="mega-grp"/g) || []).length;
  assert.ok(cards >= 200, `expected 200+ cards across the store, got ${cards}`);
  assert.ok(groups >= 25, `expected 25+ category groups, got ${groups}`);
  assert.ok(!/img src="https?:\/\/(www\.)?amsoil\.com/.test(block), "hotlinked amsoil.com image in mega-store");
  const imgs = [...block.matchAll(/<img src="(\/images\/amsoil\/[^"]+)"/g)].map((m) => m[1]);
  for (const i of imgs) assert.ok(fs.existsSync(path.join(SITE, i.replace(/^\//, ""))), `image missing on disk: ${i}`);
  assert.ok(block.includes("zo=30713116"), "outbound links missing referral");
  assert.match(block, /Prices as of \d{4}-\d{2}-\d{2}/, "scrape-dated price note missing");
  // Every group links its full-line hub; jump nav present.
  const hubLinks = (block.match(/href="amsoil-[a-z0-9-]+-products\.html"/g) || []).length;
  assert.ok(hubLinks >= groups, "each group needs its hub link");
  assert.ok(block.includes('class="mega-nav"'), "jump nav missing");
  assert.ok(!block.includes("aggregateRating"), "borrowed rating leaked into markup");
});
