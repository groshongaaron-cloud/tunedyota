// Apply ONLY the Firecrawl-verified, high-confidence AMSOIL corrections to
// site/amsoil-garage.json: real product order codes, the ATF product fix, and
// engine-oil capacities. Diff/transfer capacities + the 7 errored configs are
// intentionally NOT touched (extractor needs a careful follow-up pass), so
// `verified` stays false until a row is fully confirmed.
import fs from "node:fs";

const path = "./site/amsoil-garage.json";
const g = JSON.parse(fs.readFileSync(path, "utf8"));
const recon = JSON.parse(fs.readFileSync("./scripts/amsoil-reconciliation.json", "utf8"));
const changes = [];

// 1) Product catalog: real AMSOIL order codes (verified pattern: oils *QT-EA,
//    filters EA15K##-EA, gear lubes/ATF *PK-EA) + the ATF product correction.
const CODE = {
  "SS-0W20-QT": "ASMQT-EA", "SS-5W30-QT": "ASLQT-EA", "SS-5W20-QT": "ALMQT-EA",
  "EA15K09": "EA15K09-EA", "EA15K51": "EA15K51-EA", "EA15K02": "EA15K02-EA",
  "EA15K49": "EA15K49-EA", "EA15K04": "EA15K04-EA",
  "SVL-QT": "SVLPK-EA", "AGLPK-QT": "AGLPK-EA", "SVG-75W90-QT": "SVGPK-EA", "SVG-75W140-QT": "SVOPK-EA",
};
for (const sku of Object.keys(CODE)) {
  const p = g.products[sku]; if (!p) continue;
  if (p.stockNo !== CODE[sku]) { changes.push(`product ${sku}: stockNo ${p.stockNo} -> ${CODE[sku]}`); p.stockNo = CODE[sku]; }
}
// ATF: these Toyota/Lexus WS transmissions take Signature Series FUEL-EFFICIENT ATF.
if (g.products["ATL-QT"]) {
  const p = g.products["ATL-QT"];
  const newName = "Signature Series Fuel-Efficient 100% Synthetic ATF", newCode = "ATLPK-EA";
  if (p.name !== newName || p.stockNo !== newCode) { changes.push(`product ATL-QT: "${p.name}"/${p.stockNo} -> "${newName}"/${newCode}`); p.name = newName; p.stockNo = newCode; }
}

// NOTE: engine-oil / transmission / diff CAPACITIES are intentionally NOT applied
// here. The per-vehicle capacity parse produced some implausible values (e.g. GX/
// LS460 4.6L at 8+ qt) and the diff/transfer regex is buggy — they need a QA pass
// (cross-check vs OEM, flag outliers) before touching the customer-facing garage.
// Only the directly-verified product order codes + ATF product fix are applied.

fs.writeFileSync(path, JSON.stringify(g, null, 1) + "\n");
console.log(`Applied ${changes.length} verified corrections:\n` + changes.map((c) => "  • " + c).join("\n"));
