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
  <div class="frow"><a href="index.html">Home</a><a href="find-your-exact-tune.html">Find Your Tune</a><a href="ott-tune.html">OTT Tune</a><a href="supercharger.html">Supercharger</a><a href="amsoil-garage.html">AMSOIL</a><a href="faq.html">FAQ</a><a href="team.html">Team</a></div>
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
.fl{display:flex;gap:10px;align-items:center;border-top:1px solid var(--line);padding:10px 0}
.fl:first-of-type{border-top:none;margin-top:8px}
.fl .sys{flex:0 0 40%;font-weight:800;color:#222;font-size:13.5px}
.fl .prd{flex:1;font-size:13px;color:#555}
.fl .cap{font-size:12px;color:var(--sage-d);font-weight:700;white-space:nowrap}
.fl .ord{background:var(--ink);color:#fff;border-radius:99px;padding:7px 13px;font-weight:900;text-decoration:none;font-size:12px;white-space:nowrap}
.fl .ord:hover{background:var(--brown)}
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
.lp-final{text-align:center;margin-top:30px}
.lp-disc{font-size:11.5px;opacity:.55;text-align:center;margin-top:22px;line-height:1.55}
</style>`;

const FQA11Y = `<script>document.querySelectorAll('.lp-fq').forEach(function(it,i){var q=it.querySelector('.lp-fqq'),a=it.querySelector('.lp-fqa');if(!q||!a)return;a.id='amfqa-'+i;q.setAttribute('aria-controls','amfqa-'+i);});</script>`;

// Cross-link hub: all AMSOIL platform pages (built after the model list is known).
function vehHub(models, currentSlug) {
  const links = models
    .filter((m) => m.slug !== currentSlug)
    .map((m) => `<a href="amsoil-${m.slug}.html" aria-label="AMSOIL for ${ESC(m.make)} ${ESC(m.model)}">${ESC(m.make)} ${ESC(m.model)}</a>`)
    .join("");
  return `  <h2>AMSOIL for other Toyota &amp; Lexus platforms</h2>
  <div class="lp-veh">${links}</div>`;
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

  // Per-generation fluid cards. Capacity/interval only when verified.
  const genCards = gens.map((g) => {
    const rows = (g.bundle || []).map((sku) => {
      const p = prod(sku); if (!p) return "";
      const detail = g.verified
        ? (g.systems.find((s) => s.sku === sku && s.capacity)
            ? `<span class="cap">${g.systems.find((s) => s.sku === sku).capacity} ${g.systems.find((s) => s.sku === sku).unit}</span>` : "")
        : "";
      const sys = (g.systems.find((s) => s.sku === sku) || {}).system || categoryOf(p.name);
      return `<div class="fl"><span class="sys">${ESC(sys)}</span><span class="prd">${ESC(p.name)}</span>${detail}<a class="ord" target="_blank" rel="noopener" href="${amsoilUrl(p.productPath)}">Order &#9658;</a></div>`;
    }).join("");
    const capNote = g.verified ? "" : `<p style="margin:8px 0 0;font-size:12px;color:var(--sage-d)">Exact fill capacities &amp; severe-service intervals for this configuration are in your <a href="amsoil-garage.html?make=${encodeURIComponent(make)}&amp;model=${encodeURIComponent(model.model)}" style="color:var(--sage-d);font-weight:700">AMSOIL Garage</a>.</p>`;
    return `<div class="gen"><div class="eng">${ESC(g.y)}</div><h3>${ESC(name)} <span style="color:var(--sage-d);font-weight:600">${ESC(g.e)}</span></h3>${rows}${capNote}</div>`;
  }).join("\n");

  // Schema: Store + OfferCatalog of this platform's products (no price → no drift).
  const offers = products.map((p) => `{"@type":"Offer","itemOffered":{"@type":"Product","name":${JSON.stringify(p.name)},"brand":{"@type":"Brand","name":"AMSOIL"},"category":${JSON.stringify(categoryOf(p.name))}}}`).join(",");

  const faqs = [
    [`Where can I buy AMSOIL for my ${name}?`, `From Tuned Yota, an Authorized AMSOIL Dealer. Use the AMSOIL Garage to see the exact oil, filter, and gear lube for your ${name} and order online — products ship direct from AMSOIL anywhere in the U.S.`],
    [`What AMSOIL oil does a ${name} take?`, `AMSOIL recommends ${oilPhrase} for the ${name}; the exact grade depends on your engine and model year. Pick your vehicle in the AMSOIL Garage to confirm the right oil, filter, and capacity for your build.`],
    [`How often should I change the oil on a tuned ${name}?`, `AMSOIL's full-synthetic motor oils are built for extended and severe-service drain intervals. For a tuned or towing ${name} we recommend a severe-service schedule; your AMSOIL Garage shows the interval for your exact configuration.`],
    [`Is AMSOIL worth it for a tuned or towing ${name}?`, `Full-synthetic AMSOIL fluids are formulated for the added heat and load a tuned, supercharged, or towing ${name} puts on its oil, gears, and transmission — which is why our own installers run them.`],
  ];
  const faqSchema = faqs.map(([q, a]) => `{"@type":"Question","name":${JSON.stringify(q)},"acceptedAnswer":{"@type":"Answer","text":${JSON.stringify(a)}}}`).join(",");
  const faqVisible = faqs.map(([q, a]) => `  <div class="lp-fq"><button class="lp-fqq" aria-expanded="false">${ESC(q)}<span>+</span></button><div class="lp-fqa"><p>${ESC(a)}</p></div></div>`).join("\n");

  const title = `AMSOIL Synthetic Oil &amp; Fluids for the ${ESC(name)} | Tuned Yota`;
  const desc = `The exact AMSOIL synthetic oil, filter, gear lube, and ATF for your ${ESC(name)} — recommended grades and severe-service intervals for tuned and towing builds. Order online from Tuned Yota, an Authorized AMSOIL Dealer.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${url}">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Store","@id":"${url}#store","name":"Tuned Yota — Authorized AMSOIL Dealer","url":"${url}","image":"https://tunedyota.com/og-image.png","telephone":"+1-612-406-7117","email":"info@tunedyota.com","priceRange":"$$","parentOrganization":{"@id":"https://tunedyota.com/#business"},"areaServed":{"@type":"Country","name":"United States"},"description":${JSON.stringify(`AMSOIL synthetic motor oil, filters, gear lube, and ATF for the ${name}, sold by Tuned Yota, an Authorized AMSOIL Dealer.`)},"hasOfferCatalog":{"@type":"OfferCatalog","name":${JSON.stringify(`AMSOIL fluids for the ${name}`)},"itemListElement":[${offers}]}}
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

  <h2>AMSOIL fluids for the ${ESC(name)}</h2>
  <p>AMSOIL's recommended product, viscosity, and filter for each ${ESC(name)} engine and model year (from AMSOIL's official vehicle guide). Tap <strong>Order</strong> to add any item to your AMSOIL cart with Tuned Yota's dealer referral attached.</p>
${genCards}

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
    <a href="${ottPage(slug)}">${ESC(name)} OTT Tune</a><a href="amsoil-garage.html">AMSOIL Garage</a><a href="find-your-exact-tune.html">Find Your Exact Tune</a><a href="ott-tune.html">What is the OTT Tune?</a>
  </div>
  <div class="lp-final"><a class="btn primary" href="amsoil-garage.html?make=${encodeURIComponent(make)}&amp;model=${encodeURIComponent(model.model)}">Open your AMSOIL Garage →</a></div>
  <p class="lp-disc">Product, viscosity, and filter recommendations are from AMSOIL's official vehicle guide. Fill capacities and drain intervals shown in the interactive AMSOIL Garage are verified per configuration as our installers confirm them — check your owner's manual or contact us before service. Checkout completes on amsoil.com.</p>
</div>
${FQSCRIPT}
${FOOTER}
${FQA11Y}
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

export function buildAmsoilPages() {
  const list = models();
  for (const m of list) fs.writeFileSync(path.join(SITE, `amsoil-${m.slug}.html`), page(m, list));
  return list.length;
}

// Run standalone: `node scripts/build-amsoil-pages.mjs`
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("build-amsoil-pages.mjs")) {
  const n = buildAmsoilPages();
  console.log(`amsoil platform pages written: ${n}`);
}
