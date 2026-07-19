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

// ISO 3779 / 49 CFR 565 check digit (position 9) — mandatory on every North
// American VIN, so all Toyota/Lexus work we close out. Shape alone lets a
// misdecoded barcode or a confident-but-wrong OCR read through; the check digit
// catches virtually every single-character misread with zero network calls.
const VIN_CHAR_VALUES = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
function vinCheckDigitOk(vin) {
  const s = String(vin == null ? "" : vin).toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const c = s[i];
    sum += (c >= "0" && c <= "9" ? Number(c) : VIN_CHAR_VALUES[c]) * VIN_WEIGHTS[i];
  }
  const r = sum % 11;
  return s[8] === (r === 10 ? "X" : String(r));
}
module.exports = { normalizeScannedVin, vinCheckDigitOk };
