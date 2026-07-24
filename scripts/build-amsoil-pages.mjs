// scripts/build-amsoil-pages.mjs
// Generates one AMSOIL landing page per Toyota/Lexus platform from
// site/amsoil-garage.json (e.g. amsoil-toyota-tundra.html). Each page targets
// "AMSOIL <oil/fluids> for <vehicle>" search + AI intent and drives to order.
//
// INTEGRITY RULE: product family + viscosity + filter code are AMSOIL-API
// authoritative (docs/amsoil/fluid-data-verification.md) and are always shown.
// Fluid CAPACITIES and drain INTERVALS are Toyota-OEM-spec drafts — they are
// rendered ONLY for generations flagged `verified: true`. Until an installer
// signs off (flipping the flag), those numbers stay off the public page.
//
// Run: node scripts/build-amsoil-pages.mjs   (also invoked by `npm run build:seo`).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "site");
const CAT = require("../site/amsoil-garage.json");
const { amsoilUrl } = require("../site/amsoil-referral.js");

const ESC = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const slugOf = (make, model) => `${make} ${model}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const ottPage = (slug) => `${slug}-ott-tune.html`;

// Category for schema/labels, derived from product name keywords.
function categoryOf(name) {
  const n = name.toLowerCase();
  if (n.includes("filter")) return "Oil Filter";
  if (n.includes("gear")) return "Gear Lube";
  // Order matters: diesel/coolant/additive names also contain viscosity grades
  // ("5w-40") or generic words, so they must match BEFORE the motor-oil check.
  if (n.includes("antifreeze") || n.includes("coolant")) return "Antifreeze & Coolant";
  if (n.includes("performance improver") || n.includes("upper cylinder")) return "Fuel Additive";
  if (n.includes("diesel")) return "Diesel Oil";
  if (n.includes("european")) return "European Motor Oil";
  if (n.includes("high-mileage")) return "High-Mileage Motor Oil";
  if (n.includes("transmission") || n.includes("atf") || n.includes("multi-vehicle")) return "Automatic Transmission Fluid";
  if (n.includes("grease")) return "Grease";
  if (n.includes("motor oil") || n.includes("0w") || n.includes("5w")) return "Synthetic Motor Oil";
  return "Automotive Fluid";
}
const prod = (sku) => CAT.products[sku];

// Merchant-listing return policy for every Offer (GSC/Merchant Center reads
// `hasMerchantReturnPolicy`). Mirrors AMSOIL Inc.'s actual policy — AMSOIL
// fulfills all orders: 30-day returns on unopened product, refund to original
// payment, customer pays return freight. Human-readable page: /returns.
const RETURN_POLICY = `"hasMerchantReturnPolicy":{"@type":"MerchantReturnPolicy","applicableCountry":"US","returnPolicyCategory":"https://schema.org/MerchantReturnFiniteReturnWindow","merchantReturnDays":30,"returnMethod":"https://schema.org/ReturnByMail","returnFees":"https://schema.org/ReturnFeesCustomerResponsibility","refundType":"https://schema.org/FullRefund","merchantReturnLink":"https://tunedyota.com/returns"}`;

// Shared with the guide generator (Front B): live retail price + product-image tag.
const priceOfP = (p) => (p && typeof p.salePrice === "number" && p.salePrice > 0 ? p.salePrice
  : p && typeof p.retailPrice === "number" && p.retailPrice > 0 ? p.retailPrice : null);
const imgTagP = (p, size) => (p && p.image && /\.jpg$/i.test(p.image))
  ? `<img class="pimg" src="${p.image}" alt="${ESC(p.name)}" loading="lazy" width="${size}" height="${size}">` : "";

// ---- shared chrome (mirrors build-state-pages.mjs; AMSOIL link included) ----
const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&family=Spectral:wght@400;500;600;700&family=Spectral+SC:wght@500;600&display=swap" rel="stylesheet">`;
const SITECSS = `<link rel="stylesheet" href="site.css">`;
const FAVICON = `<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
<link rel="icon" type="image/svg+xml" href="/fox.svg">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#3A2E26">`;
const NAV = `<header class="snav"><a class="snav-logo" href="index.html">Tuned Yota</a><nav class="snav-links"><a href="index.html">Home</a><a href="find-your-exact-tune.html">Find Your Tune</a><a href="index.html#vehicles">Vehicles</a><a href="ott-tune.html">OTT Tune</a><a href="supercharger.html">Supercharger</a><a href="amsoil-garage.html">AMSOIL</a><a href="faq.html">FAQ</a><a href="team.html">Team</a></nav><a class="snav-call" href="tel:+16124067117">Call / Text</a></header>`;
const FOOTER = `<footer class="sfoot"><div class="fmark">Tuned Yota</div><div class="ftag">Undeniable Performance</div>
  <div class="frow"><a href="index.html">Home</a><a href="find-your-exact-tune.html">Find Your Tune</a><a href="ott-tune.html">OTT Tune</a><a href="supercharger.html">Supercharger</a><a href="amsoil-garage.html">AMSOIL</a><a href="faq.html">FAQ</a><a href="team.html">Team</a><a href="privacy.html">Privacy</a><a href="terms.html">Terms</a><a href="returns.html">Returns</a></div>
  <div class="fcon">Call or text <a href="tel:+16124067117">(612) 406-7117</a> &nbsp;·&nbsp; <a href="mailto:info@tunedyota.com">info@tunedyota.com</a><br>
  Serving Minnesota · Iowa · Wisconsin · North Dakota · South Dakota · Nebraska<br>
  <a href="https://www.facebook.com/TunedYota/" target="_blank" rel="noopener">Facebook</a> · <a href="https://www.facebook.com/groups/501008078456222" target="_blank" rel="noopener">Midwest Tuning Group</a> · <a href="https://www.instagram.com/tunedyota/" target="_blank" rel="noopener">Instagram</a></div>
  <div class="fcopy">© Tuned Yota · Toyota &amp; Lexus Performance Tuning · Authorized OTT Installer &amp; AMSOIL Dealer</div></footer>`;
const FQSCRIPT = `<script>
document.querySelectorAll('.lp-fqq').forEach(q=>q.addEventListener('click',()=>{
  const it=q.closest('.lp-fq'),a=it.querySelector('.lp-fqa'),open=it.classList.contains('open');
  document.querySelectorAll('.lp-fq.open').forEach(o=>{o.classList.remove('open');o.querySelector('.lp-fqa').style.maxHeight=null;});
  if(!open){it.classList.add('open');a.style.maxHeight=a.scrollHeight+'px';q.setAttribute('aria-expanded','true');}else{q.setAttribute('aria-expanded','false');}
}));
</script>`;

const STYLE = `<style>
:root{--bg:#EDECEB;--ink:#3A2E26;--brown:#5B4B42;--brown2:#5D4B40;--sage:#99A08E;--sage-d:#7c8472;--blue:#B3D0D9;--sand:#DFC4B5;--card:#FAF9F7;--white:#fff;--line:rgba(91,75,66,.16);--ring:rgba(179,208,217,.55);--shadow:0 14px 50px -12px rgba(58,46,38,.22);--shadow-sm:0 6px 22px -10px rgba(58,46,38,.20);--r:16px}
*{box-sizing:border-box;margin:0;padding:0}html,body{background:var(--bg);-webkit-font-smoothing:antialiased}
.lp{font-family:'Lato',sans-serif;color:var(--brown2);max-width:800px;margin:0 auto;padding:30px 18px 48px}
.lp-eyebrow{font-family:'Spectral SC',serif;letter-spacing:.18em;text-transform:uppercase;font-size:12px;color:var(--sage-d);font-weight:600}
h1{font-family:'Spectral',serif;font-weight:600;font-size:clamp(28px,6vw,42px);line-height:1.08;color:var(--ink);letter-spacing:-.01em;margin:8px 0 14px}
.lp-answer{font-size:16px;line-height:1.6;background:var(--card);border:1.5px solid var(--line);border-radius:var(--r);padding:20px 22px;box-shadow:var(--shadow-sm)}
.lp-cta{display:flex;flex-wrap:wrap;gap:11px;margin:20px 0 6px}
.btn{font-family:'Lato',sans-serif;font-weight:900;letter-spacing:.03em;border:none;border-radius:99px;padding:14px 24px;cursor:pointer;font-size:14.5px;text-decoration:none;display:inline-flex;align-items:center;gap:8px;transition:.2s}
.btn.primary{background:var(--ink);color:#F3EFEA;box-shadow:var(--shadow-sm)}.btn.primary:hover{background:var(--brown)}
.btn.outline{background:transparent;border:1.6px solid var(--brown);color:var(--brown)}.btn.outline:hover{background:var(--brown);color:#fff}
h2{font-family:'Spectral',serif;font-weight:600;font-size:24px;color:var(--ink);margin:34px 0 14px}
.lp p{font-size:14.5px;line-height:1.6}
.gen{background:var(--white);border:1.5px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow-sm);padding:16px 18px;margin:0 0 12px}
.gen h3{font-family:'Spectral',serif;font-weight:600;font-size:17px;color:var(--ink);margin:0 0 4px}
.gen .eng{font-size:12.5px;color:var(--sage-d);font-weight:700;text-transform:uppercase;letter-spacing:.08em}
.fl{display:flex;gap:11px;align-items:center;border-top:1px solid var(--line);padding:11px 0}
.fl:first-of-type{border-top:none;margin-top:8px}
.fl .pimg{flex:0 0 50px;width:50px;height:50px;object-fit:contain;background:#fff;border:1px solid var(--line);border-radius:9px;padding:3px}
.fl .pinfo{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.fl .sys{font-weight:700;color:var(--sage-d);font-size:11px;text-transform:uppercase;letter-spacing:.05em}
.fl .prd{font-size:13px;color:#333;font-weight:600;line-height:1.25}
.fl .cap{font-size:11.5px;color:var(--sage-d);font-weight:700}
.fl .pbuy{flex:0 0 auto;display:flex;flex-direction:column;align-items:flex-end;gap:5px}
.fl .price{font-weight:900;color:var(--ink);font-size:14px;white-space:nowrap}
.fl .ord{background:var(--ink);color:#fff;border-radius:99px;padding:7px 13px;font-weight:900;text-decoration:none;font-size:12px;white-space:nowrap}
.fl .ord:hover{background:var(--brown)}
.hero-prod{display:flex;gap:16px;align-items:center;background:var(--white);border:1.5px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow-sm);padding:16px 18px;margin:16px 0 4px}
.hero-prod .pimg{flex:0 0 104px;width:104px;height:104px;object-fit:contain;background:#fff;border:1px solid var(--line);border-radius:12px;padding:6px}
.hero-prod .hp-info{flex:1;min-width:0}
.hero-prod .hp-name{font-family:'Spectral',serif;font-weight:600;font-size:18px;color:var(--ink);margin:3px 0 2px;line-height:1.2}
.hero-prod .hp-price{font-size:16px;font-weight:900;color:var(--ink);margin-bottom:11px}
.hero-prod .hp-pc{font-size:12.5px;font-weight:600;color:var(--sage-d)}
.hero-prod .hp-cta{display:flex;flex-wrap:wrap;gap:9px}
.hero-prod .hp-cta .btn{padding:11px 18px;font-size:13px}
@media(max-width:520px){.hero-prod{flex-direction:column;text-align:center}.hero-prod .hp-cta{justify-content:center}}
ul.lp-bul{list-style:none;display:grid;gap:9px;margin-top:6px}
ul.lp-bul li{position:relative;padding-left:24px;font-size:14.5px;line-height:1.5}
ul.lp-bul li::before{content:"";position:absolute;left:0;top:5px;width:11px;height:11px;border-radius:3px;background:var(--sage)}
.lp-book{background:linear-gradient(135deg,rgba(153,160,142,.16),rgba(179,208,217,.16));border:1.5px solid var(--line);border-radius:var(--r);padding:22px;margin-top:28px}
.lp-book h2{margin:0 0 8px}.lp-book p{font-size:14.5px;line-height:1.6;margin-bottom:14px}
.lp-fq{background:var(--white);border:1.5px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow-sm);overflow:hidden;margin-bottom:10px}
.lp-fq.open{box-shadow:0 0 0 3px var(--ring),var(--shadow-sm);border-color:var(--brown)}
.lp-fqq{width:100%;text-align:left;background:none;border:none;cursor:pointer;font-family:'Spectral';font-weight:600;font-size:16px;color:var(--ink);padding:16px 18px;display:flex;justify-content:space-between;gap:12px;align-items:center}
.lp-fqq span{font-family:'Lato';font-weight:400;font-size:23px;color:var(--sage-d);transition:.25s;flex:0 0 auto}.lp-fq.open .lp-fqq span{transform:rotate(45deg)}
.lp-fqa{max-height:0;overflow:hidden;transition:max-height .3s ease}.lp-fqa p{font-size:14px;line-height:1.6;padding:0 18px 16px}
.lp-veh{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}
.lp-veh a{font-size:13.5px;font-weight:700;color:var(--brown);background:var(--white);border:1.5px solid var(--line);border-radius:99px;padding:8px 14px;text-decoration:none;box-shadow:var(--shadow-sm);transition:.15s}
.lp-veh a:hover{background:var(--ink);color:#F3EFEA;border-color:var(--ink)}
.lp-links{margin-top:30px;font-size:14px;line-height:2}.lp-links a{color:var(--brown);font-weight:700;text-decoration:none;margin-right:16px}.lp-links a:hover{text-decoration:underline}
.captbl-wrap{overflow-x:auto;background:var(--white);border:1.5px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow-sm);margin:0 0 10px}
.captbl{width:100%;border-collapse:collapse;font-size:13px;min-width:520px}
.captbl th{text-align:left;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--sage-d);padding:12px 12px 8px;border-bottom:1.5px solid var(--ink)}
.captbl th span{font-weight:400;letter-spacing:0;text-transform:none}
.captbl td{padding:10px 12px;border-bottom:1px solid var(--line);color:var(--brown2)}
.captbl tbody tr:last-child td{border-bottom:none}
.captbl .capv{font-weight:900;color:var(--ink);white-space:nowrap}
.lp-final{text-align:center;margin-top:30px}
.lp-disc{font-size:11.5px;opacity:.55;text-align:center;margin-top:22px;line-height:1.55}
</style>`;

const FQA11Y = `<script>document.querySelectorAll('.lp-fq').forEach(function(it,i){var q=it.querySelector('.lp-fqq'),a=it.querySelector('.lp-fqa');if(!q||!a)return;a.id='amfqa-'+i;q.setAttribute('aria-controls','amfqa-'+i);});</script>`;
// Progressive-enhancement click attribution: rewrites amsoil.com links to route
// through the /amsoil-go tracker (source = page slug). No-JS visitors keep the
// direct links. See site/amsoil-track.js.
const TRACK = `<script src="/amsoil-track.js" defer></script>`;

// Cross-link hub: all AMSOIL platform pages (built after the model list is known).
function vehHub(models, currentSlug) {
  const links = models
    .filter((m) => m.slug !== currentSlug)
    .map((m) => `<a href="amsoil-${m.slug}.html" aria-label="AMSOIL for ${ESC(m.make)} ${ESC(m.model)}">${ESC(m.make)} ${ESC(m.model)}</a>`)
    .join("");
  return `  <h2>AMSOIL for other Toyota &amp; Lexus platforms</h2>
  <div class="lp-veh">${links}</div>`;
}

