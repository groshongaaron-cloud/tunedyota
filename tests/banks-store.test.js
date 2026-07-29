// Banks Power store + product-line invariants
// (scripts/banks/build-store-pages.mjs, scripts/banks/build-catalog.mjs,
// site/product-lines.js banks line, netlify/functions/banks-reserve.js).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const SITE = path.join(__dirname, "..", "site");
const SCRAPE = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "banks-site-scrape.json"), "utf8"));
const SLUGS = JSON.parse(fs.readFileSync(path.join(SITE, "banks-slugs.json"), "utf8"));

function loadBanksCatalog() {
  const src = fs.readFileSync(path.join(SITE, "banks-catalog.js"), "utf8");
  const w = {};
  new Function("window", src)(w);
  return w.BANKS_CATALOG;
}

test("every store product page exists with canonical + Product schema; priced pages carry an Offer", () => {
  const pages = new Set(Object.values(SLUGS));
  assert.ok(pages.size >= 300, `expected 300+ unique product pages, got ${pages.size}`);
  let offers = 0, comingSoon = 0;
  for (const slug of pages) {
    const p = path.join(SITE, `${slug}.html`);
    assert.ok(fs.existsSync(p), `missing page ${slug}.html`);
    const html = fs.readFileSync(p, "utf8");
    assert.ok(html.includes(`<link rel="canonical" href="https://tunedyota.com/${slug}">`), `${slug}: canonical wrong`);
    assert.ok(/"@type":\s*"Product"/.test(html), `${slug}: no Product schema`);
    assert.ok(/"@type":\s*"BreadcrumbList"/.test(html), `${slug}: no breadcrumb schema`);
    if (/"@type":\s*"(Offer|AggregateOffer)"/.test(html)) offers++;
    else { comingSoon++; assert.ok(/Coming soon/i.test(html), `${slug}: unpriced page must say coming soon`); }
  }
  assert.ok(offers >= 280, `expected 280+ pages with offers, got ${offers}`);
});

test("all store page JSON-LD blocks are parseable", () => {
  for (const slug of new Set(Object.values(SLUGS))) {
    const html = fs.readFileSync(path.join(SITE, `${slug}.html`), "utf8");
    for (const m of html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)) {
      assert.doesNotThrow(() => JSON.parse(m[1]), `${slug}: unparseable JSON-LD`);
    }
  }
});

test("hub links every store product page, Toyota & Lexus section leads", () => {
  const hub = fs.readFileSync(path.join(SITE, "banks-products.html"), "utf8");
  for (const slug of new Set(Object.values(SLUGS))) {
    assert.ok(hub.includes(`href="/${slug}"`), `hub missing link to /${slug}`);
  }
  const tyPos = hub.indexOf('<h2 id="toyota-lexus"');
  assert.ok(tyPos !== -1, "hub missing Toyota & Lexus section");
  for (const other of ["performance-exhaust", "cold-air-intakes-and-manifolds"]) {
    const pos = hub.indexOf(`<h2 id="${other}"`);
    if (pos !== -1) assert.ok(tyPos < pos, `Toyota & Lexus section must precede ${other}`);
  }
});

test("reserve mode: store pages carry no Buy/checkout CTA, only contact CTAs", () => {
  for (const slug of [...new Set(Object.values(SLUGS))].slice(0, 40)) {
    const html = fs.readFileSync(path.join(SITE, `${slug}.html`), "utf8");
    assert.ok(!/data-buy=|Add to cart|Checkout/i.test(html), `${slug}: buy CTA on a reserve-mode page`);
    assert.ok(html.includes("Text us to reserve"), `${slug}: missing reserve CTA`);
  }
});

