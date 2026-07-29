// Full Magnuson store — one crawlable product page per SKU plus the master
// hub (/magnuson-products), generated from site/magnuson-catalog-full.json
// (retail/MSP pricing only; see ingest-price-file.mjs for the confidentiality
// bar). Mirrors the AMSOIL tier-3 architecture.
//
// Business rules (mirror the merchant-feed curation where they overlap):
// - The CALIBRATION AND TUNING KITS section is excluded site-wide: standalone
//   handheld tuners compete with Tuned Yota's own OTT calibration.
// - Color twins (-BL/-RD at the same price) collapse into one page on the -BL
//   SKU with the red option noted; differently-priced finishes (MOAB -PO) stay
//   separate pages.
// - Toyota Truck sections lead everywhere; those pages cross-link the curated
//   vehicle landing pages.
//
// Import-safe: module top level only computes lists (seo-data.mjs imports
// MAGNUSON_STORE_FILES for HEAD_PAGES). Page writes happen in main() only.
//
// Run via `npm run build:magnuson-store` — writes site/*.html and
// site/magnuson-slugs.json (sku -> slug, read by build-merchant-feed.mjs).
import fs from "node:fs";
import path from "node:path";
import { CHROME } from "../build-amsoil-pages.mjs";

const { FONTS, SITECSS, FAVICON, NAV, FOOTER, ESC, STYLE } = CHROME;
const SITE = "site";
const BASE = "https://tunedyota.com";
const CAT = JSON.parse(fs.readFileSync(path.join(SITE, "magnuson-catalog-full.json"), "utf8"));

// Standalone handheld tuners compete with Tuned Yota's own OTT calibration and
// get no pages. The FFV RTD Upgrade (31-19-57-215) stays: it's required
// supporting hardware for supercharged Flex-Fuel Tundras, not a competitor.
const EXCLUDED_SKUS = new Set(["88-85-59-005", "88-85-59-009"]);

const NOTE_TEXT = {
  1: "Accessories for engine systems (heat exchanger, intercooler assembly, tensioner, etc.) are sold separately.",
  2: "Calibration is not available from Magnuson for this system — ask us what's possible for your platform.",
  3: "Does not include throttle-body adapter or pulley; sold separately.",
  4: "Hot Rod and MOAB kits carry their own pricing structure.",
  5: "Carries its own pricing structure.",
};

const SECTION_META = [
  { key: "Toyota Truck", title: "Toyota & Lexus Superchargers", toyota: true },
  { key: "Magnuson Performance Packs: Toyota Truck", title: "2022+ Tundra & Sequoia Performance Packs", toyota: true },
  { key: "GM Truck and SUV", title: "GM Truck & SUV Superchargers" },
  { key: "GM LT Passenger Car", title: "GM LT Passenger Car Superchargers" },
  { key: "GM LS Passenger Car", title: "GM LS Passenger Car Superchargers" },
  { key: "Ford", title: "Ford Superchargers" },
  { key: "Jeep", title: "Jeep Superchargers" },
  { key: "HEMI Car and Truck", title: "HEMI Car & Truck Superchargers" },
  { key: "Hot Rod Kits", title: "Hot Rod & Universal Swap Kits" },
];
const PART_SECTION_TITLES = {
  "Toyota Tundra Magnuson Performance Series (2022+ Tundra)": "2022+ Tundra Performance Series Parts",
  "AIR INLETS": "Air Inlets", "Cooling Systems": "Cooling Systems", "Input Cartridge": "Input Cartridges",
  "BY-PASS ACTUATORS": "Bypass Actuators", "BELTS": "Belts", "PULLEYS": "Pulleys",
  "TENSIONERS": "Tensioners", "PINNING KITS": "Pinning Kits", "THROTTLE BODIES": "Throttle Bodies",
  "MERCHANDISE": "Magnuson Gear & Merchandise",
};

