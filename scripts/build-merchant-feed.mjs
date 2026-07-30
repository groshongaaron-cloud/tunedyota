// Generate the Google Merchant Center product feed (RSS 2.0 + g: namespace)
// at site/merchant-feed.xml from site/magnuson-catalog.js — the same single
// source of truth the quote builder and the static Product schema read.
//
// Merchant Center account: 5336800267. The feed is added there as a scheduled
// fetch of https://tunedyota.com/merchant-feed.xml, so a catalog price edit +
// `npm run build:seo` + deploy updates Shopping listings on the next fetch.
//
// Identifiers: Magnuson kits have no GTIN; brand + MPN (the Magnuson SKU) is
// the accepted 2-of-3 combination for auto parts. SKUs shared across several
// fitment year-ranges are deduped (g:id must be unique) — the title keeps the
// years only when the SKU maps to a single fitment.
//
// Banks Power items are emitted alongside Magnuson ONLY when the Banks product
// line's checkout mode (site/product-lines.js, single source of truth) flips
// from "reserve" to "converge". While Banks is in "reserve" the feed is
// byte-identical to the Magnuson-only output — the gate below is the only
// difference. See emitBanksItems() for the exclusion + mapping rules.
//
// Run via `npm run build:seo` (chained) or standalone:
//   node scripts/build-merchant-feed.mjs
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const SITE_DIR = "site";
const SITE = "https://tunedyota.com";

const ESC = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ─── Magnuson ───────────────────────────────────────────────────────────────

// Keep in lockstep with imageForApp() in scripts/build-product-schema.mjs.
function imageForApp(app) {
  const base = `${SITE}/images/magnuson/`;
  const e = app.engine, v = app.vehicle;
  const names = app.kits.map((k) => k.name).join(" ");
  let f;
  if (/i-FORCE/i.test(e)) f = "tundra-sequoia-34-perfpack.jpg";
  else if (/5\.7L/.test(e)) f = /Tundra/i.test(v) ? "tundra-57-tvs2650.jpg" : "lc-sequoia-lx570-tvs2650.jpg";
  else if (/4\.5L/.test(e)) f = "landcruiser-45-classic.jpg";
  else if (/3\.5L/.test(e)) f = "tacoma-35-tvs1900.jpg";
  else if (/3\.4L/.test(e)) f = "toyota-34-tvs1320.jpg";
  else if (/4\.0L/.test(e)) f = /TVS1320/i.test(names) ? "4runner-fj-40-tvs1320.jpg"
    : (/Tacoma/i.test(v) ? "tacoma-40-mp90.jpg" : "mp90-40-box.jpg");
  return f ? base + f : `${SITE}/og-image.png`;
}

