// Pure builders for the monthly OTT commission submission (Track A). Turns
// completed-calibration bookings into OTT's mandatory 14-column submission,
// renders it as a filled .xlsx, and renders the owner-draft + OTT cover emails.
// No I/O. Commission is resolved by lib/ott-commission.js; the owner confirms
// every amount on the draft (rule #1), so an unresolved amount is left blank +
// flagged rather than guessed. Format: docs/ott/README.md.
const { deriveVehicle, lookupCommission, commissionCandidates } = require("./ott-commission.js");
const { buildXlsx } = require("./xlsx-writer.js");
const { INSTALLERS } = require("./routing.js");
const { ecuCandidates, defaultGear, is3rdGenTacoma35 } = require("./ecu-ids.js");

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

// OTT's mandatory submission columns, in exact order (Policy 0012, v1.2). The
// 15th "Notes" column is required after Commission (MAF Scale, supercharger type,
// bench flash, free-form, etc.).
const SUBMISSION_HEADERS = [
  "Date of Submission", "Date Calibration Applied", "OTT Retailer", "Customer First Last Name",
  "VIN", "Vehicle Year", "Vehicle Type", "Engine Size", "ECU ID", "Gear Size", "Mileage",
  "Tuning Platform", "Calibration Type", "Commission", "Notes",
];

