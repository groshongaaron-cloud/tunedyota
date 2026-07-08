// Report Google index status (URL Inspection API) for key URLs, focused on the
// 8 Magnuson supercharger pages. Reuses the measurement engine's read-only SA.
// Prints coverageState + lastCrawlTime per URL with a rollup, and (if
// cfg.notifyToken is set) posts a one-line summary to Slack via the /notify
// relay so a scheduled run reaches the owner. Run anytime:
//   node scripts/measure/check-indexing.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GoogleAuth } from "google-auth-library";

const CONFIG = path.join(os.homedir(), ".tunedyota", "measure.config.json");
const cfg = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
const credentials = JSON.parse(fs.readFileSync(cfg.gscKeyFile, "utf8"));
const siteUrl = cfg.gscProperty || "https://tunedyota.com/";

// First 8 are the Magnuson pages this check exists for; the rest are context.
const MAGNUSON = [
  "https://tunedyota.com/magnuson-supercharger-pricing",
  "https://tunedyota.com/toyota-tundra-supercharger",
  "https://tunedyota.com/toyota-tacoma-supercharger",
  "https://tunedyota.com/toyota-4runner-supercharger",
  "https://tunedyota.com/toyota-fj-cruiser-supercharger",
  "https://tunedyota.com/toyota-land-cruiser-supercharger",
  "https://tunedyota.com/lexus-lx570-supercharger",
  "https://tunedyota.com/toyota-sequoia-supercharger",
];
const CONTEXT = ["https://tunedyota.com/", "https://tunedyota.com/ott-tune-cost"];

const auth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/webmasters.readonly"] });
const client = await auth.getClient();

const isIndexed = (s) => s === "Submitted and indexed" || s === "Indexed, not submitted in sitemap";

async function inspect(url) {
  const r = await client.request({
    url: "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
    method: "POST",
    data: { inspectionUrl: url, siteUrl },
  }).then((x) => x.data?.inspectionResult?.indexStatusResult || {}, (e) => ({ error: (e.response?.status || "") + " " + (e.response?.data?.error?.message || e.message) }));
  return { url, state: r.coverageState || r.error || "?", crawl: r.lastCrawlTime || "never", verdict: r.verdict || "" };
}

console.log(`property: ${siteUrl}\n`);
const results = [];
for (const url of [...MAGNUSON, ...CONTEXT]) {
  const r = await inspect(url);
  results.push(r);
  console.log(`${(r.verdict || "-").padEnd(7)} ${r.state.padEnd(34)} crawl:${r.crawl}  ${r.url.replace("https://tunedyota.com", "") || "/"}`);
}

const mag = results.slice(0, MAGNUSON.length);
const indexed = mag.filter((r) => isIndexed(r.state));
const pending = mag.filter((r) => !isIndexed(r.state));
console.log(`\nMagnuson pages indexed: ${indexed.length}/${MAGNUSON.length}`);

// Slack summary (only if a relay token is configured locally)
if (cfg.notifyToken) {
  const short = (u) => u.replace("https://tunedyota.com/", "").replace(/-supercharger$/, "").replace("magnuson-", "");
  const text = `🔎 TunedYota indexing check — Magnuson pages ${indexed.length}/${MAGNUSON.length} indexed.` +
    (pending.length ? ` Pending: ${pending.map((r) => short(r.url) + " (" + r.state + ")").join(", ")}.` : " All indexed ✅");
  const resp = await fetch("https://tunedyota.com/.netlify/functions/notify", {
    method: "POST", headers: { "Content-Type": "application/json", "x-ty-notify": cfg.notifyToken },
    body: JSON.stringify({ text }),
  }).then((r) => r.status).catch((e) => "err:" + e.message);
  console.log(`slack: ${resp}`);
}
