// scripts/measure/gsc-pull.mjs
// Pulls GSC Search Analytics for the tracked queries and prints a JSON blob to stdout.
// Env: GSC_SA_KEY (service-account JSON, raw), GSC_PROPERTY (default sc-domain:tunedyota.com).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleAuth } from "google-auth-library";
import { loadTrackedQueries } from "./lib/tracked-queries.mjs";
import { pullGsc } from "./lib/gsc.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function trailing28() {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 3);   // GSC finalizes data ~3 days back
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

async function main() {
  const property = process.env.GSC_PROPERTY || "sc-domain:tunedyota.com";
  const credentials = JSON.parse(process.env.GSC_SA_KEY);
  const auth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/webmasters.readonly"] });
  const client = await auth.getClient();
  const getAccessToken = async () => (await client.getAccessToken()).token;

  const trackedQueries = loadTrackedQueries(
    JSON.parse(fs.readFileSync(path.join(ROOT, "docs/seo/tracked-queries.json"), "utf8"))
  );
  const { startDate, endDate } = trailing28();
  const out = await pullGsc({ getAccessToken, property, startDate, endDate, trackedQueries });
  process.stdout.write(JSON.stringify(out));
}
main().catch((e) => { console.error(e.message); process.exit(1); });