// ---- Play 1 (outrank strategy 2026-07-20): the verified capacity table ----
// The "[model] oil capacity" SERP is forum confusion (7.4 vs 7.9 vs 9.8 qt
// threads); our cross-verified year-split data is the authoritative answer no
// dealer or forum has. Cells render ONLY for verified systems (class="capv" —
// guarded by tests/amsoil-vehicle-pages.test.js alongside the "cap" chips);
// unverified cells show an em dash, never a number.
const CAP_SYS = ["Engine Oil", "Front Differential", "Rear Differential", "Transfer Case"];
function capacitySection(name, gens) {
  const sysOf = (g, sys) => (g.systems || []).find((x) => x.system === sys);
  const anyVerified = gens.some((g) => CAP_SYS.some((sys) => { const s = sysOf(g, sys); return s && s.capacity && s.verified; }));
  if (!anyVerified) return { html: "", faq: null };
  const cell = (g, sys) => {
    const s = sysOf(g, sys);
    return (s && s.capacity && s.verified) ? `<span class="capv">${s.capacity} ${ESC(s.unit)}</span>` : "&mdash;";
  };
  const rows = gens.map((g) =>
    `<tr><td>${ESC(g.y)}</td><td>${ESC(g.e)}</td><td>${cell(g, "Engine Oil")}</td><td>${cell(g, "Front Differential")}</td><td>${cell(g, "Rear Differential")}</td><td>${cell(g, "Transfer Case")}</td></tr>`).join("\n");
  const html = `
  <h2>${ESC(name)} fluid capacities — verified by year</h2>
  <p>Capacity is <strong>year- and engine-specific</strong> — the same engine can take different amounts in different years and models. Every figure below is cross-verified against factory service specifications by Tuned Yota; a dash means we haven't verified that configuration yet (check your owner's manual or ask us).</p>
  <div class="captbl-wrap"><table class="captbl">
    <thead><tr><th>Model years</th><th>Engine</th><th>Engine oil<br><span>w/ filter</span></th><th>Front diff</th><th>Rear diff</th><th>Transfer case</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table></div>
  <p style="font-size:12.5px;color:var(--sage-d)">Seeing bigger numbers on forums? Toyota's "Product Info" sheets list the <strong>total fill</strong> (dry engine, cooler and lines included) — the <strong>service fill</strong> you use at an oil change is the figure above. Capacities are for the standard configuration; variants like a TRD e-locker rear differential can hold about a quart more. Automatic transmissions are excluded on purpose: they use a sealed, temperature-controlled overflow fill with no honest single number.</p>`;
  const oilRows = gens.filter((g) => { const s = sysOf(g, "Engine Oil"); return s && s.capacity && s.verified; });
  const faq = oilRows.length ? [
    `What is the oil capacity of a ${name}?`,
    `It depends on the year and engine. With a filter change: ${oilRows.map((g) => { const s = sysOf(g, "Engine Oil"); return `${g.y} ${g.e} — ${s.capacity} ${s.unit}`; }).join("; ")}. These figures are cross-verified against factory service specifications. If you've seen larger numbers quoted on forums, those are usually Toyota's "total fill" (dry engine including the cooler), not the service fill you use at an oil change.`,
  ] : null;
  return { html, faq };
}

function page(model, models) {
  const { make, name, slug, gens } = model;
  const url = `https://tunedyota.com/amsoil-${slug}`;

  // Distinct products across this platform's bundles (for schema + intro).
  const skuSet = [];
  for (const g of gens) for (const s of (g.bundle || [])) if (!skuSet.includes(s) && prod(s)) skuSet.push(s);
  const products = skuSet.map(prod);
  const primaryOil = products.find((p) => categoryOf(p.name) === "Synthetic Motor Oil");
  const oilPhrase = primaryOil ? primaryOil.name.replace(/ 100% Synthetic Motor Oil/i, "").replace(/Signature Series /i, "AMSOIL Signature Series ") : "AMSOIL synthetic motor oil";

  // Live retail price (salePrice wins) + a product-image tag. Prices come from the
  // auto-synced catalog; a product without a synced price simply shows no price.
  // Only self-hosted .jpg product shots render (all 13 catalog products now have one).
  const priceOf = (p) => (typeof p.salePrice === "number" && p.salePrice > 0 ? p.salePrice
    : typeof p.retailPrice === "number" && p.retailPrice > 0 ? p.retailPrice : null);
  const imgTag = (p, size) => (p && p.image && /\.jpg$/i.test(p.image))
    ? `<img class="pimg" src="${p.image}" alt="${ESC(p.name)}" loading="lazy" width="${size}" height="${size}">` : "";

  // Per-generation fluid cards. Capacity/interval only when verified.
  const genCards = gens.map((g) => {
    const rows = (g.bundle || []).map((sku) => {
      const p = prod(sku); if (!p) return "";
      // Per-SYSTEM gate: a capacity chip renders only for a system whose figure is
      // cross-verified (engine oil this pass). Unverified fluids (gear lube, ATF,
      // diffs) never present an unconfirmed number as fact.
      const capSys = g.systems.find((s) => s.sku === sku && s.capacity);
      const detail = (capSys && capSys.verified)
        ? `<span class="cap">${capSys.capacity} ${capSys.unit}</span>` : "";
      const sys = (g.systems.find((s) => s.sku === sku) || {}).system || categoryOf(p.name);
      const price = priceOf(p);
      const priceHtml = price != null ? `<span class="price">$${price.toFixed(2)}</span>` : "";
      return `<div class="fl">${imgTag(p, 50)}<div class="pinfo"><span class="sys">${ESC(sys)}</span><span class="prd">${ESC(p.name)}</span>${detail}</div><div class="pbuy">${priceHtml}<a class="ord" target="_blank" rel="noopener" href="${amsoilUrl(p.productPath)}">Order &#9658;</a></div></div>`;
    }).join("");
    const hasPendingCap = (g.bundle || []).some((sku) => { const s = g.systems.find((x) => x.sku === sku && x.capacity); return s && !s.verified; });
    const capNote = hasPendingCap ? `<p style="margin:8px 0 0;font-size:12px;color:var(--sage-d)">Automatic-transmission fill is set by a sealed, temperature-controlled overflow procedure — check your owner's manual or contact us for the exact amount.</p>` : "";
    return `<div class="gen"><div class="eng">${ESC(g.y)}</div><h3>${ESC(name)} <span style="color:var(--sage-d);font-weight:600">${ESC(g.e)}</span></h3>${rows}${capNote}</div>`;
  }).join("\n");

  // Schema: Store + OfferCatalog of this platform's products. Each Product carries
  // its own real offer (satisfies Google's Product requirement: one of
  // offers/review/aggregateRating). Price = live retail from the auto-synced
  // catalog (salePrice wins); the weekly price-sync regenerates these pages so it
  // never drifts. A product without a synced price is left out of the schema (it
  // still appears in the visible fluid cards) rather than emitting a bare Product.
  const offers = products.map((p) => {
    const price = priceOf(p);
    if (price == null) return null;
    const offer = `{"@type":"Offer","priceCurrency":"USD","price":${JSON.stringify(price.toFixed(2))},"availability":"https://schema.org/InStock","url":${JSON.stringify(amsoilUrl(p.productPath))},"seller":{"@type":"Organization","name":"AMSOIL Inc."},${RETURN_POLICY}}`;
    return `{"@type":"Offer","itemOffered":{"@type":"Product","name":${JSON.stringify(p.name)},${p.image?`"image":${JSON.stringify("https://tunedyota.com"+p.image)},`:""}"brand":{"@type":"Brand","name":"AMSOIL"},"category":${JSON.stringify(categoryOf(p.name))},"offers":${offer}}}`;
  }).filter(Boolean).join(",");

  const capSec = capacitySection(name, gens);
  const faqs = [
    [`Where can I buy AMSOIL for my ${name}?`, `From Tuned Yota, an Authorized AMSOIL Dealer. Use the AMSOIL Garage to see the exact oil, filter, and gear lube for your ${name} and order online — products ship direct from AMSOIL anywhere in the U.S.`],
    ...(capSec.faq ? [capSec.faq] : []),
    [`Is AMSOIL safe for my ${name}, or should I stick with ${make} OEM fluid?`, `AMSOIL is a safe choice for your ${name}. It's formulated to meet and exceed the performance standards ${make} requires, and using it does not void your factory warranty — under the federal Magnuson-Moss Warranty Act a manufacturer can't void your warranty just for using a different brand of oil, and AMSOIL backs every product with the AMSOIL Limited Warranty. Where OEM fluids are built to meet the minimum standard, AMSOIL Signature Series exceeds it: 75% more wear protection and drain intervals up to 25,000 miles — so you get more protection and fewer oil changes, not less.`],
    [`What AMSOIL oil does a ${name} take?`, `AMSOIL recommends ${oilPhrase} for the ${name}; the exact grade depends on your engine and model year. Pick your vehicle in the AMSOIL Garage to confirm the right oil, filter, and capacity for your build.`],
    [`How often should I change the oil on a tuned ${name}?`, `AMSOIL's full-synthetic motor oils are built for extended and severe-service drain intervals. For a tuned or towing ${name} we recommend a severe-service schedule; your AMSOIL Garage shows the interval for your exact configuration.`],
    [`Is AMSOIL worth it for a tuned or towing ${name}?`, `Full-synthetic AMSOIL fluids are formulated for the added heat and load a tuned, supercharged, or towing ${name} puts on its oil, gears, and transmission — which is why our own installers run them.`],
  ];
  const faqSchema = faqs.map(([q, a]) => `{"@type":"Question","name":${JSON.stringify(q)},"acceptedAnswer":{"@type":"Answer","text":${JSON.stringify(a)}}}`).join(",");
  const faqVisible = faqs.map(([q, a]) => `  <div class="lp-fq"><button class="lp-fqq" aria-expanded="false">${ESC(q)}<span>+</span></button><div class="lp-fqa"><p>${ESC(a)}</p></div></div>`).join("\n");

  const title = `AMSOIL Synthetic Oil &amp; Filter for the ${ESC(name)} — Best for Tuned &amp; Towing | Tuned Yota`;
  const desc = `The exact AMSOIL synthetic oil, filter, gear lube, and ATF for your ${ESC(name)} — with verified year-by-year oil capacities and severe-service intervals for tuned and towing builds. Order online from Tuned Yota, an Authorized AMSOIL Dealer shipping direct nationwide.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${url}">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Store","@id":"${url}#store","name":"Tuned Yota — Authorized AMSOIL Dealer","url":"${url}","image":"https://tunedyota.com/og-image.png","telephone":"+1-612-406-7117","email":"info@tunedyota.com","priceRange":"$$","parentOrganization":{"@id":"https://tunedyota.com/#business"},"areaServed":[{"@type":"State","name":"Minnesota"},{"@type":"State","name":"Iowa"},{"@type":"State","name":"Wisconsin"},{"@type":"State","name":"North Dakota"},{"@type":"State","name":"South Dakota"},{"@type":"State","name":"Nebraska"},{"@type":"Country","name":"United States"}],"description":${JSON.stringify(`AMSOIL synthetic motor oil, filters, gear lube, and ATF for the ${name}, sold by Tuned Yota, an Authorized AMSOIL Dealer.`)}${offers ? `,"hasOfferCatalog":{"@type":"OfferCatalog","name":${JSON.stringify(`AMSOIL fluids for the ${name}`)},"itemListElement":[${offers}]}` : ""}}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[${faqSchema}]}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://tunedyota.com/"},{"@type":"ListItem","position":2,"name":"AMSOIL Garage","item":"https://tunedyota.com/amsoil-garage"},{"@type":"ListItem","position":3,"name":${JSON.stringify(`AMSOIL for the ${name}`)},"item":"${url}"}]}
</script>
${FONTS}
${SITECSS}
${FAVICON}
${STYLE}
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
${NAV}
<a id="main" tabindex="-1"></a>
<div class="lp">
  <div class="lp-eyebrow">Tuned Yota · Authorized AMSOIL Dealer</div>
  <h1>AMSOIL for the ${ESC(name)}</h1>
  <div class="lp-answer">The exact AMSOIL synthetic fluids for your ${ESC(name)} — ${ESC(oilPhrase)} engine oil, the right Ea oil filter, SEVERE GEAR gear lube, and synthetic ATF, dialed for tuned and towing builds. Tuned Yota is an Authorized AMSOIL Dealer: order below and it ships direct to your door.</div>
  <div class="lp-cta">
    <a class="btn primary" href="amsoil-garage.html?make=${encodeURIComponent(make)}&amp;model=${encodeURIComponent(model.model)}">Open your AMSOIL Garage →</a>
    <a class="btn outline" target="_blank" rel="noopener" href="${amsoilUrl("/shop/")}">Shop the full catalog</a>
  </div>
${primaryOil ? `
  <div class="hero-prod">${imgTag(primaryOil, 104)}<div class="hp-info"><div class="lp-eyebrow">Recommended engine oil</div><div class="hp-name">${ESC(primaryOil.name)}</div>${priceOf(primaryOil) != null ? `<div class="hp-price">$${priceOf(primaryOil).toFixed(2)}<span class="hp-pc"> retail · Preferred Customers save up to 25%</span></div>` : ""}<div class="hp-cta"><a class="btn primary" target="_blank" rel="noopener" href="${amsoilUrl(primaryOil.productPath)}">Order &#9658;</a><a class="btn outline" target="_blank" rel="noopener" href="${amsoilUrl("/offers/pc/")}">Save 25% as a Preferred Customer</a></div></div></div>` : ""}

  <h2>AMSOIL fluids for the ${ESC(name)}</h2>
  <p>AMSOIL's recommended product, viscosity, and filter for each ${ESC(name)} engine and model year (from AMSOIL's official vehicle guide). Tap <strong>Order</strong> to add any item to your AMSOIL cart with Tuned Yota's dealer referral attached.</p>
${genCards}
${capSec.html}
  <h2>Why AMSOIL for a tuned ${ESC(name)}</h2>
  <ul class="lp-bul">
    <li>Full-synthetic protection built for the extra heat, load, and rpm that a tune, supercharger, or heavy towing adds.</li>
    <li>Severe-service drain intervals suited to hard, real-world Upper-Midwest driving.</li>
    <li>The same fluids our own installers run — matched to your ${ESC(name)}'s engine and drivetrain.</li>
    <li>Bought through an Authorized AMSOIL Dealer; ships direct with no storefront markup.</li>
  </ul>

  <div class="lp-book">
    <h2>Save on every future order</h2>
    <p>Buy at retail today, or enroll once as a Preferred Customer under Tuned Yota to save up to 25% on every future AMSOIL order — set up once, yours for life.</p>
    <a class="btn primary" target="_blank" rel="noopener" href="${amsoilUrl("/offers/pc/")}">Become a Preferred Customer →</a>
  </div>

  <h2>${ESC(name)} — AMSOIL FAQ</h2>
${faqVisible}

${vehHub(models, slug)}

  <div class="lp-links">
    <strong>More on the ${ESC(name)}:</strong><br>
    <a href="${ottPage(slug)}">${ESC(name)} OTT Tune</a><a href="amsoil-garage.html">AMSOIL Garage</a><a href="amsoil-vs-oem-toyota-lexus-fluids.html">AMSOIL vs. OEM fluids</a><a href="amsoil-synthetic-motor-oil-guide.html">AMSOIL oil guide</a><a href="find-your-exact-tune.html">Find Your Exact Tune</a><a href="ott-tune.html">What is the OTT Tune?</a>
  </div>
  <div class="lp-final"><a class="btn primary" href="amsoil-garage.html?make=${encodeURIComponent(make)}&amp;model=${encodeURIComponent(model.model)}">Open your AMSOIL Garage →</a></div>
  <p class="lp-disc">Product, viscosity, and filter recommendations are from AMSOIL's official vehicle guide. Fill capacities and drain intervals shown in the interactive AMSOIL Garage are verified per configuration as our installers confirm them — check your owner's manual or contact us before service. Checkout completes on amsoil.com.</p>
