// scripts/amsoil/ingest-scrape.mjs
// Ingest the owner's amsoil.com category scrapes (data/amsoil/<category>.json —
// one array of product records per file) into a normalized overlay keyed by
// primary stock number: scripts/amsoil/data/scrape-overlay.json. The overlay
// carries the highest-fidelity per-product facts (authoritative /p/ path,
// current price, customer rating + review count, official description) and is
// consumed by the page generators.
//
// COMPLIANCE: ratings are for VISIBLE display with attribution only — they are
// never emitted as schema aggregateRating (borrowed ratings in structured data
// = misrepresentation risk; owner rule 2026-07-12, test-guarded).
//
// Also RECONCILES against our catalog + enrichment and prints discrepancies
// (price drift, path mismatches) so the scrape raises data quality everywhere.
// Run: node scripts/amsoil/ingest-scrape.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRAPE_DIR = path.join(ROOT, "data", "amsoil");
const OUT = path.join(ROOT, "scripts", "amsoil", "data", "scrape-overlay.json");
const FULL = JSON.parse(fs.readFileSync(path.join(ROOT, "site", "amsoil-catalog-full.json"), "utf8"));
let ENRICH = { products: {} };
try { ENRICH = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "amsoil", "data", "enrichment.json"), "utf8")); } catch { /* ok */ }

const byStock = new Map();
FULL.products.forEach((p) => { if (!byStock.has(p.stockNo)) byStock.set(p.stockNo, p); p.variants.forEach((v) => { if (!byStock.has(v.stockNo)) byStock.set(v.stockNo, p); }); });
const CUR = JSON.parse(fs.readFileSync(path.join(ROOT, "site", "amsoil-garage.json"), "utf8"));
const curated = new Set(Object.values(CUR.products).map((p) => p.stockNo));

const files = fs.existsSync(SCRAPE_DIR) ? fs.readdirSync(SCRAPE_DIR).filter((f) => f.endsWith(".json")) : [];
const overlay = {};
const issues = [];
let records = 0;

for (const f of files) {
  let arr;
  try { arr = JSON.parse(fs.readFileSync(path.join(SCRAPE_DIR, f), "utf8")); } catch (e) { issues.push(`${f}: unparseable (${e.message})`); continue; }
  if (!Array.isArray(arr)) { issues.push(`${f}: expected an array of product records`); continue; }
  for (const r of arr) {
    records++;
    const skus = String(r.variant_skus || "").split(/\s*,\s*/).filter(Boolean);
    // Prefer the variant our catalog knows (aliases like AZOQTC-EA appear on
    // some pages) — resolved to the catalog's PRIMARY stockNo — then any -EA.
    const known = skus.find((s) => byStock.has(s));
    const primary = known ? byStock.get(known).stockNo : (skus.find((s) => /-EA$/i.test(s)) || skus[0]);
    if (!primary) { issues.push(`${f}: unmapped record (${(r.page_title || r.product_name || "?").slice(0, 60)})`); continue; }
    let p = null;
    try { p = new URL(r.product_url).pathname; } catch { /* keep null */ }
    const rate = String(r.customer_rating || "").match(/^([\d.]+)\s*\(([\d,]+)\)/);
    const entry = {
      path: p,
      price: parseFloat(r.offer_price ?? r.price_usd ?? r.base_price) || null,
      rating: rate ? parseFloat(rate[1]) : null,
      reviews: rate ? parseInt(rate[2].replace(/,/g, ""), 10) : (parseInt(r.total_reviews, 10) || null),
      name: r.product_name || null,
      source: f,
    };
    // Per-variant SKU→size→price from raw JSON-LD (the only aligned mapping).
    if (Array.isArray(r.variants_ld) && r.variants_ld.length) {
      entry.variants = {};
      for (const v of r.variants_ld) entry.variants[v.sku] = { price: v.price, size: v.size };
      const mine = entry.variants[primary];
      if (mine && mine.price > 0) entry.price = mine.price;
    }
    overlay[primary] = entry;
    // Reconcile against our data.
    const cat = byStock.get(primary);
    if (!cat) { issues.push(`${primary}: in scrape but NOT in pricing-sheet catalog (${(r.product_name || "").slice(0, 50)})`); continue; }
    // Price check against ALL scraped prices — the page's default offer is
    // often a different pack size (e.g. half-quart), which is not drift.
    const allPrices = String(r.all_available_prices || r.all_prices_usd || "").match(/[\d.]+/g)?.map(Number) || [entry.price];
    if (entry.price != null && !allPrices.some((x) => Math.abs(x - cat.retail) < 0.005) && Math.abs(entry.price - cat.retail) > 0.005) {
      issues.push(`${cat.stockNo}: price drift — scrape ${allPrices.join("/")} vs sheet $${cat.retail.toFixed(2)}`);
    }
    entry.price = allPrices.find((x) => Math.abs(x - cat.retail) < 0.005) ?? entry.price;
    const e = ENRICH.products[cat.stockNo];
    if (e && p && e.path !== p) issues.push(`${cat.stockNo}: path mismatch — scrape ${p} vs enrichment ${e.path}`);
    if (!e && p && !curated.has(cat.stockNo)) issues.push(`${cat.stockNo}: scrape has path ${p} but product is NOT enriched (recoverable!)`);
  }
}

fs.writeFileSync(OUT, JSON.stringify({ updated: "2026-07-25", files, count: Object.keys(overlay).length, products: overlay }, null, 1) + "\n");
console.log(`overlay: ${Object.keys(overlay).length} products from ${files.length} file(s), ${records} records`);
console.log(issues.length ? `RECONCILIATION (${issues.length}):\n` + issues.map((i) => "  " + i).join("\n") : "reconciliation clean — scrape agrees with catalog + enrichment");
