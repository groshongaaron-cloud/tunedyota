// Resolve the 4 rows FLAGGED (verified:false / capacity ambiguity) by the
// 2026-07-20 engine-oil + driveline passes. Structural fixes + cross-source-
// verified capacities, applied to site/amsoil-garage.json.
//
// What this does:
//  1. 4Runner 2005-2009 "4.0L V6 / 4.7L V8" mixed row -> SPLIT into per-engine
//     rows (the picker is engine-aware since amsoil-garage-render.js yearOptions).
//     V6: oil 5.5 qt; V8: oil 6.6 qt. Driveline per Blauparts 4Runner guide
//     (engine-specific): front 1.6 both, transfer 1.1 both, rear 2.9 (V6) /
//     3.2 (V8). Corroborated by our verified 5th-gen rows (carried-over axles:
//     1.6/2.9/1.1) and engineoildb/enginehungry/oiltype.net for oil.
//  2. Tundra 2005-2009 4.0L -> SPLIT at the 2006/07 platform break.
//     Oil is 4.8 qt WITH FILTER for BOTH gens (engineoildb 2006+2008,
//     enginehungry 2006+2008, costaoils 2008 — the old 5.5 was a 0.7 qt
//     overfill, the Tacoma/4Runner 1GR-FE spec misapplied to Tundra).
//     2007-2009 driveline: front 2.0 + transfer 1.2 (same XK50 units as the
//     verified 2007-2009 5.7L row; Blauparts 2007-2012), rear 4.8 (Blauparts
//     4.0L/4.6L axle group 4.2-4.8; AMSOIL 9.7 pt = 4.85 for the same axle).
//     2005-2006 driveline: front 1.2 + transfer 1.1 (shared 1st-gen units,
//     verified on the 2000-2009 4.7L row); rear stays UNVERIFIED (V6-specific
//     axle figure is single-source forum only).
//  3. Tacoma 2005-2015 2.7L rear diff 2.0 -> 3.1 qt VERIFIED. Blauparts
//     Tacoma guide lists the 2.7L 4WD rear identical to the 4.0L (2.95-3.5 L);
//     our row models the 4WD config (it lists front diff + transfer), and the
//     verified 4.0L sibling row is 3.1. The old flat "2 qt" was the placeholder.
//  4. Tundra 2010-2017 5.7L -> SPLIT at the 2012/13 transfer-case change
//     (WF0AM -> WF1AM supplier change, tundras.com + Blauparts):
//     2010-2012: transfer 1.2 qt (Blauparts 2007-2012; 2010 owner's-manual
//     quote via tundratalk; same unit verified on our 2007-2009 row),
//     front 2.0, SVL 75W-90 fits.
//     2013-2017: front 2.2 (Blauparts 2013-2021; AMSOIL lookup 4.2 pt = 2.1);
//     transfer case system DELIBERATELY OMITTED — the WF1AM case specs
//     Toyota's dedicated 75W fluid and AMSOIL states no recommendation, so
//     listing SVL 75W-90 with the 1.6 qt capacity would be a wrong-product
//     recommendation. Capacity documented in the reconciliation only.
//
// Fill-to-plug rule (diffs/transfer): capacity = purchase quantity, the plug
// sets the level -> safe to publish at >=2 agreeing sources. Full source URLs
// in scripts/amsoil-flagged-reconciliation.json.
import fs from "node:fs";

