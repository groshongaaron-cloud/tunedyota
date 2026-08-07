// scripts/amsoil/drift-triage-sweep.mjs
// Loop-4 TRIAGE step for AMSOIL price drift (docs/operations/verification-loops.md).
// When the weekly sentinel detector (price-drift-check.mjs) finds drift, this runs
// the FULL-catalog damage report — every enriched product, not just 24 sentinels —
// and STAGES a one-tap remediation package. It never writes prices, never touches
// the catalog, never pushes: it stops at the autonomy boundary and escalates.
//
// --if-drift : no-op unless the drift-state file shows active drift (so healthy
//              weeks cost zero Firecrawl calls when chained after the detector).
// --limit=N  : cap products fetched (smoke testing).
//
// Reads catalog/enrichment from origin/master (git show) — branch-independent,
// safe while dev sessions branch-switch this repo. Same pattern as the detector.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { fetchProductHtmlViaFirecrawl } from "./lib/firecrawl-fetch.mjs";
import { parseOfferPrices, driftedVariants } from "./lib/drift-core.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = "https://www.amsoil.com";
const TODAY = new Date().toISOString().slice(0, 10);
const HOME = path.join(os.homedir(), ".tunedyota");
const STATE_FILE = path.join(HOME, "amsoil-drift-state.json");
const REPORT_JSON = path.join(HOME, `amsoil-drift-report-${TODAY}.json`);
const REPORT_MD = path.join(HOME, `amsoil-drift-remediation-${TODAY}.md`);
const IF_DRIFT = process.argv.includes("--if-drift");
const LIMIT = Number((process.argv.find((a) => a.startsWith("--limit=")) || "").split("=")[1]) || Infinity;

async function notify(text) {
  const url = process.env.NOTIFY_URL || "https://tunedyota.com/.netlify/functions/notify";
  const token = process.env.NOTIFY_TOKEN || process.env.TY_NOTIFY_TOKEN;
  if (!token) { console.log("[notify skipped: no NOTIFY_TOKEN/TY_NOTIFY_TOKEN]\n" + text); return; }
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-ty-notify": token }, body: JSON.stringify({ text }) });
    if (!res.ok) console.error(`notify failed: HTTP ${res.status}`);
  } catch (e) { console.error("notify failed:", e.message); }
}

function gitShow(repoPath) {
  return execSync(`git show origin/master:${repoPath}`, { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 }).toString("utf8");
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return {}; }
}

async function main() {
  if (IF_DRIFT) {
    const st = loadState();
    if (!st.driftSince) { console.log("triage-sweep: no active drift; skipping (--if-drift)."); return; }
  }

  execSync("git fetch origin master", { cwd: ROOT, stdio: "ignore" });
  const catalog = JSON.parse(gitShow("site/amsoil-catalog-full.json"));
  const enrichment = JSON.parse(gitShow("scripts/amsoil/data/enrichment.json"));

  const products = catalog.products.filter((p) => enrichment.products[p.stockNo]?.path).slice(0, LIMIT);
  const drifted = [], errors = [];
  let checkedPages = 0, comparedVariants = 0;

  for (const p of products) {
    const url = BASE + enrichment.products[p.stockNo].path;
    try {
      const { html, blocked, error } = await fetchProductHtmlViaFirecrawl(url);
      if (blocked) { errors.push({ stockNo: p.stockNo, error: error || "blocked/challenge" }); continue; }
      const live = parseOfferPrices(html);
      if (!live.size) { errors.push({ stockNo: p.stockNo, error: "no JSON-LD offers parsed" }); continue; }
      checkedPages++;
      const dv = driftedVariants(p, live);
      for (const d of dv) drifted.push(d);
      // Coverage denominator: every variant whose sku resolved on the live page
      // (drifted or not). Computed once — driftedVariants is called a single time.
      comparedVariants += p.variants.filter((v) => live.has(v.stockNo.toUpperCase())).length;
    } catch (e) {
      errors.push({ stockNo: p.stockNo, error: String(e.message || e).split("\n")[0].slice(0, 120) });
    }
    await new Promise((r) => setTimeout(r, 2000)); // pace our own Firecrawl usage
  }

  const coverage = products.length ? checkedPages / products.length : 0;
  const evidence = coverage >= 0.5 ? "VERIFIED" : "UNMEASURED";
  fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify({ date: TODAY, evidence, checkedPages, totalProducts: products.length, driftedCount: drifted.length, drifted, errors }, null, 2));

  const md = [
    `# AMSOIL full-catalog drift remediation — ${TODAY}`,
    ``,
    `**Evidence:** ${evidence} — ${checkedPages}/${products.length} product pages readable (${errors.length} fetch errors).`,
    `**Drifted variants:** ${drifted.length}`,
    ``,
    `## Fix (human — P.C. prices exist ONLY in the official sheet):`,
    `1. Download a fresh U.S. Pricing CSV from dz.amsoil.com → replace scripts/amsoil/data/us-pricing.csv`,
    `2. \`npm run build:seo\` then ship per the ship skill (docs/operations + ship skill).`,
    ``,
    `## Drifted variants (catalog → live):`,
    ...drifted.map((d) => `- ${d.stockNo} (${d.category}): $${d.catalog.toFixed(2)} → $${d.live.toFixed(2)}`),
    ``,
    `## Unreadable pages (${errors.length}):`,
    ...errors.slice(0, 50).map((e) => `- ${e.stockNo}: ${e.error}`),
    ...(errors.length > 50 ? [`- …and ${errors.length - 50} more — see the JSON report for the full list.`] : []),
  ].join("\n");
  fs.writeFileSync(REPORT_MD, md);

  console.log(`triage-sweep ${TODAY}: ${drifted.length} drifted / ${comparedVariants} compared on ${checkedPages}/${products.length} pages (${errors.length} errors). Evidence: ${evidence}`);

  await notify(
    `🧾 AMSOIL drift TRIAGE complete — staged remediation package ready (human fix required; nothing shipped).\n` +
    `${checkedPages}/${products.length} pages read, ${drifted.length} drifted variants.\n` +
    `Evidence: ${evidence}${evidence === "UNMEASURED" ? " — majority of pages unreadable; treat counts as a floor." : " — full live re-compare vs origin/master this run."}\n` +
    `Staged: ${REPORT_MD}\n` +
    `Fix: fresh U.S. Pricing CSV → scripts/amsoil/data/us-pricing.csv → npm run build:seo → ship. (Loop 4 halts here per the autonomy boundary.)`
  );
}
main().catch(async (e) => {
  console.error(e);
  await notify(`⚠️ AMSOIL drift triage-sweep crashed: ${String(e.message || e).slice(0, 200)}\nEvidence: UNMEASURED — sweep incomplete, damage report not staged.`);
  process.exit(1);
});
