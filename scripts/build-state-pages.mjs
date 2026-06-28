// scripts/build-state-pages.mjs
// Generates the 6 state landing pages from markets.js (cities + installer per state).
// Run: node scripts/build-state-pages.mjs   (then `npm run build:seo` injects OG/business stub).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "site");
const { MARKETS } = require("../netlify/functions/lib/markets.js");

const STATE = {
  MN: { name: "Minnesota", slug: "minnesota" },
  WI: { name: "Wisconsin", slug: "wisconsin" },
  IA: { name: "Iowa", slug: "iowa" },
  ND: { name: "North Dakota", slug: "north-dakota" },
  SD: { name: "South Dakota", slug: "south-dakota" },
  NE: { name: "Nebraska", slug: "nebraska" },
};
const INSTALLER = {
  aaron: { name: "Aaron Groshong", bio: "Founder of Tuned Yota and a licensed VFTuner PRO Tuner." },
  noah:  { name: "Noah Kreis", bio: "Licensed VFTuner PRO Tuner with 8 years across EcoBoost, LS, and BMW platforms." },
  cody:  { name: "Cody Star", bio: "Toyota master technician and licensed VFTuner PRO Tuner who works the Toyota platform exclusively." },
};

// group markets by state -> { cities:[], instKeys:Set }
const byState = {};
for (const m of MARKETS) {
  const s = byState[m.state] || (byState[m.state] = { cities: [], inst: new Set() });
  if (!s.cities.includes(m.city)) s.cities.push(m.city);
  s.inst.add(m.inst);
}

const ESC = (s) => String(s).replace(/&/g, "&amp;");

const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&family=Spectral:wght@400;500;600;700&family=Spectral+SC:wght@500;600&display=swap" rel="stylesheet">`;
const FAVICON = `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='3.879%205.098%2040.002%2039.316'%3E%3Cpath%20fill='%23B3D0D9'%20d='M23.881,44.414L3.879,29.408l5.022-7.53V5.098L19.837,18.77h8.094L38.86,5.098v16.78l5.021,7.53L23.881,44.414z%20M7.037,28.869l16.844,12.638l16.85-12.638l-4.189-6.287V11.726l-7.5,9.36H18.72l-7.493-9.36v10.857L7.037,28.869z'/%3E%3C/svg%3E">`;

const STYLE = `<style>
:root{--bg:#EDECEB;--ink:#3A2E26;--brown:#5B4B42;--brown2:#5D4B40;--sage:#99A08E;--sage-d:#7c8472;--blue:#B3D0D9;--sand:#DFC4B5;--card:#FAF9F7;--white:#fff;--line:rgba(91,75,66,.16);--ring:rgba(179,208,217,.55);--shadow:0 14px 50px -12px rgba(58,46,38,.22);--shadow-sm:0 6px 22px -10px rgba(58,46,38,.20);--r:16px}
*{box-sizing:border-box;margin:0;padding:0}html,body{background:var(--bg);-webkit-font-smoothing:antialiased}
.lp{font-family:'Lato',sans-serif;color:var(--brown2);max-width:780px;margin:0 auto;padding:30px 18px 48px}
.lp-eyebrow{font-family:'Spectral SC',serif;letter-spacing:.18em;text-transform:uppercase;font-size:12px;color:var(--sage-d);font-weight:600}
h1{font-family:'Spectral',serif;font-weight:600;font-size:clamp(28px,6vw,42px);line-height:1.08;color:var(--ink);letter-spacing:-.01em;margin:8px 0 14px}
.lp-answer{font-size:16px;line-height:1.6;background:var(--card);border:1.5px solid var(--line);border-radius:var(--r);padding:20px 22px;box-shadow:var(--shadow-sm)}
.lp-cta{display:flex;flex-wrap:wrap;gap:11px;margin:20px 0 6px}
.btn{font-family:'Lato',sans-serif;font-weight:900;letter-spacing:.03em;border:none;border-radius:99px;padding:14px 24px;cursor:pointer;font-size:14.5px;text-decoration:none;display:inline-flex;align-items:center;gap:8px;transition:.2s}
.btn.primary{background:var(--ink);color:#F3EFEA;box-shadow:var(--shadow-sm)}.btn.primary:hover{background:var(--brown)}
.btn.outline{background:transparent;border:1.6px solid var(--brown);color:var(--brown)}.btn.outline:hover{background:var(--brown);color:#fff}
h2{font-family:'Spectral',serif;font-weight:600;font-size:24px;color:var(--ink);margin:34px 0 14px}
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
.lp-links{margin-top:30px;font-size:14px;line-height:2}.lp-links a{color:var(--brown);font-weight:700;text-decoration:none;margin-right:16px}.lp-links a:hover{text-decoration:underline}
.lp-final{text-align:center;margin-top:30px}
.lp-disc{font-size:11.5px;opacity:.55;text-align:center;margin-top:22px;line-height:1.55}
</style>`;

