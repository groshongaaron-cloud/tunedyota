// Pure builders for the monthly OTT commission submission (Track A). Turns
// completed-calibration bookings into OTT's mandatory 14-column submission,
// renders it as a filled .xlsx, and renders the owner-draft + OTT cover emails.
// No I/O. Commission is resolved by lib/ott-commission.js; the owner confirms
// every amount on the draft (rule #1), so an unresolved amount is left blank +
// flagged rather than guessed. Format: docs/ott/README.md.
const { deriveVehicle, lookupCommission } = require("./ott-commission.js");
const { buildXlsx } = require("./xlsx-writer.js");
const { INSTALLERS } = require("./routing.js");

// OTT requires the retailer tagged per installer: "Tuned Yota - <first name>"
// (Aaron / Cody / Noah), derived from the booking's Installer. Unknown/blank
// installer falls back to the plain retailer name.
function retailerFor(booking, fallback) {
  const key = Array.isArray(booking.Installer) ? booking.Installer[0] : booking.Installer;
  const inst = key && INSTALLERS[key];
  return inst ? `${fallback} - ${inst.name.split(" ")[0]}` : fallback;
}

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

// The month to report = the month before `now` (the draft fires on the 1st).
function priorMonth(now = new Date()) {
  const y = now.getUTCFullYear(), m = now.getUTCMonth();
  const py = m === 0 ? y - 1 : y, pm = m === 0 ? 11 : m - 1;
  return { key: `${py}-${String(pm + 1).padStart(2, "0")}`, label: `${MONTHS[pm]} ${py}`, year: py, month: pm + 1 };
}
function monthFromKey(key) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(key == null ? "" : key));
  if (!m) return null;
  const y = +m[1], mo = +m[2];
  if (mo < 1 || mo > 12) return null;
  return { key: `${m[1]}-${m[2]}`, label: `${MONTHS[mo - 1]} ${y}`, year: y, month: mo };
}

const DEFAULT_OTT_RECIPIENTS = ["info@overlandtailor.com", "hgobbels@me.com"];
function recipients(env = {}) {
  return env.OTT_REPORT_TO
    ? String(env.OTT_REPORT_TO).split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_OTT_RECIPIENTS.slice();
}

const monthOf = (iso) => String(iso == null ? "" : iso).slice(0, 7);

// OTT's mandatory submission columns, in exact order (Master OTT Tracker).
const SUBMISSION_HEADERS = [
  "Date of Submission", "Date Calibration Applied", "OTT Retailer", "Customer First Last Name",
  "VIN", "Vehicle Year", "Vehicle Type", "Engine Size", "ECU ID", "Gear Size", "Mileage",
  "Tuning Platform", "Calibration Type", "Commission",
];

