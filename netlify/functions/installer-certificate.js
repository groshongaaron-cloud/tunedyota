// netlify/functions/installer-certificate.js
// Auth-gated certificate repository: re-render a completed booking's Certificate of
// Calibration on demand, deterministically from the stored record (stable serial +
// stored issue date). Ownership re-checked server-side; admins may view any.
const { cfg, getRecord } = require("./lib/airtable.js");
const { resolveInstaller, isAdmin } = require("./lib/installer-auth.js");
const { certHtmlForRecord } = require("./lib/cert-render.js");

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
  return { status: "ok", html: certHtmlForRecord(rec) };
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