const path = "./site/amsoil-garage.json";
const g = JSON.parse(fs.readFileSync(path, "utf8"));
const report = {
  generated: "2026-07-20",
  system: "flagged-row resolution (engine splits + driveline)",
  shipped: [],
  notes: [],
  sources: {
    "4runner-oil-v8-6.6": [
      "https://engineoildb.com/oil-info/2007-toyota-4-runner/ (4.7L 2UZ-FE 6.6 qt w/filter)",
      "https://enginehungry.com/oil-capacity-type/toyota/4runner/2007-toyota-4runner/ (6.6 qt)",
      "https://oiltype.net/car-toyota-4-runner-2007-engine-oil-type-engine-code-2uz-fe-9 (6.6 qt w/filter)"
    ],
    "4runner-oil-v6-5.5": [
      "https://engineoildb.com/oil-info/2007-toyota-4-runner/ (4.0L 1GR-FE 5.5 qt w/filter)",
      "parity: verified Tacoma 2005-2015 4.0L row (same 1GR-FE spec era)"
    ],
    "4runner-driveline": [
      "https://www.blauparts.com/blog/what-type-of-differential-fluid-does-my-toyota-4runner-take.html (2003-2009 engine-specific: front 1.5L/1.58qt both, rear 2.7L/2.85qt V6 vs 3.0L/3.17qt V8, transfer 1.1L/1.16qt both)",
      "parity: verified 4Runner 2010-2019/2020-2024 rows (carried-over driveline: 1.6/2.9/1.1)"
    ],
    "tundra-40l-oil-4.8": [
      "https://engineoildb.com/oil-info/2006-toyota-tundra/ (4.0L 4.8 qt w/filter)",
      "https://engineoildb.com/oil-info/2008-toyota-tundra/ (4.0L 4.8 qt w/filter)",
      "https://enginehungry.com/oil-capacity-type/toyota/tundra/2006-toyota-tundra/ + /2008-toyota-tundra/ (4.8 qt both gens)",
      "https://costaoils.com/2008-toyota-tundra-40l-oil-change-guide/ (4.8 qt w/filter)"
    ],
    "tundra-2nd-gen-driveline": [
      "https://www.blauparts.com/blog/toyota-tundra-differential-fluid-types-specs-fill-capacities.html (front 1.9L/2.0qt 2007-2012, 2.0L/2.2qt 2013-2021; rear 4.0L V6/4.6L V8 4.0-4.6L / 4.2-4.8 qt)",
      "https://www.amsoil.com/lookup/ 2015 Tundra 4.6L (front diff 4.2 pt = 2.1 qt, rear 9.7 pt = 4.85 qt — tie-breaker)",
      "parity: verified Tundra 2007-2009 5.7L row (front 2.0, transfer 1.2) and 2010-2019 4.6L row (front 2.2, rear 4.9)"
    ],
    "tundra-transfer-split": [
      "https://www.blauparts.com/blog/how-to-replace-toyota-tundra-transfer-case-fluid-2007-2021-xk50.html (2007-2012: 1.12L/1.2qt; 2013-2021: 1.5L/1.6qt, cites owner's + factory service manuals)",
      "https://www.tundratalk.net/threads/final-fluid-capacities-off-for-diff-transfer-case-on-2010-tundra-5-7l.773316/ (2010 owner's manual: transfer 1.2 qt)",
      "https://autoreviewnest.com/toyota-tundra-transfer-case-service-interval-guide/ (WF1AM 2013-2021 service info 1.4-1.5 L)",
      "https://www.tundras.com/threads/transfer-case-lubrication-requirements-2014-and-above.10129/ (2013/14 supplier change to Toyota 75W; AMSOIL: no recommendation)",
      "parity: verified Tundra 2018-2021 row (transfer 1.6) and 2007-2009 row (transfer 1.2)"
    ],
    "tacoma-27-rear-3.1": [
      "https://www.blauparts.com/blog/what-type-of-differential-fluid-does-my-toyota-tacoma-take.html (2009-2015 2.7L 4WD rear identical to 4.0L: 2.95-3.5 L / 3.11-3.69 qt)",
      "https://www.blauparts.com/blog/how-to-change-toyota-tacoma-rear-differential-gear-oil-2009-2023.html (2.7L models same range)",
      "parity: verified Tacoma 2005-2015 4.0L row rear 3.1 (shared 8\" axle, 4WD config)"
    ]
  }
};

function rows(make, model) { return g.vehicles[make][model]; }
function sys(row, name) { return row.systems.find((s) => s.system === name); }
function setCap(row, name, cap, verified) {
  const s = sys(row, name);
  if (!s) throw new Error(`missing system ${name}`);
  const old = s.capacity;
  s.capacity = cap;
  if (verified) s.verified = true; else delete s.verified;
  report.shipped.push({ v: `${row._make} ${row._model} | ${row.y} | ${row.e}`, sys: name, old, new: cap, verified: !!verified });
}
function tag(row, make, model) { row._make = make; row._model = model; return row; }
function untag(row) { delete row._make; delete row._model; return row; }
const clone = (o) => JSON.parse(JSON.stringify(o));

// ---- 1. 4Runner 2005-2009: split mixed-engine row ----
{
  const list = rows("Toyota", "4Runner");
  const i = list.findIndex((r) => r.y === "2005-2009");
  if (i < 0 || !/4\.7L/.test(list[i].e)) throw new Error("4Runner 2005-2009 mixed row not found");
  const v6 = tag(clone(list[i]), "Toyota", "4Runner");
  const v8 = tag(clone(list[i]), "Toyota", "4Runner");
  v6.e = "4.0L V6"; v8.e = "4.7L V8";
  v6.verified = true; v8.verified = true;
  setCap(v6, "Engine Oil", 5.5, true);
  setCap(v6, "Front Differential", 1.6, true);
  setCap(v6, "Rear Differential", 2.9, true);
  setCap(v6, "Transfer Case", 1.1, true);
  setCap(v8, "Engine Oil", 6.6, true);
  setCap(v8, "Front Differential", 1.6, true);
  setCap(v8, "Rear Differential", 3.2, true);
  setCap(v8, "Transfer Case", 1.1, true);
  list.splice(i, 1, untag(v6), untag(v8));
  report.notes.push("4Runner 2005-2009 split into 4.0L V6 + 4.7L V8 rows (engine-aware picker). Both fully verified; V8 full-time 4WD shares front/transfer with V6 per Blauparts.");
}

