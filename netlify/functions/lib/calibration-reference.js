// Installer calibration reference (Track B). Resolves a specific Toyota vehicle
// configuration to its calibration ID (Old -> New), governing TSB, and CUW flag.
// Currently seeded with the 5.7L cross-reference; `coverage()` reports which
// platforms/engines are known vs. still pending owner-provided data. Pure, no I/O.
const DATA = require("./calibration-reference-5.7L.json");
const PRICE = require("./ott-commission-template.json");

// Flatten the workbook tabs into rows tagged with their source tab; drop the
// trailing empty row some sheets carry.
function allRows() {
  const out = [];
  for (const [tab, t] of Object.entries(DATA.tabs || {})) {
    for (const r of t.rows || []) {
      if ((r.Model == null || r.Model === "") && (r["New Cal ID"] == null || r["New Cal ID"] === "")) continue;
      out.push({ tab, ...r });
    }
  }
  return out;
}
function models() {
  return [...new Set(allRows().map((r) => r.Model).filter(Boolean))].sort();
}
function years(model) {
  return [...new Set(allRows().filter((r) => !model || r.Model === model).map((r) => r.Year).filter((v) => v != null && v !== ""))]
    .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
}
// Optional-equality: a blank query value matches anything.
const optEq = (q, v) => (q == null || q === "") ? true : String(q).toLowerCase() === String(v == null ? "" : v).toLowerCase();

function lookup(q = {}) {
  return allRows().filter((r) =>
    (!q.model || String(r.Model) === String(q.model)) &&
    (q.year == null || q.year === "" || String(r.Year) === String(q.year)) &&
    optEq(q.drivetrain, r.Drivetrain) &&
    optEq(q.fuelTank, r["Fuel Tank"]) &&
    optEq(q.tow, r.Tow) &&
    optEq(q.flex, r.Flex));
}

const engNorm = (s) => { const m = /(\d\.\d)/.exec(String(s == null ? "" : s)); return m ? m[1] : ""; };

// What the reference knows today vs. what still needs owner-provided cal data.
// Covered = model+engine present in the cross-reference. Pending = every other
// (platform, engine) the business tunes per the OTT price sheet.
function coverage() {
  const rows = allRows();
  const coveredSet = new Set();
  const covered = [];
  for (const r of rows) {
    const key = `${r.Model}|${engNorm(r["Engine Size"])}`;
    if (r.Model && !coveredSet.has(key)) { coveredSet.add(key); covered.push({ model: r.Model, engine: engNorm(r["Engine Size"]) }); }
  }
  const coveredEng = new Set(covered.map((c) => c.engine));      // e.g. {"5.7"}
  const pend = new Map();
  for (const p of Object.values(PRICE.platforms || {})) {
    for (const r of p.rows || []) {
      const e = engNorm(r.Engine);
      if (!e || coveredEng.has(e)) continue;
      const key = `${p.title}|${e}`;
      if (!pend.has(key)) pend.set(key, { platform: p.title, engine: e });
    }
  }
  const pending = [...pend.values()].sort((a, b) => a.platform.localeCompare(b.platform) || a.engine.localeCompare(b.engine));
  return { covered, pending };
}

module.exports = { allRows, models, years, lookup, coverage, DATA };
