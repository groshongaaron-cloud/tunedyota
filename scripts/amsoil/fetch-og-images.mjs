// scripts/amsoil/fetch-og-images.mjs
// One-off: for each new-product page, find the LARGEST amsoil.com media
// rendition of the default variant (the ?context= token base64-encodes the byte
// size), download it through the Playwright context (plain fetch gets
// Cloudflare-blocked) and process to the site's self-hosted 800px web-RGB jpg.
// Run: node scripts/amsoil/fetch-og-images.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { withBrowser, fetchProductHtml } from "./lib/browser-fetch.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(ROOT, "site", "images", "amsoil");

// file → { page, code: default-variant filename root to match }
const WANT = {
  "afl-5w40.jpg": { page: "https://www.amsoil.com/p/amsoil-5w-40-ms-100-synthetic-european-motor-oil-afl/", code: /^aflqt/ },
  "ael-5w30.jpg": { page: "https://www.amsoil.com/p/amsoil-5w-30-ls-100-synthetic-european-motor-oil-ael/", code: /^aelqt/ },
  "hm020.jpg": { page: "https://www.amsoil.com/p/amsoil-0w-20-100-synthetic-high-mileage-motor-oil-hm020/", code: /^hm020qt/ },
  "hm530.jpg": { page: "https://www.amsoil.com/p/amsoil-5w-30-100-synthetic-high-mileage-motor-oil-hm530/", code: /^hm530qt/ },
};

const ctxSize = (url) => {
  const m = url.match(/context=([A-Za-z0-9+/=_-]+)/);
  if (!m) return 0;
  try { return parseInt(Buffer.from(m[1], "base64").toString("utf8").split("|")[2], 10) || 0; }
  catch { return 0; }
};

for (const [file, { page: pageUrl, code }] of Object.entries(WANT)) {
  await withBrowser(async (page) => {
    const r = await fetchProductHtml(page, pageUrl);
    if (r.blocked) { console.error(`${file}: page blocked (${r.status})`); process.exitCode = 1; return; }
    const urls = [...new Set([...r.html.matchAll(/https:\/\/www\.amsoil\.com\/medias\/[^"'\s>&]+(?:&amp;[^"'\s>]+)?/g)].map((m) => m[0].replace(/&amp;/g, "&")))];
    const candidates = urls.filter((u) => code.test(u.split("/medias/")[1] || "")).sort((a, b) => ctxSize(b) - ctxSize(a));
    if (!candidates.length) { console.error(`${file}: no media match`); process.exitCode = 1; return; }
    const res = await page.context().request.get(candidates[0]);
    if (!res.ok()) { console.error(`${file}: HTTP ${res.status()}`); process.exitCode = 1; return; }
    const buf = await res.body();
    const out = path.join(OUT, file);
    await sharp(buf).resize(800, 800, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" }).jpeg({ quality: 88 }).toFile(out);
    const meta = await sharp(out).metadata();
    console.log(`${file}: ${meta.width}x${meta.height} ${(fs.statSync(out).size / 1024).toFixed(0)}kb (src ${(buf.length / 1024).toFixed(0)}kb)`);
  });
}