// Toyota product photos (same mapping as build-product-schema.mjs); others fall
// back to the brand banner in schema and render without a hero image.
function imageForKit(k) {
  const a = k.apps[0] || {};
  const e = a.engines || "", v = a.models || "";
  let f;
  if (/i-FORCE|3\.4L V6/i.test(e) && /Tundra|Sequoia/i.test(v)) f = "tundra-sequoia-34-perfpack.jpg";
  else if (/5\.7L/.test(e)) f = /Tundra/i.test(v) ? "tundra-57-tvs2650.jpg" : "lc-sequoia-lx570-tvs2650.jpg";
  else if (/4\.5L/.test(e)) f = "landcruiser-45-classic.jpg";
  else if (/3\.5L/.test(e)) f = "tacoma-35-tvs1900.jpg";
  else if (/3\.4L 5VZ/.test(e)) f = "toyota-34-tvs1320.jpg";
  else if (/4\.0L/.test(e)) f = k.rotor === "TVS1320" ? "4runner-fj-40-tvs1320.jpg" : (/Tacoma/i.test(v) ? "tacoma-40-mp90.jpg" : "mp90-40-box.jpg");
  if (!f) return null;
  return `${BASE}/images/magnuson/${f}`;
}

const slugify = (s) => String(s).toLowerCase()
  .replace(/["'’.]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");

// ---- Assemble the product list (kits + parts) with merged color twins -------
function colorBase(sku) { const m = sku.match(/^(.*)-(BL|RD)$/); return m ? m[1] : null; }

function kitList() {
  const bySku = new Map(CAT.superchargers.map((k) => [k.sku, k]));
  const out = [];
  for (const k of CAT.superchargers) {
    const base = colorBase(k.sku);
    if (base && k.sku.endsWith("-RD")) {
      const bl = bySku.get(`${base}-BL`);
      if (bl && bl.retail === k.retail) continue; // folded into the -BL page
    }
    const redTwin = base && k.sku.endsWith("-BL") ? bySku.get(`${base}-RD`) : null;
    out.push({ ...k, redSku: redTwin && redTwin.retail === k.retail ? redTwin.sku : null, kind: "kit" });
  }
  return out;
}
function partList() {
  const bySku = new Map(CAT.parts.map((p) => [p.sku, p]));
  const out = [];
  for (const p of CAT.parts) {
    if (EXCLUDED_SKUS.has(p.sku)) continue;
    const base = colorBase(p.sku);
    if (base && p.sku.endsWith("-RD")) {
      const bl = bySku.get(`${base}-BL`);
      if (bl && bl.retail === p.retail) continue;
    }
    const redTwin = base && p.sku.endsWith("-BL") ? bySku.get(`${base}-RD`) : null;
    out.push({ ...p, redSku: redTwin && redTwin.retail === p.retail ? redTwin.sku : null, kind: "part" });
  }
  return out;
}

function kitName(k) {
  const a = k.apps[0] || {};
  const models = [...new Set(k.apps.map((x) => x.models))].join(" / ");
  const isPack = /Performance Packs/.test(k.section);
  if (isPack) return `Magnuson Performance Pack: ${k.detail} — 2022+ ${models}`;
  const detail = /^Magnuson|^Magnum|^Roush/.test(k.detail) ? k.detail : `Magnuson ${k.detail}`;
  return `${detail} — ${models}${a.engines ? ` (${a.engines})` : ""}`;
}

function assignSlugs(items) {
  const used = new Set();
  for (const it of items) {
    let s;
    if (it.kind === "kit") {
      const a = it.apps[0] || {};
      const years = (a.years || "").replace(/\s/g, "");
      const engine = (a.engines || "").split(/[\s/]+/)[0];
      s = slugify(["magnuson", it.rotor || it.detail, a.models, engine, years].filter(Boolean).join(" "));
    } else {
      s = slugify(`magnuson ${it.name}`);
    }
    if (used.has(s)) s = `${s}-${slugify(it.sku)}`;
    if (used.has(s)) throw new Error(`slug collision: ${s}`);
    used.add(s);
    it.slug = s;
  }
  return items;
}

export const STORE_ITEMS = assignSlugs([...kitList(), ...partList()]);
export const MAGNUSON_HUB_FILE = "magnuson-products.html";
export const MAGNUSON_STORE_FILES = [MAGNUSON_HUB_FILE, ...STORE_ITEMS.map((i) => `${i.slug}.html`)];

// ---- Templates --------------------------------------------------------------
const TABLESTYLE = `<style>
.mtab{width:100%;border-collapse:collapse;margin:14px 0;font-size:14px}
.mtab th{font-family:'Spectral SC',serif;font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--sage-d);text-align:left;padding:8px 8px;border-bottom:1.6px solid var(--line)}
.mtab td{padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:top}
.mtab .pr{white-space:nowrap;font-weight:900;color:var(--ink)}
.mnav{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}
.mnav a{font-size:13px;border:1.2px solid var(--line);border-radius:999px;padding:6px 12px;color:var(--brown);text-decoration:none;font-weight:700}
</style>`;

const CONTACT_CTA = `
  <div class="lp-cta">
    <a class="btn primary" href="sms:+16124067117">Text us to order — (612) 406-7117</a>
    <a class="btn outline" href="mailto:info@tunedyota.com">Email info@tunedyota.com</a>
  </div>`;

function productLd(it, url, name, desc) {
  const img = it.kind === "kit" ? imageForKit(it) : null;
  return JSON.stringify({
    "@context": "https://schema.org", "@type": "Product", "@id": `${url}#product`,
    name, sku: it.sku, mpn: it.sku,
    brand: { "@type": "Brand", "name": "Magnuson Superchargers" },
    category: "Vehicle Superchargers & Parts",
    image: img || `${BASE}/og-image.png`, description: desc, url,
    offers: {
      "@type": "Offer", url, priceCurrency: "USD", price: it.retail.toFixed(2),
      priceValidUntil: "2026-12-31", availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "AutomotiveBusiness", "@id": `${BASE}/#business`, name: "Tuned Yota", telephone: "+1-612-406-7117", url: `${BASE}/` },
    },
  });
}

