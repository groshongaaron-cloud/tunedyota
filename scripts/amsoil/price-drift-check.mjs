// scripts/amsoil/price-drift-check.mjs
// Weekly full-catalog price-drift sentinel. Complements price-sync.mjs (which
// covers only the garage SKUs and APPLIES prices): this one is ALERT-ONLY and
// answers a different question — has amsoil.com repriced relative to the
// official U.S. Pricing CSV that feeds amsoil-catalog-full.json?
//
// Why alert-only: P.C. prices exist ONLY in the official CSV (never scrapeable,
// never computed — see .claude/memory/amsoil-garage-program.md), so the fix for
// drift is always "download a fresh U.S. Pricing sheet from the dealer zone",
// not an automated write. Retail drift is the tripwire that the whole sheet
// (retail AND P.C.) is stale. Displayed prices matching amsoil.com is the
// owner's compliance posture, so this tripwire is load-bearing.
//
// Strategy: fetch ~2 dozen sentinel product pages (one per category, largest
// product first), compare per-variant JSON-LD offer prices against the catalog.
// On drift: Slack alert via /notify with examples + the remediation runbook.
// The full-catalog damage report is then staged automatically by the Loop-4
// triage step (drift-triage-sweep.mjs --if-drift), chained after this in the
// scheduled task — see docs/operations/verification-loops.md.
//
// Reads catalog/enrichment from origin/master (git show) so the check is
// branch-independent and safe while dev sessions branch-switch this repo.
// State in ~/.tunedyota/amsoil-drift-state.json ("still stale since <date>").
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
const STATE_FILE = path.join(os.homedir(), ".tunedyota", "amsoil-drift-state.json");
const MAX_SENTINELS = Number((process.argv.find((a) => a.startsWith("--sentinels=")) || "").split("=")[1]) || 24;

async function notify(text) {
  // Full functions path — there is NO /notify redirect; the short URL 404s
  // silently (fetch does not throw on 404), which ate summaries until 2026-08-02.
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

// One sentinel per category (categories ordered by variant volume), largest
// product first — deterministic, so week-over-week runs hit the same pages.
function pickSentinels(catalog, enrichment) {
  const byCat = new Map();
  for (const p of catalog.products) {
    const e = enrichment.products[p.stockNo];
    if (!e || !e.path) continue;
    if (!byCat.has(p.category)) byCat.set(p.category, []);
    byCat.get(p.category).push(p);
  }
  const cats = [...byCat.entries()]
    .map(([cat, ps]) => ({ cat, ps: ps.sort((a, b) => b.variants.length - a.variants.length), vol: ps.reduce((s, x) => s + x.variants.length, 0) }))
    .sort((a, b) => b.vol - a.vol);
  const picks = [];
  for (let round = 0; picks.length < MAX_SENTINELS; round++) {
    let added = false;
    for (const c of cats) {
      if (picks.length >= MAX_SENTINELS) break;
      if (c.ps[round]) { picks.push(c.ps[round]); added = true; }
    }
    if (!added) break;
  }
  return picks;
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return {}; }
}

async function main() {
  execSync("git fetch origin master", { cwd: ROOT, stdio: "ignore" });
  const catalog = JSON.parse(gitShow("site/amsoil-catalog-full.json"));
  const enrichment = JSON.parse(gitShow("scripts/amsoil/data/enrichment.json"));
  const sentinels = pickSentinels(catalog, enrichment);

  const drifted = [], errors = [];
  let comparedVariants = 0, checkedPages = 0;

  for (const p of sentinels) {
    const url = BASE + enrichment.products[p.stockNo].path;
    try {
      const { html, blocked, error } = await fetchProductHtmlViaFirecrawl(url);
      if (blocked) { errors.push(`${p.stockNo}: ${error || "blocked/challenge"}`); continue; }

      const live = parseOfferPrices(html);
      if (!live.size) { errors.push(`${p.stockNo}: no JSON-LD offers parsed`); continue; }
      checkedPages++;
      // Count variants whose sku resolved in the live prices (mirrors the -EA fallback inside driftedVariants).
      comparedVariants += p.variants.filter((v) => live.has(v.stockNo.toUpperCase()) || (v.stockNo.toUpperCase().endsWith("-EA") && live.has(v.stockNo.toUpperCase().slice(0, -3)))).length;
      for (const d of driftedVariants(p, live)) {
        drifted.push(`${d.stockNo} (${d.category}): catalog $${d.catalog.toFixed(2)} vs live $${d.live.toFixed(2)}`);
      }
    } catch (e) {
      errors.push(`${p.stockNo}: ${String(e.message || e).split("\n")[0].slice(0, 100)}`);
    }
    // Firecrawl handles site politeness; this only paces our API usage.
    await new Promise((r) => setTimeout(r, 2000));
  }

  const state = loadState();
  const summaryHead = `AMSOIL drift-check ${TODAY}: ${drifted.length} drifted / ${comparedVariants} variants on ${checkedPages}/${sentinels.length} pages (${errors.length} fetch errors)`;
  console.log([summaryHead, ...drifted, ...errors].join("\n"));

  if (drifted.length) {
    const since = state.driftSince || TODAY;
    fs.writeFileSync(STATE_FILE, JSON.stringify({ driftSince: since, lastRun: TODAY, drifted: drifted.length }, null, 2));
    const examples = drifted.slice(0, 10).join("\n");
    await notify(
      `🚨 AMSOIL PRICE DRIFT${since !== TODAY ? ` (stale since ${since})` : ""} — amsoil.com no longer matches the site.\n` +
      `${summaryHead}\n` +
      `Evidence: VERIFIED — live amsoil.com JSON-LD offers compared against origin/master catalog this run.\n` +
      `${examples}${drifted.length > 10 ? `\n…and ${drifted.length - 10} more` : ""}\n` +
      `ACTION (P.C. prices are stale too — they only exist in the official sheet):\n` +
      `1. Download a fresh U.S. Pricing CSV from dz.amsoil.com → replace scripts/amsoil/data/us-pricing.csv\n` +
      `2. npm run build:seo, ship per the ship skill\n` +
      `Full-catalog damage report is being staged automatically (Loop-4 triage sweep) — watch for the "TRIAGE complete" ping with the remediation package.`
    );
  } else {
    if (state.driftSince) {
      await notify(`✅ AMSOIL drift resolved — site matches amsoil.com again (was stale since ${state.driftSince}). ${summaryHead}\nEvidence: VERIFIED — live re-compare this run.`);
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify({ driftSince: null, lastRun: TODAY, drifted: 0 }, null, 2));
    // Healthy = silent (watcher convention); majority-blocked runs still deserve a ping.
    if (checkedPages < sentinels.length / 2) {
      await notify(`⚠️ AMSOIL drift-check degraded: only ${checkedPages}/${sentinels.length} sentinel pages readable (${errors.length} errors). No drift among readable pages.\nEvidence: mostly UNMEASURED — treat "no drift" as unconfirmed this week.`);
    }
  }
}
main().catch(async (e) => {
  console.error(e);
  await notify(`⚠️ AMSOIL drift-check crashed: ${String(e.message || e).slice(0, 200)}\nEvidence: UNMEASURED — run incomplete, nothing confirmed.`);
  process.exit(1);
});
