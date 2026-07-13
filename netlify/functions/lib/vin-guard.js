// netlify/functions/lib/vin-guard.js
// Pure: compare a decoded VIN against the booking; return plain-English warnings.
// Advisory only — feeds the close-out guard. No I/O. Each check is skipped when its
// data is absent, so absent data never produces a false warning.
function norm(s) { return String(s == null ? "" : s).toLowerCase().replace(/\s+/g, ""); }

function compareVin(decoded, booking) {
  const d = decoded || {}, b = booking || {};
  const warnings = [];
  // Typo / validity: NHTSA ErrorCode is a comma list; code "1" = check-digit failure.
  const codes = String(d.errorCode == null ? "" : d.errorCode).split(",").map((x) => x.trim());
  if (codes.includes("1")) warnings.push("This VIN may be mistyped — it fails its check digit.");
  // Year mismatch (both present).
  const dy = String(d.modelYear == null ? "" : d.modelYear).trim();
  const by = String(b.modelYear == null ? "" : b.modelYear).trim();
  if (dy && by && dy !== by) warnings.push(`VIN decodes as a ${dy}; booking says ${by}.`);
  // Make/model mismatch: the booking vehicle string should contain the decoded make + model.
  const veh = String(b.vehicle || "");
  const make = String(d.make || "").trim(), model = String(d.model || "").trim();
  const makeBad = make && veh.toLowerCase().indexOf(make.toLowerCase()) < 0;
  const modelBad = model && norm(veh).indexOf(norm(model)) < 0;
  if (make && model && (makeBad || modelBad)) {
    warnings.push(`VIN decodes as ${make} ${model}; booking vehicle is "${veh}".`);
  }
  return { ok: warnings.length === 0, warnings };
}
module.exports = { compareVin };