// Policy 0012: Commission shown with a "$" and two decimals ("$110.00"), "$0.00"
// for free/no-charge. A null (unresolved) amount stays blank for the owner to fill.
function fmtCommission(c) { return c == null || c === "" ? "" : `$${Number(c).toFixed(2)}`; }
// Policy 0012: Gear Size to two decimals (3.90, 4.30 …) or a word like "Stock".
function fmtGear(g) {
  const s = String(g == null ? "" : g).trim();
  return s !== "" && !isNaN(Number(s)) ? Number(s).toFixed(2) : s;
}

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
    const calibrationType = String(b["Calibration Type"] || "").trim();
    // A completed calibration is reportable once it carries EITHER the customer
    // tier (from the funnel close-out) OR the OTT Calibration Type (from a direct/
    // reconciled entry). Both empty → not yet closed out, skip.
    if (!tier && !calibrationType) continue;
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
    const look = lookupCommission({ vehicleType: dv.vehicleType, year, engine: dv.engine, tuningPlatform, calibrationType });
    // The owner's manual Commission Override (saved from the review page) always
    // wins over the auto-resolved amount — including a legitimate $0 (e.g. a COBB
    // Accessport-only row). A blank/non-numeric override falls back to the lookup.
    const ov = b["Commission Override"];
    const overridden = typeof ov === "number" || (typeof ov === "string" && ov.trim() !== "" && !isNaN(Number(ov)));
    // Selectable commission tiers (4th Gen Tacoma: Stage 1 / Stage 1 Custom / Stage
    // 3 Custom). When present, the default is the first tier (Stage 1).
    const commCands = commissionCandidates({ vehicleType: dv.vehicleType, engine: dv.engine, year, tuningPlatform });
    const commission = overridden ? Number(ov) : (commCands.length ? commCands[0].amount : look.commission);
    // ECU ID: prefer what the installer entered; otherwise auto-fill the most-likely
    // candidate for the model+year (Auto). Gear Size: prefer entered; else the owner
    // default rule. Both are editable/overridable on the console.
    const veh = { vehicleType: dv.vehicleType, engine: dv.engine, year };
    const storedEcu = String(b["ECU ID"] || "").trim().toUpperCase();
    const ecuCands = ecuCandidates(veh);
    const ecuId = storedEcu || (ecuCands[0] ? ecuCands[0].id : "");
    const storedGear = fmtGear(b["Gear Size"]);
    const gearSize = storedGear || defaultGear(veh);
    out.push({
      recordId: b.id || "", dateOfSubmission: sendDate, dateCalibrationApplied: calDate, ottRetailer: retailerFor(b, retailer),
      customer: b.Name || "", vin: String(b.VIN || "").toUpperCase(),
      vehicle: String(b.Vehicle || "").split(/\s*·\s*/)[0].trim(),   // raw string (goals dropped), editable on the console
      vehicleYear: year || "", vehicleType: dv.vehicleType || "", engineSize: dv.engine || "",
      ecuId, gearSize,
      mileage: (b.Mileage === 0 || b.Mileage) ? Number(b.Mileage) : "",
      tuningPlatform, calibrationType, commission, notes: String(b.Notes || "").trim(),
      _confidence: look.confidence, _candidates: look.candidates, _tier: tier,
      _autoCommission: look.commission, _overridden: overridden, _commCandidates: commCands,
      _ecuCandidates: ecuCands, _ecuAuto: !storedEcu && !!ecuId,
      _gearAuto: !storedGear, _is3gt: is3rdGenTacoma35(veh),   // section = 3.5L only
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
// The platform year span from a vehicle string, so the overdue form can offer a
// model-year picker: "2016-2023 …" → {lo:2016,hi:2023}; "2024+ …" → {lo:2024,hi:now}.
function parseYearRange(s, now = new Date()) {
  const t = String(s == null ? "" : s);
  let m = t.match(/((?:19|20)\d{2})\s*(?:-|–|—|to)\s*((?:19|20)\d{2})/i);
  if (m) return { lo: Math.min(+m[1], +m[2]), hi: Math.max(+m[1], +m[2]) };
  m = t.match(/((?:19|20)\d{2})\s*\+/);
  if (m) return { lo: +m[1], hi: now.getUTCFullYear() };
  m = t.match(/\b((?:19|20)\d{2})\b/);
  if (m) return { lo: +m[1], hi: +m[1] };
  return { lo: null, hi: null };
}
function buildOpenBookings(bookings, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const out = [];
  for (const b of bookings || []) {
    if (NON_OPEN.has(String(b.Status || "").trim().toLowerCase())) continue;
    const event = String(b["Event Date"] || "").slice(0, 10);
    if (!event || event >= today) continue;                 // overdue only: event in the past
    const vehicle = String(b.Vehicle || "").split(/\s*·\s*/)[0].trim();   // drop the "what are you after?" goals
    const dv = deriveVehicle(vehicle);
    const yr = parseYearRange(vehicle, now);
    const my = String(b["Model Year"] == null ? "" : b["Model Year"]).trim();
    out.push({
      recordId: b.id || "", customer: b.Name || "", vehicle,
      vehicleType: dv.vehicleType || "", engine: dv.engine || "",
      yearLo: yr.lo, yearHi: yr.hi, modelYear: /^(?:19|20)\d{2}$/.test(my) ? my : "",
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
    r.tuningPlatform, r.calibrationType, fmtCommission(r.commission), r.notes || ""];
}
// Column widths (Excel character units), in SUBMISSION_HEADERS order, so every
// column is legible without manual resizing in OTT's copy.
const COL_WIDTHS = [18, 22, 20, 24, 20, 12, 13, 12, 11, 10, 11, 16, 17, 13, 34];
// Filled .xlsx in OTT's exact 15-column order (Policy 0012). Two sections, each
// ordered by Date Calibration Applied: (1) 3rd Gen Tacoma 3.5L, then TWO blank
// spacer rows, then (2) all other vehicles. A GRAND TOTAL of Commission (col N)
// sits two rows below the final entry (owner-requested, 2026-07-11).
const byCalDate = (a, b) => String(a.dateCalibrationApplied).localeCompare(String(b.dateCalibrationApplied)) || String(a.customer).localeCompare(String(b.customer));
function renderOttXlsx(subRows) {
  const tacomas = subRows.filter((r) => r._is3gt).slice().sort(byCalDate);
  const others = subRows.filter((r) => !r._is3gt).slice().sort(byCalDate);
  const rows = [SUBMISSION_HEADERS, ...tacomas.map(rowToArray)];
  if (tacomas.length && others.length) {
    rows.push(new Array(SUBMISSION_HEADERS.length).fill(""), new Array(SUBMISSION_HEADERS.length).fill(""));
  }
  rows.push(...others.map(rowToArray));
  // Grand total two rows below the final entry: one blank spacer row, then the
  // total in column N (Commission), labelled in column M.
  if (subRows.length) {
    const total = new Array(SUBMISSION_HEADERS.length).fill("");
    total[12] = "Grand Total";
    total[13] = fmtCommission(totalCommission(subRows));
    rows.push(new Array(SUBMISSION_HEADERS.length).fill(""), total);
  }
  return buildXlsx("OTT Commissions", rows, COL_WIDTHS);
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
  html += `<p><strong>Nothing has been sent to OTT yet.</strong> Review the attached workbook (OTT's exact 15-column format) or open the online review to check it, download the Excel, and send.</p>`;
  if (u.length) html += `<p style="color:#8a2a2a"><strong>${u.length} row(s) need a commission confirmed</strong> — the amount was ambiguous or the platform was bench (BB). Fill those cells in the attached .xlsx before submitting, or fix the close-out data.</p>`;
  html += `<p style="margin:18px 0"><a href="${esc(approveUrl)}" style="background:#5B4B42;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700">Review &amp; send to OTT</a></p>`;
  html += `<p style="color:#7c8472;font-size:13px">This review link is private to you — do not forward it. Vehicle Type/Year/Engine are auto-derived; verify them in the sheet.</p>`;
  html += subTable(subRows);
  html += `</div>`;
  return html;
}

// Cover email to OTT — a short transmittal only. The line-by-line detail lives in
// the attached workbook (OTT's 15-column format), so it is NOT repeated here.
function renderOttEmailHtml(subRows, month) {
  const total = totalCommission(subRows);
  let html = `<div style="font-family:Arial,sans-serif;color:#3A2E26;max-width:820px">`;
  html += `<h1 style="color:#3A2E26">Tuned Yota — OTT Commission Submission</h1>`;
  html += `<p style="color:#7c8472">${esc(month.label)} · ${subRows.length} completed calibration${subRows.length === 1 ? "" : "s"} · commission total <strong>$${total}</strong></p>`;
  html += `<p>Tuned Yota, an authorized Overland Tailor Tuning installer, submits its completed calibrations for ${esc(month.label)}. The full submission — every calibration with its details — is attached as a workbook in OTT's standard 15-column format.</p>`;
  html += `</div>`;
  return html;
}

module.exports = {
  priorMonth, monthFromKey, recipients, SUBMISSION_HEADERS,
  buildSubmissionRows, buildOpenBookings, renderOttXlsx, renderOwnerDraftHtml, renderOttEmailHtml,
  totalCommission, unresolved, subTable,
};
