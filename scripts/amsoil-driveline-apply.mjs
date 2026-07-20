// Apply cross-source-verified DIFFERENTIAL + TRANSFER-CASE fill capacities to
// site/amsoil-garage.json (per-SYSTEM verified:true). Diffs/transfer are fill-to-
// plug (capacity = purchase quantity; the plug sets the level), so these are safe
// to publish once >=2 independent sources agree on the standard config.
//
// TRANSMISSION is deliberately LEFT UNVERIFIED: every unit here is a sealed/overflow
// design filled to a temperature-controlled level, the "total" is not a service
// amount, and the drain-and-refill figures were mostly single-source. No honest
// single number -> it shows the ATF product but no capacity.
//
// Sources per value: toyota-club.net factory data, Toyota/Lexus FSM, Blauparts,
// engineswork, engineoildb, autopadre, ih8mud/ClubLexus FSM quotes. AMSOIL not a
// primary source. Values are the STANDARD 4WD / open-axle config (the Tuned Yota
// audience); e-locker / 2WD / full-time variants are covered by the owner's-manual
// note on the page.
import fs from "node:fs";

const path = "./site/amsoil-garage.json";
const g = JSON.parse(fs.readFileSync(path, "utf8"));
const report = { generated: "2026-07-20", system: "driveline (diff + transfer)", shipped: [], flagged: [], skipped: [] };

// [make, model, y, e, frontDiffQt|null, rearDiffQt|null, transferQt|null]
// null = do not ship this system for this row (flagged/ambiguous or N/A).
const DATA = [
  // Tacoma
  ["Toyota","Tacoma","2024+","2.4L-T I4",1.4,4.8,1.2],
  ["Toyota","Tacoma","2016-2023","3.5L V6",1.6,3.2,1.1],
  ["Toyota","Tacoma","2016-2023","2.7L I4",1.6,3.2,1.1],
  ["Toyota","Tacoma","2005-2015","4.0L V6",1.6,3.1,1.1],
  ["Toyota","Tacoma","2005-2015","2.7L I4",1.6,null,1.1],   // rear diff: 2WD/4WD ambiguity -> flag
  // 4Runner
  ["Toyota","4Runner","2025+","2.4L-T I4",1.4,5.9,1.2],
  ["Toyota","4Runner","2020-2024","4.0L V6",1.6,2.9,1.1],
  ["Toyota","4Runner","2010-2019","4.0L V6",1.6,2.9,1.1],
  // 4Runner 2005-2009 mixed-engine row -> fully flagged (not listed)
  // FJ Cruiser
  ["Toyota","FJ Cruiser","2010-2014","4.0L V6",1.6,3.2,1.1],
  ["Toyota","FJ Cruiser","2007-2009","4.0L V6",1.6,3.2,1.1],
  ["Toyota","FJ Cruiser","2007-2008","4.0L V6",1.6,3.2,1.1],
  // Tundra
  ["Toyota","Tundra","2022+","3.4L i-FORCE twin-turbo V6",1.4,5.7,2.2],
  ["Toyota","Tundra","2007-2009","5.7L V8",2.0,3.9,1.2],
  ["Toyota","Tundra","2010-2017","5.7L V8",2.0,3.9,null],   // transfer year-splits 2012/13 within row -> flag
  ["Toyota","Tundra","2018-2021","5.7L V8",2.0,3.9,1.6],
  ["Toyota","Tundra","2010-2019","4.6L V8",2.2,4.9,1.6],
  ["Toyota","Tundra","2000-2009","4.7L V8",1.2,3.7,1.1],
  // Tundra 2005-2009 4.0L platform-split row -> flagged (not listed)
  // Sequoia (IRS rear diff -> small carrier, 1.6 qt confirmed x2 sources)
  ["Toyota","Sequoia","2008-2009","5.7L V8",2.2,1.6,1.4],
  ["Toyota","Sequoia","2010-2022","5.7L V8",2.2,1.6,1.4],
  ["Toyota","Sequoia","2010-2019","4.6L V8",2.2,1.6,1.4],
  ["Toyota","Sequoia","2001-2009","4.7L V8",1.2,4.0,1.5],
  // Land Cruiser
  ["Toyota","Land Cruiser","2025+","2.4L-T I4",1.3,5.9,1.5],
  ["Toyota","Land Cruiser","2016-2021","5.7L V8",2.0,4.4,1.5],
  ["Toyota","Land Cruiser","2008-2010","5.7L V8",2.0,4.4,1.5],
  ["Toyota","Land Cruiser","2011-2015","5.7L V8",2.0,4.4,1.5],
  ["Toyota","Land Cruiser","2006-2007","4.7L V8",1.7,3.5,1.4],
  // Lexus GX
  ["Lexus","GX","2019+","4.6L V8",1.5,2.9,1.5],
  ["Lexus","GX","2010-2018","4.6L V8",1.5,2.9,1.5],
  ["Lexus","GX","2005-2009","4.7L V8",1.5,3.3,1.5],
  // Lexus LX570
  ["Lexus","LX570","2008-2009","5.7L V8",2.0,4.4,1.6],
  ["Lexus","LX570","2010-2021","5.7L V8",2.0,4.4,1.6],
  // Lexus LS460 (rear diff only present in data)
  ["Lexus","LS460","2007-2017","4.6L V8",null,1.4,null],
];

const SYS = { fd: "Front Differential", rd: "Rear Differential", tc: "Transfer Case" };

const setSys = (gen, sysName, qt, vlabel) => {
  const s = (gen.systems || []).find((x) => x.system === sysName);
  if (!s) { report.skipped.push(`${vlabel}: no "${sysName}" system`); return; }
  const old = s.capacity;
  s.capacity = qt;
  s.verified = true;
  report.shipped.push({ v: vlabel, sys: sysName, old, new: qt });
};

for (const [mk, md, y, e, fd, rd, tc] of DATA) {
  const gen = g.vehicles[mk]?.[md]?.find((x) => x.y === y && x.e === e);
  const vlabel = `${mk} ${md} | ${y} | ${e}`;
  if (!gen) { report.flagged.push({ v: vlabel, note: "gen NOT FOUND" }); continue; }
  const vals = { fd, rd, tc };
  for (const k of ["fd", "rd", "tc"]) {
    if (vals[k] == null) { report.flagged.push({ v: vlabel, sys: SYS[k], note: "left unverified (ambiguous/split/N-A)" }); continue; }
    setSys(gen, SYS[k], vals[k], vlabel);
  }
}

fs.writeFileSync(path, JSON.stringify(g, null, 1) + "\n");
fs.writeFileSync("./scripts/amsoil-driveline-reconciliation.json", JSON.stringify(report, null, 1) + "\n");

console.log(`Driveline (diff + transfer) pass:`);
console.log(`  ${report.shipped.length} system capacities verified & set`);
console.log(`  ${report.flagged.length} flagged (left verified:false)`);
console.log(`  ${report.skipped.length} skipped (system absent)`);
console.log(`\nSample corrections (old -> new):`);
for (const r of report.shipped.filter((x) => x.old !== x.new).slice(0, 18)) console.log(`  ${String(r.old).padStart(4)} -> ${String(r.new).padStart(4)}  ${r.sys.padEnd(20)} ${r.v}`);
console.log(`\nTransmission: intentionally left UNVERIFIED (sealed/overflow-fill; no honest single capacity).`);
