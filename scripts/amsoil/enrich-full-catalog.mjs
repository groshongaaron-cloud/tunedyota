// scripts/amsoil/enrich-full-catalog.mjs
// Tier-3 enrichment scout: for every unique full-catalog product (minus the
// curated Tier-1 SKUs), discover its real amsoil.com /p/ path, live price and
// official product image via the Cloudflare-proof browser fetch. Resumable
// (progress JSONL; re-run to continue). Compiles scripts/amsoil/data/
// enrichment.json which gates Tier-3 page generation.
//
// SAFETY: a result is accepted ONLY when the landed page's og-image variant
// code (or the /p/ slug tail) matches our stock number — misattributing a
// product page/image to the wrong SKU is worse than having no page.
// Run: node scripts/amsoil/enrich-full-catalog.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { withBrowser, fetchProductHtml } from "./lib/browser-fetch.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FULL = JSON.parse(fs.readFileSync(path.join(ROOT, "site", "amsoil-catalog-full.json"), "utf8"));
const CUR = JSON.parse(fs.readFileSync(path.join(ROOT, "site", "amsoil-garage.json"), "utf8"));
const PROG = path.join(ROOT, "scripts", "amsoil", "data", "enrichment-progress.jsonl");
const OUT = path.join(ROOT, "scripts", "amsoil", "data", "enrichment.json");
const IMGDIR = path.join(ROOT, "site", "images", "amsoil", "full");

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const baseCode = (stockNo) => norm(stockNo.replace(/-(EA|CA)$/i, ""));
// Progressive size-suffix stripping for slug-tail matching (ASMQT→asm, ANTPC1G→antpc).
const codeCandidates = (stockNo) => {
  const b = stockNo.replace(/-(EA|CA)$/i, "");
  const out = [norm(b)];
  const m = b.match(/^(.*?)(QT|CN|1G|GN|PK|TP|G|K|OZ|EA)$/i);
  if (m && m[1].length >= 2) out.push(norm(m[1]));
  return out;
};
// AMSOIL /p/ slugs follow a strict pattern: "amsoil-" + name slug (with "100%"
// → "100", "&" dropped as a separator) + "-" + base product code. Verified
// against all curated paths (asm/ado/api/ucl/antpc/deo/hm020...). We construct
// candidate URLs and VERIFY each with a fresh browser (a reused context gets
// CF-fingerprinted on its second navigation — the price-agent lesson).
function nameSlug(name) {
  return name.toLowerCase().replace(/100%/g, "100").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
const candidatePaths = (p) => {
  const out = codeCandidates(p.stockNo).map((c) => `/p/${nameSlug(p.name)}-${c}/`);
  // Ea filter families live on SELECTOR pages keyed by ?code= (the curated Ea
  // oil filters use /p/amsoil-oil-filter-eaoilfilt/?code=<STOCK>). Try the
  // family selector for filter-coded SKUs — og validation rejects wrong guesses.
  const s = p.stockNo.toUpperCase();
  if (/^EAO|^EA15|^EABP/.test(s)) out.push(`/p/amsoil-oil-filter-eaoilfilt/?code=${encodeURIComponent(p.stockNo)}`);
  if (/^EAA/.test(s)) out.push(`/p/amsoil-air-filter-eaairfilt/?code=${encodeURIComponent(p.stockNo)}`);
  if (/^EAC/.test(s)) out.push(`/p/amsoil-cabin-air-filter-eacabinfilt/?code=${encodeURIComponent(p.stockNo)}`);
  if (/^EAOM/.test(s)) out.push(`/p/amsoil-motorcycle-oil-filter-eaomfilt/?code=${encodeURIComponent(p.stockNo)}`);
  return out;
};

async function main() {
  fs.mkdirSync(IMGDIR, { recursive: true });
  const curated = new Set(Object.values(CUR.products).map((p) => p.stockNo));
  // Latest record per stockNo wins (a retry pass appends corrected records).
  const latest = new Map();
  if (fs.existsSync(PROG)) for (const l of fs.readFileSync(PROG, "utf8").trim().split("\n").filter(Boolean)) { const r = JSON.parse(l); latest.set(r.stockNo, r); }
  const retryHeld = process.env.RETRY_HELD === "1";
  const seen = new Set(), targets = [];
  for (const p of FULL.products) {
    if (seen.has(p.stockNo)) continue;
    seen.add(p.stockNo);
    if (curated.has(p.stockNo)) continue;
    const prev = latest.get(p.stockNo);
    if (retryHeld ? !(prev && !prev.ok) : !!prev) continue;   // pass 2 = only held items
    targets.push(p);
  }
  console.log(`${retryHeld ? "PASS2 retrying held" : "enriching"} ${targets.length} (records ${latest.size}, curated ${curated.size} skipped)`);
  for (const p of targets) {
    const rec = { stockNo: p.stockNo, name: p.name, ok: false };
    for (const link of candidatePaths(p)) {
      try {
        await withBrowser(async (page) => {
          const r = await fetchProductHtml(page, `https://www.amsoil.com${link}`, 3000);
          if (r.blocked) { rec.err = (r.status === 404 || /404|not found/i.test(r.title || "")) ? "404" : "blocked"; return; }
          const og = r.html.match(/property="og:image" content="([^"]+)"/);
          const ogFile = og ? (og[1].match(/medias\/([^?]+?)\.jpg/i) || [])[1] : null;
          const ogCode = ogFile ? norm(ogFile) : "";
          const cands = codeCandidates(p.stockNo);
          const validated = ogCode && cands.some((c) => ogCode.startsWith(c) || c.startsWith(ogCode));
          if (!validated) { rec.err = `unvalidated og=${ogCode}`; return; }
          rec.path = link;
          const dp = r.html.match(/data-price="([\d.]+)"/);
          rec.price = dp ? parseFloat(dp[1]) : null;
          const res = await page.context().request.get(og[1].replace(/&amp;/g, "&"));
          if (res.ok()) {
            const buf = await res.body();
            if (buf.length > 1500) {
              const file = p.stockNo.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".jpg";
              await sharp(buf).resize(800, 800, { fit: "inside", withoutEnlargement: true })
                .flatten({ background: "#ffffff" }).jpeg({ quality: 86 }).toFile(path.join(IMGDIR, file));
              rec.image = "/images/amsoil/full/" + file;
            }
          }
          rec.ok = !!(rec.path && rec.image);
          if (rec.path && !rec.image) rec.err = "no-image";
        });
      } catch (e) { rec.err = String(e.message).slice(0, 120); }
      if (rec.ok) break;
    }
    fs.appendFileSync(PROG, JSON.stringify(rec) + "\n");
    console.log(`${rec.ok ? "ok " : "ERR"} ${p.stockNo} ${rec.path || rec.err || ""}`);
  }
  const all = fs.readFileSync(PROG, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const map = {};
  for (const r of all) if (r.ok) map[r.stockNo] = { path: r.path, image: r.image, price: r.price ?? null };
  fs.writeFileSync(OUT, JSON.stringify({ updated: "2026-07-25", count: Object.keys(map).length, products: map }, null, 1) + "\n");
  console.log(`DONE enrichment.json: ${Object.keys(map).length} enriched, ${all.filter((r) => !r.ok).length} held`);
}
main().catch((e) => { console.error(e); process.exit(1); });