</div>
${FQSCRIPT}
${FOOTER}
${FQA11Y}
${TRACK}
<script src="/chat.js" defer></script>
</body>
</html>
`;
}

// Build the model list, then a page each.
function models() {
  const out = [];
  for (const make of Object.keys(CAT.vehicles)) {
    for (const model of Object.keys(CAT.vehicles[make])) {
      out.push({ make, model, name: `${make} ${model}`, slug: slugOf(make, model), gens: CAT.vehicles[make][model] });
    }
  }
  return out;
}

// The list of generated filenames (for HEAD_PAGES registration / tests).
export const AMSOIL_PAGE_FILES = models().map((m) => `amsoil-${m.slug}.html`);

// The AMSOIL Garage hub (amsoil-garage.html) lists generic category-level products
// (motor oil, filter, gear lube, ATF). Each needs a real offer or GSC raises the
// critical "offers/review/aggregateRating required" error. We compute a per-category
// price RANGE (AggregateOffer) from the same synced catalog and inject it between
// markers, so it self-maintains and stays honest. A category with no priced product
// (e.g. grease — none in the catalog) is left out rather than shown without a price.
const GARAGE_URL = "https://tunedyota.com/amsoil-garage";
const CAT_LABEL = {
  "Synthetic Motor Oil": "AMSOIL Signature Series Synthetic Motor Oil",
  "Oil Filter": "AMSOIL Ea Oil Filter",
  "Gear Lube": "AMSOIL SEVERE GEAR Synthetic Gear Lube",
  "Automatic Transmission Fluid": "AMSOIL Synthetic Automatic Transmission Fluid",
  "Diesel Oil": "AMSOIL Synthetic Diesel Oil",
  "Fuel Additive": "AMSOIL Fuel Additives",
  "Antifreeze & Coolant": "AMSOIL Antifreeze & Coolant",
  "European Motor Oil": "AMSOIL Synthetic European Motor Oil",
  "High-Mileage Motor Oil": "AMSOIL Synthetic High-Mileage Motor Oil",
  "Grease": "AMSOIL Synthetic Grease",
};

function garageOfferCatalog() {
  const byCat = {};
  for (const sku of Object.keys(CAT.products)) {
    const p = CAT.products[sku];
    const price = typeof p.salePrice === "number" && p.salePrice > 0 ? p.salePrice
      : typeof p.retailPrice === "number" && p.retailPrice > 0 ? p.retailPrice : null;
    if (price == null) continue;
    const c = categoryOf(p.name);
    (byCat[c] ||= { prices: [], image: null });
    byCat[c].prices.push(price);
    // Representative image for the category Product node (GSC "Missing field
    // image" fix — every Product needs one; first priced product's shot wins).
    if (!byCat[c].image && p.image) byCat[c].image = p.image;
  }
  const shopUrl = amsoilUrl("/shop/");
  const seller = `"seller":{"@type":"Organization","name":"AMSOIL Inc."},${RETURN_POLICY}`;
  // Stable display order; only categories with at least one priced product appear.
  return Object.keys(CAT_LABEL).filter((c) => byCat[c] && byCat[c].prices.length).map((c) => {
    const ps = byCat[c].prices, low = Math.min(...ps), high = Math.max(...ps);
    const offer = low === high
      ? `{"@type":"Offer","priceCurrency":"USD","price":${JSON.stringify(low.toFixed(2))},"availability":"https://schema.org/InStock","url":${JSON.stringify(shopUrl)},${seller}}`
      : `{"@type":"AggregateOffer","priceCurrency":"USD","lowPrice":${JSON.stringify(low.toFixed(2))},"highPrice":${JSON.stringify(high.toFixed(2))},"offerCount":${ps.length},"availability":"https://schema.org/InStock","url":${JSON.stringify(shopUrl)},${seller}}`;
    const img = byCat[c].image ? `"image":${JSON.stringify("https://tunedyota.com" + byCat[c].image)},` : "";
    return `{"@type":"Offer","itemOffered":{"@type":"Product","name":${JSON.stringify(CAT_LABEL[c])},${img}"brand":{"@type":"Brand","name":"AMSOIL"},"category":${JSON.stringify(c)},"offers":${offer}}}`;
  }).join(",");
}

export function buildAmsoilGarageStore() {
  const file = path.join(SITE, "amsoil-garage.html");
  let html = fs.readFileSync(file, "utf8");
  const store = `{"@context":"https://schema.org","@type":"Store","@id":"${GARAGE_URL}#store","name":"Tuned Yota — Authorized AMSOIL Dealer","url":"${GARAGE_URL}","image":"https://tunedyota.com/og-image.png","telephone":"+1-612-406-7117","email":"info@tunedyota.com","priceRange":"$$","parentOrganization":{"@id":"https://tunedyota.com/#business"},"areaServed":[{"@type":"State","name":"Minnesota"},{"@type":"State","name":"Iowa"},{"@type":"State","name":"Wisconsin"},{"@type":"State","name":"North Dakota"},{"@type":"State","name":"South Dakota"},{"@type":"State","name":"Nebraska"},{"@type":"Country","name":"United States"}],"description":"Authorized AMSOIL Dealer selling synthetic motor oil, oil and air filters, gear lube, and ATF for Toyota and Lexus vehicles, with capacities and severe-service intervals for tuned and towing builds.","hasOfferCatalog":{"@type":"OfferCatalog","name":"AMSOIL synthetic fluids for Toyota & Lexus","itemListElement":[${garageOfferCatalog()}]}}`;
  const inner = `<script type="application/ld+json">\n${store}\n</script>`;
  const block = `<!-- SEO:AMSOIL-STORE:START -->\n${inner}\n<!-- SEO:AMSOIL-STORE:END -->`;
  const re = /<!-- SEO:AMSOIL-STORE:START -->[\s\S]*?<!-- SEO:AMSOIL-STORE:END -->/;
  if (!re.test(html)) throw new Error("SEO:AMSOIL-STORE markers not found in amsoil-garage.html");
  html = html.replace(re, () => block);
  // Visible "Shop AMSOIL products" strip → the per-SKU merchant product pages.
  // Generator-injected so it self-maintains with the catalog + weekly prices.
  const prodLinks = Object.entries(CAT.products)
    .filter(([, p]) => priceOfP(p) != null)
    .map(([, p]) => `<a href="${productSlug(p)}.html">${ESC(p.name)} — $${priceOfP(p).toFixed(2)}</a>`).join("");
  const pBlock = `<!-- SEO:AMSOIL-PRODUCTS:START -->\n<div class="ag-veh">${prodLinks}</div>\n<!-- SEO:AMSOIL-PRODUCTS:END -->`;
  const pRe = /<!-- SEO:AMSOIL-PRODUCTS:START -->[\s\S]*?<!-- SEO:AMSOIL-PRODUCTS:END -->/;
  if (!pRe.test(html)) throw new Error("SEO:AMSOIL-PRODUCTS markers not found in amsoil-garage.html");
  fs.writeFileSync(file, html.replace(pRe, () => pBlock));
}

// ---- Front B: national AMSOIL product-guide pages ------------------------------
// Data-driven informational guides targeting high-volume "AMSOIL <product>" search +
// AI intent, written from AMSOIL's approved Dealer Sales Briefs, with real product
// cards (image + live price + ?zo= order) and the same chrome/schema as the vehicle
// pages. National (no per-vehicle capacity gate). More guides = more GUIDES entries.
const GUIDES = [
  {
    slug: "amsoil-synthetic-motor-oil-guide",
    h1: "AMSOIL Synthetic Motor Oil",
    title: "AMSOIL Synthetic Motor Oil — Signature Series Guide, Prices &amp; Where to Buy | Tuned Yota",
    desc: "AMSOIL Signature Series 100% synthetic motor oil: 75% more wear protection, 100% LSPI protection, and a guaranteed 25,000-mile drain. Compare Signature Series, XL and OE, see prices, and order from Tuned Yota — an Authorized AMSOIL Dealer.",
    answer: "AMSOIL Signature Series 100% Synthetic Motor Oil delivers <strong>75% more wear protection</strong> and <strong>100% protection against LSPI</strong>, with a guaranteed <strong>25,000-mile / 1-year</strong> drain interval — built for turbocharged and direct-injection engines. Order it from Tuned Yota, an Authorized AMSOIL Dealer, shipped direct anywhere in the U.S.",
    skus: ["SS-0W20-QT", "SS-5W30-QT", "SS-5W20-QT"],
    sections: [
      { h: "Why AMSOIL Signature Series", bullets: [
        "<strong>75% more wear protection</strong> for longer engine life.<sup>1</sup>",
        "<strong>100% protection against LSPI</strong> — safeguards modern turbo &amp; direct-injection engines.<sup>2</sup>",
        "<strong>Guaranteed up to 25,000 miles or 1 year</strong> between oil changes.",
        "Purpose-built for turbocharged and direct-injection engines — and turbo vehicles use the normal-service interval, not severe.",
      ] },
      { h: "Signature Series vs. XL vs. OE — which AMSOIL oil?", html: "<p>AMSOIL offers three synthetic tiers. <strong>Signature Series</strong> is the top tier — 75% more wear protection and up to a 25,000-mile drain — and it's what we run in tuned Toyota and Lexus builds. <strong>XL / Extended-Life</strong> adds 37% more cleaning power with a 20,000-mile guarantee. <strong>OE</strong> is the OEM-interval, API- and dexos-licensed choice with 47% more wear protection than conventional oil. For a tuned, towing, or high-performance vehicle, choose Signature Series.</p>" },
    ],
    faqs: [
      ["What is the drain interval for AMSOIL Signature Series?", "Up to 25,000 miles or one year, whichever comes first — guaranteed. Turbocharged vehicles fall under the normal-service category. Always change the oil filter when you change the oil."],
      ["Does using AMSOIL void my vehicle's warranty?", "No. Using AMSOIL synthetic lubricants does not void your vehicle or equipment manufacturer's warranty, and all AMSOIL lubricants and filters are covered by the AMSOIL Limited Warranty."],
      ["Why isn't Signature Series API-licensed?", "AMSOIL formulates Signature Series to exceed minimum industry standards rather than to a one-size-fits-all license, which lets it adopt new protection technology faster. AMSOIL's OE line is API- and dexos-licensed for those who prefer it."],
      ["Where can I buy AMSOIL synthetic oil?", "From Tuned Yota, an Authorized AMSOIL Dealer. Order online and it ships direct from AMSOIL anywhere in the U.S. — or enroll as a Preferred Customer to save up to 25%."],
    ],
    footnotes: "<sup>1</sup> 75% more wear protection based on independent testing of AMSOIL Signature Series 0W-20 (ASTM D6891). <sup>2</sup> 100% LSPI protection based on zero LSPI events in five consecutive GM dexos1 Gen 2 LSPI tests of Signature Series 5W-30.",
  },
  {
    slug: "amsoil-synthetic-atf-guide",
    h1: "AMSOIL Synthetic Automatic Transmission Fluid",
    title: "AMSOIL Synthetic ATF — Signature Series Multi-Vehicle Guide &amp; Prices | Tuned Yota",
    desc: "AMSOIL Signature Series Multi-Vehicle Synthetic ATF: guaranteed for twice the OEM severe-service drain interval and proven in a 100,000-mile severe-service fleet trial. See the price and order from Tuned Yota, an Authorized AMSOIL Dealer.",
    answer: "AMSOIL Signature Series Multi-Vehicle Synthetic ATF is built for heavy towing, high heat and hard use — <strong>guaranteed for twice the OEM severe-service drain interval</strong> and proven in a <strong>100,000-mile severe-service taxi-fleet field trial</strong>. Order it from Tuned Yota, an Authorized AMSOIL Dealer, shipped anywhere in the U.S.",
    skus: ["ATL-QT"],
    sections: [
      { h: "Why AMSOIL Signature Series ATF", bullets: [
        "<strong>Guaranteed for twice the OEM severe-service drain interval.</strong>",
        "Proven in a <strong>100,000-mile severe-service taxi-fleet trial</strong> — the valve body and clutch plates came back virtually free of sludge, deposits and wear.",
        "High antioxidant content resists <strong>thermal breakdown</strong>, sludge and varnish that clog narrow passages and glaze clutches.",
        "Stays fluid in sub-zero cold and holds reserve protection under heavy towing, hauling and challenging terrain.",
      ] },
    ],
    faqs: [
      ["Is AMSOIL ATF good for towing and heavy hauling?", "Yes — it's formulated specifically for severe service: heavy towing, elevated temperatures and challenging terrain, with reserve protection against heat. It's a strong choice for trucks, SUVs and vans that work hard."],
      ["How long does AMSOIL Signature Series ATF last?", "It's guaranteed for twice the original equipment manufacturer's severe-service drain interval. After 100,000 miles in a severe-service fleet trial it still retained 41% of its original oxidation inhibitors."],
      ["Where can I buy AMSOIL transmission fluid?", "From Tuned Yota, an Authorized AMSOIL Dealer. Order online and it ships direct anywhere in the U.S. — or enroll as a Preferred Customer to save up to 25%."],
    ],
    footnotes: "Severe-service and 100,000-mile results are from AMSOIL's Las Vegas Taxi Cab Field Study.",
  },
  {
    slug: "amsoil-severe-gear-guide",
    h1: "AMSOIL SEVERE GEAR Synthetic Gear Lube",
    title: "AMSOIL SEVERE GEAR Synthetic Gear Lube — Guide, Grades &amp; Prices | Tuned Yota",
    desc: "AMSOIL SEVERE GEAR 100% synthetic extreme-pressure gear lube: high film strength, ultimate wear protection and extreme-temperature performance for towing, hauling and racing. See grades and prices from Tuned Yota, an Authorized AMSOIL Dealer.",
    answer: "AMSOIL SEVERE GEAR 100% Synthetic Extreme-Pressure Gear Lube is engineered with <strong>high film strength</strong> for heavy loads, <strong>reduces friction and wear</strong>, and <strong>excels in extreme temperatures</strong> — ideal for towing, hauling, racing and severe duty. Order it from Tuned Yota, an Authorized AMSOIL Dealer.",
    skus: ["SVL-QT", "SVG-75W90-QT", "SVG-75W140-QT", "AGLPK-QT"],
    sections: [
      { h: "Why AMSOIL SEVERE GEAR", bullets: [
        "<strong>High film strength</strong> stands up to high-load demands and shock loading.",
        "<strong>Reduces friction and delivers the ultimate protection against wear.</strong>",
        "<strong>Excels in extreme temperatures</strong> and outperforms conventional gear oils.",
        "Excellent for all cars and trucks — and especially well-suited to towing, hauling, racing and severe duty.",
      ] },
    ],
    faqs: [
      ["What gear lube does AMSOIL recommend for towing?", "AMSOIL SEVERE GEAR — its high film strength and extreme-temperature performance are built for the heat and load of towing, hauling and severe duty. The right viscosity depends on your axle; the AMSOIL Garage shows it for your vehicle."],
      ["Does SEVERE GEAR come in the Easy-Pack?", "Yes — SEVERE GEAR is sold in the SEVERE GEAR Easy-Pack, a flexible pouch that makes differential fluid changes faster, cleaner and less messy than a rigid quart bottle."],
      ["Where can I buy AMSOIL gear lube?", "From Tuned Yota, an Authorized AMSOIL Dealer. Order online, shipped anywhere in the U.S. — or save up to 25% as a Preferred Customer."],
    ],
    footnotes: "",
  },
  {
    slug: "amsoil-ea-oil-filter-guide",
    h1: "AMSOIL Ea Synthetic Oil Filters",
    title: "AMSOIL Ea Oil Filters — 99% Efficiency, Extended-Life Guide &amp; Prices | Tuned Yota",
    desc: "AMSOIL Ea Oil Filters: up to 99% efficiency at 20 microns and warranty-supported 15,000-25,000-mile change intervals. Find the right filter and price from Tuned Yota, an Authorized AMSOIL Dealer.",
    answer: "AMSOIL Ea Oil Filters deliver <strong>up to 99% efficiency at 20 microns</strong> and warranty-supported <strong>15,000-mile (EA15K) to 25,000-mile (EAO)</strong> change intervals — the premium filter to match AMSOIL synthetic oil's extended drains. Order from Tuned Yota, an Authorized AMSOIL Dealer.",
    skus: ["EA15K09", "EA15K51", "EA15K04", "EA15K02", "EA15K49"],
    sections: [
      { h: "Why AMSOIL Ea Oil Filters", bullets: [
        "<strong>Up to 99% efficiency at 20 microns</strong> — traps the wear-causing contaminants many filters miss.",
        "<strong>High capacity</strong> — warranty-supported 15,000-mile (EA15K) and 25,000-mile (EAO) change intervals.",
        "Canister-style construction withstands up to <strong>9X</strong> normal system operating pressure.",
        "Silicone anti-drainback valves give up to <strong>3X the hot-oil resistance</strong> of nitrile valves for faster starts and longer life.",
      ] },
    ],
    faqs: [
      ["How long does an AMSOIL Ea oil filter last?", "AMSOIL Ea filters are warranty-supported for 15,000-mile (EA15K) or 25,000-mile (EAO) change intervals when used with AMSOIL synthetic motor oil, designed to match AMSOIL oil's extended drains. Always change the filter when you change the oil."],
      ["Why use an AMSOIL filter instead of FRAM or WIX?", "AMSOIL Ea filters are built for enthusiasts who want more protection — up to 99% efficiency at 20 microns and high capacity for extended intervals — going beyond what many competing filters offer."],
      ["Which AMSOIL filter fits my vehicle?", "Pick your vehicle in the AMSOIL Garage or look it up on amsoil.com. The AMSOIL Ea line covers more than 95% of North American cars and light trucks."],
    ],
    footnotes: "",
  },
  {
    slug: "is-amsoil-worth-it",
    h1: "Is AMSOIL Worth It?",
    title: "Is AMSOIL Worth It? AMSOIL vs. Conventional &amp; Mobil 1 | Tuned Yota",
    desc: "Is AMSOIL worth the money? AMSOIL Signature Series delivers 75% more wear protection and up to 25,000-mile drains, going further between oil changes. Here's how it compares, and where to buy from Tuned Yota, an Authorized AMSOIL Dealer.",
    answer: "For most drivers — especially tuned, towing or high-performance vehicles — <strong>yes</strong>. AMSOIL Signature Series delivers <strong>75% more wear protection</strong> and up to a <strong>25,000-mile / 1-year</strong> drain, so you go further between changes and give your engine top-tier protection. Order from Tuned Yota, an Authorized AMSOIL Dealer.",
    skus: ["SS-0W20-QT", "SS-5W30-QT"],
    sections: [
      { h: "Is AMSOIL worth the extra cost?", html: "<p>AMSOIL costs more up front, but it's built to go further between oil changes — often eliminating an oil change per year — so you buy it less often, which helps offset the price while adding protection. For a tuned, supercharged or towing build, the added wear and heat protection is exactly where a premium synthetic earns its keep.</p>" },
      { h: "AMSOIL vs. conventional and Mobil 1", bullets: [
        "<strong>75% more wear protection</strong> for longer engine life (Signature Series 0W-20, ASTM D6891).<sup>1</sup>",
        "<strong>100% protection against LSPI</strong> — critical for modern turbo and direct-injection engines.<sup>2</sup>",
        "Trusted by professional engine builders; surpasses leading standards for protection against horsepower loss, wear and sludge.",
        "Using AMSOIL does <strong>not void</strong> your vehicle manufacturer's warranty, and it's backed by the AMSOIL Limited Warranty.",
      ] },
    ],
    faqs: [
      ["Is AMSOIL better than Mobil 1?", "AMSOIL Signature Series is engineered to exceed minimum industry standards, is trusted by professional engine builders, and surpasses leading standards for protection against horsepower loss, engine wear and sludge."],
      ["Does AMSOIL really last 25,000 miles?", "AMSOIL Signature Series is guaranteed for up to 25,000 miles or one year in normal service (turbocharged vehicles use the normal-service interval). Always change the oil filter when you change the oil."],
      ["Will AMSOIL void my warranty?", "No. Using AMSOIL synthetic lubricants does not void your vehicle or equipment manufacturer's warranty, and all AMSOIL lubricants and filters are covered by the AMSOIL Limited Warranty."],
    ],
    footnotes: "<sup>1</sup> Based on independent testing of AMSOIL Signature Series 0W-20 (ASTM D6891). <sup>2</sup> Based on zero LSPI events in five consecutive GM dexos1 Gen 2 LSPI tests of Signature Series 5W-30.",
  },
  {
    slug: "amsoil-vs-oem-toyota-lexus-fluids",
    h1: "AMSOIL vs. OEM Toyota &amp; Lexus Fluids",
    title: "AMSOIL vs. OEM Toyota &amp; Lexus Fluids — Is It Safe? Is It Better? | Tuned Yota",
    desc: "Can you use AMSOIL instead of Toyota or Lexus OEM fluids? Yes — it's safe, it won't void your warranty, and AMSOIL Signature Series exceeds the OEM standard with 75% more wear protection and 25,000-mile drains. The honest comparison from Tuned Yota, a Toyota/Lexus specialist and Authorized AMSOIL Dealer.",
    answer: "You can absolutely run AMSOIL in your Toyota or Lexus instead of OEM fluid — and for most owners it's the better choice. AMSOIL is formulated to <strong>meet and exceed the performance standards Toyota and Lexus require</strong>, it <strong>won't void your factory warranty</strong>, and its Signature Series delivers <strong>75% more wear protection</strong> with drain intervals up to <strong>25,000 miles</strong>. As a Toyota/Lexus specialist and Authorized AMSOIL Dealer, here's the straight comparison.",
    skus: ["SS-0W20-QT", "EA15K09"],
    sections: [
      { h: "Is it safe to use AMSOIL instead of OEM?", html: "<p>Yes. AMSOIL synthetic motor oils and fluids are formulated to meet and exceed the performance standards your Toyota or Lexus calls for — the correct viscosity grade plus API, ILSAC and dexos performance where recommended. The <a href=\"amsoil-garage.html\">AMSOIL Garage</a> shows the exact oil, filter and capacity for your specific model and year, so you always install the right fluid.</p>" },
      { h: "Will AMSOIL void my Toyota or Lexus warranty?", html: "<p><strong>No.</strong> Under the federal Magnuson-Moss Warranty Act, a manufacturer can't void your warranty simply because you used a different brand of oil — they would have to prove that oil caused a failure. Toyota and Lexus dealers recommend their own branded fluids because they sell them, not because a premium synthetic like AMSOIL is unsafe. On top of that, AMSOIL backs every lubricant and filter with the AMSOIL Limited Warranty.</p>" },
      { h: "OEM meets the minimum. AMSOIL goes further.", bullets: [
        "OEM fluids are built to meet the <em>minimum</em> standard; AMSOIL Signature Series is engineered to <strong>exceed</strong> it — <strong>75% more wear protection</strong>.<sup>1</sup>",
        "<strong>100% protection against LSPI</strong> — important for Toyota's modern turbocharged and direct-injection engines (i-FORCE, turbo Tacoma and more).<sup>2</sup>",
        "<strong>Up to a 25,000-mile / 1-year drain</strong> vs. the shorter OEM interval — fewer oil changes over the life of the vehicle.",
        "Built for the heat and load of a <strong>tuned, supercharged or towing</strong> Toyota/Lexus — the exact fluids our own installers run.",
      ] },
      { h: "The value case", html: "<p>AMSOIL costs more per quart, but its extended drain interval means you buy oil less often — often eliminating an oil change per year — which helps offset the price while adding protection. Enroll as a Preferred Customer under Tuned Yota and you save up to 25%, closing the gap even further.</p>" },
    ],
    faqs: [
      ["Can I use AMSOIL instead of Toyota or Lexus OEM oil?", "Yes. AMSOIL is formulated to meet and exceed the performance standards Toyota and Lexus require, and it's a safe, higher-performance alternative to OEM fluid. Use the AMSOIL Garage to confirm the exact oil, filter and capacity for your model and year."],
      ["Does using AMSOIL void my Toyota or Lexus warranty?", "No. The federal Magnuson-Moss Warranty Act prevents a manufacturer from voiding your warranty just for using a different brand of oil, and AMSOIL backs its products with the AMSOIL Limited Warranty."],
      ["Is AMSOIL actually better than Toyota OEM oil?", "OEM fluids are formulated to meet the minimum standard; AMSOIL Signature Series is engineered to exceed it — 75% more wear protection, 100% LSPI protection, and up to 25,000-mile drains — which especially benefits tuned, turbocharged and towing vehicles."],
    ],
    footnotes: "<sup>1</sup> Based on independent testing of AMSOIL Signature Series 0W-20 (ASTM D6891). <sup>2</sup> Based on zero LSPI events in five consecutive GM dexos1 Gen 2 LSPI tests of Signature Series 5W-30. Magnuson-Moss Warranty Act information is general and not legal advice.",
  },
  {
    slug: "amsoil-0w20-guide",
    h1: "AMSOIL 0W-20 Synthetic Oil",
    title: "AMSOIL 0W-20 Synthetic Oil — Signature Series Guide &amp; Price | Tuned Yota",
    desc: "AMSOIL Signature Series 0W-20 100% synthetic motor oil: 75% more wear protection, 100% LSPI protection and a 25,000-mile guarantee — the grade most modern Toyota and Lexus engines specify. See the price and order from Tuned Yota, an Authorized AMSOIL Dealer.",
    answer: "AMSOIL Signature Series <strong>0W-20</strong> is the grade most modern Toyota and Lexus engines call for — and it delivers <strong>75% more wear protection</strong>, <strong>100% LSPI protection</strong> and a guaranteed <strong>25,000-mile</strong> drain. Order it from Tuned Yota, an Authorized AMSOIL Dealer.",
    skus: ["SS-0W20-QT"],
    sections: [
      { h: "Which vehicles use 0W-20?", html: "<p>0W-20 is the factory grade for a large share of modern Toyota and Lexus engines — including the Tundra, Tacoma, 4Runner, Sequoia, Land Cruiser, Camry, Highlander and many Lexus models. Always confirm your exact grade in the <a href=\"amsoil-garage.html\">AMSOIL Garage</a> or your owner's manual.</p>" },
      { h: "Why AMSOIL Signature Series 0W-20", bullets: [
        "<strong>75% more wear protection</strong> for longer engine life.<sup>1</sup>",
        "<strong>100% protection against LSPI</strong> — critical for direct-injection and turbo engines.<sup>2</sup>",
        "<strong>Guaranteed up to 25,000 miles or 1 year</strong> between changes.",
      ] },
    ],
    faqs: [
      ["Is AMSOIL 0W-20 good for my Toyota?", "Yes — 0W-20 is the factory grade for most modern Toyota and Lexus engines, and AMSOIL Signature Series 0W-20 meets and exceeds those requirements while adding 75% more wear protection and a 25,000-mile drain guarantee."],
      ["Can I use AMSOIL 0W-20 instead of the dealer's oil?", "Yes. AMSOIL 0W-20 is a safe, higher-performance alternative to OEM oil and does not void your warranty — see our AMSOIL vs. OEM comparison for details."],
      ["Where can I buy AMSOIL 0W-20?", "From Tuned Yota, an Authorized AMSOIL Dealer — shipped anywhere in the U.S., or save up to 25% as a Preferred Customer."],
    ],
    footnotes: "<sup>1</sup> Based on independent testing of AMSOIL Signature Series 0W-20 (ASTM D6891). <sup>2</sup> Based on zero LSPI events in five consecutive GM dexos1 Gen 2 LSPI tests of Signature Series 5W-30.",
  },
  {
    slug: "amsoil-5w30-guide",
    h1: "AMSOIL 5W-30 Synthetic Oil",
    title: "AMSOIL 5W-30 Synthetic Oil — Signature Series Guide &amp; Price | Tuned Yota",
    desc: "AMSOIL Signature Series 5W-30 100% synthetic motor oil: 75% more wear protection, 100% LSPI protection and a 25,000-mile guarantee. See the price and order from Tuned Yota, an Authorized AMSOIL Dealer.",
    answer: "AMSOIL Signature Series <strong>5W-30</strong> is a top-tier full synthetic delivering <strong>75% more wear protection</strong>, <strong>100% LSPI protection</strong> and a guaranteed <strong>25,000-mile</strong> drain — for the engines that specify 5W-30 and for added protection under load and heat. Order from Tuned Yota, an Authorized AMSOIL Dealer.",
    skus: ["SS-5W30-QT"],
    sections: [
      { h: "Which vehicles use 5W-30?", html: "<p>5W-30 is specified for many Toyota, Lexus and other vehicles, and it's a common choice for towing, high-mileage and performance builds that call for a slightly heavier film. Confirm your exact grade in the <a href=\"amsoil-garage.html\">AMSOIL Garage</a> or your owner's manual.</p>" },
      { h: "Why AMSOIL Signature Series 5W-30", bullets: [
        "<strong>75% more wear protection</strong> for longer engine life.<sup>1</sup>",
        "<strong>100% protection against LSPI</strong> — protects modern turbo and direct-injection engines.<sup>2</sup>",
        "<strong>Guaranteed up to 25,000 miles or 1 year</strong> between changes.",
      ] },
    ],
    faqs: [
      ["Is AMSOIL 5W-30 a full synthetic?", "Yes — AMSOIL Signature Series 5W-30 is a 100% synthetic motor oil engineered to exceed industry standards, with 75% more wear protection and a 25,000-mile drain guarantee."],
      ["Can I use AMSOIL 5W-30 instead of OEM oil?", "Yes. It's a safe, higher-performance alternative to OEM oil and does not void your warranty — see our AMSOIL vs. OEM comparison."],
      ["Where can I buy AMSOIL 5W-30?", "From Tuned Yota, an Authorized AMSOIL Dealer — shipped anywhere in the U.S., or save up to 25% as a Preferred Customer."],
    ],
    footnotes: "<sup>1</sup> Based on independent testing of AMSOIL Signature Series 0W-20 (ASTM D6891). <sup>2</sup> Based on zero LSPI events in five consecutive GM dexos1 Gen 2 LSPI tests of Signature Series 5W-30.",
  },
  {
    slug: "amsoil-5w20-guide",
    h1: "AMSOIL 5W-20 Synthetic Oil",
    title: "AMSOIL 5W-20 Synthetic Oil — Signature Series Guide &amp; Price | Tuned Yota",
    desc: "AMSOIL Signature Series 5W-20 100% synthetic motor oil: 75% more wear protection, 100% LSPI protection and a 25,000-mile guarantee — the grade many Toyota and Lexus engines specify. See the price and order from Tuned Yota, an Authorized AMSOIL Dealer.",
    answer: "AMSOIL Signature Series <strong>5W-20</strong> is a top-tier full synthetic delivering <strong>75% more wear protection</strong>, <strong>100% LSPI protection</strong> and a guaranteed <strong>25,000-mile</strong> drain — the grade many Toyota and Lexus engines specify. Order from Tuned Yota, an Authorized AMSOIL Dealer.",
    skus: ["SS-5W20-QT"],
    sections: [
      { h: "Which vehicles use 5W-20?", html: "<p>5W-20 is the factory grade for many Toyota and Lexus engines. Confirm your exact grade in the <a href=\"amsoil-garage.html\">AMSOIL Garage</a> or your owner's manual.</p>" },
      { h: "Why AMSOIL Signature Series 5W-20", bullets: [
        "<strong>75% more wear protection</strong> for longer engine life.<sup>1</sup>",
        "<strong>100% protection against LSPI</strong> — protects modern turbo and direct-injection engines.<sup>2</sup>",
        "<strong>Guaranteed up to 25,000 miles or 1 year</strong> between changes.",
      ] },
    ],
    faqs: [
      ["Is AMSOIL 5W-20 good for my Toyota?", "Yes — 5W-20 is the factory grade for many Toyota and Lexus engines, and AMSOIL Signature Series 5W-20 meets and exceeds those requirements with 75% more wear protection and a 25,000-mile drain guarantee."],
      ["Can I use AMSOIL 5W-20 instead of OEM oil?", "Yes. It's a safe, higher-performance alternative to OEM oil and does not void your warranty — see our AMSOIL vs. OEM comparison."],
      ["Where can I buy AMSOIL 5W-20?", "From Tuned Yota, an Authorized AMSOIL Dealer — shipped anywhere in the U.S., or save up to 25% as a Preferred Customer."],
    ],
    footnotes: "<sup>1</sup> Based on independent testing of AMSOIL Signature Series 0W-20 (ASTM D6891). <sup>2</sup> Based on zero LSPI events in five consecutive GM dexos1 Gen 2 LSPI tests of Signature Series 5W-30.",
  },
];

function guideCards(skus) {
  return skus.map(prod).filter(Boolean).map((p) => {
    const price = priceOfP(p);
    return `<div class="fl">${imgTagP(p, 50)}<div class="pinfo"><span class="sys">${ESC(categoryOf(p.name))}</span><span class="prd"><a href="${productSlug(p)}.html" style="color:inherit;text-decoration:none">${ESC(p.name)}</a></span></div><div class="pbuy">${price != null ? `<span class="price">$${price.toFixed(2)}</span>` : ""}<a class="ord" target="_blank" rel="noopener" href="${amsoilUrl(p.productPath)}">Order &#9658;</a></div></div>`;
  }).join("");
}