// One submission row per completed calibration in the target month. Vehicle
// Type/Year/Engine are derived from the booking's vehicle text; the rest come
// from the installer's close-out; Commission is auto-resolved (null if unsure).
function buildSubmissionRows(bookings, month, opts = {}) {
  const retailer = opts.retailer || "Tuned Yota";
  const sendDate = opts.sendDate || "";
  const out = [];
  for (const b of bookings || []) {
    if (String(b.Status || "").trim().toLowerCase() !== "completed") continue;
    const tier = String(b["OTT Calibration"] || "").trim();
    if (!tier) continue;
    const calDate = b["Calibration Date"] || "";
    if (monthOf(calDate) !== month.key) continue;
    const dv = deriveVehicle(b.Vehicle);
    // Prefer the exact model year captured at booking (the Model Year dropdown)
    // over the year derived from the vehicle text, which is only the platform
    // range's start (e.g. "2016" for a 2016-2023 Tacoma). The exact year is also
    // the better input for the commission lookup's year-range matching. Falls back
    // to the derived year for legacy rows booked before model-year capture.
    const capturedYear = /^(?:19|20)\d{2}$/.test(String(b["Model Year"] == null ? "" : b["Model Year"]).trim())
      ? +String(b["Model Year"]).trim() : null;
    const year = capturedYear || dv.year;
    const tuningPlatform = String(b["Tuning Platform"] || "").trim().toUpperCase();
    const calibrationType = String(b["Calibration Type"] || "").trim();
    const look = lookupCommission({ vehicleType: dv.vehicleType, year, engine: dv.engine, tuningPlatform, calibrationType });
    // The owner's manual Commission Override (saved from the review page) always
    // wins over the auto-resolved amount — including a legitimate $0 (e.g. a COBB
    // Accessport-only row). A blank/non-numeric override falls back to the lookup.
    const ov = b["Commission Override"];
    const overridden = typeof ov === "number" || (typeof ov === "string" && ov.trim() !== "" && !isNaN(Number(ov)));
    const commission = overridden ? Number(ov) : look.commission;
    out.push({
      recordId: b.id || "", dateOfSubmission: sendDate, dateCalibrationApplied: calDate, ottRetailer: retailerFor(b, retailer),
      customer: b.Name || "", vin: String(b.VIN || "").toUpperCase(),
      vehicleYear: year || "", vehicleType: dv.vehicleType || "", engineSize: dv.engine || "",
      ecuId: String(b["ECU ID"] || "").toUpperCase(), gearSize: b["Gear Size"] || "",
      mileage: (b.Mileage === 0 || b.Mileage) ? Number(b.Mileage) : "",
      tuningPlatform, calibrationType, commission,
      _confidence: look.confidence, _candidates: look.candidates, _tier: tier,
      _autoCommission: look.commission, _overridden: overridden,
    });
  }
  out.sort((a, b) => String(a.dateCalibrationApplied).localeCompare(String(b.dateCalibrationApplied)) || String(a.customer).localeCompare(String(b.customer)));
  return out;
}

// Bookings that are overdue for close-out: an event whose date has already
// passed but the installer hasn't marked Completed (and it isn't Cancelled/
// No-show). This is the owner's "chase list" — never submitted to OTT. Returns
// installerKey raw; the caller resolves the display name/region.
const NON_OPEN = new Set(["completed", "cancelled", "no-show"]);
function daysBetween(fromISO, toISO) {
  const a = Date.parse(`${fromISO}T00:00:00Z`), b = Date.parse(`${toISO}T00:00:00Z`);
  return (Number.isNaN(a) || Number.isNaN(b)) ? "" : Math.round((b - a) / 86400000);
}
function buildOpenBookings(bookings, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const out = [];
  for (const b of bookings || []) {
    if (NON_OPEN.has(String(b.Status || "").trim().toLowerCase())) continue;
    const event = String(b["Event Date"] || "").slice(0, 10);
    if (!event || event >= today) continue;                 // overdue only: event in the past
    out.push({
      recordId: b.id || "", customer: b.Name || "",
      vehicle: String(b.Vehicle || "").split(/\s*·\s*/)[0].trim(),   // drop the "what are you after?" goals
      city: b.City || "", eventDate: event,
      installerKey: Array.isArray(b.Installer) ? b.Installer[0] : (b.Installer || ""),
      status: b.Status || "Booked", daysOverdue: daysBetween(event, today),
    });
  }
  out.sort((a, b) => String(a.installerKey).localeCompare(String(b.installerKey))
    || String(a.eventDate).localeCompare(String(b.eventDate))
    || String(a.customer).localeCompare(String(b.customer)));
  return out;
}

function rowToArray(r) {
  return [r.dateOfSubmission, r.dateCalibrationApplied, r.ottRetailer, r.customer, r.vin,
    r.vehicleYear, r.vehicleType, r.engineSize, r.ecuId, r.gearSize, r.mileage,
    r.tuningPlatform, r.calibrationType, (r.commission == null ? "" : r.commission)];
}
// Filled .xlsx in OTT's exact 14-column order. Returns a Buffer. Per OTT's
// reporting standard, a GRAND TOTAL of the Commission column (N) is written two
// rows below the last record (one blank spacer row, then the total).
function renderOttXlsx(subRows) {
  const rows = [SUBMISSION_HEADERS, ...subRows.map(rowToArray)];
  if (subRows.length) {
    const total = new Array(SUBMISSION_HEADERS.length).fill("");
    total[12] = "GRAND TOTAL";                 // column M label
    total[13] = totalCommission(subRows);      // column N — Commission grand total
    rows.push(new Array(SUBMISSION_HEADERS.length).fill(""));   // blank spacer row
    rows.push(total);
  }
  return buildXlsx("OTT Commissions", rows);
}

