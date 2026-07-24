// tests/amsoil-garage-gasoline.test.js
// Guards the /amsoil-garage gasoline motor-oil storefront (owner-scrape-driven,
// injected between AMSOIL:GASOLINE markers): cards only for products meeting
// the quality bar (internal landing page + SELF-HOSTED image — never an
// amsoil.com hotlink), referral outbound links, scrape-dated price note, and
// no borrowed ratings in structured data.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SITE = path.join(__dirname, "..", "site");

test("garage gasoline showcase renders from the scrape with self-hosted images", () => {
  const html = fs.readFileSync(path.join(SITE, "amsoil-garage.html"), "utf8");
  const block = (html.match(/<!-- AMSOIL:GASOLINE:START -->([\s\S]*?)<!-- AMSOIL:GASOLINE:END -->/) || [])[1];
  assert.ok(block, "AMSOIL:GASOLINE block missing");
  const cards = (block.match(/class="gaso-card"/g) || []).length;
  assert.ok(cards >= 30, `expected 30+ gasoline oil cards, got ${cards}`);
  assert.ok(!/img src="https?:\/\/(www\.)?amsoil\.com/.test(block), "hotlinked amsoil.com image in showcase");
  const imgs = [...block.matchAll(/<img src="(\/images\/amsoil\/[^"]+)"/g)].map((m) => m[1]);
  assert.equal(imgs.length, cards, "every card needs a self-hosted image");
  for (const i of imgs) assert.ok(fs.existsSync(path.join(SITE, i.replace(/^\//, ""))), `image missing on disk: ${i}`);
  assert.ok(block.includes("zo=30713116"), "outbound links missing referral");
  assert.match(block, /Prices as of \d{4}-\d{2}-\d{2}/, "scrape-dated price note missing");
  assert.ok((block.match(/data-visc="0W-20"/g) || []).length >= 1, "viscosity derivation broken");
  assert.ok(!block.includes("aggregateRating"), "borrowed rating leaked into markup");
});
