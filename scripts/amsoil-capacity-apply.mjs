// Apply the cross-source-verified ENGINE OIL capacities to site/amsoil-garage.json.
// Each figure is "with filter", US quarts, confirmed by >=2 independent sources
// (engineswork, engineoildb, oil-change.info, toyota-club.net factory data, costa,
// oilsr.us). AMSOIL's own lookup was used only as a tie-breaker (known-unreliable
// for capacity). Rows with an unresolved within-row split or a genuine source
// conflict are LEFT verified:false (flagged for human review) — see FLAGS below.
//
// Only the ENGINE OIL system capacity + the generation `verified` flag are touched.
// Transmission / differential / transfer-case capacities are a later pass and stay
// verified:false until then (they never surface on the static pages while unverified,
// and the interactive garage shows the engine-oil number that customers actually use).
import fs from "node:fs";

const path = "./site/amsoil-garage.json";
const g = JSON.parse(fs.readFileSync(path, "utf8"));
const report = { generated: "2026-07-20", shipped: [], split: [], flagged: [], confirmed: [] };

const setOil = (gen, qt) => {
  const eo = gen.systems.find((s) => s.system === "Engine Oil");
  if (!eo) throw new Error("no Engine Oil system");
  const old = eo.capacity;
  eo.capacity = qt;
  eo.verified = true;   // per-SYSTEM flag: only engine oil is cross-verified this pass.
  return old;           // diff/trans/transfer capacities stay unverified -> never displayed.
};

// (make, model, y, e) => new engine-oil qt. verified:true set on match.
const SINGLE = [
  ["Toyota","Tacoma","2024+","2.4L-T I4",5.9],
  ["Toyota","Tacoma","2016-2023","3.5L V6",6.2],
  ["Toyota","Tacoma","2016-2023","2.7L I4",6.2],
  ["Toyota","Tacoma","2005-2015","4.0L V6",5.5],   // 4WD/premium; base-RWD is 4.8 (caveat)
  ["Toyota","Tacoma","2005-2015","2.7L I4",5.5],
  ["Toyota","4Runner","2025+","2.4L-T I4",5.9],
  ["Toyota","4Runner","2020-2024","4.0L V6",6.6],
  ["Toyota","4Runner","2010-2019","4.0L V6",6.6],
  ["Toyota","FJ Cruiser","2010-2014","4.0L V6",6.4],
  ["Toyota","FJ Cruiser","2007-2009","4.0L V6",5.5],
  ["Toyota","FJ Cruiser","2007-2008","4.0L V6",5.5],
  ["Toyota","Tundra","2022+","3.4L i-FORCE twin-turbo V6",7.7],
  ["Toyota","Tundra","2010-2019","4.6L V8",7.9],
  ["Toyota","Tundra","2000-2009","4.7L V8",6.6],
  ["Toyota","Sequoia","2010-2019","4.6L V8",7.9],
  ["Toyota","Sequoia","2001-2009","4.7L V8",6.6],
  ["Toyota","Land Cruiser","2025+","2.4L-T I4",5.9],
  ["Toyota","Land Cruiser","2016-2021","5.7L V8",7.9],
  ["Toyota","Land Cruiser","2006-2007","4.7L V8",7.2],
  ["Toyota","RAV4","2006-2012","3.5L V6",6.4],
  ["Toyota","Highlander","2017-2019","3.5L V6",5.8],
  ["Toyota","Highlander","2008-2016","3.5L V6",6.4],
  ["Toyota","Camry","2018-2024","3.5L V6",5.7],
  ["Toyota","Camry","2007-2017","3.5L V6",6.4],
  ["Lexus","GX","2019+","4.6L V8",8.2],
  ["Lexus","GX","2010-2018","4.6L V8",8.2],
  ["Lexus","GX","2005-2009","4.7L V8",6.6],
  ["Lexus","RX350","2015-2022","3.5L V6",5.7],
  ["Lexus","RX350","2006-2012","3.5L V6",6.4],
  ["Lexus","LS460","2007-2017","4.6L V8",9.1],   // RWD; AWD is 9.5 (caveat)
];

