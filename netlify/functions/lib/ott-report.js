// Pure builder for the monthly OTT completed-calibrations report. No I/O.
// Source: Airtable Bookings rows that were Completed with an OTT Calibration
// recorded (see installer close-out). Feeds functions/ott-report.js.
const { keyToInstaller } = require("./routing.js");
const { certSerial } = require("./certificate.js");

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

// The month to report = the month BEFORE `now`. The function runs on the 1st and
// covers the month that just closed.
function priorMonth(now = new Date()) {
  const y = now.getUTCFullYear(), m = now.getUTCMonth(); // m is 0-based
  const py = m === 0 ? y - 1 : y;
  const pm = m === 0 ? 11 : m - 1;                        // 0-based prior month
  return { key: `${py}-${String(pm + 1).padStart(2, "0")}`, label: `${MONTHS[pm]} ${py}`, year: py, month: pm + 1 };
}

const normInstaller = (v) => (Array.isArray(v) ? v[0] : v); // Airtable may return a multi-select array
const monthOf = (iso) => String(iso == null ? "" : iso).slice(0, 7); // "YYYY-MM"

// Completed OTT calibrations whose Calibration Date falls in the target month.
// `bookings` are flattened records (fields spread + id).
function buildOttRows(bookings, month) {
  const rows = [];
  for (const b of bookings || []) {
    if (String(b.Status || "").trim().toLowerCase() !== "completed") continue;
    const calibration = String(b["OTT Calibration"] || "").trim();
    if (!calibration) continue;                            // certs are held until calibration is set
    const calDate = b["Calibration Date"] || "";
    if (monthOf(calDate) !== month.key) continue;
    const inst = keyToInstaller(normInstaller(b.Installer));
    rows.push({
      serial: certSerial(b.id, calDate, calDate),
      calibrationDate: calDate,
      name: b.Name || "",
      vehicle: b.Vehicle || "",
      vin: String(b.VIN || "").toUpperCase(),
      calibration,
      installer: inst.name,
      region: inst.region,
      city: b.City || "",
    });
  }
  rows.sort((a, b) => String(a.calibrationDate).localeCompare(String(b.calibrationDate)) || a.serial.localeCompare(b.serial));
  return rows;
}

function csvCell(v) { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function renderOttCsv(rows) {
  const head = ["Certificate Serial", "Calibration Date", "Customer", "Vehicle", "VIN", "OTT Calibration", "Installer", "Region"];
  const lines = [head.join(",")];
  for (const r of rows) {
    lines.push([r.serial, r.calibrationDate, r.name, r.vehicle, r.vin, r.calibration, r.installer, r.region].map(csvCell).join(","));
  }
  return lines.join("\n") + "\n";
}

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function ottTable(rows) {
  let html = `<table style="border-collapse:collapse;font-size:13px"><tr>${["Serial", "Date", "Customer", "Vehicle", "VIN", "Calibration", "Installer"].map((h) => `<th style="text-align:left;border-bottom:2px solid #3A2E26;padding:4px 12px 4px 0">${esc(h)}</th>`).join("")}</tr>`;
  for (const r of rows) {
    html += `<tr>${[r.serial, r.calibrationDate, r.name, r.vehicle, r.vin || "—", r.calibration, r.installer].map((c) => `<td style="padding:3px 12px 3px 0;border-bottom:1px solid #eee">${esc(c)}</td>`).join("")}</tr>`;
  }
  return html + `</table>`;
}
function renderOttEmailHtml(rows, month) {
  const missingVin = rows.filter((r) => !r.vin).length;
  let html = `<div style="font-family:Arial,sans-serif;color:#3A2E26;max-width:720px">`;
  html += `<h1 style="color:#3A2E26">Tuned Yota — Completed OTT Calibrations</h1>`;
  html += `<p style="color:#7c8472">${esc(month.label)} · ${rows.length} completed calibration${rows.length === 1 ? "" : "s"}</p>`;
  html += `<p>Tuned Yota, an authorized Overland Tailor Tune installer, reports the following calibrations completed in ${esc(month.label)}. Full detail is attached as a CSV.</p>`;
  html += ottTable(rows);
  if (missingVin) html += `<p style="color:#8a2a2a">Note: ${missingVin} record(s) are missing a VIN.</p>`;
  html += `</div>`;
  return html;
}

// Rebuild a month descriptor from a "YYYY-MM" key (used by the approve endpoint).
function monthFromKey(key) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(key == null ? "" : key));
  if (!m) return null;
  const y = +m[1], mo = +m[2];
  if (mo < 1 || mo > 12) return null;
  return { key: `${m[1]}-${m[2]}`, label: `${MONTHS[mo - 1]} ${y}`, year: y, month: mo };
}

// OTT report recipients. Overridable via OTT_REPORT_TO (comma-separated); defaults
// to the two OTT contacts. The owner (info@) is always CC'd, set by the caller.
const DEFAULT_OTT_RECIPIENTS = ["info@overlandtailor.com", "hgobbels@me.com"];
function recipients(env = {}) {
  return env.OTT_REPORT_TO
    ? String(env.OTT_REPORT_TO).split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_OTT_RECIPIENTS.slice();
}

// Owner-facing DRAFT (rule #1: the owner reviews and approves before anything is
// sent to OTT). Contains the calibration table + a private approve-and-send link.
function renderOwnerDraftHtml(rows, month, approveUrl) {
  const missingVin = rows.filter((r) => !r.vin).length;
  let html = `<div style="font-family:Arial,sans-serif;color:#3A2E26;max-width:720px">`;
  html += `<h1 style="color:#3A2E26">OTT Calibration Report — DRAFT for your approval</h1>`;
  html += `<p style="color:#7c8472">${esc(month.label)} · ${rows.length} completed calibration${rows.length === 1 ? "" : "s"}${missingVin ? ` · ${missingVin} missing VIN` : ""}</p>`;
  html += `<p><strong>Nothing has been sent to OTT yet.</strong> Review the ${rows.length} calibration(s) below and the attached CSV, then approve.</p>`;
  html += `<p style="margin:18px 0"><a href="${esc(approveUrl)}" style="background:#5B4B42;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700">Approve &amp; send to OTT</a></p>`;
  html += `<p style="color:#7c8472;font-size:13px">This approval link is private to you — do not forward it.</p>`;
  html += ottTable(rows);
  if (missingVin) html += `<p style="color:#8a2a2a">Note: ${missingVin} record(s) are missing a VIN — fix before approving if OTT requires them.</p>`;
  html += `</div>`;
  return html;
}

module.exports = { priorMonth, monthFromKey, buildOttRows, renderOttCsv, renderOttEmailHtml, renderOwnerDraftHtml, recipients };