function guidePage(g, vehModels) {
  const url = `https://tunedyota.com/${g.slug}`;
  const products = g.skus.map(prod).filter(Boolean);
  const offers = products.map((p) => {
    const price = priceOfP(p);
    if (price == null) return null;
    const offer = `{"@type":"Offer","priceCurrency":"USD","price":${JSON.stringify(price.toFixed(2))},"availability":"https://schema.org/InStock","url":${JSON.stringify(amsoilUrl(p.productPath))},"seller":{"@type":"Organization","name":"AMSOIL Inc."},${RETURN_POLICY}}`;
    return `{"@type":"Offer","itemOffered":{"@type":"Product","name":${JSON.stringify(p.name)},${p.image?`"image":${JSON.stringify("https://tunedyota.com"+p.image)},`:""}"brand":{"@type":"Brand","name":"AMSOIL"},"category":${JSON.stringify(categoryOf(p.name))},"offers":${offer}}}`;
  }).filter(Boolean).join(",");
  const faqSchema = g.faqs.map(([q, a]) => `{"@type":"Question","name":${JSON.stringify(q)},"acceptedAnswer":{"@type":"Answer","text":${JSON.stringify(a)}}}`).join(",");
  const faqVisible = g.faqs.map(([q, a]) => `  <div class="lp-fq"><button class="lp-fqq" aria-expanded="false">${ESC(q)}<span>+</span></button><div class="lp-fqa"><p>${ESC(a)}</p></div></div>`).join("\n");
  const sections = g.sections.map((s) => s.bullets
    ? `  <h2>${ESC(s.h)}</h2>\n  <ul class="lp-bul">${s.bullets.map((b) => `<li>${b}</li>`).join("")}</ul>`
    : `  <h2>${ESC(s.h)}</h2>\n  ${s.html}`).join("\n");
  const vehLinks = vehModels.slice(0, 8).map((m) => `<a href="amsoil-${m.slug}.html">${ESC(m.make)} ${ESC(m.model)}</a>`).join("") + `<a href="amsoil-garage.html">All vehicles →</a>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${g.title}</title>
<meta name="description" content="${g.desc}">
<link rel="canonical" href="${url}">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Store","@id":"${url}#store","name":"Tuned Yota — Authorized AMSOIL Dealer","url":"${url}","image":"https://tunedyota.com/og-image.png","telephone":"+1-612-406-7117","email":"info@tunedyota.com","priceRange":"$$","parentOrganization":{"@id":"https://tunedyota.com/#business"},"areaServed":{"@type":"Country","name":"United States"},"description":${JSON.stringify(g.desc)}${offers ? `,"hasOfferCatalog":{"@type":"OfferCatalog","name":${JSON.stringify(g.h1)},"itemListElement":[${offers}]}` : ""}}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[${faqSchema}]}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://tunedyota.com/"},{"@type":"ListItem","position":2,"name":"AMSOIL Garage","item":"https://tunedyota.com/amsoil-garage"},{"@type":"ListItem","position":3,"name":${JSON.stringify(g.h1)},"item":"${url}"}]}
</script>
${FONTS}
${SITECSS}
${FAVICON}
${STYLE}
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
${NAV}
<a id="main" tabindex="-1"></a>
<div class="lp">
  <div class="lp-eyebrow">Tuned Yota · Authorized AMSOIL Dealer</div>
  <h1>${ESC(g.h1)}</h1>
  <div class="lp-answer">${g.answer}</div>
  <div class="lp-cta">
    <a class="btn primary" target="_blank" rel="noopener" href="${amsoilUrl("/shop/")}">Shop AMSOIL →</a>
    <a class="btn outline" target="_blank" rel="noopener" href="${amsoilUrl("/offers/pc/")}">Save 25% as a Preferred Customer</a>
  </div>

  <h2>Order online — real prices, shipped direct</h2>
  <p>Ships direct from AMSOIL with Tuned Yota's dealer referral attached.</p>
  ${guideCards(g.skus)}

${sections}

  <div class="lp-book">
    <h2>Save up to 25% for life</h2>
    <p>Become a Preferred Customer under Tuned Yota — wholesale pricing (up to 25% off retail), points, exclusive promotions and free gear. The membership pays for itself in about two oil changes.</p>
    <a class="btn primary" target="_blank" rel="noopener" href="${amsoilUrl("/offers/pc/")}">Become a Preferred Customer →</a>
  </div>

  <h2>AMSOIL synthetic oil — FAQ</h2>
${faqVisible}

  <h2>AMSOIL for your Toyota or Lexus</h2>
  <div class="lp-veh">${vehLinks}</div>

  <p class="lp-disc">${g.footnotes || ""} Product recommendations are from AMSOIL's official materials; checkout completes on amsoil.com. Tuned Yota is an Authorized AMSOIL Dealer.</p>
</div>
${FQSCRIPT}
${FOOTER}
${FQA11Y}
${TRACK}
<script src="/chat.js" defer></script>
</body>
</html>
`;
}