// Shared nav/footer/skip-link chrome + design tokens live in site/site.css (the
// June 2026 a11y + chrome refactor). Link it rather than inlining a #site-chrome
// block, so regeneration never re-forks the chrome away from the rest of the site.
const SITECSS = `<link rel="stylesheet" href="site.css">`;

const PIXEL = `<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version="2.0";
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,"script",
"https://connect.facebook.net/en_US/fbevents.js");
fbq("init", "1307227328237229");
fbq("track", "PageView");
</script>
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=1307227328237229&ev=PageView&noscript=1"/></noscript>
<!-- End Meta Pixel Code -->`;

const NAV = `<header class="snav"><a class="snav-logo" href="index.html">Tuned Yota</a><nav class="snav-links"><a href="index.html">Home</a><a href="find-your-exact-tune.html">Find Your Tune</a><a href="index.html#vehicles">Vehicles</a><a href="ott-tune.html">OTT Tune</a><a href="supercharger.html">Supercharger</a><a href="faq.html">FAQ</a><a href="team.html">Team</a></nav><a class="snav-call" href="tel:+16124067117">Call / Text</a></header>`;

const FQSCRIPT = `<script>
document.querySelectorAll('.lp-fqq').forEach(q=>q.addEventListener('click',()=>{
  const it=q.closest('.lp-fq'),a=it.querySelector('.lp-fqa'),open=it.classList.contains('open');
  document.querySelectorAll('.lp-fq.open').forEach(o=>{o.classList.remove('open');o.querySelector('.lp-fqa').style.maxHeight=null;});
  if(!open){it.classList.add('open');a.style.maxHeight=a.scrollHeight+'px';}
}));
</script>`;

const FOOTER = `<footer class="sfoot"><div class="fmark">Tuned Yota</div><div class="ftag">Undeniable Performance</div>
  <div class="frow"><a href="index.html">Home</a><a href="find-your-exact-tune.html">Find Your Tune</a><a href="ott-tune.html">OTT Tune</a><a href="supercharger.html">Supercharger</a><a href="faq.html">FAQ</a><a href="team.html">Team</a></div>
  <div class="fcon">Call or text <a href="tel:+16124067117">(612) 406-7117</a> &nbsp;·&nbsp; <a href="mailto:info@tunedyota.com">info@tunedyota.com</a><br>
  Serving Minnesota · Iowa · Wisconsin · North Dakota · South Dakota · Nebraska<br>
  <a href="https://www.facebook.com/TunedYota/" target="_blank" rel="noopener">Facebook</a> · <a href="https://www.facebook.com/groups/501008078456222" target="_blank" rel="noopener">Midwest Tuning Group</a> · <a href="https://www.instagram.com/tunedyota/" target="_blank" rel="noopener">Instagram</a></div>
  <div class="fcopy">© Tuned Yota · Toyota &amp; Lexus Performance Tuning · Authorized OTT Installer</div></footer>`;

// a11y: keep each FAQ button's aria-expanded in sync with its open state (June 2026 a11y pass).
const FQA11Y = `<script>document.querySelectorAll('.lp-fq').forEach(function(it,i){var q=it.querySelector('.lp-fqq'),a=it.querySelector('.lp-fqa');if(!q||!a)return;a.id='lpfqa-'+i;q.setAttribute('aria-controls','lpfqa-'+i);q.addEventListener('click',function(){q.setAttribute('aria-expanded',it.classList.contains('open')?'true':'false');});});</script>`;

function citySentence(cities) {
  if (cities.length === 1) return cities[0];
  return cities.slice(0, -1).join(", ") + ", and " + cities[cities.length - 1];
}

