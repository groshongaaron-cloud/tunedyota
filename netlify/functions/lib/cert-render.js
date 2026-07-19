// netlify/functions/lib/cert-render.js
// Shared "booking record -> certificate HTML" core, used by BOTH the installer
// repository (installer-certificate.js) and the client portal (client-certs.js).
// Deterministic: stable serial + stored issue date. Callers own auth/ownership.
const { keyToInstaller, normalizeInstallerKey } = require("./routing.js");
const { buildCertificate, certSerial } = require("./certificate.js");
const { resolveFluids } = require("./amsoil-fluids.js");
const { qrSvg } = require("./qr.js");

function certHtmlForRecord(rec) {
  const f = (rec && rec.fields) || {};
  const inst = keyToInstaller(normalizeInstallerKey(f.Installer));
  const calibrationDate = String(f["Calibration Date"] || f["Event Date"] || "").slice(0, 10);
  const issueDate = String(f["Certificate Issued"] || calibrationDate).slice(0, 10);
  const certNo = certSerial(rec.id, calibrationDate, issueDate);
  const fluids = resolveFluids(f.Vehicle, f["Model Year"]);
  const amsoil = { fluids, qrSvg: qrSvg((fluids && fluids.garageUrl) || "https://tunedyota.com/amsoil-garage") };
  const { html } = buildCertificate({
    name: f.Name, vehicle: f.Vehicle, modelYear: f["Model Year"], vin: f.VIN,
    calibration: f["OTT Calibration"], installer: inst.name, installerRegion: inst.region,
    calibrationDate, certNo, issueDate, amsoil });
  return html;
}

module.exports = { certHtmlForRecord };
