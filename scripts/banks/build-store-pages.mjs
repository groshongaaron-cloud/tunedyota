// Full Banks Power store — one crawlable product page per catalogue product
// plus the master hub (/banks-products), generated from the committed site
// scrape data/banks-site-scrape.json (public bankspower.com retail pricing).
// Mirrors the Magnuson store architecture.
//
// Business rules:
// - Reserve mode: Tuned Yota is onboarding as a Banks dealer; pages carry
//   text/email CTAs (no online checkout until the dealer price sheet lands
//   and Converge flips on).
// - Toyota & Lexus lead everywhere: vehicle-specific Toyota/Lexus products
//   get the first hub sections and cross-link the OTT vehicle pages.
// - Coming-soon products (Banks `In_Development`, unpriced) still get pages —
//   first-to-rank when the part launches — with no Offer in schema.
// - Fitment tables list Toyota/Lexus applications in full; other makes
//   collapse to a count (PedalMonster fits 50+ makes — a 300-row table
//   serves no one).
//
// Import-safe: module top level only computes lists (seo-data.mjs imports
// BANKS_STORE_FILES for HEAD_PAGES). Page writes happen in main() only.
//
// Run via `npm run build:banks-store` — writes site/*.html and
// site/banks-slugs.json (sku -> slug, read by build-catalog.mjs for app
// deep-links).
import fs from "node:fs";
import path from "node:path";
import { CHROME } from "../build-amsoil-pages.mjs";

const { FONTS, SITECSS, FAVICON, NAV, FOOTER, ESC, STYLE } = CHROME;
const SITE = "site";
const BASE = "https://tunedyota.com";
const SCRAPE = JSON.parse(fs.readFileSync(path.join("data", "banks-site-scrape.json"), "utf8"));

