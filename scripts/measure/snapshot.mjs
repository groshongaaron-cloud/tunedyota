// scripts/measure/snapshot.mjs
// Usage: node scripts/measure/snapshot.mjs <gsc.json> <websearch.json> <perplexity.json>
// Writes docs/seo/measurements/YYYY-MM-DD.json and prints the diff (vs latest prior) to stdout.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assembleSnapshot, diffSnapshots, selectLatestPrior } from "./lib/snapshot.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(ROOT, "docs/seo/measurements");

const readJson = (p) => (p && fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);

function main() {
  const [gscPath, webPath, pplxPath] = process.argv.slice(2);
  const gsc = readJson(gscPath);
  const webSearch = readJson(webPath) || [];
  const perplexity = readJson(pplxPath) || [];
  const errors = [];
  if (!gsc) errors.push("GSC pull missing/failed");
  if (!webSearch.length) errors.push("WebSearch probe empty");
  if (!perplexity.length) errors.push("Perplexity probe empty");

  const date = new Date().toISOString().slice(0, 10);
  const snapshot = assembleSnapshot({ date, gsc, webSearch, perplexity, errors });

  fs.mkdirSync(DIR, { recursive: true });
  const priorName = selectLatestPrior(fs.readdirSync(DIR), date);
  const prior = priorName ? readJson(path.join(DIR, `${priorName}.json`)) : null;
  fs.writeFileSync(path.join(DIR, `${date}.json`), JSON.stringify(snapshot, null, 2));

  process.stdout.write(JSON.stringify(diffSnapshots(prior, snapshot)));
}
main();
