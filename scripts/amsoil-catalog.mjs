// Phase 2: build the full AMSOIL product catalog from AMSOIL's sitemap (Firecrawl
// passes Cloudflare where curl can't). Derives name + product code + referral buy
// URL from each /p/ slug. Writes scripts/amsoil-catalog.json. Prices/sizes/images
// live on AMSOIL's side; the storefront hands off to amsoil.com under the ZO.
import fs from "node:fs";

const KEY = (() => { const c = JSON.parse(fs.readFileSync("C:/Users/grosh/.claude.json", "utf8")); let k = "";
  (function w(o){ for (const key in o){ const v=o[key]; if (key==="FIRECRAWL_API_KEY"&&v){k=v;return;} if (v&&typeof v==="object") w(v); } })(c); return k; })();
const ZO = "30713116";

async function fetchXmlUrls(url) {
  const r = await fetch("https://api.firecrawl.dev/v1/scrape", { method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["rawHtml"], waitFor: 2500 }) });
  const j = await r.json(); const raw = (j.data && (j.data.rawHtml || j.data.html)) || "";
  return [...new Set([...raw.matchAll(/https?:\/\/www\.amsoil\.com\/p\/[a-z0-9-]+\//gi)].map((m) => m[0]))];
}

const ACRONYM = { atf: "ATF", atv: "ATV", utv: "UTV", suv: "SUV", rv: "RV", hd: "HD", xl: "XL",
  ls: "LS", vw: "VW", ms: "MS", fs: "FS", ez: "EZ", oe: "OE", gl: "GL", api: "API", led: "LED", usb: "USB",
  cvt: "CVT", dct: "DCT", dot: "DOT", mtf: "MTF", mtg: "MTG", agl: "AGL", atv_utv: "ATV/UTV", uv: "UV",
  hp: "HP", cv: "CV", gtl: "GTL", tdt: "TDT", vtwin: "V-Twin", suvs: "SUVs" };
function cleanName(name) {
  let n = name
    .replace(/\b(\d{1,3})w[\s-](\d{1,3})\b/gi, (_, a, b) => `${a}W-${b}`)   // 0w 16 -> 0W-16
    .replace(/\b100 synthetic\b/gi, "100% Synthetic")
    .replace(/\bsae\b/gi, "SAE");
  n = n.split(" ").map((w) => ACRONYM[w.toLowerCase()] || w).join(" ");
  return n.trim();
}
// Primary category by keyword (priority order — first match wins). Ordered so the
// more specific buckets win before the general ones.
const CATS = [
  ["Merch & Apparel", /\b(t-?shirt|hoodie|hat|cap|beanie|jacket|apparel|decal|sticker|banner|sign|poster|flag|tent|ez-?up|canopy|glove|towel|mat|keychain|mug|bottle opener|lanyard|gift|book|manual|brochure|catalog|pen|magnet|patch)\b/i],
  ["Fuel Additives", /fuel additive|cetane|injector|cold flow|4-in-1|fuel stabilizer|gasoline stabilizer|octane|upper lube|dominator.*fuel|fuel system|ethanol/i],
  ["Filters", /filter|\bea\b/i],
  ["Transmission Fluid", /transmission|\batf\b|\bcvt\b|\bdct\b|torque[- ]drive|synchromesh|dsg|dual-clutch/i],
  ["Gear Lube", /gear lube|severe gear|gear oil|\bagl\b|75w|80w|85w|differential/i],
  ["Diesel Oil", /diesel oil|diesel.*motor oil|heavy-?duty.*(diesel|oil)|dme|dominator.*diesel/i],
  ["Motor Oil", /motor oil|hybrid.*oil|european.*oil|high-?mileage|z-rod|break-in oil|synthetic blend|signature series [0-9]/i],
  ["Powersports", /atv|utv|motorcycle|marine|snowmobile|dirt bike|scooter|watercraft|metric|v-twin|interceptor|saber|outboard|2-stroke|4-stroke|2-cycle|4-cycle|fork oil|shock|dominator|small engine|lawn/i],
  ["Chassis & Brake", /\bbrake\b|dot [0-9]|power steering|shock therapy|suspension/i],
  ["Industrial & Shop", /compressor|air tool|hydraulic|way oil|slip lock|industrial|guardian|\bpump\b/i],
  ["Grease", /grease/i],
  ["Chain & Bar", /chain|bar and chain/i],
  ["Coolant", /coolant|antifreeze|propylene|dominator.*coolant/i],
  ["Cleaners & Care", /degreaser|cleaner|wash|flush|mud|hand scrub|wipe|protectant|polish|wax/i],
  ["Additives & Treatments", /additive|stabilizer|treatment|boost|conditioner|break-in|assembly lube|engine flush|oil.*restore/i],
];
function categorize(name, code) {
  if (/^G\d/i.test(code)) return "Merch & Apparel";               // G#### = promo/merchandise
  if (/^(BP|BK|BMK|BMT|BU|EABP)/i.test(code)) return "Parts & Fittings";   // bypass hardware/fittings
  for (const [c, re] of CATS) if (re.test(name)) return c;
  return "Other Specialty";
}

function parse(url) {
  const slug = url.replace(/^https?:\/\/www\.amsoil\.com\/p\//, "").replace(/\/$/, "");
  const parts = slug.split("-");
  const code = parts[parts.length - 1].toUpperCase();
  let words = parts.slice(0, -1);
  if (words[0] === "amsoil") words = words.slice(1);
  const name = cleanName(words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "));
  return { name, code, slug, category: categorize(name, code) };
}
// Non-products to exclude (registration/dealership pages).
const SKIP = /(dealership|preferred-customer-registration|-dreg\/|-preg\/)/i;

const urls = await fetchXmlUrls("https://www.amsoil.com/sitemap/Product.xml");
const products = urls.filter((u) => !SKIP.test(u)).map((u) => {
  const { name, code, slug, category } = parse(u);
  return { name, code, category, buyUrl: `${u}?zo=${ZO}` };
}).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

const byCat = {};
for (const p of products) byCat[p.category] = (byCat[p.category] || 0) + 1;
fs.writeFileSync("./site/amsoil-catalog.json", JSON.stringify({ count: products.length, zo: ZO, categories: byCat, products }) + "\n");
console.log(`AMSOIL catalog: ${urls.length} URLs -> ${products.length} products -> site/amsoil-catalog.json`);
console.log("By category:"); Object.entries(byCat).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => console.log(`  ${String(n).padStart(3)}  ${c}`));
