// Report Google's STRUCTURED-DATA verdict (URL Inspection API → richResultsResult)
// for key URLs — the same Product-snippet ERRORs/WARNINGs that show up in GSC's
// Enhancement reports, but on demand and per URL. Reuses the measurement engine's
// read-only service account (scope webmasters.readonly, already proven by
// check-indexing.mjs). Note: URL Inspection reflects Google's LAST-CRAWLED version,
// so a just-shipped fix won't clear here until Google re-crawls (days–weeks).
//
// Usage:
//   node scripts/measure/check-rich-results.mjs                 # default AMSOIL set
//   node scripts/measure/check-rich-results.mjs amsoil-garage   # one page (path or full URL)
//   node scripts/measure/check-rich-results.mjs all             # AMSOIL + Magnuson
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GoogleAuth } from "google-auth-library";

const CONFIG = path.join(os.homedir(), ".tunedyota", "measure.config.json");
const cfg = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
const credentials = JSON.parse(fs.readFileSync(cfg.gscKeyFile, "utf8"));
const siteUrl = cfg.gscProperty || "https://tunedyota.com/";
const ORIGIN = "https://tunedyota.com";

const AMSOIL = [
  "/amsoil-garage",
  "/amsoil-toyota-tundra", "/amsoil-toyota-tacoma", "/amsoil-toyota-4runner", "/amsoil-toyota-sequoia",
  "/amsoil-toyota-land-cruiser", "/amsoil-toyota-fj-cruiser", "/amsoil-toyota-rav4",
  "/amsoil-toyota-highlander", "/amsoil-toyota-camry",
  "/amsoil-lexus-gx", "/amsoil-lexus-lx570", "/amsoil-lexus-rx350", "/amsoil-lexus-ls460",
];
const MAGNUSON = [
  "/magnuson-supercharger-pricing", "/toyota-tundra-supercharger", "/toyota-tacoma-supercharger",
  "/toyota-4runner-supercharger", "/toyota-fj-cruiser-supercharger", "/toyota-land-cruiser-supercharger",
  "/lexus-lx570-supercharger", "/toyota-sequoia-supercharger",
];

// Resolve CLI args → full URLs. Bare words become /path; "all" = AMSOIL+Magnuson.
// --notify opts into a Slack post (only the scheduled job passes it; ad-hoc runs
// stay quiet, since a just-shipped fix always shows Google's stale pre-crawl view).
const rawArgs = process.argv.slice(2);
const NOTIFY = rawArgs.includes("--notify");
const args = rawArgs.filter((a) => a !== "--notify");
const toUrl = (a) => (a.startsWith("http") ? a : ORIGIN + (a.startsWith("/") ? a : "/" + a));
let targets;
if (!args.length) targets = AMSOIL.map(toUrl);
else if (args.length === 1 && args[0] === "all") targets = [...AMSOIL, ...MAGNUSON].map(toUrl);
else targets = args.map(toUrl);

const auth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/webmasters.readonly"] });
const client = await auth.getClient();

async function inspect(url) {
  try {
    const { data } = await client.request({
      url: "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
      method: "POST",
      data: { inspectionUrl: url, siteUrl },
    });
    return data?.inspectionResult?.richResultsResult || null; // null = no rich results detected
  } catch (e) {
    return { error: (e.response?.status || "") + " " + (e.response?.data?.error?.message || e.message) };
  }
}

// Flatten a richResultsResult into {verdict, errors[], warnings[]} of "Type — item: message".
function summarize(rr) {
  if (!rr) return { verdict: "NONE", errors: [], warnings: [] };
  if (rr.error) return { verdict: "ERR", errors: [rr.error], warnings: [] };
  const errors = [], warnings = [];
  for (const d of rr.detectedItems || []) {
    for (const it of d.items || []) {
      for (const is of it.issues || []) {
        const line = `${d.richResultType} — ${it.name || "?"}: ${is.issueMessage}`;
        (is.severity === "ERROR" ? errors : warnings).push(line);
      }
    }
  }
  return { verdict: rr.verdict || "?", errors, warnings };
}

console.log(`property: ${siteUrl}  (Google's last-crawled view; not live)\n`);
let totalErr = 0, totalWarn = 0;
const failing = [];
for (const url of targets) {
  const s = summarize(await inspect(url));
  totalErr += s.errors.length; totalWarn += s.warnings.length;
  if (s.errors.length) failing.push(url.replace(ORIGIN, "") || "/");
  const tag = s.verdict === "PASS" ? "PASS " : s.verdict.padEnd(5);
  console.log(`${tag} err:${s.errors.length} warn:${s.warnings.length}  ${url.replace(ORIGIN, "") || "/"}`);
  for (const e of s.errors) console.log(`   ✖ ${e}`);
  // Show the first couple of warnings only, to keep output readable.
  for (const w of s.warnings.slice(0, 2)) console.log(`   ~ ${w}`);
  if (s.warnings.length > 2) console.log(`   ~ …and ${s.warnings.length - 2} more warning(s)`);
}

console.log(`\n${targets.length} URLs · ${totalErr} error(s) · ${totalWarn} warning(s)`);
if (failing.length) console.log(`ERROR-severity on: ${failing.join(", ")}`);

// Slack only when opted in (--notify) AND there is a real ERROR-severity problem.
if (NOTIFY && cfg.notifyToken && totalErr > 0) {
  const text = `⚠️ TunedYota rich-results check — ${totalErr} structured-data ERROR(s) across ${failing.length} page(s): ${failing.join(", ")}. (warnings ${totalWarn}, informational)`;
  const resp = await fetch("https://tunedyota.com/.netlify/functions/notify", {
    method: "POST", headers: { "Content-Type": "application/json", "x-ty-notify": cfg.notifyToken },
    body: JSON.stringify({ text }),
  }).then((r) => r.status).catch((e) => "err:" + e.message);
  console.log(`slack: ${resp}`);
}
