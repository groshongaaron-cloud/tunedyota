// netlify/functions/lib/qr.js
// Pure: encode a string -> inline SVG QR (crisp in print, zero external requests).
// Wraps the vendored MIT Nayuki encoder. Used on the Certificate v2 reference page,
// which is opened in a browser / printed to PDF (SVG is fine there).
const { qrcodegen } = require("./vendor/qrcodegen.js");

// One black rect per dark module. `size` px per module keeps the SVG integer-clean.
function qrSvg(text, opts = {}) {
  const s = String(text == null ? "" : text);
  if (!s) throw new Error("qrSvg: empty input");
  const px = opts.moduleSize || 4;
  const quiet = opts.quiet == null ? 4 : opts.quiet;      // quiet-zone modules
  const qr = qrcodegen.QrCode.encodeText(s, qrcodegen.QrCode.Ecc.MEDIUM);
  const dim = (qr.size + quiet * 2) * px;
  let rects = "";
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y)) {
        const rx = (x + quiet) * px, ry = (y + quiet) * px;
        rects += `<rect x="${rx}" y="${ry}" width="${px}" height="${px}"/>`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" ` +
    `role="img" aria-label="QR code to your AMSOIL Garage" shape-rendering="crispEdges">` +
    `<rect width="${dim}" height="${dim}" fill="#fff"/><g fill="#191C1E">${rects}</g></svg>`;
}

module.exports = { qrSvg };
