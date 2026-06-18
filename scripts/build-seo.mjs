// scripts/build-seo.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import sharp from "sharp";
import * as SD from "./lib/seo-data.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_DIR = path.join(ROOT, "site");
const today = () => new Date().toISOString().slice(0, 10);

function logoSvg(size) {
  const { ink, blue, viewBox, path: d } = SD.BRAND;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.18)}" fill="${ink}"/>
  <svg x="${size * 0.2}" y="${size * 0.2}" width="${size * 0.6}" height="${size * 0.6}" viewBox="${viewBox}">
    <path fill="${blue}" d="${d}"/></svg></svg>`;
}
function ogSvg() {
  const { ink, blue, cream, viewBox, path: d } = SD.BRAND;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${ink}"/>
  <svg x="120" y="225" width="180" height="180" viewBox="${viewBox}"><path fill="${blue}" d="${d}"/></svg>
  <text x="340" y="320" font-family="Georgia,serif" font-size="86" fill="${cream}" font-weight="600">Tuned Yota</text>
  <text x="344" y="380" font-family="Arial,sans-serif" font-size="30" letter-spacing="6" fill="${blue}">UNDENIABLE PERFORMANCE</text></svg>`;
}
async function writeImages() {
  await sharp(Buffer.from(logoSvg(512))).png().toFile(path.join(SITE_DIR, "logo.png"));
  await sharp(Buffer.from(ogSvg())).png().toFile(path.join(SITE_DIR, "og-image.png"));
  console.log("images: logo.png, og-image.png");
}

// Replace content between <!-- SEO:KEY:START/END -->, or insert a fresh marked
// block right after the canonical link. Returns the new html.
function injectMarked(html, key, inner) {
  const block = `<!-- SEO:${key}:START -->\n${inner}\n<!-- SEO:${key}:END -->`;
  const re = new RegExp(`<!-- SEO:${key}:START -->[\\s\\S]*?<!-- SEO:${key}:END -->`);
  if (re.test(html)) return html.replace(re, block);
  return html.replace(/(<link rel="canonical"[^>]*>)/i, `$1\n${block}`);
}

function processHead(file) {
  const p = path.join(SITE_DIR, file);
  let html = fs.readFileSync(p, "utf8");
  const meta = SD.extractMeta(html);
  html = injectMarked(html, "BUSINESS",
    `<script type="application/ld+json">\n${SD.BUSINESS_STUB}\n</script>`);
  html = injectMarked(html, "OG", SD.buildOgTags(meta));
  fs.writeFileSync(p, html);
}

async function main() {
  await writeImages();
  for (const f of SD.HEAD_PAGES) processHead(f);
  console.log(`head injected: ${SD.HEAD_PAGES.length} pages`);
}
main().catch((e) => { console.error(e); process.exit(1); });
