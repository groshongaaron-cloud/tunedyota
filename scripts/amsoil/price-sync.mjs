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
import { buildAmsoilPages, AMSOIL_PAGE_FILES } from "../build-amsoil-pages.mjs";
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

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// Stability flags keep headless Chromium from crashing its network service on a
// constrained/unattended host; the log flags keep it from spamming the task log.
function launchBrowser() {
  return chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage", "--disable-gpu", "--disable-logging", "--log-level=3"],
  });
}

async function main() {
  const cat = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const applied = [], held = [];

  // Fresh browser context per product to reset the Cloudflare cookie (a reused session
  // gets fingerprinted + blocked). Each product is isolated in its own try/catch so one
  // Chromium hiccup can't abort the whole run; the browser is relaunched if it dies.
  let browser = await launchBrowser();
  try {
    for (const sku of Object.keys(cat.products)) {
      const p = cat.products[sku];
      if (!p.productPath) continue;

      try {
        if (!browser.isConnected()) browser = await launchBrowser();
        const ctx = await browser.newContext({ userAgent: UA, locale: "en-US" });
        let html, blocked;
        try {
          const page = await ctx.newPage();
          ({ html, blocked } = await fetchProductHtml(page, BASE + p.productPath, 5000));
        } finally {
          await ctx.close().catch(() => {});
        }

        if (blocked) {
          held.push(`${sku}: HELD — blocked/challenge (len<20k or 403)`);
        } else {
          const parsed = parsePrice(html);
          const d = decide(p, parsed);
          if (d.action === "apply") { applyToProduct(p, parsed, TODAY); applied.push(`${sku}: ${d.from ?? "—"} → ${d.to} (${d.reason})`); }
          else if (d.action === "hold") { held.push(`${sku}: HELD ${d.from ?? "—"} → ${d.to ?? "?"} (${d.reason})`); }
        }
      } catch (e) {
        held.push(`${sku}: HELD — error ${String(e.message || e).split("\n")[0].slice(0, 120)}`);
      }

      // Polite delay between products to avoid rate-limiting
      await new Promise(r => setTimeout(r, 8000));
    }
  } finally {
    await browser.close().catch(() => {});
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
  await notify(summary);
  if (COMMIT && applied.length) {
    // Stage the catalog plus exactly the regenerated landing pages (never a broad
    // glob — this repo folder is shared with a separate AMSOIL session).
    const pageArgs = AMSOIL_PAGE_FILES.map((f) => JSON.stringify(path.join("site", f))).join(" ");
    execSync(`git add ${JSON.stringify(DATA)} ${pageArgs}`, { cwd: ROOT });
    execSync(`git commit -m "chore(amsoil): weekly retail price sync (${applied.length} updated)"`, { cwd: ROOT });
    execSync("git push", { cwd: ROOT });
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
