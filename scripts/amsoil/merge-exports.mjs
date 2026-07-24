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

const normalize = (r) => {
  const out = {
    product_url: r.product_url ?? r.page_url, product_name: r.product_name, page_title: r.page_title,
    product_description: r.product_description, data_source_format: r.data_source_format ?? r.source_format,
    offer_price: r.offer_price ?? r.price_usd ?? r.base_price ?? r.price ?? null,
    all_available_prices: r.all_available_prices ?? r.all_prices_usd ?? r.all_prices ?? "",
    available_sizes: r.available_sizes ?? r.package_size ?? r.product_size ?? "",
    variant_skus: r.variant_skus ?? "",
    customer_rating: r.customer_rating ?? (typeof r.average_rating === "string" ? r.average_rating : (r.average_rating != null && r.total_review_count != null ? `${r.average_rating} (${r.total_review_count})` : "")),
    total_reviews: r.total_reviews ?? r.total_review_count ?? null,
    breadcrumb_navigation: r.breadcrumb_navigation ?? "",
    main_product_image: r.main_product_image ?? r.product_image ?? "",
  };
  // Raw JSON-LD is the ONLY trustworthy SKU→size→price mapping (the flattened
  // All Prices column is sorted ascending, NOT aligned to Variant SKUs — never
  // zip them). Parse the ProductGroup: hasVariant[] gives per-variant price +
  // size; aggregateRating gives the published rating verbatim.
  const raw = r.raw_json_ld_data ?? r.s0_json_ld___raw_jsonld ?? r.raw_jsonld;
  if (raw) {
    try {
      const ld = JSON.parse(raw);
      const nodes = Array.isArray(ld) ? ld : (ld["@graph"] || [ld]);
      const g = nodes.find((n) => n && /ProductGroup|Product/.test(String(n["@type"]))) || {};
      out.product_name = g.name || out.product_name;
      const ar = g.aggregateRating;
      if (ar && ar.ratingValue != null) {
        const rc = ar.reviewCount ?? ar.ratingCount ?? 0;
        out.customer_rating = `${ar.ratingValue} (${rc})`;
        out.total_reviews = parseInt(rc, 10) || out.total_reviews;
      }
      const hv = g.hasVariant;
      if (Array.isArray(hv) && hv.length) {
        out.variants_ld = hv.map((v) => {
          const o = Array.isArray(v.offers) ? v.offers[0] : (v.offers || {});
          return { sku: v.sku, size: v.size || v.name || "", price: parseFloat(o.price) || null };
        }).filter((v) => v.sku);
        if (!out.variant_skus) out.variant_skus = out.variants_ld.map((v) => v.sku).join(", ");
        if (out.offer_price == null) {
          const ea = out.variants_ld.find((v) => /-EA$/i.test(v.sku) && v.price);
          out.offer_price = (ea || out.variants_ld[0] || {}).price ?? null;
        }
      }
    } catch { /* keep flattened fields */ }
  }
  return out;
};

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
    if (!n.product_url) continue;
    // Dedupe rule (per the fuel-additives handoff): the row WITH raw JSON-LD
    // (variants_ld) wins — failed-capture rows are meta-only junk that must
    // never shadow a good retry row.
    const prev = byUrl.get(n.product_url);
    if (!prev || (!prev.variants_ld && n.variants_ld)) byUrl.set(n.product_url, n);
  }
}
const out = [...byUrl.values()];
const dest = path.join(ROOT, "data", "amsoil", `${slug}.json`);
fs.writeFileSync(dest, JSON.stringify(out, null, 1) + "\n");
console.log(`merged ${out.length} records -> data/amsoil/${slug}.json`);
