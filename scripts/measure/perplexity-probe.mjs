// scripts/measure/perplexity-probe.mjs
// Probes Perplexity for each tracked query and prints [{query,citedUs,...}] to stdout.
// Env: PERPLEXITY_API_KEY.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTrackedQueries } from "./lib/tracked-queries.mjs";
import { probePerplexity } from "./lib/perplexity.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function main() {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY is not set");
  const queries = loadTrackedQueries(
    JSON.parse(fs.readFileSync(path.join(ROOT, "docs/seo/tracked-queries.json"), "utf8"))
  );
  const out = await probePerplexity({ queries, apiKey });
  process.stdout.write(JSON.stringify(out));
}
main().catch((e) => { console.error(e.message); process.exit(1); });