// ---- Merchant product pages (Google Merchant Center landing pages) -----------
// One page per catalog SKU. Google's merchant-listing experience requires a
// SINGLE-product page (multi-product pages qualify only for product snippets),
// so these are the landing pages Merchant Center's website-crawl items resolve
// to and rank from. Each carries the full identifier set (AMSOIL stock number
// as sku + mpn), the live synced price (the weekly price-sync regenerates AND
// stages these files — a stale price disapproves the Merchant Center item),
// real Toyota/Lexus fitment from the garage data (capacities only for
// verified generations, per the integrity rule), and the shared return policy.
// Copy reuses the approved Dealer-Sales-Brief claims from the GUIDES above.
const PRODUCT_COPY = {
  "Synthetic Motor Oil": {
    tag: "75% more wear protection, 100% LSPI protection, guaranteed 25,000-mile drain.",
    answer: (p) => `${ESC(p.name)} is AMSOIL's top-tier full synthetic — <strong>75% more wear protection</strong>, <strong>100% protection against LSPI</strong> and a guaranteed <strong>25,000-mile / 1-year</strong> drain interval, built for turbocharged and direct-injection engines.<sup>1</sup>`,
    bullets: [
      "<strong>75% more wear protection</strong> for longer engine life.<sup>1</sup>",
      "<strong>100% protection against LSPI</strong> — safeguards modern turbo &amp; direct-injection engines.<sup>2</sup>",
      "<strong>Guaranteed up to 25,000 miles or 1 year</strong> between oil changes.",
    ],
    faqs: [
      ["What is the drain interval?", "Up to 25,000 miles or one year, whichever comes first — guaranteed. Turbocharged vehicles fall under the normal-service category. Always change the oil filter when you change the oil."],
      ["Does using AMSOIL void my vehicle's warranty?", "No. Using AMSOIL synthetic lubricants does not void your vehicle or equipment manufacturer's warranty, and all AMSOIL lubricants and filters are covered by the AMSOIL Limited Warranty."],
      ["How do I get the best price?", "Enroll once as a Preferred Customer under Tuned Yota and save up to 25% on every order, for life. Or buy at retail with no account — either way it ships direct from AMSOIL."],
    ],
    footnotes: `<sup>1</sup> Based on independent testing of AMSOIL Signature Series 0W-20 (ASTM D6891). <sup>2</sup> Based on zero LSPI events in five consecutive GM dexos1 Gen 2 LSPI tests of Signature Series 5W-30.`,
    guide: "amsoil-synthetic-motor-oil-guide.html", guideLabel: "AMSOIL synthetic motor oil guide",
  },
  "Oil Filter": {
    tag: "Up to 99% efficiency at 20 microns; warranty-supported 15,000-mile change interval.",
    answer: (p) => `The ${ESC(p.name)} delivers <strong>up to 99% efficiency at 20 microns</strong> with a warranty-supported <strong>15,000-mile</strong> change interval — the premium filter engineered to match AMSOIL synthetic oil's extended drains.`,
    bullets: [
      "<strong>Up to 99% efficiency at 20 microns</strong> — traps the wear-causing contaminants many filters miss.",
      "<strong>High capacity</strong> — warranty-supported 15,000-mile (EA15K) change interval.",
      "Canister construction withstands up to <strong>9X</strong> normal system operating pressure; silicone anti-drainback valve gives up to <strong>3X the hot-oil resistance</strong> of nitrile.",
    ],
    faqs: [
      ["How long does this filter last?", "AMSOIL EA15K filters are warranty-supported for a 15,000-mile change interval when used with AMSOIL synthetic motor oil. Always change the filter when you change the oil."],
      ["Will this filter fit my vehicle?", "The fitment list on this page shows the Toyota and Lexus applications we've matched it to. For anything else, pick your vehicle in the AMSOIL Garage or look it up on amsoil.com."],
      ["Why use an AMSOIL filter instead of FRAM or WIX?", "AMSOIL Ea filters are built for extended drains — up to 99% efficiency at 20 microns and high capacity — going beyond what many competing filters offer."],
    ],
    footnotes: "",
    guide: "amsoil-ea-oil-filter-guide.html", guideLabel: "AMSOIL Ea oil filter guide",
  },
  "Gear Lube": {
    tag: "High film strength and extreme-temperature performance for towing, hauling and severe duty.",
    answer: (p) => `${ESC(p.name)} is engineered with <strong>high film strength</strong> for heavy loads and shock loading, <strong>reduces friction and wear</strong>, and <strong>excels in extreme temperatures</strong> — ideal for towing, hauling, racing and severe duty. Sold in the mess-free SEVERE GEAR Easy-Pack.`,
    bullets: [
      "<strong>High film strength</strong> stands up to high-load demands and shock loading.",
      "<strong>Reduces friction and delivers the ultimate protection against wear.</strong>",
      "<strong>Excels in extreme temperatures</strong> and outperforms conventional gear oils.",
    ],
    faqs: [
      ["Is this the right gear lube for towing?", "Yes — SEVERE GEAR's high film strength and extreme-temperature performance are built for the heat and load of towing, hauling and severe duty. Confirm the viscosity your axle specifies in the fitment list or the AMSOIL Garage."],
      ["What is the Easy-Pack?", "A flexible pouch that makes differential fluid changes faster, cleaner and less messy than a rigid quart bottle — you can squeeze and reach fill holes a bottle can't."],
      ["How do I get the best price?", "Enroll once as a Preferred Customer under Tuned Yota and save up to 25% on every order, for life — or buy at retail with no account."],
    ],
    footnotes: "",
    guide: "amsoil-severe-gear-guide.html", guideLabel: "AMSOIL SEVERE GEAR guide",
  },
  "Automatic Transmission Fluid": {
    tag: "Guaranteed for twice the OEM severe-service drain interval; proven over 100,000 severe miles.",
    answer: (p) => `${ESC(p.name)} is built for heavy towing, high heat and hard use — <strong>guaranteed for twice the OEM severe-service drain interval</strong> and proven in a <strong>100,000-mile severe-service taxi-fleet field trial</strong>.`,
    bullets: [
      "<strong>Guaranteed for twice the OEM severe-service drain interval.</strong>",
      "Proven in a <strong>100,000-mile severe-service taxi-fleet trial</strong> — valve body and clutch plates came back virtually free of sludge, deposits and wear.",
      "High antioxidant content resists <strong>thermal breakdown</strong>, sludge and varnish; stays fluid in sub-zero cold.",
    ],
    faqs: [
      ["Is AMSOIL ATF good for towing and heavy hauling?", "Yes — it's formulated for severe service: heavy towing, elevated temperatures and challenging terrain, with reserve protection against heat."],
      ["How long does it last?", "It's guaranteed for twice the original equipment manufacturer's severe-service drain interval. After 100,000 miles in a severe-service fleet trial it still retained 41% of its original oxidation inhibitors."],
      ["Which vehicles use this fluid?", "The fitment list on this page shows the Toyota and Lexus applications we've matched it to — or pick your vehicle in the AMSOIL Garage."],
    ],
    footnotes: "Severe-service and 100,000-mile results are from AMSOIL's Las Vegas Taxi Cab Field Study.",
    guide: "amsoil-synthetic-atf-guide.html", guideLabel: "AMSOIL synthetic ATF guide",
  },
  // Claims below are from the AMSOIL Dealer Sales Briefs (Diesel Oils 8/23,
  // Gasoline Additives 10/24, Antifreeze/Coolants 1/16). tag/bullets/faqs/
  // footnotes may be functions of the product for per-variant copy.
  "Diesel Oil": {
    tag: (p) => /max-duty/i.test(p.name)
      ? "AMSOIL's top-grade diesel oil: 6X better wear protection than required by the Detroit Diesel DD13 scuffing test, with reserve protection to extend drain intervals."
      : "4X better wear protection than required by the Detroit Diesel DD13 scuffing test — engineered for turbodiesel pickups and hard-working equipment.",
    answer: (p) => /max-duty/i.test(p.name)
      ? `${ESC(p.name)} is AMSOIL's top-grade 100% synthetic diesel oil — <strong>6X better wear protection</strong> than required by the Detroit Diesel DD13 scuffing test, with <strong>reserve protection</strong> that lets serious diesel owners extend drain intervals with confidence.<sup>1</sup>`
      : `${ESC(p.name)} is a 100% synthetic formula developed for hard-working turbodiesel pickups and equipment — <strong>4X better wear protection</strong> than required by the Detroit Diesel DD13 scuffing test, with low volatility that minimizes oil consumption.<sup>1</sup>`,
    bullets: (p) => /max-duty/i.test(p.name) ? [
      "<strong>6X better engine wear protection</strong> than required by the Detroit Diesel DD13 scuffing test.<sup>1</sup>",
      "<strong>Reserve protection</strong> — the option to extend drain intervals with confidence.",
      "Withstands high-temperature breakdown under heavy use in extreme temperatures; advanced synthetic technology for maximum fuel economy.",
      "Exceeds the latest API CK-4 specification.",
    ] : [
      "<strong>4X better engine wear protection</strong> than required by the Detroit Diesel DD13 scuffing test.<sup>1</sup>",
      "<strong>Minimizes oil consumption</strong> — low volatility (burn-off) with excellent film strength at high operating temperatures.",
      "5W-40 is specifically designed for the demands serious turbo-truck enthusiasts put their diesel pickups through.",
      "Exceeds the latest API CK-4 specification.",
    ],
    faqs: [
      ["Will switching to AMSOIL synthetic diesel oil cause leaks?", "No — synthetic oils do not cause engines to leak. AMSOIL diesel oils are fully compatible with modern seal materials and are formulated to condition seals, keeping them pliable. They're safe in both new and high-mileage engines."],
      ["What's the difference between Max-Duty and Heavy-Duty?", "Both exceed the API CK-4 specification. Heavy-Duty delivers 4X better wear protection than required by the Detroit Diesel DD13 scuffing test; Signature Series Max-Duty delivers 6X, with reserve protection that allows extended drain intervals — it's the pick for hardcore enthusiasts and owners who want the best."],
      ["Can AMSOIL diesel oil be used in gasoline engines?", "Signature Series Max-Duty is suitable for applications specifying API SN+ and earlier, making it ideal for mixed fleets. Check your owner's manual for the specified viscosity and rating."],
    ],
    footnotes: "<sup>1</sup> Wear-protection comparisons are based on the requirements of the Detroit Diesel DD13 scuffing test.",
    guide: "is-amsoil-worth-it.html", guideLabel: "Is AMSOIL worth it?",
  },
  "Fuel Additive": {
    tag: (p) => /performance improver/i.test(p.name)
      ? "Deep-cleans injectors, intake valves and combustion chambers — restores power and fuel economy in one tank. Use every 4,000 miles."
      : "Lubricates upper cylinders to fight wear, inhibits ethanol corrosion and keeps injectors clean — use at every fill-up.",
    answer: (p) => /performance improver/i.test(p.name)
      ? `${ESC(p.name)} is an extremely potent, concentrated detergent additive — unsurpassed in removing damaging fuel-injector, intake-valve and combustion-chamber deposits. It cleans your <strong>entire fuel system and restores power and performance in one tank</strong> of gasoline, and it's excellent for direct-injected (GDI) and port-injected engines. Treats 30 gallons; use every 4,000 miles.`
      : `${ESC(p.name)} lubricates upper cylinders to fight wear, <strong>inhibits ethanol-related corrosion</strong> and keeps injectors clean — extending engine life at every fill-up. It delivers <strong>18% more lubricity than Lucas and 20% more than Sea Foam</strong> for better retention of horsepower and fuel economy.<sup>1</sup> Treats 25 gallons; use every tank.`,
    bullets: (p) => /performance improver/i.test(p.name) ? [
      "<strong>Deep-cleans the entire fuel system</strong> — injectors, intake valves and combustion chambers — in one tank.",
      "Restores power, performance and fuel economy; helps reduce emissions.",
      "Excellent for gasoline direct-injected (GDI) and port fuel-injected engines; capless-compatible bottle; E85-safe.",
    ] : [
      "<strong>Lubricates upper cylinders</strong> to fight wear — extending engine life at every fill-up.",
      "<strong>Inhibits ethanol-related corrosion</strong> and keeps injectors clean.",
      "<strong>18% more lubricity than Lucas, 20% more than Sea Foam</strong> for better retention of horsepower and fuel economy.<sup>1</sup>",
      "Designed to work hand-in-hand with P.i. Performance Improver; capless-compatible; E85-safe.",
    ],
    faqs: [
      ["What's the difference between P.i. and Upper Cylinder Lubricant?", "P.i. is the deep-cleaning additive — it cleans the entire fuel system and restores like-new performance every 4,000 miles. Upper Cylinder Lubricant is the maintenance product — it lubricates upper cylinders, fights ethanol corrosion and keeps injectors clean at every fill-up."],
      ["Can I use both at the same time?", "Yes — both products can be used together in one tank of gasoline. Deep-clean with P.i. every 4,000 miles, keep clean with Upper Cylinder Lubricant every tank."],
      ["Do these work in my Toyota or Lexus?", "Yes — they're formulated for all gasoline engines, including the direct-injected and turbocharged engines across the Toyota and Lexus lineup, and they're compatible with E85 and capless fuel systems."],
    ],
    footnotes: (p) => /performance improver/i.test(p.name) ? ""
      : "<sup>1</sup> Based on independent testing of AMSOIL Upper Cylinder Lubricant, Lucas Upper Cylinder Lubricant and Sea Foam Motor Treatment obtained on 02/13/2019 using ASTM D6079 modified for use with gasoline.",
    guide: "is-amsoil-worth-it.html", guideLabel: "Is AMSOIL worth it?",
  },
  "Antifreeze & Coolant": {
    tag: (p) => /heavy-duty/i.test(p.name)
      ? "50/50 premix with no SCAs required — service life up to 600,000 miles, 12,000 hours or 6 years."
      : "50/50 premixed OAT coolant — outstanding hot- and cold-weather protection against corrosion, cavitation and scaling.",
    answer: (p) => /heavy-duty/i.test(p.name)
      ? `${ESC(p.name)} is formulated with cutting-edge organic acid technology for outstanding protection against cavitation, corrosion and scaling. Premixed 50/50 with high-purity water, it requires <strong>no supplemental coolant additives (SCAs)</strong> and provides extended drain intervals of <strong>600,000 miles, 12,000 hours or six years</strong>, whichever comes first.`
      : `${ESC(p.name)} is formulated with cutting-edge organic acid technology for outstanding protection and performance in both hot and cold weather — effectively protecting against <strong>cavitation, corrosion and scaling</strong>. Premixed 50/50 with high-purity water and <strong>compatible with all other antifreeze/coolant colors</strong> on the market.`,
    bullets: (p) => /heavy-duty/i.test(p.name) ? [
      "<strong>600,000-mile / 12,000-hour / 6-year</strong> extended service life — no supplemental coolant additives (SCAs) required.",
      "Cutting-edge organic acid technology protects against cavitation, corrosion and scaling.",
      "<strong>50/50 premixed</strong> with high-purity water — no measuring or mixing; compatible with virtually all vehicles.",
    ] : [
      "Cutting-edge <strong>organic acid technology</strong> protects against corrosion, cavitation and scaling in both hot and cold weather.",
      "<strong>50/50 premixed</strong> with high-purity water — no measuring or mixing.",
      "<strong>Compatible with all other antifreeze/coolant colors</strong> — no poly-organic scaling salts like green conventional coolants.",
    ],
    faqs: [
      ["Is it compatible with the coolant already in my vehicle?", "Yes — AMSOIL Antifreeze & Coolant is compatible with all other coolants and coolant colors on the market. For the most predictable freeze and boil protection, AMSOIL recommends staying with all ethylene glycol or all propylene glycol rather than mixing the two types."],
      ["Do I need to mix it with water?", "No — it comes premixed 50/50 with high-purity water, eliminating the hassle of measuring and mixing (poor-quality mixing water is a leading cause of cooling-system problems)."],
      ["Which coolant should I choose for my Toyota or Lexus?", "Passenger Car & Light Truck Antifreeze & Coolant is the fit for the Toyota/Lexus lineup, with a 150,000-mile or 5-year service interval in passenger-vehicle use. Heavy-Duty is the pick for diesel and commercial equipment."],
    ],
    footnotes: "",
    guide: "amsoil-vs-oem-toyota-lexus-fluids.html", guideLabel: "AMSOIL vs. OEM fluids",
  },
  // Claims from the European Motor Oil Dealer Product Brief (10/23) and the
  // High-Mileage Motor Oil Product Sales Brief (7/23).
  "European Motor Oil": {
    tag: "Covers strict European manufacturer specifications with SAPS-balanced emissions-system protection — for gasoline and diesel engines.",
    answer: (p) => `${ESC(p.name)} is a premium synthetic formulated for the unique demands of European engines — covering <strong>strict European manufacturer specifications</strong> with a precisely balanced SAPS formulation that protects sensitive emissions systems. Shear-stable synthetic base oils and high-quality anti-wear additives deliver dependable protection through the <strong>long drain intervals European manufacturers recommend</strong>, in both gasoline and diesel engines.`,
    bullets: [
      "<strong>Extensive coverage</strong> of strict European manufacturer specifications.",
      "<strong>Emissions-system protection</strong> — precisely balanced SAPS (sulfated ash, phosphorus, sulfur) keeps exhaust-treatment devices functioning properly.",
      "<strong>Superior engine cleanliness</strong> — prevents sludge and varnish deposits, reduces oil consumption, extends engine life.",
      "<strong>Excellent for turbochargers</strong> — thermally stable formulation resists deposits and cools turbos; low pour point protects against oil starvation in subzero cold.",
    ],
    faqs: [
      ["Is it safe if it's not officially approved by my manufacturer?", "Absolutely — if it has the correct viscosity and specification. Manufacturer approvals only mean an oil meets minimum performance standards; AMSOIL goes beyond the minimum, and AMSOIL products are Warranty Secure, keeping your factory warranty intact."],
      ["Can I use it in my diesel-powered European vehicle?", "Yes — the versatile formulation is suitable for both gasoline and diesel engines. Match the viscosity and specification your owner's manual calls for."],
      ["How often should I change the oil?", "European manufacturers commonly recommend long drain intervals, and AMSOIL recommends following them — check your owner's manual or change according to the oil-life monitor."],
    ],
    footnotes: "",
    guide: "amsoil-synthetic-motor-oil-guide.html", guideLabel: "AMSOIL synthetic motor oil guide",
  },
  "High-Mileage Motor Oil": {
    tag: "Purpose-built for vehicles past 75,000 miles — seal conditioners protect against leaks, boosted detergents fight deposits, API licensed, 12,000-mile protection.",
    answer: (p) => `${ESC(p.name)} is purpose-built for engines past <strong>75,000 miles</strong>: added seal conditioners defend seals against drying, cracking and leaking, an added detergent boost cleans up sludge and deposits, and a robust viscosity provides additional wear protection even after some wear has occurred. It's <strong>API licensed</strong> and cleans and protects for up to <strong>12,000 miles or 1 year</strong> in normal service.`,
    bullets: [
      "<strong>Purpose-built protection</strong> for high-mileage vehicles — confidence to keep aging vehicles on the road.",
      "<strong>Protects against leaks</strong> — seal conditioners extend seal life by defending against drying and cracking.",
      "<strong>Fights deposits</strong> — an added boost of detergents cleans up sludge.",
      "<strong>API licensed</strong>; formulated to meet and exceed the latest industry specifications, including LSPI protection.",
      "<strong>Cleans and protects for up to 12,000 miles</strong> or 1 year in normal service.",
    ],
    faqs: [
      ["When should I switch to High-Mileage Motor Oil?", "A good rule of thumb is at or around 75,000 miles — the widely accepted threshold to begin a more robust preventive-maintenance program for maximum engine life."],
      ["Is this right for my older Tundra, Tacoma or 4Runner?", "It's an excellent fit for high-mileage Toyota and Lexus engines: targeted seal, deposit and wear protection at an affordable price. For ultimate performance and protection regardless of miles, Signature Series remains AMSOIL's top choice."],
      ["What's the drain interval?", "Up to 12,000 miles or 1 year, whichever comes first, in normal service (see your owner's manual for severe-service schedules). Always change the filter when changing oil."],
    ],
    footnotes: "",
    guide: "amsoil-synthetic-motor-oil-guide.html", guideLabel: "AMSOIL synthetic motor oil guide",
  },
};

