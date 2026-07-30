// Banks Power emission in the Google Merchant Center feed generator
// (scripts/build-merchant-feed.mjs). The feed is gated on the Banks product
// line's checkout mode in site/product-lines.js: "reserve" = no Banks items;
// "converge" = Banks ships. These tests import the emission function directly
// and force the mode, so they hold regardless of the live gate value.
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { emitBanksItems, banksCheckoutMode } from "../scripts/build-merchant-feed.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SCRAPE = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "banks-site-scrape.json"), "utf8"));

const converge = () => emitBanksItems({ scrape: SCRAPE, checkoutMode: "converge" });
const idOf = (item) => (item.match(/<g:id>([^<]+)<\/g:id>/) || [])[1];

test("gate closed: reserve mode emits zero Banks items", () => {
  assert.deepStrictEqual(emitBanksItems({ scrape: SCRAPE, checkoutMode: "reserve" }), []);
  assert.deepStrictEqual(emitBanksItems({ scrape: SCRAPE, checkoutMode: "referral" }), []);
  assert.deepStrictEqual(emitBanksItems({ scrape: SCRAPE, checkoutMode: undefined }), []);
});

test("gate reads the banks line's checkout mode from product-lines.js", () => {
  const mode = banksCheckoutMode();
  assert.ok(["reserve", "converge", "referral"].includes(mode), `unexpected mode ${mode}`);
  // Live registry is the single source of truth — no Banks items unless converge.
  const live = emitBanksItems({ scrape: SCRAPE, checkoutMode: mode });
  if (mode !== "converge") assert.strictEqual(live.length, 0);
});

test("gate open: emits Banks items (446 for the committed scrape)", () => {
  const items = converge();
  assert.ok(items.length > 0, "converge should emit items");
  assert.strictEqual(items.length, 446);
});

test("known part maps every required field correctly", () => {
  // 63397 iDash Stealth Pod — fitment-specific (2025–2026 4Runner), $109.
  const item = converge().find((i) => idOf(i) === "63397");
  assert.ok(item, "63397 not emitted");
  assert.match(item, /<g:id>63397<\/g:id>/);
  assert.match(item, /<g:mpn>63397<\/g:mpn>/);
  assert.match(item, /<g:brand>Banks Power<\/g:brand>/);
  assert.match(item, /<g:condition>new<\/g:condition>/);
  assert.match(item, /<g:availability>in_stock<\/g:availability>/);
  assert.match(item, /<g:price>109\.00 USD<\/g:price>/);
  assert.match(item, /<g:link>https:\/\/tunedyota\.com\/banks-idash-stealth-pod-63397<\/g:link>/);
  assert.match(item, /<g:image_link>https:\/\/[^<]+<\/g:image_link>/);
  // authorized-dealer line mirrors the Magnuson description pattern
  assert.match(item, /Sold by Tuned Yota, an authorized Banks Power dealer\./);
  // gauges/electronics → electronics subcategory
  assert.match(item, /Motor Vehicle Electronics<\/g:google_product_category>/);
});

test("verbatim fitment years in title for fitment-specific parts, never compressed", () => {
  const item = converge().find((i) => idOf(i) === "63397");
  // 2025 and 2026 are one contiguous run for the 4Runner — kept verbatim.
  assert.match(item, /<g:title>[^<]*4Runner 2025–2026[^<]*<\/g:title>/);
});

test("engine/airflow families map to Motor Vehicle Engine Parts", () => {
  // 42291 Banks Ram-Air (Cold Air Intakes and Manifolds).
  const item = converge().find((i) => idOf(i) === "42291");
  assert.ok(item, "42291 not emitted");
  assert.match(item, /Motor Vehicle Engine Parts<\/g:google_product_category>/);
});

test("exclusions: gift card, apparel, emblems, and in-development never emit", () => {
  const items = converge();
  const ids = new Set(items.map(idOf));
  // Gift card variants (sku 98000-*) — excluded by title.
  for (const sku of ["98000-25", "98000-100", "98000-4000"]) assert.ok(!ids.has(sku), `gift card ${sku} leaked`);

  // Apparel / Emblems categories — excluded by category, verified against source.
  const merchSkus = [];
  for (const p of SCRAPE.products) {
    if (p.category === "Apparel" || p.category === "Emblems") {
      for (const v of p.variants || []) if (v.sku) merchSkus.push(v.sku);
    }
  }
  assert.ok(merchSkus.length > 0, "test fixture has no apparel/emblems to check");
  for (const sku of merchSkus) assert.ok(!ids.has(sku), `merch sku ${sku} leaked into feed`);

  // In-development (comingSoon / In_Development.jpg) products — excluded.
  const inDevSkus = [];
  for (const p of SCRAPE.products) {
    if (p.comingSoon === true || /In_Development/i.test(p.image || "")) {
      for (const v of p.variants || []) if (v.sku) inDevSkus.push(v.sku);
    }
  }
  assert.ok(inDevSkus.length > 0, "test fixture has no in-development products to check");
  for (const sku of inDevSkus) assert.ok(!ids.has(sku), `in-development sku ${sku} leaked into feed`);
});

test("null/absent-price and out-of-stock variants are excluded", () => {
  const items = converge();
  const ids = new Set(items.map(idOf));
  // Build the set of variants that SHOULD emit under the same rules and confirm
  // no null-price / unavailable variant slipped in.
  const MERCH = new Set(["Apparel", "Emblems"]);
  for (const p of SCRAPE.products) {
    const excludedProduct = /gift card/i.test(p.title || "") || MERCH.has(p.category) ||
      p.comingSoon === true || /In_Development/i.test(p.image || "");
    for (const v of p.variants || []) {
      if (!v.sku) continue;
      if (v.price == null && ids.has(v.sku)) assert.fail(`null-price sku ${v.sku} emitted`);
      if (v.available === false && !excludedProduct && ids.has(v.sku)) assert.fail(`out-of-stock sku ${v.sku} emitted`);
    }
  }
});

test("no wholesale or dealer-level pricing language anywhere in Banks items", () => {
  const xml = converge().join("\n");
  for (const banned of [/jobber/i, /wholesale/i, /dealer pric/i, /dealer plus/i, /distributor pric/i, /trade price/i]) {
    assert.ok(!banned.test(xml), `wholesale leak: ${banned}`);
  }
});

test("every Banks g:link is a clean tunedyota.com/banks- URL (never .html)", () => {
  for (const item of converge()) {
    const link = (item.match(/<g:link>([^<]+)<\/g:link>/) || [])[1];
    assert.ok(link, "item missing g:link");
    assert.match(link, /^https:\/\/tunedyota\.com\/banks-[a-z0-9-]+$/, `bad link ${link}`);
    assert.ok(!link.endsWith(".html"), `link is .html: ${link}`);
  }
});

test("no g:shipping on Banks items (no Banks shipping data to fabricate)", () => {
  for (const item of converge()) assert.ok(!/<g:shipping>/.test(item), "Banks item fabricated a shipping rate");
});

test("g:id is unique across all emitted Banks items", () => {
  const ids = converge().map(idOf);
  assert.strictEqual(ids.length, new Set(ids).size, "duplicate g:id in Banks items");
});