// (make, model, y, e) => [{y, qt}, ...] : replace one gen with year-split sub-rows.
// The 5.7L 3UR-FE capacity is vehicle- AND year-dependent; cross-resolved from
// multiple sources. Tundra runs higher late (8.5); LC/LX/Sequoia stay 7.9.
const SPLIT = [
  ["Toyota","Tundra","2007-2021","5.7L V8",[["2007-2009",7.4],["2010-2017",7.9],["2018-2021",8.5]]],
  ["Toyota","Sequoia","2008-2022","5.7L V8",[["2008-2009",7.4],["2010-2022",7.9]]],
  ["Toyota","Land Cruiser","2008-2015","5.7L V8",[["2008-2010",7.4],["2011-2015",7.9]]],
  ["Lexus","LX570","2008-2021","5.7L V8",[["2008-2009",7.4],["2010-2021",7.9]]],
];

// Left verified:false on purpose.
const FLAGS = [
  ["Toyota","4Runner","2005-2009","4.0L V6 / 4.7L V8","mixed-engine row: 4.0L=5.5 qt, 4.7L V8=6.6 qt; year-based picker can't distinguish engine. Current 5.5 is correct for the 4.0L (volume engine)."],
  ["Toyota","Tundra","2005-2009","4.0L V6","source conflict: engineoildb=4.8 qt vs oil-change.info=5.5 qt; low-volume config; needs owner's-manual tie-break."],
];

for (const [mk, md, y, e, qt] of SINGLE) {
  const arr = g.vehicles[mk]?.[md];
  const gen = arr?.find((x) => x.y === y && x.e === e);
  if (!gen) { report.flagged.push({ v: `${mk} ${md} ${y} ${e}`, note: "NOT FOUND (single)" }); continue; }
  const old = setOil(gen, qt);
  gen.verified = true;
  (old === qt ? report.confirmed : report.shipped).push({ v: `${mk} ${md} | ${y} | ${e}`, old, new: qt });
}

for (const [mk, md, y, e, subs] of SPLIT) {
  const arr = g.vehicles[mk]?.[md];
  const idx = arr?.findIndex((x) => x.y === y && x.e === e);
  if (idx == null || idx < 0) { report.flagged.push({ v: `${mk} ${md} ${y} ${e}`, note: "NOT FOUND (split)" }); continue; }
  const base = arr[idx];
  const rows = subs.map(([yy, qt]) => {
    const clone = JSON.parse(JSON.stringify(base));
    clone.y = yy; clone.verified = true; setOil(clone, qt);
    return clone;
  });
  arr.splice(idx, 1, ...rows);
  report.split.push({ v: `${mk} ${md} | ${y} | ${e}`, into: subs.map(([yy, qt]) => `${yy}=${qt}qt`) });
}

for (const [mk, md, y, e, note] of FLAGS) {
  const gen = g.vehicles[mk]?.[md]?.find((x) => x.y === y && x.e === e);
  report.flagged.push({ v: `${mk} ${md} | ${y} | ${e}`, keptVerifiedFalse: true, note });
}

fs.writeFileSync(path, JSON.stringify(g, null, 1) + "\n");
fs.writeFileSync("./scripts/amsoil-capacity-reconciliation.json", JSON.stringify(report, null, 1) + "\n");

const changed = report.shipped.length, conf = report.confirmed.length, spl = report.split.length, fl = report.flagged.length;
console.log(`Engine-oil capacity pass:`);
console.log(`  ${changed} corrected + ${conf} confirmed-in-place -> verified:true`);
console.log(`  ${spl} rows split into year-sub-ranges (verified)`);
console.log(`  ${fl} flagged (left verified:false)`);
console.log(`\nCorrections (old -> new qt):`);
for (const r of report.shipped) console.log(`  ${r.old} -> ${r.new}   ${r.v}`);
console.log(`\nFlagged:`);
for (const r of report.flagged) console.log(`  ${r.v}\n     ${r.note}`);