function totalCommission(subRows) { return subRows.reduce((s, r) => s + (typeof r.commission === "number" ? r.commission : 0), 0); }
function unresolved(subRows) { return subRows.filter((r) => r.commission == null); }

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function subTable(subRows) {
  const head = ["Date", "Customer", "VIN", "Vehicle", "Platform", "Cal Type", "Commission"];
  let h = `<table style="border-collapse:collapse;font-size:13px"><tr>${head.map((x) => `<th style="text-align:left;border-bottom:2px solid #3A2E26;padding:4px 12px 4px 0">${esc(x)}</th>`).join("")}</tr>`;
  for (const r of subRows) {
    const veh = [r.vehicleYear, r.vehicleType, r.engineSize].filter(Boolean).join(" ") || "—";
    const com = r.commission == null ? `<span style="color:#8a2a2a">— confirm</span>` : `$${r.commission}`;
    h += `<tr>${[r.dateCalibrationApplied, r.customer, r.vin || "—", veh, r.tuningPlatform || "—", r.calibrationType || "—", com].map((c) => `<td style="padding:3px 12px 3px 0;border-bottom:1px solid #eee">${esc(c)}</td>`).join("")}</tr>`;
  }
  return h + "</table>";
}

function renderOwnerDraftHtml(subRows, month, approveUrl) {
  const u = unresolved(subRows), total = totalCommission(subRows);
  let html = `<div style="font-family:Arial,sans-serif;color:#3A2E26;max-width:820px">`;
  html += `<h1 style="color:#3A2E26">OTT Commission Submission — DRAFT for your approval</h1>`;
  html += `<p style="color:#7c8472">${esc(month.label)} · ${subRows.length} calibration${subRows.length === 1 ? "" : "s"} · commission total <strong>$${total}</strong></p>`;
  html += `<p><strong>Nothing has been sent to OTT yet.</strong> Review the attached workbook (OTT's exact 14-column format) or open the online review to check it, download the Excel, and send.</p>`;
  if (u.length) html += `<p style="color:#8a2a2a"><strong>${u.length} row(s) need a commission confirmed</strong> — the amount was ambiguous or the platform was bench (BB). Fill those cells in the attached .xlsx before submitting, or fix the close-out data.</p>`;
  html += `<p style="margin:18px 0"><a href="${esc(approveUrl)}" style="background:#5B4B42;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700">Review &amp; send to OTT</a></p>`;
  html += `<p style="color:#7c8472;font-size:13px">This review link is private to you — do not forward it. Vehicle Type/Year/Engine are auto-derived; verify them in the sheet.</p>`;
  html += subTable(subRows);
  html += `</div>`;
  return html;
}

function renderOttEmailHtml(subRows, month) {
  const total = totalCommission(subRows);
  let html = `<div style="font-family:Arial,sans-serif;color:#3A2E26;max-width:820px">`;
  html += `<h1 style="color:#3A2E26">Tuned Yota — OTT Commission Submission</h1>`;
  html += `<p style="color:#7c8472">${esc(month.label)} · ${subRows.length} completed calibration${subRows.length === 1 ? "" : "s"} · commission total <strong>$${total}</strong></p>`;
  html += `<p>Tuned Yota, an authorized Overland Tailor Tune installer, submits the following completed calibrations for ${esc(month.label)}. The full submission is attached as a workbook in OTT's standard 14-column format.</p>`;
  html += subTable(subRows);
  html += `</div>`;
  return html;
}

module.exports = {
  priorMonth, monthFromKey, recipients, SUBMISSION_HEADERS,
  buildSubmissionRows, buildOpenBookings, renderOttXlsx, renderOwnerDraftHtml, renderOttEmailHtml,
  totalCommission, unresolved, subTable,
};
