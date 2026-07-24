// scripts/amsoil/merge-exports.mjs
// Merge one or more Ultimate Web Scraper JSON exports (URLs or local files)
// into one canonical, key-normalized category file for data/amsoil/.
// Handles the recurring main+retry export pattern: key variants are aliased
// (price_usd/offer_price, average_rating+total_review_count/customer_rating),
// records dedupe by product_url (first occurrence wins).
// Run: node scripts/amsoil/merge-exports.mjs <category-slug> <url-or-file> [more...]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const [slug, ...sources] = process.argv.slice(2);
if (!slug || !sources.length) { console.error("usage: node merge-exports.mjs <category-slug> <url-or-file>..."); process.exit(1); }

const normalize = (r) => ({
  product_url: r.product_url, product_name: r.product_name, page_title: r.page_title,
  product_description: r.product_description, data_source_format: r.data_source_format,
  offer_price: r.offer_price ?? r.price_usd ?? null,
  all_available_prices: r.all_available_prices ?? "", available_sizes: r.available_sizes ?? "",
  variant_skus: r.variant_skus ?? "",
  customer_rating: r.customer_rating ?? (r.average_rating != null && r.total_review_count != null ? `${r.average_rating} (${r.total_review_count})` : ""),
  total_reviews: r.total_reviews ?? r.total_review_count ?? null,
  breadcrumb_navigation: r.breadcrumb_navigation ?? "",
  main_product_image: r.main_product_image ?? "",
});

const byUrl = new Map();
for (const src of sources) {
  let text;
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src);
    if (!res.ok) { console.error(`${src.slice(0, 60)}...: HTTP ${res.status}`); process.exit(1); }
    text = await res.text();
  } else text = fs.readFileSync(src, "utf8");
  const arr = JSON.parse(text);
  if (!Array.isArray(arr)) { console.error(`${src.slice(0, 60)}: not an array`); process.exit(1); }
  for (const r of arr) {
    const n = normalize(r);
    if (n.product_url && !byUrl.has(n.product_url)) byUrl.set(n.product_url, n);
  }
}
const out = [...byUrl.values()];
const dest = path.join(ROOT, "data", "amsoil", `${slug}.json`);
fs.writeFileSync(dest, JSON.stringify(out, null, 1) + "\n");
console.log(`merged ${out.length} records -> data/amsoil/${slug}.json`);
