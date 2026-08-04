// scripts/amsoil/price-sync.mjs
// Weekly price-sync agent. Fetches each garage SKU's amsoil.com product page
// via the Firecrawl API (Cloudflare hard-blocks headless Chromium from this
// host since ~2026-08 — see lib/firecrawl-fetch.mjs), parses retail/sale,
// applies within the ±40% guardrail, writes site/amsoil-garage.json, posts a
// summary to the /notify Slack relay. Pass --commit to git commit+push.
// Schedule locally with Windows Task Scheduler (same host as scripts/measure/).
// Needs FIRECRAWL_API_KEY (user-level env var, same key as the firecrawl MCP).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { parsePrice } from "./lib/price-parse.mjs";
import { decide, applyToProduct } from "./lib/sync.mjs";
import { fetchProductHtmlViaFirecrawl } from "./lib/firecrawl-fetch.mjs";
import { buildAmsoilPages, AMSOIL_PAGE_FILES, AMSOIL_GUIDE_FILES, AMSOIL_GEO_FILES, AMSOIL_PRODUCT_FILES } from "../build-amsoil-pages.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = path.join(ROOT, "site", "amsoil-garage.json");
const BASE = "https://www.amsoil.com";
const TODAY = new Date().toISOString().slice(0, 10);
const COMMIT = process.argv.includes("--commit");

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

async function main() {
  const cat = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const applied = [], held = [];

  // Each product is isolated in its own try/catch so one fetch hiccup can't
  // abort the whole run.
  for (const sku of Object.keys(cat.products)) {
    const p = cat.products[sku];
    if (!p.productPath) continue;

    try {
      const { html, blocked, error } = await fetchProductHtmlViaFirecrawl(BASE + p.productPath);

      if (blocked) {
        held.push(`${sku}: HELD — ${error || "blocked/challenge (len<20k or 403)"}`);
      } else {
        const parsed = parsePrice(html);
        const d = decide(p, parsed);
        if (d.action === "apply") { applyToProduct(p, parsed, TODAY); applied.push(`${sku}: ${d.from ?? "—"} → ${d.to} (${d.reason})`); }
        else if (d.action === "hold") { held.push(`${sku}: HELD ${d.from ?? "—"} → ${d.to ?? "?"} (${d.reason})`); }
      }
    } catch (e) {
      held.push(`${sku}: HELD — error ${String(e.message || e).split("\n")[0].slice(0, 120)}`);
    }

    // Firecrawl handles site politeness; this only paces our API usage.
    await new Promise(r => setTimeout(r, 2000));
  }

  if (applied.length) {
    cat.updated = TODAY;
    fs.writeFileSync(DATA, JSON.stringify(cat, null, 2) + "\n");
    // Regenerate the per-platform landing pages so their embedded Product
    // offer prices (JSON-LD) stay in lockstep with the synced catalog.
    buildAmsoilPages();
  }
  const summary = `AMSOIL price-sync ${TODAY}\nApplied: ${applied.length}\n${applied.join("\n") || "  (none)"}\nHeld: ${held.length}\n${held.join("\n") || "  (none)"}`;
  console.log(summary);
  // The Slack summary goes out AFTER the commit/push attempt and carries an
  // evidence state (docs/operations/evidence-states.md) — a summary sent before
  // the push claims work the outside world may never have received.
  let evidence;
  if (!applied.length) {
    evidence = held.length
      ? "Evidence: no changes applied; HELD items above are UNMEASURED or guard-held — not confirmed matching."
      : "Evidence: VERIFIED — live amsoil.com prices compared this run; catalog matches.";
  } else if (!COMMIT) {
    evidence = "Evidence: PREPARED — catalog + pages rewritten locally, NOT committed (run without --commit).";
  }
  if (COMMIT && applied.length) {
    // Stage the catalog plus exactly the regenerated landing pages (never a broad
    // glob — this repo folder is shared with a separate AMSOIL session). ALL
    // generated surfaces carry live prices, so all must ride the sync commit:
    // vehicle pages + guides + geo pages + per-SKU product pages + the garage
    // hub. (Guides/geo/garage were previously regenerated but NOT staged — a
    // price change left them stale on the live site until the next unrelated
    // build. Product pages make price freshness load-bearing: a stale price
    // disapproves the Merchant Center item.)
    const pageArgs = [...AMSOIL_PAGE_FILES, ...AMSOIL_GUIDE_FILES, ...AMSOIL_GEO_FILES, ...AMSOIL_PRODUCT_FILES, "amsoil-garage.html"]
      .map((f) => JSON.stringify(path.join("site", f))).join(" ");
    try {
      execSync(`git add ${JSON.stringify(DATA)} ${pageArgs}`, { cwd: ROOT });
      // Pathspec commit — a bare commit would sweep in whatever a parallel
      // session staged in this shared repo mid-run.
      execSync(`git commit -m "chore(amsoil): weekly retail price sync (${applied.length} updated)" -- ${JSON.stringify(DATA)} ${pageArgs}`, { cwd: ROOT });
      execSync("git push", { cwd: ROOT });
      evidence = "Evidence: OBSERVED — committed + pushed to master (Netlify deploy not independently verified).";
    } catch (e) {
      evidence = `Evidence: 🚨 PREPARED ONLY — changes written locally but commit/push FAILED: ${String(e.message || e).split("\n")[0].slice(0, 160)}`;
    }
  }
  await notify(`${summary}\n${evidence}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