const slugify = (s) => String(s).toLowerCase()
  .replace(/["'’.®™]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");

// "Ram-Air Intake" → "Banks Ram-Air Intake"; "Banks Ram-Air®" stays as-is.
const brandName = (title) => (/^banks\b/i.test(String(title).trim()) ? String(title).trim() : `Banks ${title}`);

// ---- Assemble product list with slugs and hub sections ----------------------
const TY_MAKES = new Set(["Toyota", "Lexus"]);

function primarySku(p) {
  const v = (p.variants || []).find((x) => x.sku) || {};
  return v.sku || slugify(p.handle).toUpperCase();
}

function sectionFor(p) {
  const makes = p.makes || [];
  const tyOnly = makes.length && makes.every((m) => TY_MAKES.has(m));
  if (tyOnly) return "Toyota & Lexus";
  if (makes.includes("Toyota") || makes.includes("Lexus")) return `${p.category || "Universal"} (fits Toyota & Lexus + more)`;
  return p.category || "Universal & Accessories";
}

function assignSlugs(products) {
  const used = new Set();
  for (const p of products) {
    let s = slugify(brandName(p.title));
    if (used.has(s)) s = `${s}-${slugify(primarySku(p))}`;
    if (used.has(s)) throw new Error(`slug collision: ${s}`);
    used.add(s);
    p.slug = s;
    p.section = sectionFor(p);
  }
  return products;
}

export const STORE_ITEMS = assignSlugs(SCRAPE.products.map((p) => ({ ...p })));
export const BANKS_HUB_FILE = "banks-products.html";
export const BANKS_GARAGE_FILE = "banks-garage.html";
export const BANKS_STORE_FILES = [BANKS_GARAGE_FILE, BANKS_HUB_FILE, ...STORE_ITEMS.map((i) => `${i.slug}.html`)];

// Tuned Yota is now an authorized Banks Power dealer — this exact claim carries
// on every Banks page.
const DEALER_CLAIM = "Tuned Yota is an authorized Banks Power dealer.";
const DEALER_EYEBROW = "Tuned Yota · Authorized Banks Power Dealer";

// ---- Fitment helpers --------------------------------------------------------
function yearRuns(years) {
  const ys = [...new Set(years)].sort((a, b) => a - b);
  const runs = [];
  for (const y of ys) {
    const last = runs[runs.length - 1];
    if (last && y === last[1] + 1) last[1] = y;
    else runs.push([y, y]);
  }
  return runs.map(([a, b]) => (a === b ? String(a) : `${a}–${b}`)).join(", ");
}

function fitmentRows(p) {
  const groups = new Map(); // "make|model|engine" -> years
  for (const f of p.fitment || []) {
    const k = `${f.make}|${f.model}|${f.engine}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f.year);
  }
  const ty = [], other = new Set();
  for (const [k, years] of groups) {
    const [make, model, engine] = k.split("|");
    if (TY_MAKES.has(make)) ty.push({ make, model, engine, years: yearRuns(years) });
    else other.add(make);
  }
  ty.sort((a, b) => (a.make === b.make ? a.model.localeCompare(b.model) : a.make === "Toyota" ? -1 : 1));
  return { ty, otherMakes: [...other].sort() };
}

// ---- Pricing helpers --------------------------------------------------------
function pricedVariants(p) { return (p.variants || []).filter((v) => v.sku && v.price != null); }
function priceLabel(p) {
  const vs = pricedVariants(p);
  if (!vs.length) return null;
  const prices = vs.map((v) => v.price);
  const lo = Math.min(...prices), hi = Math.max(...prices);
  return lo === hi ? `$${lo.toLocaleString("en-US")}` : `$${lo.toLocaleString("en-US")}–$${hi.toLocaleString("en-US")}`;
}

// ---- Schema -----------------------------------------------------------------
function productLd(p, url, name, desc) {
  const vs = pricedVariants(p);
  const ld = {
    "@context": "https://schema.org", "@type": "Product", "@id": `${url}#product`,
    name, sku: primarySku(p), mpn: primarySku(p),
    brand: { "@type": "Brand", name: "Banks Power" },
    category: p.category || "Vehicle Performance Parts",
    image: p.image || `${BASE}/og-image.png`, description: desc, url,
  };
  if (vs.length) {
    const prices = vs.map((v) => v.price);
    const anyAvail = vs.some((v) => v.available);
    const seller = { "@type": "AutomotiveBusiness", "@id": `${BASE}/#business`, name: "Tuned Yota", telephone: "+1-612-406-7117", url: `${BASE}/` };
    const availability = anyAvail ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";
    ld.offers = vs.length === 1
      ? { "@type": "Offer", url, priceCurrency: "USD", price: vs[0].price.toFixed(2), priceValidUntil: "2026-12-31", availability, itemCondition: "https://schema.org/NewCondition", seller }
      : { "@type": "AggregateOffer", url, priceCurrency: "USD", lowPrice: Math.min(...prices).toFixed(2), highPrice: Math.max(...prices).toFixed(2), offerCount: vs.length, availability, seller };
  }
  return JSON.stringify(ld);
}

function breadcrumbLd(url, name) {
  return JSON.stringify({
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${BASE}/` },
      { "@type": "ListItem", position: 2, name: "Banks Power Store", item: `${BASE}/banks-products` },
      { "@type": "ListItem", position: 3, name, item: url },
    ],
  });
}

// ---- Templates --------------------------------------------------------------
const TABLESTYLE = `<style>
.mtab{width:100%;border-collapse:collapse;margin:14px 0;font-size:14px}
.mtab th{font-family:'Spectral SC',serif;font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--sage-d);text-align:left;padding:8px 8px;border-bottom:1.6px solid var(--line)}
.mtab td{padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:top}
.mtab .pr{white-space:nowrap;font-weight:900;color:var(--ink)}
.mnav{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}
.mnav a{font-size:13px;border:1.2px solid var(--line);border-radius:999px;padding:6px 12px;color:var(--brown);text-decoration:none;font-weight:700}
</style>`;

// Client-side search over the embedded product index (mirrors amsoil-products.html).
const SEARCHSTYLE = `<style>
#hsearch{width:100%;padding:13px 16px;font-size:16px;border:1.6px solid var(--brown);border-radius:12px;margin:14px 0 4px}
#hresults{margin:0 0 6px}
.htab{width:100%;border-collapse:collapse;font-size:14px}
.htab td{padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:top}
.htab .hp{white-space:nowrap;font-weight:900;color:var(--ink);text-align:right}
.hsizes{font-size:11.5px;color:var(--sage-d);font-weight:700}
</style>`;

// [{n:name, s:sku, c:category/section, r:price-label, u:/slug}] for embedded JSON search.
function searchIndex(items) {
  return items.map((p) => ({
    n: brandName(p.title), s: primarySku(p), c: p.section,
    r: priceLabel(p) || "Coming soon", u: `/${p.slug}`,
  }));
}
function searchBlock(items, placeholder) {
  return `  <input id="hsearch" type="search" placeholder="${ESC(placeholder)}" autocomplete="off" aria-label="Search Banks Power products">
  <div id="hresults"></div>
  <script type="application/json" id="hdata">${JSON.stringify(searchIndex(items))}</script>
  <script>
  (function(){
    var data=JSON.parse(document.getElementById('hdata').textContent);
    var inp=document.getElementById('hsearch'),out=document.getElementById('hresults');
    function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
    inp.addEventListener('input',function(){
      var q=inp.value.trim().toLowerCase();
      if(q.length<2){out.innerHTML='';return;}
      var hits=data.filter(function(p){return (p.n+' '+p.s+' '+p.c).toLowerCase().indexOf(q)>-1;}).slice(0,40);
      out.innerHTML=hits.length?'<table class="htab"><tbody>'+hits.map(function(p){
        return '<tr><td><a href="'+esc(p.u)+'">'+esc(p.n)+'</a><div class="hsizes">'+esc(p.c)+'</div></td><td>'+esc(p.s)+'</td><td class="hp">'+esc(p.r)+'</td></tr>';
      }).join('')+'</tbody></table>':'<p style="color:var(--sage-d)">No matches — try a shorter term or browse the categories below.</p>';
    });
  })();
  </script>`;
}

const CONTACT_CTA = `
  <div class="lp-cta">
    <a class="btn primary" href="sms:+16124067117">Text us to reserve — (612) 406-7117</a>
    <a class="btn outline" href="mailto:info@tunedyota.com">Email info@tunedyota.com</a>
  </div>`;

const VEHICLE_PAGE = {
  Tundra: "/toyota-tundra-ott-tune", Tacoma: "/toyota-tacoma-ott-tune",
  "4Runner": "/toyota-4runner-ott-tune", Sequoia: "/toyota-sequoia-ott-tune",
  "Land Cruiser": "/toyota-land-cruiser-ott-tune", "FJ Cruiser": "/toyota-fj-cruiser-ott-tune",
  Highlander: "/toyota-highlander-ott-tune", RAV4: "/toyota-rav4-ott-tune", Camry: "/toyota-camry-ott-tune",
  GX: "/lexus-gx-ott-tune", LX: "/lexus-lx570-ott-tune", RX: "/lexus-rx350-ott-tune",
};
function vehicleLinks(fit) {
  const seen = new Map();
  for (const r of fit.ty) {
    for (const [m, href] of Object.entries(VEHICLE_PAGE)) {
      if (r.model === m || r.model.startsWith(m)) { seen.set(m, href); break; }
    }
  }
  return [...seen.entries()];
}

function productPage(p) {
  const url = `${BASE}/${p.slug}`;
  const sku = primarySku(p);
  const name = brandName(p.title);
  const price = priceLabel(p);
  const fit = fitmentRows(p);
  const tyFit = fit.ty.length > 0;
  const desc = (p.description
    ? p.description.slice(0, 250).replace(/\s+\S*$/, "")
    : `${name}, genuine Banks Power part #${sku}.`) +
    ` Reserve through Tuned Yota${tyFit ? " — Toyota & Lexus install and OTT calibration available in the Upper Midwest" : ""}.`;
  const vlinks = vehicleLinks(fit);

  const variantRows = (p.variants || []).filter((v) => v.sku).map((v) =>
    `<tr><td>${ESC(v.sku)}</td><td>${ESC(v.title || "—")}</td><td class="pr">${v.price != null ? `$${v.price.toLocaleString("en-US")}` : "Coming soon"}</td><td>${v.price == null ? "Announced" : v.available ? "In stock at Banks" : "Backordered"}</td></tr>`).join("\n");

  const fitRows = fit.ty.map((r) =>
    `<tr><td>${ESC(r.years)}</td><td>${ESC(`${r.make} ${r.model}`)}</td><td>${ESC(r.engine)}</td></tr>`).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${ESC(name)}${price ? ` — ${price}` : " — Coming Soon"} | Banks ${ESC(sku)} | Tuned Yota</title>
<meta name="description" content="${ESC(desc)}">
<link rel="canonical" href="${url}">
<script type="application/ld+json">
${productLd(p, url, name, desc)}
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
  <div class="lp-eyebrow">${DEALER_EYEBROW} · ${ESC(p.section)}</div>
  <h1>${ESC(name)}</h1>
  <div class="lp-answer" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
    ${p.image ? `<img src="${ESC(p.image)}" alt="${ESC(name)}" loading="lazy" width="160" height="160" style="border-radius:12px;object-fit:contain;background:#fff">` : ""}
    <div style="flex:1;min-width:220px">
      <div style="font-size:27px;font-weight:900;color:var(--ink)">${price || "Coming soon"}</div>
      <div style="font-size:13.5px;color:var(--sage-d);margin-top:2px">Banks part&nbsp;#&nbsp;${ESC(sku)} · ${price ? "Banks' published retail pricing" : "Announced by Banks — priced on release"}</div>
    </div>
  </div>
${CONTACT_CTA}
  ${p.description ? `<p style="margin:14px 0 0">${ESC(p.description)}</p>` : ""}
  <p style="margin:14px 0 0"><strong>${DEALER_CLAIM}</strong> Genuine <strong>Banks Power</strong> hardware reserved through Tuned Yota${tyFit ? ", the Upper Midwest's Toyota &amp; Lexus performance shop — add professional install and OTT calibration in one stop" : ""}. ${price ? "You pay Banks' published retail price; we confirm personally before anything is charged." : "Banks has announced this part but not priced it yet — reserve interest now and be first in line at launch."}</p>
${fitRows ? `
  <h2>Toyota &amp; Lexus fitment</h2>
  <table class="mtab"><thead><tr><th>Years</th><th>Vehicle</th><th>Engine</th></tr></thead><tbody>
${fitRows}
  </tbody></table>` : ""}
${fit.otherMakes.length ? `  <p class="lp-disc" style="margin-top:4px">Also fits ${fit.otherMakes.length} other makes (${ESC(fit.otherMakes.slice(0, 6).join(", "))}${fit.otherMakes.length > 6 ? "…" : ""}) — text us your vehicle and we'll confirm.</p>` : ""}
${variantRows ? `
  <h2>Options &amp; part numbers</h2>
  <table class="mtab"><thead><tr><th>Part #</th><th>Option</th><th>Retail</th><th>Status</th></tr></thead><tbody>
${variantRows}
  </tbody></table>` : ""}
  <h2>Keep browsing</h2>
  <div class="lp-veh">${vlinks.map(([m, href]) => `<a href="${href}">${ESC(m)} tuning overview</a>`).join("")}<a href="/banks-garage">Banks for your Toyota &amp; Lexus</a><a href="/banks-products">Every Banks Power product</a><a href="/supercharger">Superchargers at Tuned Yota</a><a href="/find-your-exact-tune">Find Your Exact Tune</a></div>
  <p class="lp-disc">${DEALER_CLAIM} Prices are Banks Power's published retail pricing as of ${ESC(SCRAPE.scraped)} and are subject to change. Reservations are confirmed personally with no online payment, and install/calibration is quoted before you commit.</p>
</div>
${FOOTER}
<script src="/chat.js" defer></script>
</body>
</html>
`;
}

function hubPage() {
  const url = `${BASE}/banks-products`;
  const bySection = new Map();
  for (const p of STORE_ITEMS) {
    if (!bySection.has(p.section)) bySection.set(p.section, []);
    bySection.get(p.section).push(p);
  }
  // Toyota & Lexus first, then fits-Toyota crossovers, then everything else A→Z.
  const sectionNames = [...bySection.keys()].sort((a, b) => {
    const rank = (s) => (s === "Toyota & Lexus" ? 0 : /fits Toyota/.test(s) ? 1 : 2);
    return rank(a) - rank(b) || a.localeCompare(b);
  });
  const total = STORE_ITEMS.length;
  const desc = `Every current Banks Power product — ${total} products with Banks' published retail pricing — reserved through Tuned Yota. Cold air intakes, iDash gauges, PedalMonster, exhausts and more for Toyota, Lexus and beyond, with install and OTT calibration in the Upper Midwest.`;

  const row = (p) => {
    const price = priceLabel(p);
    return `<tr><td><a href="/${p.slug}">${ESC(brandName(p.title))}</a>${p.comingSoon ? ' <span style="font-size:11.5px;color:var(--sage-d)">(coming soon)</span>' : ""}</td><td>${ESC(primarySku(p))}</td><td class="pr">${price || "TBA"}</td></tr>`;
  };

  const sections = sectionNames.map((name) => ({
    id: slugify(name), title: name,
    rows: bySection.get(name).sort((a, b) => a.title.localeCompare(b.title)).map(row),
  }));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Banks Power Catalog — All ${total} Products &amp; 2026 Prices | Tuned Yota</title>
<meta name="description" content="${ESC(desc)}">
<link rel="canonical" href="${url}">
<script type="application/ld+json">
${JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: `${BASE}/` }, { "@type": "ListItem", position: 2, name: "Banks Power Store", item: url }] })}
</script>
${FONTS}
${SITECSS}
${FAVICON}
${STYLE}
${TABLESTYLE}
${SEARCHSTYLE}
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
${NAV}
<a id="main" tabindex="-1"></a>
<div class="lp">
  <div class="lp-eyebrow">${DEALER_EYEBROW} · Full Catalog</div>
  <h1>Banks Power — Every Product, 2026 Retail Pricing</h1>
  <div class="lp-answer">${DEALER_CLAIM} All <strong>${total} current Banks Power products</strong> at Banks' published retail pricing — Ram-Air cold air intakes, iDash gauges and Stealth Pods, PedalMonster throttle controllers, Monster exhausts, and the full diesel line. Search below, or browse by category. Toyota &amp; Lexus applications lead, and Upper-Midwest builds can add professional install and OTT calibration in one stop.</div>
