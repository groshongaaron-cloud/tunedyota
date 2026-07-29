// Banks Power catalog generator — from the committed site scrape
// (data/banks-site-scrape.json, public bankspower.com retail pricing) build:
//   1. site/banks-catalog.js — window.BANKS_CATALOG applications for the
//      client-app product line (Toyota + Lexus fitment front and center).
//   2. site/banks-catalog.json — server-side SKU → {name, retail} lookup for
//      netlify/functions/banks-reserve.js (prices resolve server-side; the
//      browser only ever sends SKUs).
// Fitment comes from Banks' own structured tags (Year_Make_Model_Engine),
// parsed into fitment[] at scrape time — no hand-maintained fitment here.
// Reserve mode until the Banks dealer price sheet lands; when it does, a
// price-file ingest (Magnuson pattern, same confidentiality bar) supersedes
// the scrape as the pricing source and checkout flips to converge.
// Run: node scripts/banks/build-catalog.mjs   (also via npm run build:banks-store)
import fs from "node:fs";

const SCRAPE = JSON.parse(fs.readFileSync("data/banks-site-scrape.json", "utf8"));
const APP_MAKES = new Set(["Toyota", "Lexus"]);

const yearsLabel = (years) => {
  const ys = [...new Set(years)].sort((a, b) => a - b);
  return ys.length === 1 ? String(ys[0]) : `${ys[0]}–${ys[ys.length - 1]}`;
};

// One application per (vehicle, engine, years) — products sharing the fitment
// merge into one kits[] list, mirroring the Magnuson catalog shape.
export function buildApplications(products) {
  const apps = new Map();
  for (const p of products) {
    const priced = (p.variants || []).filter((v) => v.sku && v.price != null);
    if (!priced.length) continue; // coming-soon: store page only, not reservable
    const groups = new Map(); // lower "make|model|engine" -> {label, years}
    for (const f of p.fitment || []) {
      if (!APP_MAKES.has(f.make)) continue;
      const k = `${f.make}|${f.model}|${f.engine}`.toLowerCase();
      if (!groups.has(k)) groups.set(k, { labels: new Map(), years: new Set() });
      const g = groups.get(k);
      const label = `${f.make}|${f.model}|${f.engine}`;
      g.labels.set(label, (g.labels.get(label) || 0) + 1);
      g.years.add(f.year);
    }
    for (const [, g] of groups) {
      const years = g.years;
      // Tag casing drifts ("4runner"/"4Runner") — keep the most common form.
      const [make, model, engine] = [...g.labels.entries()].sort((a, b) => b[1] - a[1])[0][0].split("|");
      const appKey = `${make} ${model}|${engine}|${yearsLabel([...years])}`;
      if (!apps.has(appKey)) {
        apps.set(appKey, { vehicle: `${make} ${model}`, years: yearsLabel([...years]), engine, kits: [] });
      }
      for (const v of priced) {
        apps.get(appKey).kits.push({
          sku: v.sku,
          name: v.title ? `${p.title} — ${v.title}` : p.title,
          retail: v.price,
          note: p.category || undefined,
          slug: p.storeSlug || undefined,
        });
      }
    }
  }
  // Toyota before Lexus, then by vehicle name and years.
  return [...apps.values()].sort((a, b) =>
    (a.vehicle.startsWith("Lexus") ? 1 : 0) - (b.vehicle.startsWith("Lexus") ? 1 : 0) ||
    a.vehicle.localeCompare(b.vehicle) || a.years.localeCompare(b.years));
}

export function buildSkuIndex(products) {
  const out = {};
  for (const p of products) {
    for (const v of p.variants || []) {
      if (!v.sku || v.price == null) continue;
      out[v.sku] = { sku: v.sku, name: v.title ? `${p.title} — ${v.title}` : p.title, retail: v.price };
    }
  }
  return out;
}

function main() {
  // storeSlug lets app kit rows deep-link their store page when it exists.
  let slugs = {};
  try { slugs = JSON.parse(fs.readFileSync("site/banks-slugs.json", "utf8")); } catch { /* store not built yet */ }
  for (const p of SCRAPE.products) {
    const first = (p.variants || []).find((v) => v.sku && slugs[v.sku]);
    if (first) p.storeSlug = slugs[first.sku];
  }

  const applications = buildApplications(SCRAPE.products);
  const kitCount = applications.reduce((s, a) => s + a.kits.length, 0);

  const js = `/* ═══════════════════════════════════════════════════════════════
   TUNED YOTA · Banks Power catalog — GENERATED, do not hand-edit.
   Source: bankspower.com public retail (scraped ${SCRAPE.scraped}) via
   scripts/banks/build-catalog.mjs. Toyota & Lexus applications only —
   the full line lives in the Banks store pages (/banks-products).
   Reserve mode: prices shown are Banks' published retail; payment is
   completed personally (dealer Converge checkout arrives with the
   Banks dealer price sheet).
   ═══════════════════════════════════════════════════════════════ */
window.BANKS_CATALOG = ${JSON.stringify({ updated: SCRAPE.scraped, applications }, null, 2)};
`;
  fs.writeFileSync("site/banks-catalog.js", js);
  fs.writeFileSync("site/banks-catalog.json", JSON.stringify({ updated: SCRAPE.scraped, products: buildSkuIndex(SCRAPE.products) }, null, 1) + "\n");
  console.log(`banks catalog: ${applications.length} Toyota/Lexus applications, ${kitCount} kit rows; sku index ${Object.keys(buildSkuIndex(SCRAPE.products)).length}`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) main();
