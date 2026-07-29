// Submit URLs to IndexNow (Bing, Yandex, Naver, Seznam — the indexes behind
// ChatGPT search, Copilot and most AI answer engines). Google does not consume
// IndexNow; its channel is the sitemap + GSC. The key file site/<KEY>.txt must
// be deployed before pinging.
// Usage:
//   node scripts/submit-indexnow.mjs <url-or-prefix>...   # e.g. banks-
//   node scripts/submit-indexnow.mjs --all                # every sitemap URL
import fs from "node:fs";

const KEY = "dc3c9d5e9cd0a09746b311007b9d356c";
const HOST = "tunedyota.com";

const sitemap = fs.readFileSync("site/sitemap.xml", "utf8");
const all = [...sitemap.matchAll(/<loc>(https:\/\/tunedyota\.com\/[^<]*)<\/loc>/g)].map((m) => m[1]);
const args = process.argv.slice(2);
const urls = args.includes("--all")
  ? all
  : all.filter((u) => args.some((a) => u.includes(a)));
if (!urls.length) { console.error("no URLs matched"); process.exit(1); }

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urls }),
});
console.log(`indexnow: ${urls.length} URLs submitted — HTTP ${res.status}${res.status === 200 || res.status === 202 ? " (accepted)" : ""}`);
if (res.status >= 400) console.log(await res.text());