${searchBlock(STORE_ITEMS, `Search all ${total} Banks Power products — name or part #…`)}
${CONTACT_CTA}
  <p style="margin:14px 0 0"><a href="/banks-garage"><strong>Shopping for a Toyota or Lexus? See Banks by platform in the Banks Garage →</strong></a></p>
  <div class="mnav">
${sections.map((s) => `    <a href="#${s.id}">${ESC(s.title)}</a>`).join("\n")}
  </div>
${sections.map((s) => `  <h2 id="${s.id}">${ESC(s.title)}</h2>
  <table class="mtab"><thead><tr><th>Product</th><th>Part #</th><th>Retail</th></tr></thead><tbody>
${s.rows.join("\n")}
  </tbody></table>`).join("\n")}
  <h2>Keep browsing</h2>
  <div class="lp-veh"><a href="/banks-garage">Banks for your Toyota &amp; Lexus</a><a href="/toyota-tacoma-ott-tune">2024+ Tacoma tuning</a><a href="/toyota-4runner-ott-tune">4Runner tuning</a><a href="/magnuson-products">Magnuson supercharger catalog</a><a href="/find-your-exact-tune">Find Your Exact Tune</a></div>
  <p class="lp-disc">${DEALER_CLAIM} Prices are Banks Power's published retail pricing as of ${ESC(SCRAPE.scraped)}, subject to change without notice. Reservations confirm personally with no online payment.</p>