// Per-SKU store pages (scripts/magnuson/build-store-pages.mjs) are the
// preferred landing pages — one product, one price, one schema block — which
// satisfies Merchant Center's specific-landing-page requirement. Fall back to
// the vehicle page only if a SKU has no store page.
function emitMagnusonItems() {
  const catalogSrc = fs.readFileSync(path.join(SITE_DIR, "magnuson-catalog.js"), "utf8");
  const windowStub = {};
  new Function("window", catalogSrc)(windowStub);
  const C = windowStub.MAGNUSON_CATALOG;
  if (!C) throw new Error("MAGNUSON_CATALOG not found");

  const SLUGS = fs.existsSync(path.join(SITE_DIR, "magnuson-slugs.json"))
    ? JSON.parse(fs.readFileSync(path.join(SITE_DIR, "magnuson-slugs.json"), "utf8"))
    : {};

  // Group every (app, kit) pair by SKU so shared SKUs become one item.
  const bySku = new Map();
  for (const app of C.applications) {
    for (const kit of app.kits) {
      if (!bySku.has(kit.sku)) bySku.set(kit.sku, { kit, apps: [] });
      bySku.get(kit.sku).apps.push(app);
    }
  }

  const items = [...bySku.values()].map(({ kit, apps }) => {
    const app = apps[0];
    const fit = apps.length === 1 ? `${app.vehicle} ${app.years} (${app.engine})` : `${app.vehicle} (${app.engine})`;
    const title = `${kit.name} — ${fit}`;
    const description =
      `${kit.name} for the ${fit}. Genuine Magnuson hardware sold by Tuned Yota, an authorized Magnuson dealer, installer, servicer and calibrator specializing in Toyota and Lexus. Ships to the lower 48; installation and OTT calibration available in the Upper Midwest.`;
    return [
      "  <item>",
      `    <g:id>${ESC(kit.sku)}</g:id>`,
      `    <g:title>${ESC(title)}</g:title>`,
      `    <g:description>${ESC(description)}</g:description>`,
      `    <g:link>${SITE}/${ESC(SLUGS[kit.sku] || app.slug)}</g:link>`,
      `    <g:image_link>${ESC(imageForApp(app))}</g:image_link>`,
      `    <g:price>${kit.retail.toFixed(2)} USD</g:price>`,
      "    <g:availability>in_stock</g:availability>",
      "    <g:condition>new</g:condition>",
      // $310 = Magnuson dealer policy pass-through: $275 flat freight (contiguous
      // US, policy §6.13) + $35 non-negotiable drop-ship fee (§6.9.1).
      "    <g:shipping><g:country>US</g:country><g:service>Flat rate</g:service><g:price>310.00 USD</g:price></g:shipping>",
      "    <g:brand>Magnuson Superchargers</g:brand>",
      `    <g:mpn>${ESC(kit.sku)}</g:mpn>`,
      "    <g:google_product_category>Vehicles &amp; Parts &gt; Vehicle Parts &amp; Accessories &gt; Motor Vehicle Parts &gt; Motor Vehicle Engine Parts</g:google_product_category>",
      "  </item>",
    ].join("\n");
  });
  return items;
}

// ─── Banks Power ──────────────────────────────────────────────────────────────

// Gate: the Banks line's checkout mode in site/product-lines.js is the single
// source of truth (same registry the client app renders CTAs from). "reserve"
// = no direct checkout → the feed omits Banks entirely; "converge" = Buy is
// live → Banks items ship in the feed. No separate feed flag exists on purpose.
export function banksCheckoutMode() {
  const require = createRequire(import.meta.url);
  const registry = require(path.resolve(SITE_DIR, "product-lines.js"));
  const banks = (registry.LINES || []).find((l) => l.id === "banks");
  if (!banks) throw new Error("banks line not found in product-lines.js");
  return banks.checkout;
}

// Merch/apparel excluded by Banks' own category field (not name matching):
// t-shirts, hats, sunglasses (Apparel) and badges, key flags, banners,
// billet caps, emblems (Emblems). These are branded accessories, not the
// automotive parts this feed sells.
const BANKS_MERCH_CATEGORIES = new Set(["Apparel", "Emblems"]);

// Google product category by Banks family. Engine-airflow/exhaust/boost parts
// reuse the exact Magnuson taxonomy value (Motor Vehicle Engine Parts).
// Gauges/monitors/throttle-electronics map to the Electronics subcategory
// under the same Motor Vehicle Parts branch. Anything unmapped falls back to
// the broad Motor Vehicle Parts node so no item is ever miscategorized.
const GPC_ENGINE = "Vehicles & Parts > Vehicle Parts & Accessories > Motor Vehicle Parts > Motor Vehicle Engine Parts";
const GPC_ELECTRONICS = "Vehicles & Parts > Vehicle Parts & Accessories > Motor Vehicle Parts > Motor Vehicle Electronics";
const GPC_PARTS = "Vehicles & Parts > Vehicle Parts & Accessories > Motor Vehicle Parts";
const BANKS_GPC_BY_CATEGORY = {
  "Cold Air Intakes and Manifolds": GPC_ENGINE,
  "Intercoolers and Boost Tubes": GPC_ENGINE,
  "Performance Exhaust": GPC_ENGINE,
  "Turbo Systems and Accessories": GPC_ENGINE,
  "Diff Covers": GPC_ENGINE,
  "Transmission Management": GPC_ENGINE,
  "Banks Racing Parts": GPC_ENGINE,
  "Power Bundles": GPC_ENGINE,
  "iDash Digital Monitor": GPC_ELECTRONICS,
  "Gauges and Mounting": GPC_ELECTRONICS,
  "Throttle Controllers": GPC_ELECTRONICS,
  "Tuners and Programmers": GPC_ELECTRONICS,
};
function banksGpc(category) {
  return BANKS_GPC_BY_CATEGORY[category] || GPC_PARTS;
}