function page({ name, slug, cities, instKeys }) {
  const SITE_URL = "https://tunedyota.com";
  const url = `${SITE_URL}/${slug}`;
  const cityTxt = citySentence(cities);
  const installers = [...instKeys].map((k) => INSTALLER[k]);
  const instNames = installers.map((i) => i.name);
  const instLabel = instNames.length === 1 ? instNames[0] : instNames.slice(0, -1).join(", ") + " and " + instNames[instNames.length - 1];
  const instWord = instNames.length === 1 ? "installer is" : "installers are";
  const instLine = installers.map((i) => `<strong>${i.name}</strong> — ${i.bio}`).join("<br>");

  const faqs = [
    [`Where can I get my Toyota or Lexus tuned in ${name}?`, `Tuned Yota runs in-person tuning events across ${name}, including ${cityTxt}. Pick your city and the next date in Find Your Exact Tune.`],
    [`Which ${name} cities do you serve?`, `${cityTxt}.`],
    [`How much does an OTT Tune cost in ${name}?`, `From $400 depending on platform; see the cost page or Find Your Exact Tune for your exact price.`],
    [`Is the tune emissions-legal?`, `Yes. Factory emissions systems stay fully intact and every calibration is verified with a 5-gas analyzer, EPA-compliant in every state.`],
  ];

  const areaServed = [`{"@type":"State","name":"${name}"}`, ...cities.map((c) => `{"@type":"City","name":"${c}"}`)].join(",");
  const faqSchema = faqs.map(([q, a]) => `{"@type":"Question","name":${JSON.stringify(q)},"acceptedAnswer":{"@type":"Answer","text":${JSON.stringify(a)}}}`).join(",");
  const faqVisible = faqs.map(([q, a]) => `  <div class="lp-fq"><button class="lp-fqq" aria-expanded="false">${ESC(q)}<span>+</span></button><div class="lp-fqa"><p>${ESC(a)}</p></div></div>`).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Toyota &amp; Lexus Engine Tuning in ${name} | Tuned Yota</title>
<meta name="description" content="Professional Toyota &amp; Lexus engine tuning across ${name} — ${ESC(cityTxt)}. In-person OTT calibration and Magnuson supercharger work by a licensed VFTuner PRO Tuner. See pricing and book.">
<link rel="canonical" href="${url}">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Service","@id":"${url}#service","serviceType":"Toyota & Lexus OTT Tune Calibration in ${name}","name":"Toyota & Lexus Engine Tuning in ${name} installed by Tuned Yota","provider":{"@id":"https://tunedyota.com/#business"},"areaServed":[${areaServed}],"description":"Tuned Yota provides Toyota and Lexus OTT Tune calibration and Magnuson supercharger services at in-person events across ${name} (${cityTxt}), built by a licensed VFTuner PRO Tuner.","offers":{"@type":"AggregateOffer","priceCurrency":"USD","lowPrice":"400","highPrice":"950"}}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[${faqSchema}]}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://tunedyota.com/"},{"@type":"ListItem","position":2,"name":"OTT Tune","item":"https://tunedyota.com/ott-tune"},{"@type":"ListItem","position":3,"name":"Toyota & Lexus Tuning in ${name}","item":"${url}"}]}
</script>
${FONTS}
${SITECSS}
${FAVICON}
${STYLE}

${PIXEL}
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
${NAV}
<a id="main" tabindex="-1"></a>
<div class="lp">
  <div class="lp-eyebrow">Toyota &amp; Lexus Tuning · ${name}</div>
  <h1>Toyota &amp; Lexus Engine Tuning in ${name}</h1>
  <div class="lp-answer">Tuned Yota brings professional Toyota and Lexus engine tuning to ${name} — in person at events in ${ESC(cityTxt)}. Every OTT calibration is built by a licensed VFTuner PRO Tuner, keeps factory emissions fully intact, and starts from $400. Your ${name} ${instWord} ${instLabel}.</div>
  <div class="lp-cta">
    <a class="btn primary" href="find-your-exact-tune.html">Find Your Exact Tune →</a>
    <a class="btn outline" href="tel:+16124067117">Call / Text (612) 406-7117</a>
  </div>

  <h2>Where we tune in ${name}</h2>
  <p style="font-size:15px;line-height:1.65">Tuned Yota runs in-person tuning events across ${name}: ${ESC(cityTxt)}. Pick your city and the next event date in <a href="find-your-exact-tune.html" style="color:var(--brown);font-weight:700">Find Your Exact Tune</a>.</p>

  <h2>What we tune</h2>
  <ul class="lp-bul">
    <li>OTT Tune calibration for supported Toyota &amp; Lexus platforms (drivability, shifting, gear hunting, towing, larger tires)</li>
    <li>Magnuson supercharger sales, install, and calibration on supported platforms</li>
    <li>Custom calibration and factory-turbo performance tuning where supported</li>
  </ul>

  <h2>Your ${name} installer</h2>
  <p style="font-size:14.5px;line-height:1.6">${instLine}</p>

  <div class="lp-book">
    <h2>Get your ${name} price</h2>
    <p>Find Your Exact Tune shows your exact starting price and the next event near you. Prefer to talk? Call or text (612) 406-7117.</p>
    <a class="btn primary" href="find-your-exact-tune.html">Find Your Exact Tune →</a>
  </div>

  <h2>${name} tuning FAQ</h2>
${faqVisible}

  <div class="lp-links">
    <strong>Explore:</strong><br>
    <a href="ott-tune.html">What is the OTT Tune?</a><a href="ott-tune-cost.html">OTT Tune cost</a><a href="is-the-ott-tune-worth-it.html">Is it worth it?</a><a href="find-your-exact-tune.html">Find Your Exact Tune</a>
  </div>
  <div class="lp-final"><a class="btn primary" href="find-your-exact-tune.html">Find Your Exact Tune →</a></div>
  <p class="lp-disc">In-person tuning at scheduled events; dates and availability vary — confirm in Find Your Exact Tune. Supported years, engines, and features vary by platform. All vehicles must retain fully intact, federally compliant emissions systems.</p>
</div>
${FQSCRIPT}
${FOOTER}
${FQA11Y}
</body>
</html>
`;
}

let n = 0;
for (const [code, meta] of Object.entries(STATE)) {
  const s = byState[code];
  if (!s) continue;
  const html = page({ name: meta.name, slug: `toyota-lexus-tuning-${meta.slug}`, cities: s.cities, instKeys: s.inst });
  fs.writeFileSync(path.join(SITE, `toyota-lexus-tuning-${meta.slug}.html`), html);
  n++;
}
console.log(`state pages written: ${n}`);