export function productSlug(p) {
  return ("amsoil " + p.name).toLowerCase().replace(/100% /g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Toyota/Lexus applications for a SKU, from the garage data. Capacity is shown
// ONLY when both the generation and the system row are installer-verified —
// the same integrity rule the vehicle pages enforce.
export function fitmentFor(sku) {
  const out = [];
  for (const make of Object.keys(CAT.vehicles || {})) {
    for (const model of Object.keys(CAT.vehicles[make])) {
      for (const g of CAT.vehicles[make][model]) {
        for (const s of g.systems || []) {
          if (s.sku !== sku) continue;
          out.push({ make, model, slug: slugOf(make, model), y: g.y, e: g.e, system: s.system,
            capacity: (g.verified && s.verified && s.capacity) ? `${s.capacity} ${s.unit || ""}`.trim() : "" });
        }
      }
    }
  }
  return out;
}

function productPage(sku, p) {
  const cat = categoryOf(p.name);
  const copy = PRODUCT_COPY[cat];
  if (!copy) throw new Error(`no PRODUCT_COPY for category "${cat}" (${p.name}) — add it before cataloging this product`);
  // Copy fields may be functions of the product (per-variant claims within a category).
  const V = (x) => (typeof x === "function" ? x(p) : x);
  const tag = V(copy.tag), bullets = V(copy.bullets), faqs = V(copy.faqs), footnotes = V(copy.footnotes);
  const price = priceOfP(p);
  const slug = productSlug(p);
  const url = `https://tunedyota.com/${slug}`;
  const fits = fitmentFor(sku);
  const desc = `${p.name} (${p.stockNo}) — $${price.toFixed(2)} from Tuned Yota, an Authorized AMSOIL Dealer. ${tag} Free shipping on orders $100+, 30-day returns, ships direct from AMSOIL.`;
  const img = `https://tunedyota.com${p.image}`;
  const faqSchema = faqs.map(([q, a]) => `{"@type":"Question","name":${JSON.stringify(q)},"acceptedAnswer":{"@type":"Answer","text":${JSON.stringify(a)}}}`).join(",");
  const faqVisible = faqs.map(([q, a]) => `  <div class="lp-fq"><button class="lp-fqq" aria-expanded="false">${ESC(q)}<span>+</span></button><div class="lp-fqa"><p>${ESC(a)}</p></div></div>`).join("\n");
  const fitList = fits.map((f) => `<li><a href="amsoil-${f.slug}.html">${ESC(f.make)} ${ESC(f.model)} ${ESC(f.y)} ${ESC(f.e)}</a> — ${ESC(f.system)}${f.capacity ? ` (${ESC(f.capacity)})` : ""}</li>`).join("\n    ");
  const fitSection = fits.length
    ? `  <h2>Fits these Toyota &amp; Lexus vehicles</h2>\n  <p>Applications we've matched from AMSOIL's fitment guide for our supported lineup:</p>\n  <ul class="lp-bul">\n    ${fitList}\n  </ul>\n  <p>Different vehicle? Pick it in the <a href="amsoil-garage.html">AMSOIL Garage</a> — or search all of AMSOIL from there.</p>`
    : `  <h2>Find your fit</h2>\n  <p>Pick your vehicle in the <a href="amsoil-garage.html">AMSOIL Garage</a> to confirm the right AMSOIL products for your Toyota or Lexus.</p>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${ESC(p.name)} (${ESC(p.stockNo)}) — $${price.toFixed(2)} | Tuned Yota</title>
<meta name="description" content="${ESC(desc)}">
<link rel="canonical" href="${url}">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","@id":"${url}#product","name":${JSON.stringify(p.name)},"image":[${JSON.stringify(img)}],"description":${JSON.stringify(desc)},"sku":${JSON.stringify(p.stockNo)},"mpn":${JSON.stringify(p.stockNo)},"brand":{"@type":"Brand","name":"AMSOIL"},"category":${JSON.stringify(cat)},"url":"${url}","offers":{"@type":"Offer","url":"${url}","priceCurrency":"USD","price":${JSON.stringify(price.toFixed(2))},"availability":"https://schema.org/InStock","itemCondition":"https://schema.org/NewCondition","seller":{"@type":"Organization","name":"AMSOIL Inc."},${RETURN_POLICY}}}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[${faqSchema}]}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://tunedyota.com/"},{"@type":"ListItem","position":2,"name":"AMSOIL Garage","item":"https://tunedyota.com/amsoil-garage"},{"@type":"ListItem","position":3,"name":${JSON.stringify(p.name)},"item":"${url}"}]}
</script>
${FONTS}
${SITECSS}
${FAVICON}
${STYLE}
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
${NAV}
<a id="main" tabindex="-1"></a>
<div class="lp">
  <div class="lp-eyebrow">Tuned Yota · Authorized AMSOIL Dealer</div>
  <h1>${ESC(p.name)}</h1>
  <div class="lp-answer" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
    ${imgTagP(p, 160)}
    <div style="flex:1;min-width:220px">
      <div style="font-size:27px;font-weight:900;color:var(--ink)">$${price.toFixed(2)}</div>
      <div style="font-size:13.5px;color:var(--sage-d);margin-top:2px">AMSOIL Stock&nbsp;#&nbsp;${ESC(p.stockNo)} · In stock — ships direct from AMSOIL</div>
      ${ratingLine(p.stockNo, amsoilUrl(p.productPath))}<div style="font-size:13.5px;margin-top:4px">Free shipping on orders $100+ · <a href="returns.html">30-day returns</a></div>
    </div>
  </div>
  <div class="lp-cta">
    <a class="btn primary" target="_blank" rel="noopener" href="${amsoilUrl(p.productPath)}">Order at AMSOIL.com →</a>
    <a class="btn outline" target="_blank" rel="noopener" href="${amsoilUrl("/offers/pc/")}">Save up to 25% as a Preferred Customer</a>
  </div>

  <p style="margin:14px 0 0">${copy.answer(p)}</p>
  <h2>Why this product</h2>
  <ul class="lp-bul">${bullets.map((b) => `<li>${b}</li>`).join("")}</ul>

${fitSection}

  <div class="lp-book">
    <h2>Save up to 25% for life</h2>
    <p>Become a Preferred Customer under Tuned Yota — wholesale pricing (up to 25% off retail), points, exclusive promotions and free gear. The membership pays for itself in about two oil changes.</p>
    <a class="btn primary" target="_blank" rel="noopener" href="${amsoilUrl("/offers/pc/")}">Become a Preferred Customer →</a>
  </div>

  <h2>${ESC(p.name)} — FAQ</h2>
${faqVisible}

  <h2>Keep reading</h2>
  <div class="lp-veh"><a href="${copy.guide}">${ESC(copy.guideLabel)}</a><a href="amsoil-vs-oem-toyota-lexus-fluids.html">AMSOIL vs. OEM fluids</a><a href="amsoil-garage.html">AMSOIL Garage — all vehicles</a><a href="returns.html">Shipping &amp; returns</a></div>

  <p class="lp-disc">${footnotes || ""} Price shown is AMSOIL's current online retail price, synced weekly. Checkout completes on amsoil.com; orders are sold, shipped and fulfilled by AMSOIL Inc. Tuned Yota is an Authorized AMSOIL Dealer.</p>
</div>
${FQSCRIPT}
${FOOTER}
${FQA11Y}
${TRACK}
<script src="/chat.js" defer></script>
</body>
</html>
`;
}

export const AMSOIL_PRODUCT_FILES = Object.values(CAT.products)
  .filter((p) => priceOfP(p) != null)
  .map((p) => `${productSlug(p)}.html`);

// ---- Tier-2 full-line category hubs (Phase 2 of the 541-product strategy) ----
// The FULL catalog (site/amsoil-catalog-full.json, built by
// scripts/amsoil/build-full-catalog.mjs from the owner's authoritative U.S.
// Pricing sheet) drives one hub page per AMSOIL category + a searchable master
// index — every product in the line visible with live retail + PC pricing and
// one-click referral ordering. Curated Tier-1 SKUs link to their internal
// product pages; the long tail orders via amsoil.com stock-number search (the
// runtime amsoil-track.js rewrites those through the tracked go-link).
// DELIBERATE: hubs emit CollectionPage/ItemList schema, NOT Product nodes —
// long-tail items have no self-hosted images yet, and imageless Product nodes
// are exactly the GSC error fixed on 2026-07-24.
const FULL = require("../site/amsoil-catalog-full.json");
// Tier-3 enrichment (real /p/ paths + validated images + live prices from the
// enrichment scout). Absent before the first scout run → zero Tier-3 pages.
let ENRICH = { products: {} };
try { ENRICH = require("../scripts/amsoil/data/enrichment.json"); } catch { /* not yet scouted */ }
// Owner-provided category hero images (assets-source → ingested to
// site/images/amsoil/cats/). Hubs without one simply render text-only.
let CAT_IMAGES = { images: {} };
try { CAT_IMAGES = require("../scripts/amsoil/data/category-images.json"); } catch { /* none yet */ }
// Owner's amsoil.com category scrapes, normalized by ingest-scrape.mjs —
// highest-fidelity price + customer rating per stockNo. Ratings are rendered
// as VISIBLE text with attribution only, never as schema aggregateRating
// (borrowed ratings in structured data = misrepresentation; owner rule
// 2026-07-12, test-guarded).
let SCRAPE = { products: {} };
try { SCRAPE = require("../scripts/amsoil/data/scrape-overlay.json"); } catch { /* none yet */ }
const scrapeOf = (stockNo) => SCRAPE.products[stockNo] || null;
function ratingLine(stockNo, orderHref) {
  const s = scrapeOf(stockNo);
  if (!s || !s.rating || !s.reviews) return "";
  return `<div style="font-size:13.5px;margin-top:4px">★ ${s.rating.toFixed(1)} · <a target="_blank" rel="noopener" href="${orderHref}">${s.reviews.toLocaleString("en-US")} customer reviews on AMSOIL.com</a></div>`;
}
export const catSlug = (c) => c.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const HUB_CATS = [...new Set(FULL.products.map((p) => p.category))].sort();
export const AMSOIL_HUB_FILES = ["amsoil-products.html", ...HUB_CATS.map((c) => `amsoil-${catSlug(c)}-products.html`)];

// Category → deeper Tier-1 reading where we have it.
const HUB_GUIDE = {
  "Motor Oil": ["amsoil-synthetic-motor-oil-guide.html", "AMSOIL synthetic motor oil guide"],
  "Gear Oil": ["amsoil-severe-gear-guide.html", "AMSOIL SEVERE GEAR guide"],
  "Transmission Fluid": ["amsoil-synthetic-atf-guide.html", "AMSOIL synthetic ATF guide"],
  "Filters": ["amsoil-ea-oil-filter-guide.html", "AMSOIL Ea oil filter guide"],
  "High Mileage Motor Oil": ["is-amsoil-worth-it.html", "Is AMSOIL worth it?"],
  "European Oil": ["amsoil-vs-oem-toyota-lexus-fluids.html", "AMSOIL vs. OEM fluids"],
};
const HUBSTYLE = `<style>
.htab{width:100%;border-collapse:collapse;margin:14px 0;font-size:14px}
.htab th{font-family:'Spectral SC',serif;font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--sage-d);text-align:left;padding:8px 8px;border-bottom:1.6px solid var(--line)}
.htab td{padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:top}
.htab a{color:var(--brown);font-weight:700;text-decoration:none}
.hsizes{font-size:12px;color:var(--sage-d);margin-top:3px}
.hp{white-space:nowrap;font-weight:900;color:var(--ink)}
.hpc{font-size:11.5px;color:var(--sage-d);font-weight:600}
.htab .ord{display:inline-block;background:var(--ink);color:#F3EFEA;border-radius:99px;padding:7px 14px;font-weight:900;font-size:12.5px}
.hcats{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}
.hcats a{background:var(--card);border:1.4px solid var(--line);border-radius:99px;padding:8px 14px;font-size:13px;font-weight:700;color:var(--brown);text-decoration:none}
#hsearch{width:100%;padding:13px 16px;font-size:16px;border:1.6px solid var(--brown);border-radius:12px;margin:14px 0 4px}
@media(max-width:560px){.htab th:nth-child(2),.htab td:nth-child(2){display:none}}
</style>`;

// stockNo (any variant) → internal Tier-1 page, for curated SKUs.
function curatedByStock() {
  const m = {};
  for (const p of Object.values(CAT.products)) if (p.stockNo && priceOfP(p) != null) m[p.stockNo] = `${productSlug(p)}.html`;
  return m;
}

// ---- Tier-3 long-tail product pages ------------------------------------------
// One crawlable landing page per enriched full-catalog product (quality bar:
// validated /p/ path AND self-hosted image from the enrichment scout). Copy is
// deliberately GENERIC-honest — no per-line performance claims (those live on
// Tier-1 pages and the briefs); the unique substance is the full pack/pricing
// table, identifiers (stock number, UPC→gtin12) and the ordering/PC/shipping
// value props. Live scouted price wins over the sheet price when present.
const cleanName = (n) => n.replace(/^AMSOIL /, "");
export function tier3List() {
  const curated = curatedByStock();
  const seen = new Set(), out = [], slugs = new Set();
  for (const p of FULL.products) {
    if (seen.has(p.stockNo)) continue;
    seen.add(p.stockNo);
    if (curated[p.stockNo] || p.variants.some((v) => curated[v.stockNo])) continue;
    const e = ENRICH.products[p.stockNo];
    if (!e || !e.path || !e.image) continue;
    let slug = productSlug({ name: cleanName(p.name) });
    if (slugs.has(slug)) slug = `${slug}-${p.stockNo.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    if (slugs.has(slug)) throw new Error(`tier3 slug collision: ${slug}`);
    slugs.add(slug);
    out.push({ p, e, slug });
  }
  return out;
}
export const AMSOIL_FULL_PRODUCT_FILES = tier3List().map(({ slug }) => `${slug}.html`);

function fullProductPage({ p, e, slug }) {
  const url = `https://tunedyota.com/${slug}`;
  const name = cleanName(p.name);
  const sc = scrapeOf(p.stockNo);
  const price = (sc && sc.price > 0 ? sc.price : null) ?? (e.price != null && e.price > 0 ? e.price : p.retail);
  const img = `https://tunedyota.com${e.image}`;
  const gtin = /^\d{12}$/.test(p.upc || "") ? `"gtin12":${JSON.stringify(p.upc)},` : "";
  const desc = `${name} (${p.stockNo}) — $${price.toFixed(2)} from Tuned Yota, an Authorized AMSOIL Dealer. Genuine AMSOIL ${p.category.toLowerCase()}, shipped direct from AMSOIL — free on orders $100+, 30-day returns.`;
  const hub = `amsoil-${catSlug(p.category)}-products.html`;
  const guide = HUB_GUIDE[p.category];
  const sizeRows = p.variants.map((v) => `<tr><td>${ESC(v.pkg)}</td><td>${ESC(v.stockNo)}</td><td class="hp">$${v.retail.toFixed(2)}${v.pc ? `<div class="hpc">$${v.pc.toFixed(2)} P.C.</div>` : ""}</td></tr>`).join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${ESC(name)} (${ESC(p.stockNo)}) — $${price.toFixed(2)} | Tuned Yota</title>
<meta name="description" content="${ESC(desc)}">
<link rel="canonical" href="${url}">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","@id":"${url}#product","name":${JSON.stringify(name)},"image":[${JSON.stringify(img)}],"description":${JSON.stringify(desc)},"sku":${JSON.stringify(p.stockNo)},"mpn":${JSON.stringify(p.stockNo)},${gtin}"brand":{"@type":"Brand","name":"AMSOIL"},"category":${JSON.stringify(p.category)},"url":"${url}","offers":{"@type":"Offer","url":"${url}","priceCurrency":"USD","price":${JSON.stringify(price.toFixed(2))},"availability":"https://schema.org/InStock","itemCondition":"https://schema.org/NewCondition","seller":{"@type":"Organization","name":"AMSOIL Inc."},${RETURN_POLICY}}}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://tunedyota.com/"},{"@type":"ListItem","position":2,"name":"All AMSOIL Products","item":"https://tunedyota.com/amsoil-products"},{"@type":"ListItem","position":3,"name":${JSON.stringify(`AMSOIL ${p.category}`)},"item":"https://tunedyota.com/${hub.replace(/\.html$/, "")}"},{"@type":"ListItem","position":4,"name":${JSON.stringify(name)},"item":"${url}"}]}
</script>
${FONTS}
${SITECSS}
${FAVICON}
${STYLE}
${HUBSTYLE}
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
${NAV}
<a id="main" tabindex="-1"></a>
<div class="lp">
  <div class="lp-eyebrow">Tuned Yota · Authorized AMSOIL Dealer · ${ESC(p.category)}</div>
  <h1>${ESC(name)}</h1>
  <div class="lp-answer" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
    <img class="pimg" src="${e.image}" alt="${ESC(name)}" loading="lazy" width="160" height="160">
    <div style="flex:1;min-width:220px">
      <div style="font-size:27px;font-weight:900;color:var(--ink)">$${price.toFixed(2)}</div>
      ${p.pc ? `<div style="font-size:13.5px;color:var(--sage-d)">$${p.pc.toFixed(2)} as a Preferred Customer</div>` : ""}
      <div style="font-size:13.5px;color:var(--sage-d);margin-top:2px">AMSOIL Stock&nbsp;#&nbsp;${ESC(p.stockNo)} · In stock — ships direct from AMSOIL</div>
      ${ratingLine(p.stockNo, amsoilUrl(e.path))}<div style="font-size:13.5px;margin-top:4px">Free shipping on orders $100+ · <a href="returns.html">30-day returns</a></div>
    </div>
  </div>
  <div class="lp-cta">
    <a class="btn primary" target="_blank" rel="noopener" href="${amsoilUrl(e.path)}">Order at AMSOIL.com →</a>
    <a class="btn outline" target="_blank" rel="noopener" href="${amsoilUrl("/offers/pc/")}">Save up to 25% as a Preferred Customer</a>
  </div>

  <p style="margin:14px 0 0">Genuine AMSOIL <strong>${ESC(name)}</strong> — part of AMSOIL's ${ESC(p.category)} line. Ordering through Tuned Yota, an Authorized AMSOIL Dealer, costs nothing extra: you pay AMSOIL's own published price, it ships direct from AMSOIL's distribution centers, and your purchase supports an independent Toyota/Lexus specialist shop.${guide ? ` New to the category? Read the <a href="${guide[0]}">${guide[1]}</a>.` : ""}</p>

  <h2>Sizes &amp; pricing</h2>
  <table class="htab"><thead><tr><th>Package</th><th>Stock #</th><th>Price</th></tr></thead><tbody>
${sizeRows}
  </tbody></table>

  <div class="lp-book">
    <h2>Save up to 25% for life</h2>
    <p>Become a Preferred Customer under Tuned Yota — the P.C. prices shown above, points, exclusive promotions and free gear. The membership pays for itself in about two oil changes.</p>
    <a class="btn primary" target="_blank" rel="noopener" href="${amsoilUrl("/offers/pc/")}">Become a Preferred Customer →</a>
  </div>

  <h2>Keep browsing</h2>
  <div class="lp-veh"><a href="${hub}">All AMSOIL ${ESC(p.category)}</a><a href="amsoil-products.html">All AMSOIL products</a><a href="amsoil-garage.html">AMSOIL Garage — fluids for your Toyota/Lexus</a><a href="returns.html">Shipping &amp; returns</a></div>

  <p class="lp-disc">Prices are AMSOIL's published U.S. retail and Preferred Customer prices. Checkout completes on amsoil.com; orders are sold, shipped and fulfilled by AMSOIL Inc. Tuned Yota is an Authorized AMSOIL Dealer.</p>
</div>
${FOOTER}
${TRACK}
<script src="/chat.js" defer></script>
</body>
</html>
`;
}

export function buildTier3Pages() {
  const list = tier3List();
  for (const item of list) fs.writeFileSync(path.join(SITE, `${item.slug}.html`), fullProductPage(item));
  return list.length;
}

function hubChrome({ file, title, desc, h1, eyebrow, body, itemList, hero }) {
  const url = `https://tunedyota.com/${file.replace(/\.html$/, "")}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${url}">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"CollectionPage","name":${JSON.stringify(h1)},"url":"${url}",${hero ? `"image":${JSON.stringify(`https://tunedyota.com${hero}`)},` : ""}"isPartOf":{"@id":"https://tunedyota.com/#business"},"mainEntity":{"@type":"ItemList","numberOfItems":${itemList.length},"itemListElement":[${itemList.map((it, i) => `{"@type":"ListItem","position":${i + 1},"name":${JSON.stringify(it.name)},"url":${JSON.stringify(it.url)}}`).join(",")}]}}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://tunedyota.com/"},{"@type":"ListItem","position":2,"name":"AMSOIL Garage","item":"https://tunedyota.com/amsoil-garage"},{"@type":"ListItem","position":3,"name":${JSON.stringify(h1)},"item":"${url}"}]}
</script>
${FONTS}
${SITECSS}
${FAVICON}
${STYLE}
${HUBSTYLE}
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
${NAV}
<a id="main" tabindex="-1"></a>
<div class="lp">
  <div class="lp-eyebrow">${eyebrow}</div>
  ${hero ? `<img src="${hero}" alt="${h1}" width="140" height="140" loading="eager" style="float:right;margin:0 0 10px 14px;border-radius:50%;box-shadow:var(--shadow-sm)">` : ""}<h1>${h1}</h1>
${body}
  <div class="lp-book">
    <h2>Save up to 25% for life</h2>
    <p>Become a Preferred Customer under Tuned Yota — the P.C. prices shown above, points, exclusive promotions and free gear. The membership pays for itself in about two oil changes.</p>
    <a class="btn primary" target="_blank" rel="noopener" href="${amsoilUrl("/offers/pc/")}">Become a Preferred Customer →</a>
  </div>
  <p class="lp-disc">Prices are AMSOIL's published U.S. retail (online/catalog) and Preferred Customer prices; checkout completes on amsoil.com with free shipping on orders $100+. Orders are sold, shipped and fulfilled by AMSOIL Inc. See <a href="returns.html">shipping &amp; returns</a>. Tuned Yota is an Authorized AMSOIL Dealer.</p>
</div>
${FOOTER}
${TRACK}
<script src="/chat.js" defer></script>
</body>
</html>
`;
}

// Effective retail: owner-scraped live price wins over the pricing sheet.
const effRetail = (p) => {
  const s = scrapeOf(p.stockNo);
  return (s && s.price > 0 ? s.price : null) ?? p.retail;
};

function hubRows(products, curated) {
  return products.map((p) => {
    const internal = curated[p.stockNo] || p.variants.map((v) => curated[v.stockNo]).find(Boolean);
    const searchUrl = amsoilUrl(`/search/?text=${encodeURIComponent(p.stockNo)}`);
    const nameHref = internal || searchUrl;
    const ext = internal ? "" : ' target="_blank" rel="noopener"';
    const sizes = p.variants.map((v) => `${ESC(v.pkg)} $${v.retail.toFixed(2)}`).join(" · ");
    return `<tr><td><a href="${nameHref}"${ext}>${ESC(p.name.replace(/^AMSOIL /, ""))}</a><div class="hsizes">${sizes}</div></td><td>${ESC(p.stockNo)}</td><td class="hp">$${effRetail(p).toFixed(2)}${p.pc ? `<div class="hpc">$${p.pc.toFixed(2)} P.C.</div>` : ""}</td><td><a class="ord" target="_blank" rel="noopener" href="${searchUrl}">Order &#9658;</a></td></tr>`;
  }).join("\n");
}

// stockNo (any variant) → internal page: Tier-1 curated first, then Tier-3.
function internalByStock() {
  const m = curatedByStock();
  for (const { p, slug } of tier3List()) {
    for (const v of p.variants) if (!m[v.stockNo]) m[v.stockNo] = `${slug}.html`;
    if (!m[p.stockNo]) m[p.stockNo] = `${slug}.html`;
  }
  return m;
}

export function buildAmsoilHubs() {
  const curated = internalByStock();
  // Per-category hubs.
  for (const c of HUB_CATS) {
    const ps = FULL.products.filter((p) => p.category === c);
    const file = `amsoil-${catSlug(c)}-products.html`;
    const guide = HUB_GUIDE[c];
    const itemList = ps.map((p) => {
      const internal = curated[p.stockNo] || p.variants.map((v) => curated[v.stockNo]).find(Boolean);
      return { name: p.name, url: internal ? `https://tunedyota.com/${internal.replace(/\.html$/, "")}` : amsoilUrl(`/search/?text=${encodeURIComponent(p.stockNo)}`) };
    });
    const body = `  <div class="lp-answer">Every AMSOIL <strong>${ESC(c)}</strong> product — all ${ps.length} of them — with AMSOIL's published retail and Preferred Customer pricing and one-click ordering, shipped direct from AMSOIL anywhere in the U.S. (free on orders $100+). Ordering through Tuned Yota, an Authorized AMSOIL Dealer, costs nothing extra and supports a Toyota/Lexus specialist shop.${guide ? ` New to the category? Read the <a href="${guide[0]}">${guide[1]}</a>.` : ""}</div>
  <table class="htab"><thead><tr><th>Product &amp; sizes</th><th>Stock #</th><th>Price</th><th></th></tr></thead><tbody>
${hubRows(ps, curated)}
  </tbody></table>
  <p><a href="amsoil-products.html">← All AMSOIL products</a> · <a href="amsoil-garage.html">AMSOIL Garage — fluids for your Toyota/Lexus</a></p>`;
    fs.writeFileSync(path.join(SITE, file), hubChrome({
      file, h1: `AMSOIL ${ESC(c)}`, eyebrow: "Tuned Yota · Authorized AMSOIL Dealer · Full product line",
      title: `AMSOIL ${ESC(c)} — All ${ps.length} Products, Prices &amp; Ordering | Tuned Yota`,
      desc: `Complete AMSOIL ${c} line — all ${ps.length} products with current retail and Preferred Customer prices, stock numbers and direct ordering from Tuned Yota, an Authorized AMSOIL Dealer. Free shipping on orders $100+.`,
      body, itemList, hero: CAT_IMAGES.images[catSlug(c)] || null,
    }));
  }
  // Master index with instant client-side search. Cross-category listings are
  // deduped by stock number so a search shows each product once.
  const seenStock = new Set();
  const searchData = FULL.products.filter((p) => !seenStock.has(p.stockNo) && seenStock.add(p.stockNo)).map((p) => {
    const internal = curated[p.stockNo] || p.variants.map((v) => curated[v.stockNo]).find(Boolean);
    return { n: p.name.replace(/^AMSOIL /, ""), s: p.stockNo, c: p.category, r: effRetail(p),
      u: internal || amsoilUrl(`/search/?text=${encodeURIComponent(p.stockNo)}`) };
  });
  const catLinks = HUB_CATS.map((c) => {
    const im = CAT_IMAGES.images[catSlug(c)];
    return `<a href="amsoil-${catSlug(c)}-products.html">${im ? `<img src="${im}" alt="" width="26" height="26" loading="lazy" style="border-radius:50%;vertical-align:-7px;margin-right:6px">` : ""}${ESC(c)} (${FULL.products.filter((p) => p.category === c).length})</a>`;
  }).join("");
  const idxBody = `  <div class="lp-answer">The <strong>complete AMSOIL product line — ${FULL.count} products</strong> — searchable below with AMSOIL's published pricing, and browsable by category. Every order ships direct from AMSOIL (free on orders $100+) through Tuned Yota, an Authorized AMSOIL Dealer.</div>
  <input id="hsearch" type="search" placeholder="Search all ${FULL.count} AMSOIL products — name or stock number…" autocomplete="off">
  <div id="hresults"></div>
  <h2>Browse by category</h2>
  <div class="hcats">${catLinks}</div>
  <p><a href="amsoil-garage.html">Not sure what your Toyota or Lexus needs? Use the AMSOIL Garage →</a></p>
  <script id="hdata" type="application/json">${JSON.stringify(searchData)}</script>
  <script>
  (function(){
    var data=JSON.parse(document.getElementById('hdata').textContent);
    var inp=document.getElementById('hsearch'),out=document.getElementById('hresults');
    function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
    inp.addEventListener('input',function(){
      var q=inp.value.trim().toLowerCase();
      if(q.length<2){out.innerHTML='';return;}
      var hits=data.filter(function(p){return (p.n+' '+p.s+' '+p.c).toLowerCase().indexOf(q)>-1;}).slice(0,30);
      out.innerHTML=hits.length?'<table class="htab"><tbody>'+hits.map(function(p){
        var ext=/^https:/.test(p.u)?' target="_blank" rel="noopener"':'';
        return '<tr><td><a href="'+esc(p.u)+'"'+ext+'>'+esc(p.n)+'</a><div class="hsizes">'+esc(p.c)+'</div></td><td>'+esc(p.s)+'</td><td class="hp">$'+p.r.toFixed(2)+'</td></tr>';
      }).join('')+'</tbody></table>':'<p style="color:var(--sage-d)">No matches — try a shorter term or browse the categories below.</p>';
    });
  })();
  </script>`;
  fs.writeFileSync(path.join(SITE, "amsoil-products.html"), hubChrome({
    file: "amsoil-products.html", h1: "All AMSOIL Products",
    eyebrow: "Tuned Yota · Authorized AMSOIL Dealer · Full product line",
    title: `All ${FULL.count} AMSOIL Products — Search, Prices &amp; Ordering | Tuned Yota`,
    desc: `Search and shop the complete AMSOIL product line — ${FULL.count} products across ${HUB_CATS.length} categories with current retail and Preferred Customer pricing, from Tuned Yota, an Authorized AMSOIL Dealer.`,
    body: idxBody,
    itemList: HUB_CATS.map((c) => ({ name: `AMSOIL ${c}`, url: `https://tunedyota.com/amsoil-${catSlug(c)}-products` })),
  }));
  return HUB_CATS.length + 1;
}

// ---- Front B: national "Buy AMSOIL in [State]" geo pages ----------------------
// Substantive (NOT thin doorway) — each state gets real cities + a climate/driving
// angle, the AMSOIL value case, product cards + schema, and a national-shipping FAQ.
// `served: true` states also surface our in-person tuning events. Start curated;
// expand by adding STATES entries.
const STATES = [
  { name: "Minnesota", slug: "minnesota", cities: ["Minneapolis", "St. Paul", "Rochester"], served: true, angle: "In Minnesota's brutal winters, AMSOIL synthetic oils protect at start-up in sub-zero cold and resist the moisture and fuel dilution of short, cold-weather trips." },
  { name: "Iowa", slug: "iowa", cities: ["Des Moines", "Cedar Rapids", "Davenport"], served: true, angle: "From Iowa's farm-country hauling to daily commutes, AMSOIL's extended-drain synthetics protect through hot summers and cold winters alike." },
  { name: "Wisconsin", slug: "wisconsin", cities: ["Milwaukee", "Madison", "Green Bay"], served: true, angle: "Wisconsin drivers face everything from Northwoods cold to lake-country towing — AMSOIL's full-synthetic protection handles both." },
  { name: "North Dakota", slug: "north-dakota", cities: ["Fargo", "Bismarck", "Grand Forks"], served: true, angle: "North Dakota's extreme cold and oilfield-grade duty demand more than OEM fluids — AMSOIL delivers cold-start protection and reserve durability." },
  { name: "South Dakota", slug: "south-dakota", cities: ["Sioux Falls", "Rapid City", "Aberdeen"], served: true, angle: "Across South Dakota's big temperature swings and long highway miles, AMSOIL's extended drain intervals mean fewer oil changes and more protection." },
  { name: "Nebraska", slug: "nebraska", cities: ["Omaha", "Lincoln", "Grand Island"], served: true, angle: "Nebraska's mix of interstate miles, farm work and hot summers is exactly where AMSOIL's heat and wear protection earns its keep." },
  { name: "Texas", slug: "texas", cities: ["Houston", "Dallas", "San Antonio"], served: false, angle: "Texas heat and heavy towing punish ordinary oil — AMSOIL synthetics resist thermal breakdown and protect under load." },
  { name: "Florida", slug: "florida", cities: ["Miami", "Orlando", "Tampa"], served: false, angle: "Florida's heat, humidity and stop-and-go traffic are hard on fluids — AMSOIL full-synthetic protection stands up to it." },
  { name: "Colorado", slug: "colorado", cities: ["Denver", "Colorado Springs", "Fort Collins"], served: false, angle: "Colorado's high altitude, mountain towing and cold winters demand a fluid with reserve protection — AMSOIL delivers." },
  { name: "Arizona", slug: "arizona", cities: ["Phoenix", "Tucson", "Mesa"], served: false, angle: "In Arizona's extreme desert heat, AMSOIL's thermal-breakdown resistance keeps engines and transmissions protected." },
  { name: "Michigan", slug: "michigan", cities: ["Detroit", "Grand Rapids", "Lansing"], served: false, angle: "Michigan's harsh winters and daily miles are ideal for AMSOIL's cold-start protection and extended drains." },
  { name: "California", slug: "california", cities: ["Los Angeles", "San Diego", "Sacramento"], served: false, angle: "From California commutes to canyon runs and desert heat, AMSOIL's synthetic protection outperforms conventional oil." },
  { name: "Georgia", slug: "georgia", cities: ["Atlanta", "Augusta", "Savannah"], served: false, angle: "Georgia's heat, humidity and Atlanta stop-and-go traffic are hard on fluids — AMSOIL's full-synthetic protection resists thermal breakdown where conventional oil thins out." },
  { name: "Ohio", slug: "ohio", cities: ["Columbus", "Cleveland", "Cincinnati"], served: false, angle: "From Ohio's snowy winters to daily highway miles, AMSOIL's cold-start protection and extended drains keep engines protected all year." },
  { name: "Pennsylvania", slug: "pennsylvania", cities: ["Philadelphia", "Pittsburgh", "Allentown"], served: false, angle: "Pennsylvania's cold winters, hilly terrain and towing demand a fluid with reserve protection — AMSOIL delivers where OEM oil is stretched thin." },
  { name: "Illinois", slug: "illinois", cities: ["Chicago", "Aurora", "Springfield"], served: false, angle: "Illinois' brutal winters and Chicago stop-and-go traffic are exactly where AMSOIL's cold-start flow and extended drains earn their keep." },
  { name: "Washington", slug: "washington", cities: ["Seattle", "Spokane", "Tacoma"], served: false, angle: "From Washington's wet commutes to Cascade mountain towing, AMSOIL's synthetic protection handles both the daily grind and the grades." },
  { name: "Tennessee", slug: "tennessee", cities: ["Nashville", "Memphis", "Knoxville"], served: false, angle: "Tennessee's summer heat and towing across the hills punish ordinary oil — AMSOIL resists thermal breakdown under sustained load." },
  { name: "North Carolina", slug: "north-carolina", cities: ["Charlotte", "Raleigh", "Greensboro"], served: false, angle: "North Carolina's heat, humidity and mountain-to-coast terrain are a workout for fluids — AMSOIL's protection keeps up in every condition." },
  { name: "Missouri", slug: "missouri", cities: ["Kansas City", "St. Louis", "Springfield"], served: false, angle: "Missouri's big temperature swings and long highway miles favor AMSOIL's all-season protection and 25,000-mile drain intervals." },
  { name: "Montana", slug: "montana", cities: ["Billings", "Missoula", "Bozeman"], served: false, angle: "Montana's extreme cold, big country and heavy towing demand more than OEM fluids — AMSOIL delivers cold-start protection and reserve durability." },
  { name: "Idaho", slug: "idaho", cities: ["Boise", "Meridian", "Nampa"], served: false, angle: "Idaho's cold winters and mountain towing call for a fluid with reserve protection — AMSOIL delivers cold-flow and wear protection where it counts." },
  { name: "Oklahoma", slug: "oklahoma", cities: ["Oklahoma City", "Tulsa", "Norman"], served: false, angle: "Oklahoma's heat and heavy towing are exactly where AMSOIL's thermal-breakdown resistance protects engines, transmissions and axles." },
  { name: "Indiana", slug: "indiana", cities: ["Indianapolis", "Fort Wayne", "Evansville"], served: false, angle: "From Indiana's cold winters to daily highway miles, AMSOIL's cold-start protection and extended drains keep engines protected." },
];

function geoPage(st, vehModels) {
  const url = `https://tunedyota.com/amsoil-${st.slug}`;
  const skus = ["SS-0W20-QT", "SS-5W30-QT", "EA15K09"];
  const products = skus.map(prod).filter(Boolean);
  const offers = products.map((p) => {
    const price = priceOfP(p);
    if (price == null) return null;
    const offer = `{"@type":"Offer","priceCurrency":"USD","price":${JSON.stringify(price.toFixed(2))},"availability":"https://schema.org/InStock","url":${JSON.stringify(amsoilUrl(p.productPath))},"seller":{"@type":"Organization","name":"AMSOIL Inc."},${RETURN_POLICY}}`;
    return `{"@type":"Offer","itemOffered":{"@type":"Product","name":${JSON.stringify(p.name)},${p.image?`"image":${JSON.stringify("https://tunedyota.com"+p.image)},`:""}"brand":{"@type":"Brand","name":"AMSOIL"},"category":${JSON.stringify(categoryOf(p.name))},"offers":${offer}}}`;
  }).filter(Boolean).join(",");
  const cityList = st.cities.join(", ");
  const faqs = [
    [`Where can I buy AMSOIL in ${st.name}?`, `From Tuned Yota, an Authorized AMSOIL Dealer. Order online and it ships direct from AMSOIL to anywhere in ${st.name}, including ${cityList} — no local store trip required.`],
    [`Does AMSOIL ship to ${st.name}?`, `Yes. AMSOIL ships direct to your door anywhere in ${st.name}. Order through Tuned Yota and your dealer referral is applied automatically, or enroll as a Preferred Customer to save up to 25%.`],
    [`Is AMSOIL a good choice for ${st.name} driving?`, `${st.angle} It also carries a guaranteed drain interval up to 25,000 miles, so you change oil less often.`],
  ];
  const faqSchema = faqs.map(([q, a]) => `{"@type":"Question","name":${JSON.stringify(q)},"acceptedAnswer":{"@type":"Answer","text":${JSON.stringify(a)}}}`).join(",");
  const faqVisible = faqs.map(([q, a]) => `  <div class="lp-fq"><button class="lp-fqq" aria-expanded="false">${ESC(q)}<span>+</span></button><div class="lp-fqa"><p>${ESC(a)}</p></div></div>`).join("\n");
  const servedBlock = st.served
    ? `  <h2>Toyota &amp; Lexus tuning in ${ESC(st.name)}</h2>\n  <p>Beyond AMSOIL, Tuned Yota runs in-person OTT tuning events across ${ESC(st.name)}, including ${ESC(cityList)}. <a href="toyota-lexus-tuning-${st.slug}.html">See ${ESC(st.name)} tuning &amp; dates →</a></p>`
    : "";
  const title = `Buy AMSOIL in ${ESC(st.name)} — Synthetic Oil Shipped to Your Door | Tuned Yota`;
  const desc = `Buy genuine AMSOIL synthetic oil, filters, gear lube and ATF in ${ESC(st.name)} — shipped direct to your door from Tuned Yota, an Authorized AMSOIL Dealer. Real prices, and save up to 25% as a Preferred Customer.`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${url}">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Store","@id":"${url}#store","name":"Tuned Yota — Authorized AMSOIL Dealer","url":"${url}","image":"https://tunedyota.com/og-image.png","telephone":"+1-612-406-7117","email":"info@tunedyota.com","priceRange":"$$","parentOrganization":{"@id":"https://tunedyota.com/#business"},"areaServed":{"@type":"State","name":${JSON.stringify(st.name)}},"description":${JSON.stringify(desc)}${offers ? `,"hasOfferCatalog":{"@type":"OfferCatalog","name":${JSON.stringify(`AMSOIL synthetic fluids in ${st.name}`)},"itemListElement":[${offers}]}` : ""}}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[${faqSchema}]}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://tunedyota.com/"},{"@type":"ListItem","position":2,"name":"AMSOIL Garage","item":"https://tunedyota.com/amsoil-garage"},{"@type":"ListItem","position":3,"name":${JSON.stringify(`AMSOIL in ${st.name}`)},"item":"${url}"}]}
