// Read the filled docs/dealers/dealer-signals.xlsx and write truckVolume +
// enthusiastPosture back into dealers.json (matched by dealer name), then re-score
// and regenerate the pipeline/worksheet views via the shared rescore pass.
//
// Safety: validates every value up front and fails closed (writes nothing) on any
// bad value; a blank cell leaves the current value as-is; unmatched rows are
// reported, never silently dropped. Preserves all other living dealer state.
const fs = require("node:fs");
const path = require("node:path");
const { readXlsx } = require("../netlify/functions/lib/xlsx-reader.js");
const { rescoreAll } = require("./score-dealers.js");

const ROOT = path.join(__dirname, "..");
const REG = path.join(ROOT, "netlify", "functions", "lib", "dealers.json");
const SRC = path.join(ROOT, "docs", "dealers", "dealer-signals.xlsx");

const TRUCK = new Set(["high", "med", "low"]);
const norm = (s) => String(s == null ? "" : s).trim().toLowerCase();

function findKey(keys, re) {
  return keys.find((k) => re.test(k)) || null;
}

// Each parser returns { ok, val }. Blank → ok with val null (no change).
function parseTruck(v) {
  const s = norm(v);
  if (s === "") return { ok: true, val: null };
  return TRUCK.has(s) ? { ok: true, val: s } : { ok: false };
}
function parseEnth(v) {
  const s = norm(v);
  if (s === "") return { ok: true, val: null };
  if (["yes", "y", "true"].includes(s)) return { ok: true, val: true };
  if (["no", "n", "false"].includes(s)) return { ok: true, val: false };
  return { ok: false };
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Missing ${path.relative(ROOT, SRC)} — run: npm run build:signals`);
    process.exit(1);
  }
  const rows = readXlsx(SRC);
  if (!rows.length) {
    console.error("The signals sheet has no data rows.");
    process.exit(1);
  }
  const keys = Object.keys(rows[0]);
  const kName = findKey(keys, /dealer/i);
  const kTruck = findKey(keys, /truck/i);
  const kEnth = findKey(keys, /enthus/i);
  if (!kName || !kTruck || !kEnth) {
    console.error(`Sheet is missing a required column (need Dealer / Truck / Enthusiast).\nFound: ${keys.join(", ")}`);
    process.exit(1);
  }

  const dealers = JSON.parse(fs.readFileSync(REG, "utf8"));
  const byName = new Map(dealers.map((d) => [norm(d.name), d]));

  // Validate everything before mutating anything (fail closed).
  const errors = [];
  const unmatched = [];
  const updates = [];
  for (const r of rows) {
    const name = r[kName];
    const d = byName.get(norm(name));
    if (!d) { unmatched.push(name); continue; }
    const tv = parseTruck(r[kTruck]);
    const en = parseEnth(r[kEnth]);
    if (!tv.ok) errors.push(`${name}: bad Truck Volume "${r[kTruck]}" (allowed: high/med/low)`);
    if (!en.ok) errors.push(`${name}: bad Enthusiast "${r[kEnth]}" (allowed: yes/no)`);
    if (tv.ok && en.ok) updates.push({ d, tv: tv.val, en: en.val });
  }
  if (errors.length) {
    console.error(`Refusing to write — ${errors.length} invalid value(s):`);
    errors.forEach((e) => console.error("  " + e));
    process.exit(1);
  }

  // Apply: blank leaves current value untouched.
  let filled = 0;
  for (const u of updates) {
    if (u.tv !== null) u.d.truckVolume = u.tv;
    if (u.en !== null) u.d.enthusiastPosture = u.en;
    if (u.tv !== null || u.en !== null) filled++;
  }
  fs.writeFileSync(REG, JSON.stringify(dealers, null, 2) + "\n");

  const { counts } = rescoreAll();
  const stillBlank = JSON.parse(fs.readFileSync(REG, "utf8")).filter((d) => d.needsSignal).length;

  console.log(`Ingested ${rows.length - unmatched.length}/${rows.length} rows (${filled} carried a value).`);
  if (unmatched.length) {
    console.log(`⚠ ${unmatched.length} row(s) matched no dealer (check the Dealer column):`);
    unmatched.forEach((n) => console.log("  " + JSON.stringify(n)));
  }
  console.log(`Tiers: A ${counts.A} · B ${counts.B} · C ${counts.C} — ${stillBlank} dealer(s) still need a signal.`);
}

module.exports = { findKey, parseTruck, parseEnth };

if (require.main === module) main();
