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
import { withBrowser, fetchProductHtml } from "./lib/browser-fetch.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = path.join(ROOT, "site", "amsoil-garage.json");
const BASE = "https://www.amsoil.com";
const TODAY = new Date().toISOString().slice(0, 10);
const COMMIT = process.argv.includes("--commit");

async function notify(text) {
  const url = process.env.NOTIFY_URL || "https://tunedyota.com/notify";
  const token = process.env.NOTIFY_TOKEN;
  if (!token) { console.log("[notify skipped: no NOTIFY_TOKEN]\n" + text); return; }
  try {
    await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-ty-notify": token }, body: JSON.stringify({ text }) });
  } catch (e) { console.error("notify failed:", e.message); }
}

async function main() {
  const cat = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const applied = [], held = [];

  await withBrowser(async (page) => {
    for (const sku of Object.keys(cat.products)) {
      const p = cat.products[sku];
      if (!p.productPath) continue;

      const { html, blocked } = await fetchProductHtml(page, BASE + p.productPath);
      if (blocked) {
        held.push(`${sku}: HELD — blocked/challenge (len<20k or 403)`);
        // politeness delay before next product even when blocked
        await page.waitForTimeout(1500);
        continue;
      }

      const parsed = parsePrice(html);
      const d = decide(p, parsed);
      if (d.action === "apply") { applyToProduct(p, parsed, TODAY); applied.push(`${sku}: ${d.from ?? "—"} → ${d.to} (${d.reason})`); }
      else if (d.action === "hold") { held.push(`${sku}: HELD ${d.from ?? "—"} → ${d.to ?? "?"} (${d.reason})`); }

      // politeness delay between products
      await page.waitForTimeout(1500);
    }
  });

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
