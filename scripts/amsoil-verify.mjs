// AMSOIL garage data verifier (Phase 1). Firecrawl-scrapes AMSOIL's per-vehicle
// lookup for every Toyota/Lexus config in site/amsoil-garage.json and writes a
// reconciliation (garage vs AMSOIL) to scripts/amsoil-reconciliation.json.
// Reusable for Phase 2. Firecrawl key read from ~/.claude.json.
import fs from "node:fs";

const KEY = (() => {
  const c = JSON.parse(fs.readFileSync("C:/Users/grosh/.claude.json", "utf8"));
  let k = ""; (function w(o){ for (const key in o){ const v=o[key]; if (key==="FIRECRAWL_API_KEY"&&v){k=v;return;} if (v&&typeof v==="object") w(v); } })(c); return k;
})();

const FC = "https://api.firecrawl.dev/v1";
async function fcScrape(url) {
  const r = await fetch(`${FC}/scrape`, { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }) });
  const j = await r.json(); if (!j.success) throw new Error("scrape fail"); return j.data.markdown || "";
}
async function fcMap(url, search) {
  const r = await fetch(`${FC}/map`, { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, search, limit: 60 }) });
  const j = await r.json(); return (j.links || []).map((x) => (typeof x === "string" ? x : x.url));
}

const MODEL_SLUG = { "Tacoma":"tacoma","4Runner":"4runner","FJ Cruiser":"fj-cruiser","Tundra":"tundra","Sequoia":"sequoia",
  "Land Cruiser":"land-cruiser","RAV4":"rav4","Highlander":"highlander","Camry":"camry",
  "GX":"gx-460","RX350":"rx-350","LS460":"ls-460","LX570":"lx-570" };

function repYear(range) {
  let m;
  if ((m = /^(\d{4})\s*\+$/.exec(range))) return Math.min(+m[1], 2025);
  if ((m = /^(\d{4})\s*[-–]\s*(\d{4})$/.exec(range))) return Math.min(+m[2], 2024);
  if ((m = /^(\d{4})$/.exec(range))) return +m[1];
  return 2021;
}
const displOf = (e) => { const m = /(\d\.\d)\s*L/i.exec(e || ""); return m ? m[1] : ""; };
const toQt = (n, unit) => (/pint/i.test(unit) ? +(n / 2).toFixed(2) : +n);

async function engineUrl(year, make, modelSlug, displ) {
  const want = displ.replace(".", "-") + "l";
  let urls = await fcMap(`https://www.amsoil.com/lookup/auto-and-light-truck/${year}/${make}/${modelSlug}/`, "engine code");
  urls = urls.filter((u) => new RegExp(`/${modelSlug}/[^/]*-cyl[^/]*/?$`, "i").test(u));
  let hit = urls.find((u) => u.toLowerCase().includes(want));
  if (hit) return hit;
  // Fallback: map the make to find the true model slug, then retry.
  const makeUrls = await fcMap(`https://www.amsoil.com/lookup/auto-and-light-truck/${year}/${make}/`, modelSlug.replace(/-/g, " "));
  const eng = makeUrls.filter((u) => /-cyl/i.test(u) && u.toLowerCase().includes(want));
  return eng[0] || null;
}

function extract(md) {
  const out = {}; let m;
  if ((m = md.match(/Viscosity:\s*\|?\s*([0-9]W-[0-9]{2})/i))) out.oilVisc = m[1];
  if ((m = md.match(/Capacity:\s*\|?\s*([\d.]+)\s*quarts?\s*\(with filter\)/i))) out.engineOilQt = +m[1];
  if ((m = md.match(/AMSOIL Oil Filter[\s\S]{0,300}?Product Code:\s*(EA[\w-]+)/i))) out.oilFilter = m[1];
  if ((m = md.match(/([\d.]+)\s*quarts?\s*Initial Fill/i))) out.transDrainQt = +m[1];
  const totals = [...md.matchAll(/Total Fill\s*([\d.]+)\s*quarts/gi)].map((x) => +x[1]);
  if (totals.length) out.transTotalQt = Math.max(...totals);
  if ((m = md.match(/(Signature Series[^\]]*?Automatic Transmission Fluid)\]\([^)]*\)[\s\S]{0,140}?Product Code:\s*([\w-]+)/i))) { out.atfName = m[1].trim(); out.atfCode = m[2]; }
  if ((m = md.match(/Differential Lubricant: Front[\s\S]{0,500}?Capacity:[\s\S]{0,45}?([\d.]+)\s*(pints?|quarts?)/i))) out.frontDiffQt = toQt(+m[1], m[2]);
  if ((m = md.match(/Differential Lubricant: Rear[\s\S]{0,500}?Capacity:[\s\S]{0,45}?([\d.]+)\s*(pints?|quarts?)/i))) out.rearDiffQt = toQt(+m[1], m[2]);
  if ((m = md.match(/Transfer Case[\s\S]{0,500}?Capacity:[\s\S]{0,45}?([\d.]+)\s*(pints?|quarts?)/i))) out.transferQt = toQt(+m[1], m[2]);
  if ((m = md.match(/SEVERE GEAR[\s\S]{0,10}?([0-9]{2}W-[0-9]{2,3})[\s\S]{0,140}?Product Code:\s*([\w-]+)/i))) { out.gearVisc = m[1]; out.gearCode = m[2]; }
  return out;
}

const garage = JSON.parse(fs.readFileSync("./site/amsoil-garage.json", "utf8"));
const out = [];
for (const make of Object.keys(garage.vehicles)) {
  const amake = make.toLowerCase();
  for (const model of Object.keys(garage.vehicles[make])) {
    const slug = MODEL_SLUG[model] || model.toLowerCase().replace(/\s+/g, "-");
    for (const row of garage.vehicles[make][model]) {
      const year = repYear(row.y); const displ = displOf(row.e);
      const label = `${make} ${model} [${row.y} ${row.e}]`;
      try {
        const eu = await engineUrl(year, amake, slug, displ);
        if (!eu) { out.push({ label, year, displ, error: "no-engine-url" }); console.log("✗", label, "(no engine url)"); continue; }
        const x = extract(await fcScrape(eu));
        out.push({ label, make, model, y: row.y, e: row.e, year, url: eu.split("/").filter(Boolean).pop(), amsoil: x });
        console.log("✓", label, JSON.stringify(x));
      } catch (e) { out.push({ label, error: e.message }); console.log("✗", label, e.message); }
    }
  }
}
fs.writeFileSync("./scripts/amsoil-reconciliation.json", JSON.stringify(out, null, 1));
console.log(`\nWROTE scripts/amsoil-reconciliation.json — ${out.length} configs, ${out.filter((o)=>o.error).length} errors`);
