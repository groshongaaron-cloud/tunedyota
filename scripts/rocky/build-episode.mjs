// scripts/rocky/build-episode.mjs
// Usage: node scripts/rocky/build-episode.mjs "<procedure-search>"
// Emits a validated episode manifest JSON to stdout for the pilot episode.
import path from "node:path";
import { loadGuides, findByProcedure } from "./lib/dataset.mjs";
import { validateManifest } from "./lib/episode-manifest.mjs";

const search = process.argv[2];
if (!search) { console.error('Usage: build-episode.mjs "<procedure-search>"'); process.exit(1); }

const guides = loadGuides(path.join("scripts", "rocky", "data", "toyota-guides.json"));
const hits = findByProcedure(guides, search);
if (hits.length !== 1) { console.error(`Expected 1 match, got ${hits.length}`); process.exit(1); }
const g = hits[0];
const id = `${g.Model}-${g["Year Range"]}-${g.Procedure}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const manifest = {
  id,
  sourceUrl: g["Page URL"],
  videoId: g["YouTube Video ID"],
  model: g.Model,
  yearRange: g["Year Range"],
  procedure: g.Procedure,
  scriptPath: "docs/brand/rocky/pilot-tundra-front-brakes-script.md",
  status: "draft",
};

const { ok, errors } = validateManifest(manifest);
if (!ok) { console.error("Invalid manifest:", errors); process.exit(1); }
console.log(JSON.stringify(manifest, null, 2));
