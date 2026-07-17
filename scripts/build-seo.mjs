// scripts/build-seo.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import sharp from "sharp";
import * as SD from "./lib/seo-data.mjs";
import { buildAmsoilPages } from "./build-amsoil-pages.mjs";
import { buildStatePages } from "./build-state-pages.mjs";

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
// block right after the canonical link. Returns the new html. Replacement
// FUNCTIONS are used so `$$`/`$&` inside the injected JSON aren't interpreted as
// String.replace special patterns (which would corrupt e.g. priceRange "$$").
function injectMarked(html, key, inner) {
  const block = `<!-- SEO:${key}:START -->\n${inner}\n<!-- SEO:${key}:END -->`;
  const re = new RegExp(`<!-- SEO:${key}:START -->[\\s\\S]*?<!-- SEO:${key}:END -->`);
  if (re.test(html)) return html.replace(re, () => block);
  return html.replace(/<link rel="canonical"[^>]*>/i, (m) => `${m}\n${block}`);
}

// True if the page already defines the #business entity (not just references it
// via provider/organizer). Such pages (index, ott-tune, team, supercharger,
// find-your-exact-tune) must NOT get the stub, or the @id would be duplicated.
function definesBusiness(html) {
  const stripped = html.replace(/<!-- SEO:BUSINESS:START -->[\s\S]*?<!-- SEO:BUSINESS:END -->/g, "");
  const blocks = [...stripped.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  for (const b of blocks) {
    try {
      const j = JSON.parse(b);
      const nodes = Array.isArray(j) ? j : (j["@graph"] || [j]);
      if (nodes.some((n) => n && n["@id"] === SD.BIZ_ID && /Business|Organization/.test(n["@type"] || ""))) return true;
    } catch { /* ignore unparseable block */ }
  }
  return false;
}

function processHead(file) {
  const p = path.join(SITE_DIR, file);
  let html = fs.readFileSync(p, "utf8");
  const meta = SD.extractMeta(html);
  if (!definesBusiness(html)) {
    html = injectMarked(html, "BUSINESS",
      `<script type="application/ld+json">\n${SD.BUSINESS_STUB}\n</script>`);
  }
  html = injectMarked(html, "OG", SD.buildOgTags(meta));
  fs.writeFileSync(p, html);
}

function processEvents() {
  const events = require("../netlify/functions/lib/events-data.js");
  const { MARKETS } = require("../netlify/functions/lib/markets.js");
  const states = Object.fromEntries(MARKETS.map((m) => [m.city.toLowerCase(), m.state]));
  const p = path.join(SITE_DIR, "find-your-exact-tune.html");
  let html = fs.readFileSync(p, "utf8");
  html = injectMarked(html, "EVENTS",
    `<script type="application/ld+json">\n${SD.buildEventsJsonLd(events, states)}\n</script>`);
  fs.writeFileSync(p, html);
}

// Sync the server-side vehicle/pricing source (netlify/functions/lib/vehicles.json)
// from the funnel's inline VEHICLES literal — the single human-edited price source
// ("Edit prices here" in find-your-exact-tune.html). The WebMCP get_vehicle_pricing
// tool reads the JSON; tests/vehicles-parity.test.js fails loudly if this wasn't re-run
// after a price edit (same role seo.test.js plays for the schema/sitemap output).
function syncVehicles() {
  const p = path.join(SITE_DIR, "find-your-exact-tune.html");
  const html = fs.readFileSync(p, "utf8");
  const { extractVehicles } = require("./lib/extract-vehicles.cjs");
  const vehicles = extractVehicles(html); // brace-matched; throws on missing/malformed → fails the build
  fs.writeFileSync(path.join(ROOT, "netlify", "functions", "lib", "vehicles.json"),
    JSON.stringify(vehicles, null, 2) + "\n");
  // Public copy for the /book mini flow's vehicle picker — same source, zero drift
  // (tests/vehicles-parity.test.js pins both copies to the funnel literal).
  fs.writeFileSync(path.join(SITE_DIR, "vehicles.json"),
    JSON.stringify(vehicles, null, 2) + "\n");
  console.log("vehicles: synced lib/vehicles.json from funnel VEHICLES");
}

// Repoint the broken Services breadcrumb to the real OTT Tune hub. Whitespace-
// insensitive so it catches both spaced (vehicle pages) and compact (ott-tune)
// JSON formatting. team.html already ships its own Person schema, so no Person
// injection is needed here.
function fixBreadcrumbs() {
  for (const f of SD.HEAD_PAGES) {
    const p = path.join(SITE_DIR, f);
    let html = fs.readFileSync(p, "utf8");
    const next = html
      .replace(/("item"\s*:\s*)"https:\/\/tunedyota\.com\/services"/g, `$1"${SD.SITE}/ott-tune"`)
      .replace(/("name"\s*:\s*)"Services"/g, `$1"OTT Tune"`);
    if (next !== html) fs.writeFileSync(p, next);
  }
}

// lastmod = the page's last git commit date (content change), not the build
// date. Uncommitted/new pages (no history yet, or dirty in the working tree)
// fall back to today via buildSitemap's second argument.
function gitLastmod(file) {
  try {
    const dirty = execFileSync("git", ["status", "--porcelain", "--", `site/${file}`], { cwd: ROOT }).toString().trim();
    if (dirty) return ""; // modified since last commit → today
    return execFileSync("git", ["log", "-1", "--format=%cs", "--", `site/${file}`], { cwd: ROOT }).toString().trim();
  } catch { return ""; }
}

function writeSitemap() {
  const entries = SD.HEAD_PAGES
    .filter((f) => !SD.SITEMAP_EXCLUDE.has(f))
    .map((f) => ({ loc: SD.locFor(f), priority: SD.PRIORITY[f] || "0.8", lastmod: gitLastmod(f) }));
  fs.writeFileSync(path.join(SITE_DIR, "sitemap.xml"), SD.buildSitemap(entries, today()));
}

async function main() {
  await writeImages();
  console.log(`amsoil pages: regenerated ${buildAmsoilPages()}`);
  console.log(`state pages: regenerated ${buildStatePages()}`);
  for (const f of SD.HEAD_PAGES) processHead(f);
  fixBreadcrumbs();
  processEvents();
  syncVehicles();
  writeSitemap();
  console.log("seo build complete");
}
main().catch((e) => { console.error(e); process.exit(1); });
