// scripts/measure/run-local.mjs
// Local monthly runner for the search + AI-visibility measurement engine.
// Reads secrets from ~/.tunedyota/measure.config.json (never committed), pulls GSC +
// Perplexity, assembles a dated snapshot, posts a Slack report, and commits + pushes.
// The WebSearch presence probe is cloud-agent-only, so it is skipped here (GSC already
// gives exact Google positions); the report omits the WebSearch stat accordingly.
//
// Config shape (~/.tunedyota/measure.config.json):
//   { "gscKeyFile": "C:\\path\\to\\gsc-key.json",
//     "gscProperty": "https://tunedyota.com/",
//     "perplexityApiKey": "pplx-...",   // optional; omit/empty to skip
//     "slackWebhookUrl": "https://hooks.slack.com/services/..." } // optional; omit to skip
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { GoogleAuth } from "google-auth-library";
import { loadTrackedQueries } from "./lib/tracked-queries.mjs";
import { pullGsc } from "./lib/gsc.mjs";
import { probePerplexity } from "./lib/perplexity.mjs";
import { assembleSnapshot, diffSnapshots, selectLatestPrior } from "./lib/snapshot.mjs";
import { renderReport } from "./lib/report.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(ROOT, "docs/seo/measurements");
const CONFIG = path.join(os.homedir(), ".tunedyota", "measure.config.json");
const log = (...a) => console.log(...a);

function trailing28() {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 3); // GSC finalizes data ~3 days back
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

async function gscTokenGetter(keyFile) {
  const credentials = JSON.parse(fs.readFileSync(keyFile, "utf8"));
  const auth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/webmasters.readonly"] });
  const client = await auth.getClient();
  return async () => (await client.getAccessToken()).token;
}

async function main() {
  if (!fs.existsSync(CONFIG)) {
    throw new Error(`Missing config at ${CONFIG} — see docs/seo/measurement-local.md`);
  }
  const cfg = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
  const property = cfg.gscProperty || "https://tunedyota.com/";
  const trackedQueries = loadTrackedQueries(
    JSON.parse(fs.readFileSync(path.join(ROOT, "docs/seo/tracked-queries.json"), "utf8"))
  );
  const errors = [];

  // --- GSC ---
  let gsc = null;
  try {
    if (!cfg.gscKeyFile) throw new Error("gscKeyFile not set in config");
    const getAccessToken = await gscTokenGetter(cfg.gscKeyFile);
    const { startDate, endDate } = trailing28();
    gsc = await pullGsc({ getAccessToken, property, startDate, endDate, trackedQueries });
    log(`GSC: ${gsc.tracked.length} tracked rows, ${gsc.topPages.length} top pages (${gsc.range.start}..${gsc.range.end})`);
  } catch (e) {
    errors.push(`GSC pull failed: ${e.message}`);
    log(`GSC ERROR: ${e.message}`);
  }

  // --- Perplexity (optional) ---
  let perplexity = [];
  if (cfg.perplexityApiKey) {
    perplexity = await probePerplexity({ queries: trackedQueries, apiKey: cfg.perplexityApiKey });
    const cited = perplexity.filter((p) => p.citedUs).length;
    const failed = perplexity.filter((p) => p.error).length;
    log(`Perplexity: cited ${cited}/${perplexity.length}${failed ? `, ${failed} errored` : ""}`);
    if (failed) errors.push(`Perplexity: ${failed}/${perplexity.length} queries errored`);
  } else {
    log("Perplexity: skipped (no perplexityApiKey in config)");
  }

  // WebSearch presence probe is cloud-agent-only; skipped in the local runner.
  const webSearch = [];

  // --- Assemble + diff ---
  const date = new Date().toISOString().slice(0, 10);
  const snapshot = assembleSnapshot({ date, gsc, webSearch, perplexity, errors });
  fs.mkdirSync(DIR, { recursive: true });
  const priorName = selectLatestPrior(fs.readdirSync(DIR), date);
  const prior = priorName ? JSON.parse(fs.readFileSync(path.join(DIR, `${priorName}.json`), "utf8")) : null;
  const outPath = path.join(DIR, `${date}.json`);
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  log(`Snapshot: ${outPath}${prior ? ` (trending vs ${priorName})` : " (baseline)"}`);

  const diff = diffSnapshots(prior, snapshot);
  const report = renderReport(snapshot, diff);
  log(`\n----- REPORT -----\n${report}\n------------------\n`);

  // --- Slack (optional) ---
  // Direct webhook first if configured; on failure (or no webhook) fall back to
  // the site's /notify relay — the same contract price-sync and the drift
  // sentinel use, so the monthly report lands in Slack even after a webhook
  // is rotated (the 2026-08 run 404'd on a dead webhook).
  let slacked = false;
  if (cfg.slackWebhookUrl) {
    try {
      const res = await fetch(cfg.slackWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: report }),
      });
      log(`Slack: HTTP ${res.status}`);
      slacked = res.ok;
    } catch (e) {
      log(`Slack ERROR: ${e.message}`);
    }
  }
  const notifyToken = cfg.notifyToken || process.env.NOTIFY_TOKEN || process.env.TY_NOTIFY_TOKEN;
  if (!slacked && notifyToken) {
    try {
      const res = await fetch(cfg.notifyUrl || "https://tunedyota.com/.netlify/functions/notify", {
        method: "POST",
        headers: { "content-type": "application/json", "x-ty-notify": notifyToken },
        body: JSON.stringify({ text: report }),
      });
      log(`Notify relay: HTTP ${res.status}`);
      slacked = res.ok;
    } catch (e) {
      log(`Notify relay ERROR: ${e.message}`);
    }
  }
  if (!slacked) log("Slack: no working delivery path (webhook failed/missing and no notify token)");

  // --- Persist (commit + push the snapshot) ---
  // Pathspec commit only — parallel sessions stage files in this repo, and a
  // bare `git commit` would sweep them in. Master-only, same as price-sync.
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: ROOT, stdio: "pipe" }).toString().trim();
    if (branch !== "master") throw new Error(`on branch ${branch}, not master — snapshot left uncommitted`);
    execSync(`git add "${outPath}"`, { cwd: ROOT, stdio: "pipe" });
    execSync(`git commit -m "chore(measure): ${date} snapshot" -- "${outPath}"`, { cwd: ROOT, stdio: "pipe" });
    execSync("git push", { cwd: ROOT, stdio: "pipe" });
    log("Persisted: committed + pushed snapshot to origin.");
  } catch (e) {
    const detail = [e.stderr && e.stderr.toString(), e.stdout && e.stdout.toString(), String(e.message)]
      .filter(Boolean).join(" | ").split("\n").filter(Boolean).slice(0, 3).join(" | ");
    log(`Persist skipped/failed: ${detail.slice(0, 300)}`);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
