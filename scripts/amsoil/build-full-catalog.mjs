// scripts/amsoil/build-full-catalog.mjs
// Phase-1 master-catalog pipeline: parse the owner's authoritative "AMSOIL U.S.
// Pricing" sheet (scripts/amsoil/data/us-pricing.csv — Category, Product,
// Stock No., Pkg./Size, Wholesale, P.C., MSRP, Online/Catalog, UPC) into the
// PUBLIC full-line catalog site/amsoil-catalog-full.json that powers the Tier-2
// category hubs + on-site product search.
//
// PRIVACY RULE: the Wholesale (dealer-cost) column NEVER reaches the output —
// only Online/Catalog retail and the P.C. price (both shown publicly on
// amsoil.com) plus UPC (printed on packaging). Guarded by tests.
//
// One catalog entry per unique (category, product name); package variants are
// collapsed under `variants`, with the primary variant = the single-unit retail
// pack a shopper would buy first (Quart Bottle -EA > Each -EA > any -EA > first).
// Run: node scripts/amsoil/build-full-catalog.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.join(ROOT, "scripts", "amsoil", "data", "us-pricing.csv");
const OUT = path.join(ROOT, "site", "amsoil-catalog-full.json");

// Minimal RFC-4180 CSV parser (quoted fields may contain commas).
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const num = (v) => { const n = parseFloat(String(v).replace(/[^0-9.]/g, "")); return isNaN(n) ? null : n; };
const cleanUpc = (v) => String(v || "").replace(/^'/, "").trim();

// Rank a variant row for "primary" selection — lower is better.
function variantRank(v) {
  const ea = /-EA$/i.test(v.stockNo), pkg = v.pkg.toLowerCase();
  if (ea && /quart bottle/.test(pkg)) return 0;
  if (ea && /\beach\b/.test(pkg)) return 1;
  if (ea) return 2;
  return 3;
}

export function buildFullCatalog(csvText) {
  const rows = parseCsv(csvText);
  const header = rows[0].map((h) => h.trim());
  const col = (name) => header.findIndex((h) => h.toLowerCase().startsWith(name));
  const iCat = col("category"), iName = col("product"), iStock = col("stock"),
    iPkg = col("pkg"), iPc = col("p.c."), iOnline = col("online"), iUpc = col("upc");
  if ([iCat, iName, iStock, iPkg, iPc, iOnline].some((i) => i < 0)) throw new Error("pricing CSV header mismatch");
  const byKey = new Map();
  for (const r of rows.slice(1)) {
    const category = (r[iCat] || "").trim(), name = (r[iName] || "").trim();
    const stockNo = (r[iStock] || "").trim();
    if (!category || !name || !stockNo) continue;
    const v = { stockNo, pkg: (r[iPkg] || "").trim(), retail: num(r[iOnline]), pc: num(r[iPc]), upc: cleanUpc(r[iUpc]) };
    if (v.retail == null || v.retail <= 0) continue;   // unsellable row
    const key = `${category}||${name}`;
    (byKey.get(key) || byKey.set(key, []).get(key)).push(v);
  }
  const products = [...byKey.entries()].map(([key, variants]) => {
    const [category, name] = key.split("||");
    variants.sort((a, b) => variantRank(a) - variantRank(b) || a.retail - b.retail);
    const p = variants[0];
    return { name, category, stockNo: p.stockNo, pkg: p.pkg, retail: p.retail, pc: p.pc, upc: p.upc,
      variants: variants.map(({ stockNo, pkg, retail, pc }) => ({ stockNo, pkg, retail, pc })) };
  }).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  return { updated: "2026-07-24", source: "AMSOIL U.S. Pricing sheet (owner-provided)", count: products.length, products };
}

if (process.argv[1] && process.argv[1].endsWith("build-full-catalog.mjs")) {
  const cat = buildFullCatalog(fs.readFileSync(SRC, "utf8"));
  fs.writeFileSync(OUT, JSON.stringify(cat, null, 1) + "\n");
  const cats = new Set(cat.products.map((p) => p.category));
  console.log(`full catalog: ${cat.count} products, ${cats.size} categories -> site/amsoil-catalog-full.json`);
  for (const c of [...cats].sort()) console.log(` ${c}: ${cat.products.filter((p) => p.category === c).length}`);
}