function breadcrumbLd(url, name) {
  return JSON.stringify({
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${BASE}/` },
      { "@type": "ListItem", position: 2, name: "Magnuson Store", item: `${BASE}/magnuson-products` },
      { "@type": "ListItem", position: 3, name, item: url },
    ],
  });
}

const VEHICLE_PAGE = {
  Tundra: "/toyota-tundra-supercharger", Tacoma: "/toyota-tacoma-supercharger",
  "4Runner": "/toyota-4runner-supercharger", "FJ Cruiser": "/toyota-fj-cruiser-supercharger",
  "Land Cruiser": "/toyota-land-cruiser-supercharger", Sequoia: "/toyota-sequoia-supercharger",
  LX570: "/lexus-lx570-supercharger",
};
function vehicleLink(it) {
  if (it.kind !== "kit") return null;
  const models = it.apps.map((a) => a.models).join(" ");
  for (const [m, href] of Object.entries(VEHICLE_PAGE)) if (models.includes(m)) return href;
  return null;
}

function productPage(it) {
  const url = `${BASE}/${it.slug}`;
  const name = it.kind === "kit" ? kitName(it) : `Magnuson ${it.name}`;
  const isToyota = /Toyota/.test(it.section) || /Tundra/.test(it.section);
  const img = it.kind === "kit" ? imageForKit(it) : null;
  const desc = `${name}. Genuine Magnuson part #${it.sku} — $${it.retail.toLocaleString("en-US")} retail, sold by Tuned Yota, an authorized Magnuson dealer. Drop-ships from Magnuson to the lower 48${isToyota ? "; installation and OTT calibration available in the Upper Midwest" : ""}.`;
  const notes = (it.notes || []).map((n) => NOTE_TEXT[n]).filter(Boolean);
  const fitRows = it.kind === "kit"
    ? it.apps.map((a) => `<tr><td>${ESC(a.years)}</td><td>${ESC(a.models)}</td><td>${ESC(a.engines)}</td></tr>`).join("\n")
    : "";
  const vp = vehicleLink(it);
  const sectionTitle = it.kind === "kit"
    ? (SECTION_META.find((s) => s.key === it.section) || {}).title || it.section
    : PART_SECTION_TITLES[it.section] || it.section;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${ESC(name)} — $${it.retail.toLocaleString("en-US")} | Magnuson ${ESC(it.sku)} | Tuned Yota</title>
<meta name="description" content="${ESC(desc)}">
<link rel="canonical" href="${url}">
<script type="application/ld+json">
${productLd(it, url, name, desc)}
</script>
<script type="application/ld+json">
${breadcrumbLd(url, name)}
</script>
${FONTS}
${SITECSS}
${FAVICON}
${STYLE}
${TABLESTYLE}
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
${NAV}
<a id="main" tabindex="-1"></a>
<div class="lp">
  <div class="lp-eyebrow">Tuned Yota · Authorized Magnuson Dealer · ${ESC(sectionTitle)}</div>
  <h1>${ESC(name)}</h1>
  <div class="lp-answer" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
    ${img ? `<img src="${img.replace(BASE, "")}" alt="${ESC(name)}" loading="lazy" width="160" height="160" style="border-radius:12px">` : ""}
    <div style="flex:1;min-width:220px">
      <div style="font-size:27px;font-weight:900;color:var(--ink)">$${it.retail.toLocaleString("en-US")}</div>
      <div style="font-size:13.5px;color:var(--sage-d);margin-top:2px">Magnuson part&nbsp;#&nbsp;${ESC(it.sku)} · Retail (MSP) pricing · Drop-ships from Magnuson to the lower 48</div>
      ${it.redSku ? `<div style="font-size:13.5px;margin-top:4px">Also available in Magnuson Red (part #${ESC(it.redSku)}) — same price.</div>` : ""}
      ${it.colorOptions ? `<div style="font-size:13.5px;margin-top:4px">Colored lid options (+$300): ${ESC(it.colorOptions)}</div>` : ""}
    </div>
  </div>
${CONTACT_CTA}
  <p style="margin:14px 0 0">Genuine <strong>Magnuson</strong> hardware sold by Tuned Yota, an authorized Magnuson dealer${isToyota ? ", installer, servicer and calibrator specializing in Toyota and Lexus" : ""}. You pay Magnuson's own published retail price; the kit ships direct from Magnuson in Ventura, CA${isToyota ? " — or have us install and finish it with an OTT calibration in the Upper Midwest" : ""}.</p>
${fitRows ? `
  <h2>Fitment</h2>
  <table class="mtab"><thead><tr><th>Years</th><th>Model(s)</th><th>Engine(s)</th></tr></thead><tbody>
${fitRows}
  </tbody></table>` : ""}
${notes.length ? `
  <h2>Good to know</h2>
  <ul class="lp-bul">
${notes.map((n) => `    <li>${ESC(n)}</li>`).join("\n")}
  </ul>` : ""}
  <h2>Keep browsing</h2>
  <div class="lp-veh">${vp ? `<a href="${vp}">${ESC(Object.entries(VEHICLE_PAGE).find(([, h]) => h === vp)[0])} supercharger overview</a>` : ""}<a href="/magnuson-products">Every Magnuson product</a><a href="/magnuson-supercharger-pricing">Toyota &amp; Lexus price list + quote builder</a><a href="/banks-products">Banks Power catalog</a><a href="/supercharger">Superchargers at Tuned Yota</a></div>
  <p class="lp-disc">Prices are Magnuson's published retail (MSP) pricing as of ${ESC(CAT.updated)} and are subject to change. Ordering through Tuned Yota, an authorized Magnuson dealer, costs nothing extra. Freight and any applicable install/calibration quoted before you commit.</p>
</div>
${FOOTER}
<script src="/chat.js" defer></script>
</body>
</html>
`;
}

function hubPage() {
  const url = `${BASE}/magnuson-products`;
  const kits = STORE_ITEMS.filter((i) => i.kind === "kit");
  const parts = STORE_ITEMS.filter((i) => i.kind === "part");
  const sections = [];
  for (const meta of SECTION_META) {
    const items = kits.filter((k) => k.section === meta.key);
    if (items.length) sections.push({ id: slugify(meta.title), title: meta.title, rows: items.map(kitRow) });
  }
  const partSections = [...new Set(parts.map((p) => p.section))];
  for (const ps of partSections) {
    const title = PART_SECTION_TITLES[ps] || ps;
    sections.push({ id: slugify(title), title, rows: parts.filter((p) => p.section === ps).map(partRow) });
  }
  const total = STORE_ITEMS.length;
  const desc = `Every current Magnuson supercharger system and part — ${total} products with Magnuson's published retail pricing — from Tuned Yota, an authorized Magnuson dealer. Toyota, Lexus, GM, Ford, Jeep, HEMI and hot rod applications, drop-shipped to the lower 48.`;

  function kitRow(k) {
    const fit = k.apps.map((a) => `${a.years} ${a.models}`).join("; ");
    return `<tr><td><a href="/${k.slug}">${ESC(kitName(k))}</a><div style="font-size:12.5px;color:var(--sage-d)">${ESC(fit)}</div></td><td>${ESC(k.sku)}</td><td class="pr">$${k.retail.toLocaleString("en-US")}</td></tr>`;
  }
  function partRow(p) {
    return `<tr><td><a href="/${p.slug}">${ESC(p.name)}</a></td><td>${ESC(p.sku)}</td><td class="pr">$${p.retail.toLocaleString("en-US")}</td></tr>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Magnuson Supercharger Catalog — All ${total} Products &amp; 2026 Prices | Tuned Yota</title>
<meta name="description" content="${ESC(desc)}">
<link rel="canonical" href="${url}">
<script type="application/ld+json">
${breadcrumbLd(url, "Magnuson Store").replace('"position":3,"name":"Magnuson Store","item":"' + url + '"},', "").replace(/,\{"@type":"ListItem","position":3[^\]]*/, "")}
</script>
${FONTS}
${SITECSS}
${FAVICON}
${STYLE}
${TABLESTYLE}
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
${NAV}
<a id="main" tabindex="-1"></a>
<div class="lp">
  <div class="lp-eyebrow">Tuned Yota · Authorized Magnuson Dealer · Full Catalog</div>
  <h1>Magnuson Superchargers — Every Product, 2026 Retail Pricing</h1>
  <div class="lp-answer">All <strong>${total} current Magnuson products</strong> at Magnuson's published retail pricing — supercharger systems for Toyota, Lexus, GM, Ford, Jeep and HEMI platforms, hot rod kits, and supporting parts. Ordering through Tuned Yota costs nothing extra, kits drop-ship from Magnuson to the lower 48, and Toyota &amp; Lexus builds can add in-house install and OTT calibration.</div>
${CONTACT_CTA}
  <div class="mnav">
${sections.map((s) => `    <a href="#${s.id}">${ESC(s.title)}</a>`).join("\n")}
  </div>
${sections.map((s) => `  <h2 id="${s.id}">${ESC(s.title)}</h2>
  <table class="mtab"><thead><tr><th>Product</th><th>Part #</th><th>Retail</th></tr></thead><tbody>
${s.rows.join("\n")}
  </tbody></table>`).join("\n")}
  <h2>Keep browsing</h2>
  <div class="lp-veh"><a href="/magnuson-supercharger-pricing">Toyota &amp; Lexus quote builder</a><a href="/banks-products">Banks Power catalog</a><a href="/supercharger">Why supercharge with Tuned Yota</a><a href="/find-your-exact-tune">Find Your Exact Tune</a></div>
  <p class="lp-disc">Prices are Magnuson's published retail (MSP) pricing as of ${ESC(CAT.updated)}, subject to change without notice. Tuned Yota is an authorized Magnuson dealer; freight and install/calibration quoted before you commit.</p>
</div>
${FOOTER}
<script src="/chat.js" defer></script>
</body>
</html>
`;
}

function main() {
  for (const it of STORE_ITEMS) fs.writeFileSync(path.join(SITE, `${it.slug}.html`), productPage(it));
  fs.writeFileSync(path.join(SITE, MAGNUSON_HUB_FILE), hubPage());
  const slugMap = Object.fromEntries(STORE_ITEMS.map((i) => [i.sku, i.slug]));
  for (const it of STORE_ITEMS) if (it.redSku) slugMap[it.redSku] = it.slug;
  fs.writeFileSync(path.join(SITE, "magnuson-slugs.json"), JSON.stringify(slugMap, null, 1));
  console.log(`magnuson store: ${STORE_ITEMS.length} product pages + hub written`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) main();