</script>
${FONTS}
${SITECSS}
${FAVICON}
${STYLE}
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
${NAV}
<a id="main" tabindex="-1"></a>
<div class="lp">
  <div class="lp-eyebrow">Tuned Yota · Authorized AMSOIL Dealer</div>
  <h1>Buy AMSOIL in ${ESC(st.name)}</h1>
  <div class="lp-answer">Get genuine AMSOIL synthetic oil, filters, gear lube and ATF delivered anywhere in ${ESC(st.name)} — from Tuned Yota, an Authorized AMSOIL Dealer. ${ESC(st.angle)} Order online and it ships direct from AMSOIL to your door.</div>
  <div class="lp-cta">
    <a class="btn primary" target="_blank" rel="noopener" href="${amsoilUrl("/shop/")}">Shop AMSOIL →</a>
    <a class="btn outline" target="_blank" rel="noopener" href="${amsoilUrl("/offers/pc/")}">Save 25% as a Preferred Customer</a>
  </div>

  <h2>Popular AMSOIL products — shipped to ${ESC(st.name)}</h2>
  <p>Real prices, delivered direct from AMSOIL with Tuned Yota's dealer referral attached.</p>
  ${guideCards(skus)}

  <h2>Why AMSOIL in ${ESC(st.name)}</h2>
  <ul class="lp-bul">
    <li>${ESC(st.angle)}</li>
    <li><strong>75% more wear protection</strong> and <strong>100% LSPI protection</strong> — built for modern turbo and direct-injection engines.</li>
    <li><strong>Up to 25,000-mile / 1-year</strong> guaranteed drain intervals — fewer oil changes over the life of your vehicle.</li>
    <li>Factory-direct and shipped to your door in ${ESC(st.name)} — no store trip, no markup.</li>
  </ul>

