// One-off: submit the sitemap to Google Search Console via the API.
// Reuses the measurement engine's service-account config
// (~/.tunedyota/measure.config.json -> gscKeyFile), but requests the
// read-write `webmasters` scope (sitemaps.submit needs write, not readonly).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GoogleAuth } from "google-auth-library";

const CONFIG = path.join(os.homedir(), ".tunedyota", "measure.config.json");
const cfg = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
const property = cfg.gscProperty && cfg.gscProperty.startsWith("sc-domain:")
  ? cfg.gscProperty
  : "sc-domain:tunedyota.com";
const sitemap = "https://tunedyota.com/sitemap.xml";
const credentials = JSON.parse(fs.readFileSync(cfg.gscKeyFile, "utf8"));

const auth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/webmasters"] });
const client = await auth.getClient();
const base = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/sitemaps/${encodeURIComponent(sitemap)}`;

console.log(`SA:        ${credentials.client_email}`);
console.log(`property:  ${property}`);
console.log(`sitemap:   ${sitemap}`);

// PUT = submit/resubmit
const put = await client.request({ url: base, method: "PUT" }).then(
  (r) => ({ ok: true, status: r.status }),
  (e) => ({ ok: false, status: e.response?.status, error: e.response?.data?.error?.message || e.message })
);
console.log("submit:", JSON.stringify(put));

if (put.ok) {
  // GET = read back status
  const got = await client.request({ url: base, method: "GET" }).then(
    (r) => r.data,
    (e) => ({ error: e.response?.data?.error?.message || e.message })
  );
  console.log("status:", JSON.stringify({
    path: got.path, lastSubmitted: got.lastSubmitted, isPending: got.isPending,
    lastDownloaded: got.lastDownloaded, warnings: got.warnings, errors: got.errors,
    contents: got.contents,
  }, null, 2));
}