// Slug assignment mirrors scripts/banks/build-store-pages.mjs exactly so the
// feed links resolve to the real per-product store pages (clean URLs, never
// .html). Kept in lockstep — if the store slug rule changes, change both.
const banksSlugify = (s) => String(s).toLowerCase()
  .replace(/["'’.®™]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
const banksBrandName = (title) => (/^banks\b/i.test(String(title).trim()) ? String(title).trim() : `Banks ${title}`);
function banksPrimarySku(p) {
  const v = (p.variants || []).find((x) => x.sku) || {};
  return v.sku || banksSlugify(p.handle).toUpperCase();
}
function banksAssignSlugs(products) {
  const used = new Set();
  for (const p of products) {
    let s = banksSlugify(banksBrandName(p.title));
    if (used.has(s)) s = `${s}-${banksSlugify(banksPrimarySku(p))}`;
    used.add(s);
    p.slug = s;
  }
  return products;
}

// A product is "In development" (coming soon, not orderable) when Banks flags
// comingSoon or serves the In_Development.jpg placeholder image. These carry
// no price on a store page and must never appear in Shopping.
function banksInDevelopment(p) {
  return p.comingSoon === true || /In_Development/i.test(p.image || "");
}

// A fitment-specific part in the title gets its Toyota/Lexus years VERBATIM,
// never compressed across a generation boundary — one "years engine" phrase per
// distinct fitment group, exactly as Banks lists them. Universal-fit parts (the
// PedalMonster fits 50+ platforms) are NOT fitment-specific, so their titles
// stay clean and the full fitment lives only in the description. The threshold
// separates a genuinely vehicle-specific part from a universal accessory.
const BANKS_TITLE_FITMENT_MAX_GROUPS = 4;
const BANKS_TY_MAKES = new Set(["Toyota", "Lexus"]);
function banksYearRuns(years) {
  const ys = [...new Set(years)].sort((a, b) => a - b);
  const runs = [];
  for (const y of ys) {
    const last = runs[runs.length - 1];
    if (last && y === last[1] + 1) last[1] = y;
    else runs.push([y, y]);
  }
  return runs.map(([a, b]) => (a === b ? String(a) : `${a}–${b}`)).join(", ");
}
// Returns the verbatim per-group Toyota/Lexus fitment phrases (years never
// compressed across a generation). full = every group (goes in description);
// title = the same phrases only when the part is fitment-specific (few groups),
// else "" so universal parts keep a clean title.
function banksFitment(p) {
  const groups = new Map(); // "make|model|engine" -> years[]
  for (const f of p.fitment || []) {
    if (!BANKS_TY_MAKES.has(f.make)) continue;
    const k = `${f.make}|${f.model}|${f.engine}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f.year);
  }
  const phrases = [...groups.entries()].map(([k, years]) => {
    const [make, model, engine] = k.split("|");
    return `${make} ${model} ${banksYearRuns(years)}${engine ? ` (${engine})` : ""}`;
  });
  const full = phrases.join(", ");
  const title = phrases.length && phrases.length <= BANKS_TITLE_FITMENT_MAX_GROUPS ? full : "";
  return { full, title };
}

// Build the Banks item XML strings. Emits one item per priced, available,
// non-excluded variant (SKU) — g:id/g:mpn = the Banks part number, which is
// unique per variant. Import this with the scrape and a checkout mode to unit
// test the rules directly.
export function emitBanksItems({ scrape, checkoutMode } = {}) {
  if (checkoutMode !== "converge") return []; // gate closed → no Banks items
  const src = scrape || JSON.parse(fs.readFileSync(path.join("data", "banks-site-scrape.json"), "utf8"));
  const products = banksAssignSlugs((src.products || []).map((p) => ({ ...p })));

  const items = [];
  for (const p of products) {
    const isGiftCard = /gift card/i.test(p.title || "");
    const isMerch = BANKS_MERCH_CATEGORIES.has(p.category);
    const isInDev = banksInDevelopment(p);
    if (isGiftCard || isMerch || isInDev) continue; // product-level exclusions
    const name = banksBrandName(p.title);
    const fit = banksFitment(p);
    const gpc = banksGpc(p.category);
    const link = `${SITE}/${p.slug}`;
    const image = p.image || `${SITE}/og-image.png`;

    for (const v of p.variants || []) {
      if (!v.sku) continue;
      if (v.price == null) continue;      // unpriced variant — not orderable
      if (v.available === false) continue; // out of stock at Banks
      const variantName = v.title ? `${name} — ${v.title}` : name;
      const title = fit.title ? `${variantName} — ${fit.title}` : variantName;
      const description =
        `${variantName}, genuine Banks Power part #${v.sku}` +
        `${fit.full ? ` for the ${fit.full}` : ""}. Sold by Tuned Yota, an authorized Banks Power dealer. ` +
        `Ships to the lower 48; installation and OTT calibration available in the Upper Midwest.`;
      items.push([
        "  <item>",
        `    <g:id>${ESC(v.sku)}</g:id>`,
        `    <g:title>${ESC(title)}</g:title>`,
        `    <g:description>${ESC(description)}</g:description>`,
        `    <g:link>${ESC(link)}</g:link>`,
        `    <g:image_link>${ESC(image)}</g:image_link>`,
        `    <g:price>${v.price.toFixed(2)} USD</g:price>`,
        "    <g:availability>in_stock</g:availability>",
        "    <g:condition>new</g:condition>",
        // No Banks shipping data yet — omit g:shipping rather than invent a rate.
        "    <g:brand>Banks Power</g:brand>",
        `    <g:mpn>${ESC(v.sku)}</g:mpn>`,
        `    <g:google_product_category>${ESC(gpc)}</g:google_product_category>`,
        "  </item>",
      ].join("\n"));
    }
  }
  return items;
}

// ─── Feed assembly ────────────────────────────────────────────────────────────

export function buildFeed() {
  const catalogSrc = fs.readFileSync(path.join(SITE_DIR, "magnuson-catalog.js"), "utf8");
  const windowStub = {};
  new Function("window", catalogSrc)(windowStub);
  const updated = windowStub.MAGNUSON_CATALOG.updated;

  const magItems = emitMagnusonItems();
  const banksItems = emitBanksItems({ checkoutMode: banksCheckoutMode() });
  const items = [...magItems, ...banksItems];

  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
  <title>Tuned Yota — Magnuson Supercharger Kits</title>
  <link>${SITE}/supercharger</link>
  <description>Genuine Magnuson supercharger systems for Toyota and Lexus, sold by Tuned Yota, an authorized Magnuson dealer. Catalog updated ${updated}.</description>
${items.join("\n")}
</channel>
</rss>
`;
  return { feed, magCount: magItems.length, banksCount: banksItems.length };
}

function main() {
  const { feed, magCount, banksCount } = buildFeed();
  fs.writeFileSync(path.join(SITE_DIR, "merchant-feed.xml"), feed);
  console.log(`merchant feed: ${magCount} Magnuson + ${banksCount} Banks = ${magCount + banksCount} products written to site/merchant-feed.xml`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) main();
