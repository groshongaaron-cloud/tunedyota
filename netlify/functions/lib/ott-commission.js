// OTT commission engine: derive the OTT-submission vehicle basics from a booking's
// free-text vehicle, and resolve the OTT Commission owed from the April price sheet
// (ott-commission-template.json). Pure, no I/O. The owner confirms every amount on
// the monthly draft, so an ambiguous lookup returns candidates rather than guessing.
const TEMPLATE = require("./ott-commission-template.json");

// --- OTT Vehicle Type — the exact picklist from Policy 0012 (capitalization and
// spacing matter; "RAV 4" has a space). Order matters: match specific before general.
const VTYPE_PATTERNS = [
  [/\bfj\s*cruiser\b/i, "FJ Cruiser"],
  [/\b4\s*runner\b|\b4runner\b/i, "4Runner"],
  [/\bgx\s*470\b/i, "GX470"],
  [/\bgx\s*460\b/i, "GX460"],
  [/\blx\s*570\b/i, "LX570"],
  [/\bland\s*cruiser\b|\blc250\b/i, "Land Cruiser"],
  [/\bsequoia\b/i, "Sequoia"],
  [/\btundra\b/i, "Tundra"],
  [/\btacoma\b/i, "Tacoma"],
  [/\bhighlander\b/i, "Highlander"],
  [/\brav\s*4\b/i, "RAV 4"],      // Policy 0012 spells it with a space
  [/\bes\s*350\b/i, "ES350"],
  [/\bls\s*460\b/i, "LS460"],
  [/\bcamry\b/i, "Camry"],
];
function vehicleType(s) {
  const t = String(s == null ? "" : s);
  for (const [re, v] of VTYPE_PATTERNS) if (re.test(t)) return v;
  return "";
}
function vehicleYear(s) {
  const m = /\b(19|20)\d{2}\b/.exec(String(s == null ? "" : s));
  return m ? +m[0] : null;
}
// Engine size as Policy 0012 writes it: 2.4T / 2.4TH for the turbo(-hybrid) 2.4L
// trucks, otherwise the plain "X.X" litre figure (no extra zeros). The 2.4L on
// OTT-supported platforms is always forced-induction: TH = Turbo Hybrid (iForce
// Max), else T = Turbo (gas).
function engineSize(s) {
  const t = String(s == null ? "" : s);
  // Any 2.4L form (raw "2.4", "2.4L-T", or an already-normalized "2.4T"/"2.4TH")
  // maps to 2.4T / 2.4TH — idempotent so the value round-trips through the
  // commission lookup (a 4th Gen Tacoma resolved to nothing before this).
  if (/2\.4/.test(t)) {
    return /hybrid|iforce\s*max|2\.4\s*l?-?th\b|2\.4th\b/i.test(t) ? "2.4TH" : "2.4T";
  }
  const m = /(\d\.\d)\s*L?/i.exec(t);
  return m ? m[1] : "";
}
function deriveVehicle(vehicleStr) {
  return { vehicleType: vehicleType(vehicleStr), year: vehicleYear(vehicleStr), engine: engineSize(vehicleStr) };
}

