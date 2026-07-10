// scripts/amsoil/price-sync.mjs
// Weekly price-sync agent. Launches ONE headless Chromium session, fetches each
// garage SKU's amsoil.com product page (bypassing Cloudflare), parses retail/sale,
// applies within the ±40% guardrail, writes site/amsoil-garage.json, posts a
// summary to the /notify Slack relay. Pass --commit to git commit+push.
// Schedule locally with Windows Task Scheduler (same host as scripts/measure/).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { parsePrice } from "./lib/price-parse.mjs";
import { decide, applyToProduct } from "./lib/sync.mjs";
import { fetchProductHtml } from "./lib/browser-fetch.mjs";
import { chromium } from "playwright";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = path.join(ROOT, "site", "amsoil-garage.json");
const BASE = "https://www.amsoil.com";
const TODAY = new Date().toISOString().slice(0, 10);
const COMMIT = process.argv.includes("--commit");

async function notify(text) {
  const url = process.env.NOTIFY_URL || "https://tunedyota.com/notify";
  const token = process.env.NOTIFY_TOKEN || process.env.TY_NOTIFY_TOKEN;
  if (!token) { console.log("[notify skipped: no NOTIFY_TOKEN/TY_NOTIFY_TOKEN]\n" + text); return; }
  try {
    await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-ty-notify": token }, body: JSON.stringify({ text }) });
  } catch (e) { console.error("notify failed:", e.message); }
}

async function main() {
  const cat = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const applied = [], held = [];

  // Use a fresh browser context per product to avoid Cloudflare session fingerprinting.
  // A single shared page gets flagged after the first hit; fresh contexts reset the CF cookie.
  const browser = await chromium.launch({ headless: true });
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
  try {
    for (const sku of Object.keys(cat.products)) {
      const p = cat.products[sku];
      if (!p.productPath) continue;

      const ctx = await browser.newContext({ userAgent: UA, locale: "en-US" });
      const page = await ctx.newPage();
      let html, blocked;
      try {
        ({ html, blocked } = await fetchProductHtml(page, BASE + p.productPath, 5000));
      } finally {
        await ctx.close();
      }

      if (blocked) {
        held.push(`${sku}: HELD — blocked/challenge (len<20k or 403)`);
      } else {
        const parsed = parsePrice(html);
        const d = decide(p, parsed);
        if (d.action === "apply") { applyToProduct(p, parsed, TODAY); applied.push(`${sku}: ${d.from ?? "—"} → ${d.to} (${d.reason})`); }
        else if (d.action === "hold") { held.push(`${sku}: HELD ${d.from ?? "—"} → ${d.to ?? "?"} (${d.reason})`); }
      }

      // Polite delay between products to avoid rate-limiting
      await new Promise(r => setTimeout(r, 8000));
    }
  } finally {
    await browser.close();
  }

  if (applied.length) {
    cat.updated = TODAY;
    fs.writeFileSync(DATA, JSON.stringify(cat, null, 2) + "\n");
  }
  const summary = `AMSOIL price-sync ${TODAY}\nApplied: ${applied.length}\n${applied.join("\n") || "  (none)"}\nHeld: ${held.length}\n${held.join("\n") || "  (none)"}`;
  console.log(summary);
  await notify(summary);
  if (COMMIT && applied.length) {
    execSync(`git add ${JSON.stringify(DATA)}`, { cwd: ROOT });
    execSync(`git commit -m "chore(amsoil): weekly retail price sync (${applied.length} updated)"`, { cwd: ROOT });
    execSync("git push", { cwd: ROOT });
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