</div>
${FOOTER}
<script src="/chat.js" defer></script>
</body>
</html>
`;
}

// ---- /banks-garage — Toyota & Lexus-centric, platform-organized ------------
// Vehicle-centric entry point (mirrors /amsoil-garage): every Banks product with
// a Toyota or Lexus application, grouped by platform (make + model), each row
// carrying its fitment year range VERBATIM from the catalog — never compressed
// across a generation boundary. Links prominently to the full store.
function garagePage() {
  const url = `${BASE}/banks-garage`;

  // Order Toyota models first (roughly newest-relevant), then Lexus; unknown → A→Z.
  const MODEL_ORDER = ["Tacoma", "4Runner", "Tundra", "Sequoia", "Land Cruiser", "FJ Cruiser", "Highlander", "RAV4", "Camry"];
  const modelRank = (make, model) => {
    if (make === "Lexus") return 100 + (model.charCodeAt(0) || 0);
    const i = MODEL_ORDER.indexOf(model);
    return i === -1 ? 50 + (model.charCodeAt(0) || 0) : i;
  };

  // platformKey "make|model" (lowercased so casing variants in the scrape —
  // e.g. "4Runner" vs "4runner" — collapse to one platform and one anchor id).
  // Canonical label prefers the MODEL_ORDER spelling, else the most title-cased.
  const platforms = new Map();
  const betterLabel = (a, b) => {
    if (MODEL_ORDER.includes(a)) return a;
    if (MODEL_ORDER.includes(b)) return b;
    const caps = (s) => (s.match(/[A-Z]/g) || []).length;
    return caps(b) > caps(a) ? b : a;
  };
  let tyProducts = 0;
  for (const p of STORE_ITEMS) {
    const fit = fitmentRows(p);
    if (!fit.ty.length) continue;
    tyProducts++;
    const price = priceLabel(p);
    const name = brandName(p.title);
    const sku = primarySku(p);
    for (const r of fit.ty) {
      const key = `${r.make}|${r.model}`.toLowerCase();
      if (!platforms.has(key)) platforms.set(key, { make: r.make, model: r.model, rows: [] });
      const pl = platforms.get(key);
      pl.model = betterLabel(pl.model, r.model);
      pl.rows.push({
        years: r.years, engine: r.engine, name, sku, price, slug: p.slug, comingSoon: p.comingSoon,
      });
    }
  }

  const platformList = [...platforms.values()].sort((a, b) =>
    (a.make === b.make ? modelRank(a.make, a.model) - modelRank(b.make, b.model) : a.make === "Toyota" ? -1 : 1));
  for (const pl of platformList) {
    pl.rows.sort((a, b) => a.name.localeCompare(b.name) || a.years.localeCompare(b.years));
    pl.id = slugify(`${pl.make}-${pl.model}`);
  }

  // Tuned Yota leads truck/SUV: these core Toyota/Lexus platforms render first
  // as full sections, in this exact order. Everything else (cars, vans, other
  // Lexus) moves into ONE collapsed <details> at the bottom — nothing deleted,
  // every fitment and product stays reachable, it just stops competing with the
  // trucks. Matched case-insensitively against the canonical platform label so
  // e.g. "LC 250"/"LC250" would fall in with Land Cruiser if the catalog adds it.
  const CORE_ORDER = [
    { make: "Toyota", match: /^tacoma$/i },
    { make: "Toyota", match: /^tundra$/i },
    { make: "Toyota", match: /^4runner$/i },
    { make: "Toyota", match: /^sequoia$/i },
    { make: "Toyota", match: /^(land ?cruiser|lc ?250)$/i },
    { make: "Lexus", match: /^gx$/i },
    { make: "Lexus", match: /^lx$/i },
  ];
  const corePlatforms = [];
  for (const spec of CORE_ORDER) {
    for (const pl of platformList) {
      if (pl.make === spec.make && spec.match.test(pl.model) && !corePlatforms.includes(pl)) corePlatforms.push(pl);
    }
  }
  const restPlatforms = platformList.filter((pl) => !corePlatforms.includes(pl));

  const desc = `Banks Power for your Toyota or Lexus — Ram-Air intakes, PedalMonster throttle response controllers, iDash gauges and more, organized by platform with Banks' published retail pricing. ${DEALER_CLAIM} Install and OTT calibration available in the Upper Midwest.`;

  const platformSection = (pl) => `  <h2 id="${pl.id}">${ESC(`${pl.make} ${pl.model}`)}</h2>
  <table class="mtab"><thead><tr><th>Product</th><th>Fits</th><th>Part #</th><th>Retail</th></tr></thead><tbody>
${pl.rows.map((r) => `<tr><td><a href="/${r.slug}">${ESC(r.name)}</a>${r.comingSoon ? ' <span style="font-size:11.5px;color:var(--sage-d)">(coming soon)</span>' : ""}</td><td>${ESC(r.years)}${r.engine ? ` · ${ESC(r.engine)}` : ""}</td><td>${ESC(r.sku)}</td><td class="pr">${r.price || "TBA"}</td></tr>`).join("\n")}
  </tbody></table>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Banks Power for Toyota &amp; Lexus — By Platform &amp; 2026 Prices | Tuned Yota</title>
<meta name="description" content="${ESC(desc)}">
<link rel="canonical" href="${url}">
<script type="application/ld+json">
${JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: `${BASE}/` }, { "@type": "ListItem", position: 2, name: "Banks for Toyota & Lexus", item: url }] })}
</script>
${FONTS}
${SITECSS}
${FAVICON}
${STYLE}
${TABLESTYLE}
<style>
.more-fitments{margin:26px 0 0;border-top:1.6px solid var(--line);padding-top:10px}
.more-fitments>summary{font-family:'Spectral SC',serif;font-size:15px;letter-spacing:.04em;color:var(--brown);cursor:pointer;padding:8px 0;font-weight:700}
.more-fitments[open]>summary{margin-bottom:6px}
</style>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
${NAV}
<a id="main" tabindex="-1"></a>
<div class="lp">
  <div class="lp-eyebrow">${DEALER_EYEBROW} · Toyota &amp; Lexus</div>
  <h1>Banks Power for Your Toyota &amp; Lexus</h1>
  <div class="lp-answer">${DEALER_CLAIM} Every Banks Power part with a Toyota or Lexus application — <strong>${tyProducts} products across ${platformList.length} platforms</strong> — organized by vehicle with Banks' published retail pricing. The Toyota and Lexus trucks and SUVs we build lead below; every other Toyota &amp; Lexus fitment is in the collapsed section at the bottom. Fitment year ranges are shown exactly as Banks lists them. Add professional install and OTT calibration in one stop in the Upper Midwest.</div>
${CONTACT_CTA}
  <div class="mnav">
${corePlatforms.map((pl) => `    <a href="#${pl.id}">${ESC(`${pl.make} ${pl.model}`)}</a>`).join("\n")}
  </div>
${corePlatforms.map(platformSection).join("\n")}
${restPlatforms.length ? `  <details class="more-fitments">
    <summary>More Toyota &amp; Lexus fitments (PedalMonster &amp; universal parts)</summary>
    <div class="mnav">