// --- price-sheet row matching ---
// Tab title -> OTT Vehicle Type (for tabs whose type isn't in the Model text).
const TAB_VTYPE = {
  "4th Gen Tacoma": "Tacoma", "3rd Gen Tacoma": "Tacoma", "2nd Gen Tacoma": "Tacoma",
  "6th Gen 4Runner": "4Runner", "5th Gen 4Runner": "4Runner", "4th Gen 4Runner": "4Runner",
  "FJ Cruiser": "FJ Cruiser", "Tundra": "Tundra", "Sequoia": "Sequoia",
  "LC250 Land Cruiser": "Land Cruiser", "Land Cruiser-Lexus LX": "Land Cruiser",
  "Highlander": "Highlander", "Camry-ES350-Sienna": "Camry",
  // GX460-470 resolves per row (Model names "GX 460" / "GX 470"); RAV4/RX350/LS460 aren't
  // on the 12-value submission list, so they're intentionally absent here.
};
function rowVehicleType(tab, model) {
  if (/gx\s*470/i.test(model)) return "GX470";
  if (/gx\s*460/i.test(model)) return "GX460";
  return TAB_VTYPE[tab] || "";
}
function yearMatches(range, y) {
  if (!y) return true;                                   // unknown year: don't exclude
  const r = String(range == null ? "" : range).trim();
  if (/^all$/i.test(r)) return true;
  const plus = /^(\d{4})\s*\+$/.exec(r);
  if (plus) return y >= +plus[1];
  const span = /(\d{4})\s*[-–—]\s*(\d{4})/.exec(r);
  if (span) return y >= +span[1] && y <= +span[2];
  const one = /(\d{4})/.exec(r);
  if (one) return y === +one[1];
  return true;
}
function engMatches(rowEngine, inEngine) {
  if (!inEngine) return true;
  return engineSize(rowEngine) === engineSize(inEngine);
}
// coarse platform (VFT/HPT/PCM/BB) -> granular "Tuning Platform" prefix on the sheet
const FAMILY = { VFT: /^vftuner/i, HPT: /^hp\s*tuners/i, PCM: /^pcm/i };
function platformMatches(rowTP, coarse) {
  const re = FAMILY[String(coarse || "").toUpperCase()];
  if (!re) return false;                                 // BB (bench) has no granular rows -> no auto-match
  return re.test(String(rowTP || "").trim());
}
// Calibration Type -> which granular variant / Model the row must be.
function calibrationMatches(row, calType) {
  const tp = String(row["Tuning Platform"] || "");
  const model = String(row.Model || "");
  const isMaf = /maf\s*scale/i.test(tp) || /\bmaf\b/i.test(model);
  const isCustom = /custom/i.test(tp);
  const isSuper = /supercharg/i.test(model);
  switch (String(calType || "").trim().toLowerCase()) {
    case "basic": return !isMaf && !isCustom && !isSuper;
    case "maf":
    case "basic + maf": return isMaf && !isSuper;
    case "custom": return isCustom && !isSuper;
    case "supercharger": return isSuper;
    case "carb update": return /ce update|carb/i.test(model);
    case "": return true;                                // unknown -> don't filter on it
    default: return true;                                // 9.2 / TCM / K-Line etc. handled by owner confirm
  }
}

function allRows() {
  const out = [];
  for (const [tab, p] of Object.entries(TEMPLATE.platforms || {})) {
    for (const r of p.rows || []) out.push({ tab, ...r });
  }
  return out;
}

// Resolve the OTT Commission for a completed calibration. Returns
// { commission, confidence, candidates }. commission is a number when a single
// amount is implied, else null (owner picks on the draft).
function lookupCommission({ vehicleType: vt, year, engine, tuningPlatform, calibrationType } = {}) {
  const rows = allRows().filter((r) =>
    (!vt || rowVehicleType(r.tab, r.Model) === vt) &&
    yearMatches(r.Year, year) &&
    engMatches(r.Engine, engine) &&
    platformMatches(r["Tuning Platform"], tuningPlatform) &&
    calibrationMatches(r, calibrationType));
  const amounts = [...new Set(rows.map((r) => r["OTT Commission"]))];
  const candidates = rows.map((r) => ({ tab: r.tab, model: r.Model, year: r.Year, engine: r.Engine, tuningPlatform: r["Tuning Platform"], commission: r["OTT Commission"] }));
  if (amounts.length === 1) return { commission: amounts[0], confidence: rows.length === 1 ? "exact" : "single-amount", candidates };
  return { commission: null, confidence: amounts.length ? "ambiguous" : "none", candidates };
}

// Selectable commission tiers for a vehicle, most-likely (default) first. 4th Gen
// Tacoma (2024+, 2.4T/2.4TH, VFT — we don't do COBB) defaults to Stage 1 and lets
// the owner pick the customs. Amounts from the 4th Gen Tacoma price-sheet tab.
// Empty array → no tier picker (commission comes from the normal lookup/override).
function commissionCandidates({ vehicleType, engine, year, tuningPlatform } = {}) {
  const y = Number(year), eng = engineSize(engine);
  const tp = String(tuningPlatform == null ? "VFT" : tuningPlatform).toUpperCase();
  if (vehicleType === "Tacoma" && (eng === "2.4T" || eng === "2.4TH") && y >= 2024 && tp !== "COBB") {
    return [
      { label: "Stage 1", amount: 160 },
      { label: "Stage 1 Custom", amount: 250 },
      { label: "Stage 3 Custom", amount: 350 },
    ];
  }
  return [];
}

module.exports = { deriveVehicle, vehicleType, vehicleYear, engineSize, lookupCommission, commissionCandidates };
