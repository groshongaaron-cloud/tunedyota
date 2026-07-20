// Submit URLs to IndexNow — instantly notifies Bing, Yandex, Seznam, etc. (NOT Google;
// Google discovers via normal crawl + Search Console). The API key is the public
// verification file at site/<hex>.txt, hosted at the site root; engines fetch it to
// confirm we own the host. The key is NOT a secret.
//
// Usage:
//   node scripts/indexnow-submit.mjs https://tunedyota.com/ott-tune https://tunedyota.com/
//   node scripts/indexnow-submit.mjs --sitemap        # submit every live URL in the sitemap
//   npm run indexnow -- --sitemap
import fs from "node:fs";

const HOST = "tunedyota.com";
const SITE = `https://${HOST}`;

// The key is whichever <hex>.txt verification file lives in site/ (rotate = swap the file).
const keyFile = fs.readdirSync("site").find((f) => /^[a-f0-9]{8,128}\.txt$/.test(f));
if (!keyFile) { console.error("No IndexNow key file (site/<hex>.txt) found."); process.exit(1); }
const key = keyFile.replace(/\.txt$/, "");
const keyLocation = `${SITE}/${keyFile}`;

let urls = process.argv.slice(2);
if (urls.includes("--sitemap")) {
  const xml = fs.readFileSync("site/sitemap.xml", "utf8");
  urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}
urls = [...new Set(urls.filter((u) => /^https?:\/\//i.test(u)))];
if (!urls.length) { console.error("No URLs given. Pass full URLs, or --sitemap."); process.exit(1); }
if (urls.length > 10000) { console.error("IndexNow caps at 10,000 URLs per request."); process.exit(1); }

const body = { host: HOST, key, keyLocation, urlList: urls };
const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(body),
});
const text = await res.text().catch(() => "");
// 200 = received, 202 = accepted (key validation pending). Both are success.
console.log(`IndexNow: ${urls.length} URL(s) -> HTTP ${res.status} ${res.statusText}`);
urls.forEach((u) => console.log(`  · ${u}`));
if (res.status !== 200 && res.status !== 202) { console.error(`FAILED${text ? ": " + text : ""}`); process.exit(1); }
console.log(res.status === 202 ? "Accepted (validating key)." : "Received.");
