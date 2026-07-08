// Nudge Google to (re)crawl specific URLs via the Indexing API.
// Reuses the measurement engine's service-account key. Requires the Web Search
// Indexing API enabled in the GCP project + the SA as a verified Search Console
// OWNER of the property.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GoogleAuth } from "google-auth-library";

const CONFIG = path.join(os.homedir(), ".tunedyota", "measure.config.json");
const cfg = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
const credentials = JSON.parse(fs.readFileSync(cfg.gscKeyFile, "utf8"));

const URLS = [
  "https://tunedyota.com/magnuson-supercharger-pricing",
  "https://tunedyota.com/toyota-tundra-supercharger",
  "https://tunedyota.com/toyota-tacoma-supercharger",
  "https://tunedyota.com/toyota-4runner-supercharger",
  "https://tunedyota.com/toyota-fj-cruiser-supercharger",
  "https://tunedyota.com/toyota-land-cruiser-supercharger",
  "https://tunedyota.com/lexus-lx570-supercharger",
  "https://tunedyota.com/toyota-sequoia-supercharger",
];

const auth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/indexing"] });
const client = await auth.getClient();
console.log(`SA: ${credentials.client_email}\n`);

let ok = 0, fail = 0;
for (const url of URLS) {
  const res = await client.request({
    url: "https://indexing.googleapis.com/v3/urlNotifications:publish",
    method: "POST",
    data: { url, type: "URL_UPDATED" },
  }).then(
    (r) => ({ ok: true, status: r.status, ts: r.data?.urlNotificationMetadata?.latestUpdate?.notifyTime }),
    (e) => ({ ok: false, status: e.response?.status, error: e.response?.data?.error?.message || e.message })
  );
  if (res.ok) { ok++; console.log(`OK   ${res.status}  ${url.replace("https://tunedyota.com", "")}  ${res.ts || ""}`); }
  else { fail++; console.log(`FAIL ${res.status}  ${url.replace("https://tunedyota.com", "")}  — ${res.error}`); }
}
console.log(`\n${ok} ok / ${fail} failed`);
