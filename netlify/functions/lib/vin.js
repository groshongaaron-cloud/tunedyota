// netlify/functions/lib/vin.js
// Pure VIN normalization for scanned/typed input. Uppercases, strips anything
// outside A-Z0-9 (Code-39 start/stop `*`, spaces, dashes), and returns the value
// only if it is a valid 17-char VIN (excludes I/O/Q per the VIN standard); else "".
// NOTE: site/installer.html inlines a byte-identical copy (the browser page can't
// require() a node module). Keep the two in sync.
function normalizeScannedVin(raw) {
  const s = String(raw == null ? "" : raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(s) ? s : "";
}
module.exports = { normalizeScannedVin };
