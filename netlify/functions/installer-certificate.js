// netlify/functions/installer-certificate.js
// Auth-gated certificate repository: re-render a completed booking's Certificate of
// Calibration on demand, deterministically from the stored record (stable serial +
// stored issue date). Ownership re-checked server-side; admins may view any.
const { cfg, getRecord } = require("./lib/airtable.js");
const { resolveInstaller, isAdmin } = require("./lib/installer-auth.js");
const { keyToInstaller } = require("./lib/routing.js");
const { buildCertificate, certSerial } = require("./lib/certificate.js");
const { resolveFluids } = require("./lib/amsoil-fluids.js");
const { qrSvg } = require("./lib/qr.js");

async function renderCertificate(recordId, deps) {
  const { env = process.env, fetchImpl = fetch, key, admin = false,
          get = (a) => getRecord({ fetchImpl, ...a }) } = deps;
  if (!recordId) return { status: "error", error: "missing-record" };
  const c = cfg(env);
  let rec;
  try { rec = await get({ token: c.token, baseId: c.baseId, table: c.bookings, id: recordId }); }
  catch { return { status: "error", error: "store-unavailable" }; }
  const f = (rec && rec.fields) || {};
  const owner = Array.isArray(f.Installer) ? f.Installer[0] : f.Installer;
  if (!admin && owner !== key) return { status: "error", error: "not-yours" };
  const inst = keyToInstaller(owner);
  const calibrationDate = String(f["Calibration Date"] || f["Event Date"] || "").slice(0, 10);
  const issueDate = String(f["Certificate Issued"] || calibrationDate).slice(0, 10);
  const certNo = certSerial(recordId, calibrationDate, issueDate);
  const fluids = resolveFluids(f.Vehicle, f["Model Year"]);
  const amsoil = { fluids, qrSvg: qrSvg((fluids && fluids.garageUrl) || "https://tunedyota.com/amsoil-garage") };
  const { html } = buildCertificate({
    name: f.Name, vehicle: f.Vehicle, modelYear: f["Model Year"], vin: f.VIN,
    calibration: f["OTT Calibration"], installer: inst.name, installerRegion: inst.region,
    calibrationDate, certNo, issueDate, amsoil });
  return { status: "ok", html };
}

async function handler(event) {
  const key = resolveInstaller(event.headers || {}, process.env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  const recordId = (event.queryStringParameters || {}).recordId || "";
  const out = await renderCertificate(recordId, { key, admin: isAdmin(key, process.env) });
  if (out.status !== "ok") {
    const code = out.error === "not-yours" ? 403 : out.error === "missing-record" ? 400 : 502;
    return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
  }
  return { statusCode: 200, headers: { "Content-Type": "text/html; charset=utf-8" }, body: out.html };
}
module.exports = { handler, renderCertificate };
