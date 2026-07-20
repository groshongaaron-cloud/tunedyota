// Re-apply the shared naming + categorization rules (amsoil-categorize.mjs) to
// the EXISTING site/amsoil-catalog.json in place — no re-scrape, keeps `img`
// fields. Run after tightening rules; the full rebuild (amsoil-catalog.mjs)
// uses the same module so both stay in agreement.
import fs from "node:fs";
import { cleanName, categorize } from "./amsoil-categorize.mjs";

const path = "./site/amsoil-catalog.json";
const cat = JSON.parse(fs.readFileSync(path, "utf8"));
let renamed = 0, moved = 0;
for (const p of cat.products) {
  const n = cleanName(p.name);
  const c = categorize(n, p.code);
  if (n !== p.name) { console.log(`name: ${p.name} -> ${n}`); p.name = n; renamed++; }
  if (c !== p.category) { console.log(`cat:  ${p.code} ${p.category} -> ${c}`); p.category = c; moved++; }
}
cat.products.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
const byCat = {};
for (const p of cat.products) byCat[p.category] = (byCat[p.category] || 0) + 1;
cat.categories = byCat;
fs.writeFileSync(path, JSON.stringify(cat) + "\n");
console.log(`recategorized: ${moved} moved, ${renamed} renamed; ${byCat["Other Specialty"] || 0} remain in Other Specialty`);