// ---- 2. Tundra 2005-2009 4.0L: split at the 2006/07 platform break ----
{
  const list = rows("Toyota", "Tundra");
  const i = list.findIndex((r) => r.y === "2005-2009" && r.e === "4.0L V6");
  if (i < 0) throw new Error("Tundra 2005-2009 4.0L row not found");
  const g1 = tag(clone(list[i]), "Toyota", "Tundra");
  const g2 = tag(clone(list[i]), "Toyota", "Tundra");
  g1.y = "2005-2006"; g2.y = "2007-2009";
  g1.verified = true; g2.verified = true;
  setCap(g1, "Engine Oil", 4.8, true);
  setCap(g1, "Front Differential", 1.2, true);   // shared 1st-gen unit, verified on 2000-2009 4.7L row
  setCap(g1, "Rear Differential", 3.7, false);   // V6-specific axle single-source -> stays unverified
  setCap(g2, "Engine Oil", 4.8, true);
  setCap(g2, "Front Differential", 2.0, true);   // XK50 unit, verified on 2007-2009 5.7L row + Blauparts
  setCap(g2, "Rear Differential", 4.8, true);    // Blauparts 4.0/4.6 axle group + AMSOIL 4.85
  // transfer case: neither original row listed one; add for 4WD configs
  const tmpl = { system: "Transfer Case", sku: "SVL-QT", unit: "qt", factoryInterval: "severe: inspect", tunedInterval: "30,000 mi" };
  g1.systems.splice(g1.systems.findIndex((s) => s.system === "Transmission"), 0, { ...tmpl, capacity: 1.1, verified: true });
  g2.systems.splice(g2.systems.findIndex((s) => s.system === "Transmission"), 0, { ...tmpl, capacity: 1.2, verified: true });
  report.shipped.push({ v: "Toyota Tundra | 2005-2006 | 4.0L V6", sys: "Transfer Case", old: null, new: 1.1, verified: true });
  report.shipped.push({ v: "Toyota Tundra | 2007-2009 | 4.0L V6", sys: "Transfer Case", old: null, new: 1.2, verified: true });
  list.splice(i, 1, untag(g1), untag(g2));
  report.notes.push("Tundra 2005-2009 4.0L split at the 2006/07 platform break. Oil corrected 5.5 -> 4.8 qt BOTH gens (0.7 qt overfill shipped until now). Transfer Case added (was missing).");
}

// ---- 3. Tacoma 2005-2015 2.7L: rear diff placeholder -> verified ----
{
  const row = rows("Toyota", "Tacoma").find((r) => r.y === "2005-2015" && r.e === "2.7L I4");
  if (!row) throw new Error("Tacoma 2005-2015 2.7L row not found");
  tag(row, "Toyota", "Tacoma");
  setCap(row, "Rear Differential", 3.1, true);
  untag(row);
  report.notes.push("Tacoma 2005-2015 2.7L rear diff 2.0 -> 3.1 qt (4WD config, shares the 4.0L axle). 2WD/PreRunner variants not modeled (row lists front diff + transfer = 4WD).");
}

// ---- 4. Tundra 2010-2017 5.7L: split at the 2012/13 transfer-case change ----
{
  const list = rows("Toyota", "Tundra");
  const i = list.findIndex((r) => r.y === "2010-2017" && r.e === "5.7L V8");
  if (i < 0) throw new Error("Tundra 2010-2017 5.7L row not found");
  const a = tag(clone(list[i]), "Toyota", "Tundra");
  const b = tag(clone(list[i]), "Toyota", "Tundra");
  a.y = "2010-2012"; b.y = "2013-2017";
  setCap(a, "Front Differential", 2.0, true);
  setCap(b, "Front Differential", 2.2, true);
  const tIdx = a.systems.findIndex((s) => s.system === "Transmission");
  a.systems.splice(tIdx, 0, { system: "Transfer Case", sku: "SVL-QT", unit: "qt", capacity: 1.2, factoryInterval: "severe: inspect", tunedInterval: "30,000 mi", verified: true });
  report.shipped.push({ v: "Toyota Tundra | 2010-2012 | 5.7L V8", sys: "Transfer Case", old: null, new: 1.2, verified: true });
  // 2013-2017: WF1AM case wants Toyota's dedicated 75W fluid; AMSOIL has no
  // recommendation -> NO transfer listing (capacity 1.6 qt documented here only).
  list.splice(i, 1, untag(a), untag(b));
  report.notes.push("Tundra 2010-2017 5.7L split at 2012/13 (WF0AM -> WF1AM transfer). 2010-2012 transfer 1.2 qt w/ SVL. 2013-2017: transfer omitted on purpose — Toyota 75W spec, no suitable AMSOIL product (capacity would be 1.6 qt).");
}

fs.writeFileSync(path, JSON.stringify(g, null, 1) + "\n");
fs.writeFileSync("./scripts/amsoil-flagged-reconciliation.json", JSON.stringify(report, null, 1) + "\n");
console.log(`shipped ${report.shipped.length} capacity changes across 7 rows (4 -> 7 via splits)`);
for (const n of report.notes) console.log("-", n);
