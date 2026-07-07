// One-shot ingest: parse docs/dealers/dealer-master-list.xlsx → seed the dealer
// registry with identity + computed fields (rep, group, ownership, proximity).
// Owner-signal fields and living pipeline state default to null/empty. Re-running
// PRESERVES living state (truckVolume, enthusiastPosture, stage, lastTouch, notes)
// for any dealer matched by name+city, so a future re-verify doesn't wipe progress.
const fs = require("node:fs");
const path = require("node:path");
const { readXlsx } = require("../netlify/functions/lib/xlsx-reader.js");
const { assignRep, computeProximity, tagGroup } = require("../netlify/functions/lib/dealer-zones.js");
const { inferOwnership } = require("../netlify/functions/lib/dealer-scoring.js");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "docs", "dealers", "dealer-master-list.xlsx");
const OUT = path.join(ROOT, "netlify", "functions", "lib", "dealers.json");

const key = (name, city) => `${String(name).toLowerCase().trim()}|${String(city).toLowerCase().trim()}`;

function main() {
  const rows = readXlsx(SRC);
  // Preserve living state from any existing registry.
  const prev = new Map();
  if (fs.existsSync(OUT)) {
    for (const d of JSON.parse(fs.readFileSync(OUT, "utf8"))) prev.set(key(d.name, d.city), d);
  }
  const dealers = rows.map((r) => {
    const name = r["Dealer Name"];
    const city = r["City"];
    const state = r["Abbrev"];
    const rep = assignRep(state);
    const group = tagGroup(name);
    const old = prev.get(key(name, city)) || {};
    return {
      name,
      city,
      state,
      address: r["Street Address"] || "",
      zip: r["ZIP"] || "",
      sourceUrl: r["Source URL"] || "",
      owningRep: rep,
      group,
      ownershipType: inferOwnership(group),
      ownershipInferred: true,
      proximity: old.proximity || computeProximity(city, rep), // keep owner overrides
      truckVolume: old.truckVolume ?? null,
      enthusiastPosture: old.enthusiastPosture ?? null,
      stage: old.stage || "Prospect",
      lastTouch: old.lastTouch || null,
      notes: old.notes || "",
    };
  });
  fs.writeFileSync(OUT, JSON.stringify(dealers, null, 2) + "\n");
  console.log(`Ingested ${dealers.length} dealers → ${path.relative(ROOT, OUT)}`);
}

main();