${restPlatforms.map((pl) => `      <a href="#${pl.id}">${ESC(`${pl.make} ${pl.model}`)}</a>`).join("\n")}
    </div>
${restPlatforms.map(platformSection).join("\n")}
  </details>` : ""}
  <h2>Every Banks Power product</h2>
  <p><a href="/banks-products"><strong>Or browse the complete Banks Power line — every product, searchable →</strong></a></p>
  <h2>Keep browsing</h2>
  <div class="lp-veh"><a href="/banks-products">Full Banks Power catalog</a><a href="/toyota-tacoma-ott-tune">2024+ Tacoma tuning</a><a href="/toyota-4runner-ott-tune">4Runner tuning</a><a href="/supercharger">Superchargers at Tuned Yota</a><a href="/find-your-exact-tune">Find Your Exact Tune</a></div>
  <p class="lp-disc">${DEALER_CLAIM} Prices are Banks Power's published retail pricing as of ${ESC(SCRAPE.scraped)}, subject to change without notice. Reservations confirm personally with no online payment, and install/calibration is quoted before you commit.</p>
</div>
${FOOTER}
<script src="/chat.js" defer></script>
</body>
</html>
`;
}

function main() {
  for (const it of STORE_ITEMS) fs.writeFileSync(path.join(SITE, `${it.slug}.html`), productPage(it));
  fs.writeFileSync(path.join(SITE, BANKS_HUB_FILE), hubPage());
  fs.writeFileSync(path.join(SITE, BANKS_GARAGE_FILE), garagePage());
  const slugMap = {};
  for (const it of STORE_ITEMS) for (const v of it.variants || []) if (v.sku) slugMap[v.sku] = it.slug;
  fs.writeFileSync(path.join(SITE, "banks-slugs.json"), JSON.stringify(slugMap, null, 1));
  console.log(`banks store: ${STORE_ITEMS.length} product pages + hub + garage written`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) main();
