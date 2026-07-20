// Phase 2: build the full AMSOIL product catalog from AMSOIL's sitemap (Firecrawl
// passes Cloudflare where curl can't). Derives name + product code + referral buy
// URL from each /p/ slug. Writes scripts/amsoil-catalog.json. Prices/sizes/images
// live on AMSOIL's side; the storefront hands off to amsoil.com under the ZO.
import fs from "node:fs";

const KEY = (() => { const c = JSON.parse(fs.readFileSync("C:/Users/grosh/.claude.json", "utf8")); let k = "";
  (function w(o){ for (const key in o){ const v=o[key]; if (key==="FIRECRAWL_API_KEY"&&v){k=v;return;} if (v&&typeof v==="object") w(v); } })(c); return k; })();
const ZO = "30713116";

async function fetchXmlUrls(url) {
  const r = await fetch("https://api.firecrawl.dev/v1/scrape", { method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["rawHtml"], waitFor: 2500 }) });
  const j = await r.json(); const raw = (j.data && (j.data.rawHtml || j.data.html)) || "";
  return [...new Set([...raw.matchAll(/https?:\/\/www\.amsoil\.com\/p\/[a-z0-9-]+\//gi)].map((m) => m[0]))];
}

import { cleanName, categorize } from "./amsoil-categorize.mjs";

function parse(url) {
  const slug = url.replace(/^https?:\/\/www\.amsoil\.com\/p\//, "").replace(/\/$/, "");
  const parts = slug.split("-");
  const code = parts[parts.length - 1].toUpperCase();
  let words = parts.slice(0, -1);
  if (words[0] === "amsoil") words = words.slice(1);
  const name = cleanName(words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "));
  return { name, code, slug, category: categorize(name, code) };
}
// Non-products to exclude (registration/dealership pages).
const SKIP = /(dealership|preferred-customer-registration|-dreg\/|-preg\/)/i;

// Carry harvested product images (scripts/amsoil-images.mjs) across rebuilds.
let prevImg = {};
try {
  for (const p of JSON.parse(fs.readFileSync("./site/amsoil-catalog.json", "utf8")).products)
    if (p.img) prevImg[p.code] = p.img;
} catch {}

const urls = await fetchXmlUrls("https://www.amsoil.com/sitemap/Product.xml");
const products = urls.filter((u) => !SKIP.test(u)).map((u) => {
  const { name, code, slug, category } = parse(u);
  const p = { name, code, category, buyUrl: `${u}?zo=${ZO}` };
  if (prevImg[code]) p.img = prevImg[code];
  return p;
}).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

const byCat = {};
for (const p of products) byCat[p.category] = (byCat[p.category] || 0) + 1;
fs.writeFileSync("./site/amsoil-catalog.json", JSON.stringify({ count: products.length, zo: ZO, categories: byCat, products }) + "\n");
console.log(`AMSOIL catalog: ${urls.length} URLs -> ${products.length} products -> site/amsoil-catalog.json`);
console.log("By category:"); Object.entries(byCat).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => console.log(`  ${String(n).padStart(3)}  ${c}`));
