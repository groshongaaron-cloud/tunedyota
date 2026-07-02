// Annual OTT calibration rollup — Tuned Yota INTERNAL (Track C). Aggregates a
// calendar year of completed calibrations into cost totals + breakdowns and a
// two-sheet workbook (Summary + Detail). Private to info@tunedyota.com — never
// sent to OTT. Recomputed from Airtable Bookings (the source of truth), so it
// always agrees with the monthly submissions. No I/O.
const { deriveVehicle, lookupCommission } = require("./ott-commission.js");
const { keyToInstaller } = require("./routing.js");
const { buildWorkbook } = require("./xlsx-writer.js");

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const normInstaller = (v) => (Array.isArray(v) ? v[0] : v);

function groupSum(items, keyFn) {
  const m = new Map();
  for (const it of items) {
    const k = keyFn(it) || "—";
    const g = m.get(k) || { name: k, count: 0, commission: 0 };
    g.count++; g.commission += (typeof it.commission === "number" ? it.commission : 0);
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.commission - a.commission || b.count - a.count);
}

// Build the annual rollup for `year` from flattened bookings.
function buildAnnual(bookings, year) {
  const yr = String(year);
  const detail = [];
  for (const b of bookings || []) {
    if (String(b.Status || "").trim().toLowerCase() !== "completed") continue;
    const tier = String(b["OTT Calibration"] || "").trim();
    if (!tier) continue;
    const calDate = b["Calibration Date"] || "";
    if (String(calDate).slice(0, 4) !== yr) continue;
    const dv = deriveVehicle(b.Vehicle);
    const tuningPlatform = String(b["Tuning Platform"] || "").trim().toUpperCase();
    const calibrationType = String(b["Calibration Type"] || "").trim();
    const look = lookupCommission({ vehicleType: dv.vehicleType, year: dv.year, engine: dv.engine, tuningPlatform, calibrationType });
    detail.push({
      calibrationDate: calDate, customer: b.Name || "", vin: String(b.VIN || "").toUpperCase(),
      vehicleYear: dv.year || "", vehicleType: dv.vehicleType || "", engineSize: dv.engine || "",
      installer: keyToInstaller(normInstaller(b.Installer)).name, tuningPlatform, calibrationType,
      tier, commission: look.commission, month: +String(calDate).slice(5, 7) || 0,
    });
  }
  detail.sort((a, b) => String(a.calibrationDate).localeCompare(String(b.calibrationDate)) || String(a.customer).localeCompare(String(b.customer)));
  const totalCommission = detail.reduce((s, r) => s + (typeof r.commission === "number" ? r.commission : 0), 0);
  const unresolvedCount = detail.filter((r) => r.commission == null).length;
  const byMonth = MONTHS.map((label, i) => {
    const rows = detail.filter((r) => r.month === i + 1);
    return { name: label, count: rows.length, commission: rows.reduce((s, r) => s + (typeof r.commission === "number" ? r.commission : 0), 0) };
  });
  return {
    year: +year, count: detail.length, totalCommission, unresolvedCount, byMonth,
    byInstaller: groupSum(detail, (r) => r.installer),
    byVehicleType: groupSum(detail, (r) => r.vehicleType),
    byTuningPlatform: groupSum(detail, (r) => r.tuningPlatform),
    byCalibrationType: groupSum(detail, (r) => r.calibrationType),
    detail,
  };
}

const DETAIL_HEADERS = ["Calibration Date", "Customer", "VIN", "Vehicle Year", "Vehicle Type", "Engine Size", "Installer", "Tuning Platform", "Calibration Type", "Calibration Tier", "OTT Commission"];
function detailRow(r) {
  return [r.calibrationDate, r.customer, r.vin, r.vehicleYear, r.vehicleType, r.engineSize, r.installer, r.tuningPlatform, r.calibrationType, r.tier, (r.commission == null ? "" : r.commission)];
}
function renderAnnualXlsx(a) {
  const sum = [];
  sum.push(["Tuned Yota — OTT Calibration Annual Rollup"]);
  sum.push(["Year", a.year]);
  sum.push(["Total calibrations", a.count]);
  sum.push(["Total OTT commission ($)", a.totalCommission]);
  sum.push(["Rows needing commission confirmation", a.unresolvedCount]);
  sum.push([]);
  const section = (title, rows) => { sum.push([title, "Calibrations", "Commission ($)"]); for (const g of rows) sum.push([g.name, g.count, g.commission]); sum.push([]); };
  section("By month", a.byMonth);
  section("By installer", a.byInstaller);
  section("By vehicle type", a.byVehicleType);
  section("By tuning platform", a.byTuningPlatform);
  section("By calibration type", a.byCalibrationType);
  const detail = [DETAIL_HEADERS, ...a.detail.map(detailRow)];
  return buildWorkbook([{ name: "Summary", aoa: sum }, { name: "Detail", aoa: detail }]);
}

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function table(title, rows) {
  let h = `<h2 style="font-family:Arial;color:#5B4B42;margin:16px 0 4px">${esc(title)}</h2><table style="border-collapse:collapse;font-size:13px"><tr><th style="text-align:left;border-bottom:2px solid #3A2E26;padding:3px 14px 3px 0"></th><th style="text-align:right;border-bottom:2px solid #3A2E26;padding:3px 14px 3px 0">Calibrations</th><th style="text-align:right;border-bottom:2px solid #3A2E26;padding:3px 0">Commission</th></tr>`;
  for (const g of rows) if (g.count) h += `<tr><td style="padding:2px 14px 2px 0">${esc(g.name)}</td><td style="text-align:right;padding:2px 14px 2px 0">${g.count}</td><td style="text-align:right;padding:2px 0">$${g.commission}</td></tr>`;
  return h + "</table>";
}
function renderAnnualEmailHtml(a) {
  let html = `<div style="font-family:Arial,sans-serif;color:#3A2E26;max-width:760px">`;
  html += `<h1 style="color:#3A2E26">Tuned Yota — OTT Calibration Annual Rollup</h1>`;
  html += `<p style="color:#7c8472"><strong>${a.year}</strong> · ${a.count} calibration${a.count === 1 ? "" : "s"} · OTT commission total <strong>$${a.totalCommission}</strong>${a.unresolvedCount ? ` · ${a.unresolvedCount} need confirmation` : ""}</p>`;
  html += `<p style="color:#7c8472;font-size:13px">Private to Tuned Yota — this is not sent to OTT. Full detail in the attached workbook (Summary + Detail sheets).</p>`;
  html += table("By month", a.byMonth);
  html += table("By installer", a.byInstaller);
  html += table("By vehicle type", a.byVehicleType);
  html += table("By tuning platform", a.byTuningPlatform);
  html += table("By calibration type", a.byCalibrationType);
  html += `</div>`;
  return html;
}

module.exports = { buildAnnual, renderAnnualXlsx, renderAnnualEmailHtml, DETAIL_HEADERS };
