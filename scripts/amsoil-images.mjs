// Harvest product images for the on-site AMSOIL store. AMSOIL's Hybris media
// URLs require a per-image base64 `context` param (bare /medias/{code}.jpg
// 400s), so the only source is each product page's og:image. Product pages
// serve fine to a browser-UA fetch (Cloudflare gates the sitemap, not /p/).
// Reads site/amsoil-catalog.json, writes an `img` field per product in place.
// Re-run after scripts/amsoil-catalog.mjs whenever the catalog is refreshed.
import fs from "node:fs";
import { execFile } from "node:child_process";

const path = "./site/amsoil-catalog.json";
const cat = JSON.parse(fs.readFileSync(path, "utf8"));
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const CONCURRENCY = 8;

// Cloudflare 403s Node's fetch (TLS fingerprint) but passes curl — shell out.
function curl(url) {
  return new Promise((resolve) => {
    execFile("curl", ["-s", "--max-time", "25", "-A", UA, url], { maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => resolve(err ? "" : stdout));
  });
}

async function ogImage(url, attempt = 0) {
  const html = await curl(url);
  const m = html.match(/property="og:image"\s+content="([^"]+)"/) ||
    html.match(/content="([^"]+)"\s+property="og:image"/);
  const img = m && m[1];
  // AMSOIL's PDF-icon/logo fallbacks mean "no real product shot" — skip those.
  if (img && !/icon_pdf|amsoil-logo/.test(img)) return img;
  if (attempt < 2) { await new Promise((s) => setTimeout(s, 800 * (attempt + 1))); return ogImage(url, attempt + 1); }
  return null;
}

let done = 0, missed = [];
const queue = [...cat.products];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  for (let p; (p = queue.shift()); ) {
    const img = await ogImage(p.buyUrl.replace(/\?zo=\d+$/, ""));
    if (img) p.img = img; else { delete p.img; missed.push(p.code); }
    if (++done % 50 === 0) console.log(`${done}/${cat.products.length}`);
  }
}));

fs.writeFileSync(path, JSON.stringify(cat) + "\n");
console.log(`images: ${cat.products.length - missed.length}/${cat.products.length} harvested`);
if (missed.length) console.log(`no product shot (${missed.length}): ${missed.join(" ")}`);
