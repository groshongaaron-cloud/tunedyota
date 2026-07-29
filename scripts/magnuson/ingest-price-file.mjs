// Ingest Magnuson's "Price File - All Levels" workbook into the committed
// public catalog at site/magnuson-catalog-full.json.
//
// CONFIDENTIALITY BAR: the workbook carries six price levels (Retail/MSP,
// Trade, Jobber, Dealer, Dealer Plus, Distributor). ONLY the Retail/MSP column
// is ever written to the output — the dealer-confidential levels must never
// reach the repo, the site, or the search index (same rule as the AMSOIL
// wholesale sheet). The Discontinued sheet is excluded entirely.
//
// Usage (path defaults to the Dropbox company-files copy):
//   node scripts/magnuson/ingest-price-file.mjs ["C:\\path\\to\\Price File.xlsx"]
import fs from "node:fs";
import XLSX from "xlsx";

const SRC = process.argv[2] ||
  "C:/Users/grosh/Dropbox/Tuned Yota/Company Files/1-Magnuson/Magnuson - Price File - All Levels - July 1st 2026.xlsx";
const OUT = "site/magnuson-catalog-full.json";

const wb = XLSX.readFile(SRC);
const sheet = (n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: null });
const S = (x) => (x === null ? "" : String(x).trim());
const isPart = (s) => /^[A-Z]?\d{2}-\d{2}-\d{2}-\d{3}(-[A-Z]{2})?$/.test(s) || /^MAG-[A-Z0-9-]+$/.test(s);

// Footnote digits trail some detail strings ("Supercharger System 2",
// "… Hot Rod Supercharger Kit 1, 2, 3") — split them off into `notes`.
const NOTE_TEXT = {
  1: "Accessories for engine systems (heat exchanger, intercooler assembly, tensioner, etc.) are sold separately.",
  2: "Calibration is not available for this system/kit.",
  3: "Magnum/Magnum PI Hot Rod superchargers do not include throttle-body adapter or pulley; sold separately.",
  4: "Hot Rod and MOAB kits carry their own pricing structure.",
  5: "Cooling kits, calibration and merchandise carry their own pricing structure.",
};
function splitNotes(detail) {
  const m = detail.match(/^(.*?)\s+(\d(?:\s*,\s*\d)*)$/);
  if (!m) return { text: detail, notes: [] };
  const notes = m[2].split(/\s*,\s*/).map(Number).filter((n) => NOTE_TEXT[n]);
  return notes.length ? { text: m[1].trim(), notes } : { text: detail, notes: [] };
}

// ---- Superchargers sheet: sections delimited by "RETAIL PRICING - MSP" header rows
const scRows = sheet("Superchargers");
const kitsBySku = new Map();
let section = null;
let stopped = false;
for (const r of scRows) {
  const c0 = S(r[0]);
  if (c0 === "NOTES") { stopped = true; }
  if (stopped) continue;
  if (S(r[6]).startsWith("RETAIL PRICING")) { section = c0; continue; }
  if (!section || c0 === "PART NUMBER" || !isPart(c0)) continue;
  const price = typeof r[6] === "number" ? r[6] : null;
  if (price === null) continue;
  const isPack = /Performance Packs/i.test(section);
  const rawDetail = S(isPack ? r[4] : r[5]);
  const { text: detail, notes } = splitNotes(rawDetail);
  const app = { years: S(r[1]), models: S(r[2]), engines: S(r[3]) };
  if (!kitsBySku.has(c0)) {
    kitsBySku.set(c0, {
      sku: c0, section, detail, rotor: isPack ? "" : S(r[4]), retail: price, notes, apps: [],
    });
  }
  kitsBySku.get(c0).apps.push(app);
}

// Lid color options table (below NOTES): sku -> color list
let colorMode = false;
for (const r of scRows) {
  const c0 = S(r[0]);
  if (c0 === "Lid Color Options") { colorMode = true; continue; }
  if (!colorMode || !isPart(c0)) continue;
  const colors = S(r[5]);
  if (colors && kitsBySku.has(c0)) kitsBySku.get(c0).colorOptions = colors;
}

// ---- Parts sheet: sections are "PART NUMBER | <category> | RETAIL PRICING" header rows
const partRows = sheet("Parts");
const parts = [];
let pSection = null;
for (const r of partRows) {
  const c0 = S(r[0]);
  if (c0 === "PART NUMBER") { pSection = S(r[1]); continue; }
  if (c0 === "NOTES") break;
  if (!pSection || !isPart(c0)) continue;
  const price = typeof r[2] === "number" ? r[2] : null;
  if (price === null) continue;
  const { text: name, notes } = splitNotes(S(r[1]));
  parts.push({ sku: c0, section: pSection, name, retail: price, notes });
}

const out = {
  updated: "2026-07-01",
  source: "Magnuson Price File 07.01.26 v1 (retail/MSP level only)",
  superchargers: [...kitsBySku.values()],
  parts,
};

// Hard guard: no dealer-level numbers or labels may survive into the output.
const txt = JSON.stringify(out, null, 1);
for (const banned of ["Trade Pricing", "Jobber", "Dealer Pricing", "Dealer Plus", "Distributor Pricing"]) {
  if (txt.includes(banned)) throw new Error(`wholesale leak: "${banned}" found in output`);
}
fs.writeFileSync(OUT, txt);
console.log(`catalog: ${out.superchargers.length} supercharger SKUs, ${parts.length} parts -> ${OUT}`);