test("banks line registers in product-lines with reserve checkout and Toyota/Lexus fitment resolves", () => {
  const PL = require(path.join(SITE, "product-lines.js"));
  const line = PL.LINES.find((l) => l.id === "banks");
  assert.ok(line, "banks line missing from LINES");
  assert.strictEqual(line.checkout, "reserve");
  assert.deepStrictEqual(PL.ctasFor("reserve"), ["reserve", "referral"]);

  const catalog = loadBanksCatalog();
  assert.ok(catalog.applications.length >= 100, "banks catalog unexpectedly small");

  // 2024 Tacoma (garage option-value year format) → Ram-Air intake 42291 present.
  const tacoma = line.itemsFor({ make: "Toyota", model: "Tacoma", year: "2024|2.4L Gas" }, { banks: catalog });
  assert.ok(tacoma.length >= 3, `2024 Tacoma expected 3+ Banks items, got ${tacoma.length}`);
  assert.ok(tacoma.some((it) => it.sku === "42291"), "2024 Tacoma missing Ram-Air 42291");
  for (const it of tacoma) assert.ok(typeof it.price === "number" && it.price > 0, `${it.sku}: unpriced item in reserve line`);

  // 2025 4Runner (new gen) → iDash Stealth Pod 63397.
  const runner = line.itemsFor({ make: "Toyota", model: "4Runner", year: "2025" }, { banks: catalog });
  assert.ok(runner.some((it) => it.sku === "63397"), "2025 4Runner missing Stealth Pod 63397");

  // Lexus GX → PedalMonster fitment reaches Lexus.
  const gx = line.itemsFor({ make: "Lexus", model: "GX", year: "2008" }, { banks: catalog });
  assert.ok(gx.length >= 1, "2008 Lexus GX expected PedalMonster fitment");

  // No vehicle year → no fitment guess.
  assert.deepStrictEqual(line.itemsFor({ make: "Toyota", model: "Tacoma", year: null }, { banks: catalog }), []);
});

test("banks-reserve resolves SKUs server-side, drops unknowns, and composes the lead message", async () => {
  const { reserve, resolveKit, kitMessage } = require("../netlify/functions/banks-reserve.js");
  const kit = resolveKit(["42291", "NOPE-123", "63397"]);
  assert.strictEqual(kit.length, 2, "unknown SKU should be dropped");
  assert.ok(kit.every((k) => typeof k.price === "number" && k.price > 0));

  const msg = kitMessage({ vehicle: "2024 Toyota Tacoma", fulfillment: "pickup", kit, note: "" });
  assert.ok(msg.includes("Banks Power parts reservation — 2024 Toyota Tacoma"));
  assert.ok(msg.includes("no online payment"));

  // Full reserve flow with a stubbed ingest.
  let ingested = null;
  const out = await reserve(
    { name: "Test", email: "t@example.com", vehicle: "2024 Toyota Tacoma", kit: ["42291"] },
    { ingest: async (b) => { ingested = b; return { status: "ok" }; } });
  assert.deepStrictEqual(out, { status: "ok", items: 1 });
  assert.strictEqual(ingested.source, "banks-reserve");

  // Empty/unknown kit is rejected; honeypot silently accepts.
  const bad = await reserve({ name: "T", email: "t@x.com", kit: ["NOPE"] }, { ingest: async () => ({ status: "ok" }) });
  assert.strictEqual(bad.error, "empty-kit");
  const hp = await reserve({ name: "T", email: "t@x.com", company: "spam", kit: ["42291"] }, { ingest: async () => { throw new Error("must not ingest"); } });
  assert.strictEqual(hp.skipped, true);
});

test("catalog + store carry retail only and every scraped product has a page", () => {
  const catalog = loadBanksCatalog();
  const txt = JSON.stringify(catalog);
  for (const banned of [/jobber/i, /dealer price/i, /wholesale/i, /\bcost\b/i]) {
    assert.ok(!banned.test(txt), `dealer-pricing leak in app catalog: ${banned}`);
  }
  const paged = new Set(Object.values(SLUGS));
  assert.strictEqual(paged.size, SCRAPE.productCount, "every product gets exactly one page");
});
