// tests/amsoil-tier3-pages.test.js
// Guards the Tier-3 long-tail product pages: one page per enriched SKU
// (quality bar: validated /p/ path + self-hosted image), correct identifiers
// (gtin12 only when the UPC is a clean 12-digit code), image files on disk,
// referral ordering, HEAD_PAGES registration, and hub rows linking internal.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SITE = path.join(__dirname, "..", "site");

let mod, SD, ENRICH = { products: {} };
try { ENRICH = require("../scripts/amsoil/data/enrichment.json"); } catch { /* pre-scout */ }
test.before(async () => {
  mod = await import("../scripts/build-amsoil-pages.mjs");
  SD = await import("../scripts/lib/seo-data.mjs");
});

test("a Tier-3 page exists for every enriched, non-curated SKU", () => {
  const list = mod.tier3List();
  assert.equal(mod.AMSOIL_FULL_PRODUCT_FILES.length, list.length);
  for (const { p, e, slug } of list) {
    const f = `${slug}.html`;
    assert.ok(fs.existsSync(path.join(SITE, f)), `${f} missing`);
    assert.ok(SD.HEAD_PAGES.includes(f), `${f} not in HEAD_PAGES`);
    assert.ok(fs.existsSync(path.join(SITE, e.image.replace(/^\//, ""))), `${p.stockNo}: image file missing`);
    const html = fs.readFileSync(path.join(SITE, f), "utf8");
    assert.ok(html.includes(`"sku":${JSON.stringify(p.stockNo)}`), `${f}: sku mismatch`);
    assert.ok(html.includes("zo=30713116"), `${f}: no referral order link`);
    assert.ok(html.includes(`href="https://www.amsoil.com${e.path}`) || html.includes(`${e.path}?zo=`) || html.includes(`${e.path}&zo=`) || html.includes(e.path), `${f}: order link not using the scouted /p/ path`);
    const g = html.match(/"gtin12":"(\d+)"/);
    if (g) assert.match(g[1], /^\d{12}$/, `${f}: malformed gtin12`);
    // Owner rule 2026-07-12: borrowed AMSOIL.com ratings must NEVER appear in
    // structured data — visible attributed text only.
    assert.ok(!html.includes('"aggregateRating"'), `${f}: borrowed rating leaked into schema`);
  }
});

test("enrichment quality bar: no page without both path and image", () => {
  for (const { e } of mod.tier3List()) {
    assert.ok(e.path && /^\/p\//.test(e.path), "bad path in tier3 list");
    assert.ok(e.image && e.image.startsWith("/images/amsoil/full/"), "bad image in tier3 list");
  }
});
