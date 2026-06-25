// Pure builder: a branded, editable Certificate of Authenticity (HTML). Known
// fields pre-filled; installer fields are contenteditable blanks. No I/O.
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fieldRow(label, value, editable) {
  const cell = editable
    ? `<span contenteditable="true" style="display:inline-block;min-width:240px;border-bottom:1px solid #7c8472;padding:2px 6px">${esc(value)}</span>`
    : `<strong style="display:inline-block;min-width:240px;padding:2px 6px">${esc(value)}</strong>`;
  return `<tr><td style="padding:8px 16px 8px 0;color:#7c8472;font-weight:700;text-transform:uppercase;letter-spacing:.04em;font-size:12px;vertical-align:top">${esc(label)}</td><td style="padding:8px 0">${cell}</td></tr>`;
}

function buildCertificate({ name, retailer, vehicle, calibrationDate }) {
  const subject = `Certificate of Authenticity — ${name || "Customer"}${vehicle ? ` · ${vehicle}` : ""}`;
  const rows = [
    fieldRow("Date Calibration Applied", calibrationDate || "", true),
    fieldRow("OTT Retailer", retailer || "", false),
    fieldRow("Customer Name", name || "", false),
    fieldRow("VIN", "", true),
    fieldRow("Vehicle Year", "", true),
    fieldRow("Vehicle Type", "", true),
    fieldRow("Engine Size", "", true),
    fieldRow("Mileage", "", true),
  ].join("");
  const html =
`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Certificate of Authenticity — Tuned Yota</title>
<style>
  @media print { .noprint { display:none !important } [contenteditable]{ border-bottom:1px solid #7c8472 } }
  body{ font-family:Georgia,'Times New Roman',serif; color:#3A2E26; margin:0; background:#EDECEB }
  .cert{ max-width:760px; margin:24px auto; background:#fff; border:2px solid #5B4B42; padding:40px 48px }
  h1{ font-size:26px; color:#3A2E26; letter-spacing:.02em; margin:0 0 2px }
  .eyebrow{ color:#7c8472; font-weight:700; text-transform:uppercase; letter-spacing:.2em; font-size:12px }
  .note{ color:#7c8472; font-size:13px; margin:6px 0 22px }
  table{ border-collapse:collapse; width:100% }
  .sig{ margin-top:28px; color:#5B4B42; font-weight:700; letter-spacing:.04em }
</style></head>
<body>
  <p class="noprint" style="max-width:760px;margin:18px auto 0;color:#5B4B42;font-size:13px">Open this file in a browser, click each underlined field to type VIN / Year / Type / Engine / Mileage (and the date if blank), then <strong>Print → Save as PDF</strong> and send it to your customer.</p>
  <div class="cert">
    <div class="eyebrow">Tuned Yota · Undeniable Performance</div>
    <h1>Certificate of Authenticity</h1>
    <p class="note">This certifies an authentic OTT calibration${vehicle ? ` · Booked as: ${esc(vehicle)}` : ""}.</p>
    <table>${rows}</table>
    <p class="sig">— Tuned Yota · Authorized OTT Installer</p>
  </div>
</body></html>`;
  return { subject, html };
}
module.exports = { buildCertificate };
