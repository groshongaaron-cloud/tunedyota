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
  if (n.includes("transmission") || n.includes("atf") || n.includes("multi-vehicle")) return "Automatic Transmission Fluid";
  if (n.includes("grease")) return "Grease";
  if (n.includes("motor oil") || n.includes("0w") || n.includes("5w")) return "Synthetic Motor Oil";
  return "Automotive Fluid";
}
const prod = (sku) => CAT.products[sku];

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
  <div class="frow"><a href="index.html">Home</a><a href="find-your-exact-tune.html">Find Your Tune</a><a href="ott-tune.html">OTT Tune</a><a href="supercharger.html">Supercharger</a><a href="amsoil-garage.html">AMSOIL</a><a href="faq.html">FAQ</a><a href="team.html">Team</a><a href="privacy.html">Privacy</a><a href="terms.html">Terms</a></div>
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
    const offer = `{"@type":"Offer","priceCurrency":"USD","price":${JSON.stringify(price.toFixed(2))},"availability":"https://schema.org/InStock","url":${JSON.stringify(amsoilUrl(p.productPath))},"seller":{"@type":"Organization","name":"AMSOIL Inc."}}`;
    return `{"@type":"Offer","itemOffered":{"@type":"Product","name":${JSON.stringify(p.name)},"brand":{"@type":"Brand","name":"AMSOIL"},"category":${JSON.stringify(categoryOf(p.name))},"offers":${offer}}}`;
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
  "Grease": "AMSOIL Synthetic Grease",
};

function garageOfferCatalog() {
  const byCat = {};
  for (const sku of Object.keys(CAT.products)) {
    const p = CAT.products[sku];
    const price = typeof p.salePrice === "number" && p.salePrice > 0 ? p.salePrice
      : typeof p.retailPrice === "number" && p.retailPrice > 0 ? p.retailPrice : null;
    if (price == null) continue;
    (byCat[categoryOf(p.name)] ||= []).push(price);
  }
  const shopUrl = amsoilUrl("/shop/");
  const seller = `"seller":{"@type":"Organization","name":"AMSOIL Inc."}`;
  // Stable display order; only categories with at least one priced product appear.
  return Object.keys(CAT_LABEL).filter((c) => byCat[c] && byCat[c].length).map((c) => {
    const ps = byCat[c], low = Math.min(...ps), high = Math.max(...ps);
    const offer = low === high
      ? `{"@type":"Offer","priceCurrency":"USD","price":${JSON.stringify(low.toFixed(2))},"availability":"https://schema.org/InStock","url":${JSON.stringify(shopUrl)},${seller}}`
      : `{"@type":"AggregateOffer","priceCurrency":"USD","lowPrice":${JSON.stringify(low.toFixed(2))},"highPrice":${JSON.stringify(high.toFixed(2))},"offerCount":${ps.length},"availability":"https://schema.org/InStock","url":${JSON.stringify(shopUrl)},${seller}}`;
    return `{"@type":"Offer","itemOffered":{"@type":"Product","name":${JSON.stringify(CAT_LABEL[c])},"brand":{"@type":"Brand","name":"AMSOIL"},"category":${JSON.stringify(c)},"offers":${offer}}}`;
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
  fs.writeFileSync(file, html.replace(re, () => block));
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
    return `<div class="fl">${imgTagP(p, 50)}<div class="pinfo"><span class="sys">${ESC(categoryOf(p.name))}</span><span class="prd">${ESC(p.name)}</span></div><div class="pbuy">${price != null ? `<span class="price">$${price.toFixed(2)}</span>` : ""}<a class="ord" target="_blank" rel="noopener" href="${amsoilUrl(p.productPath)}">Order &#9658;</a></div></div>`;
  }).join("");
}

function guidePage(g, vehModels) {
  const url = `https://tunedyota.com/${g.slug}`;
  const products = g.skus.map(prod).filter(Boolean);
  const offers = products.map((p) => {
    const price = priceOfP(p);
    if (price == null) return null;
    const offer = `{"@type":"Offer","priceCurrency":"USD","price":${JSON.stringify(price.toFixed(2))},"availability":"https://schema.org/InStock","url":${JSON.stringify(amsoilUrl(p.productPath))},"seller":{"@type":"Organization","name":"AMSOIL Inc."}}`;
    return `{"@type":"Offer","itemOffered":{"@type":"Product","name":${JSON.stringify(p.name)},"brand":{"@type":"Brand","name":"AMSOIL"},"category":${JSON.stringify(categoryOf(p.name))},"offers":${offer}}}`;
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
    const offer = `{"@type":"Offer","priceCurrency":"USD","price":${JSON.stringify(price.toFixed(2))},"availability":"https://schema.org/InStock","url":${JSON.stringify(amsoilUrl(p.productPath))},"seller":{"@type":"Organization","name":"AMSOIL Inc."}}`;
    return `{"@type":"Offer","itemOffered":{"@type":"Product","name":${JSON.stringify(p.name)},"brand":{"@type":"Brand","name":"AMSOIL"},"category":${JSON.stringify(categoryOf(p.name))},"offers":${offer}}}`;
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
  buildAmsoilGarageStore();
  return list.length;
}

// Run standalone: `node scripts/build-amsoil-pages.mjs`
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("build-amsoil-pages.mjs")) {
  const n = buildAmsoilPages();
  console.log(`amsoil platform pages written: ${n}`);
}