${servedBlock}

  <div class="lp-book">
    <h2>Save up to 25% for life</h2>
    <p>Become a Preferred Customer under Tuned Yota — wholesale pricing (up to 25% off retail), points, promotions and free gear. The membership pays for itself in about two oil changes.</p>
    <a class="btn primary" target="_blank" rel="noopener" href="${amsoilUrl("/offers/pc/")}">Become a Preferred Customer →</a>
  </div>

  <h2>AMSOIL in ${ESC(st.name)} — FAQ</h2>
${faqVisible}

  <div class="lp-links">
    <strong>More:</strong><br>
    <a href="amsoil-garage.html">AMSOIL Garage</a><a href="amsoil-synthetic-motor-oil-guide.html">AMSOIL oil guide</a><a href="amsoil-vs-oem-toyota-lexus-fluids.html">AMSOIL vs. OEM</a>
  </div>
  <p class="lp-disc">Product recommendations are from AMSOIL's official materials; checkout completes on amsoil.com. Tuned Yota is an Authorized AMSOIL Dealer shipping nationwide.</p>
</div>
${FQSCRIPT}
${FOOTER}
${FQA11Y}
${TRACK}
<script src="/chat.js" defer></script>
</body>
</html>
`;
}

export const AMSOIL_GUIDE_FILES = GUIDES.map((g) => `${g.slug}.html`);
export const AMSOIL_GEO_FILES = STATES.map((s) => `amsoil-${s.slug}.html`);

export function buildAmsoilPages() {
  const list = models();
  for (const m of list) fs.writeFileSync(path.join(SITE, `amsoil-${m.slug}.html`), page(m, list));
  for (const g of GUIDES) fs.writeFileSync(path.join(SITE, `${g.slug}.html`), guidePage(g, list));
  for (const st of STATES) fs.writeFileSync(path.join(SITE, `amsoil-${st.slug}.html`), geoPage(st, list));
  for (const [sku, p] of Object.entries(CAT.products)) {
    if (priceOfP(p) != null) fs.writeFileSync(path.join(SITE, `${productSlug(p)}.html`), productPage(sku, p));
  }
  buildTier3Pages();
  buildAmsoilHubs();
  buildAmsoilGarageStore();
  return list.length;
}

// Run standalone: `node scripts/build-amsoil-pages.mjs`
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("build-amsoil-pages.mjs")) {
  const n = buildAmsoilPages();
  console.log(`amsoil platform pages written: ${n}`);
}
