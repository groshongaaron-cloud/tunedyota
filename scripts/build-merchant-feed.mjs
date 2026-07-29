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
// Run via `npm run build:seo` (chained) or standalone:
//   node scripts/build-merchant-feed.mjs
import fs from "node:fs";
import path from "node:path";

const SITE_DIR = "site";
const SITE = "https://tunedyota.com";

const catalogSrc = fs.readFileSync(path.join(SITE_DIR, "magnuson-catalog.js"), "utf8");
const windowStub = {};
new Function("window", catalogSrc)(windowStub);
const C = windowStub.MAGNUSON_CATALOG;
if (!C) throw new Error("MAGNUSON_CATALOG not found");

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

const ESC = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Per-SKU store pages (scripts/magnuson/build-store-pages.mjs) are the
// preferred landing pages — one product, one price, one schema block — which
// satisfies Merchant Center's specific-landing-page requirement. Fall back to
// the vehicle page only if a SKU has no store page.
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
    "    <g:shipping><g:country>US</g:country><g:service>Flat rate</g:service><g:price>250.00 USD</g:price></g:shipping>",
    "    <g:brand>Magnuson Superchargers</g:brand>",
    `    <g:mpn>${ESC(kit.sku)}</g:mpn>`,
    "    <g:google_product_category>Vehicles &amp; Parts &gt; Vehicle Parts &amp; Accessories &gt; Motor Vehicle Parts &gt; Motor Vehicle Engine Parts</g:google_product_category>",
    "  </item>",
  ].join("\n");
});

const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
  <title>Tuned Yota — Magnuson Supercharger Kits</title>
  <link>${SITE}/supercharger</link>
  <description>Genuine Magnuson supercharger systems for Toyota and Lexus, sold by Tuned Yota, an authorized Magnuson dealer. Catalog updated ${C.updated}.</description>
${items.join("\n")}
</channel>
</rss>
`;

fs.writeFileSync(path.join(SITE_DIR, "merchant-feed.xml"), feed);
console.log(`merchant feed: ${items.length} unique products written to site/merchant-feed.xml`);
