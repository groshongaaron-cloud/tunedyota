// netlify/functions/client-certs.js
// Client portal certificates. GET (no params) -> the caller's completed bookings
// (matched by session email, case-insensitive). GET ?recordId= -> that booking's
// certificate HTML, re-rendered deterministically (never stored). Ownership =
// the booking's Email equals the session email. 401 without a valid session.
const { cfg, escapeFormula, listRecords, getRecord } = require("./lib/airtable.js");
const { resolveClient } = require("./lib/client-auth.js");
const { certHtmlForRecord } = require("./lib/cert-render.js");

async function listCerts(email, deps = {}) {
  const { env = process.env, fetchImpl = fetch, list = (a) => listRecords({ fetchImpl, ...a }) } = deps;
  const c = cfg(env);
  let rows;
  try {
    rows = await list({ token: c.token, baseId: c.baseId, table: c.bookings,
      filterByFormula: `AND(LOWER({Email})="${escapeFormula(email)}", {Status}="Completed")`,
      fields: ["Name", "Vehicle", "Model Year", "OTT Calibration", "Calibration Date", "Event Date", "Certificate Issued"] });
  } catch { return { status: "error", error: "store-unavailable" }; }
  const certs = rows.map((r) => {
    const f = r.fields || {};
    const calibrationDate = String(f["Calibration Date"] || f["Event Date"] || "").slice(0, 10);
    return { recordId: r.id, name: String(f.Name || ""), vehicle: String(f.Vehicle || ""),
      modelYear: String(f["Model Year"] || ""), calibration: String(f["OTT Calibration"] || ""),
      calibrationDate, certIssued: String(f["Certificate Issued"] || calibrationDate).slice(0, 10) };
  });
  return { status: "ok", certs };
}

async function renderClientCert(recordId, email, deps = {}) {
  const { env = process.env, fetchImpl = fetch, get = (a) => getRecord({ fetchImpl, ...a }) } = deps;
  if (!recordId) return { status: "error", error: "missing-record" };
  const c = cfg(env);
  let rec;
  try { rec = await get({ token: c.token, baseId: c.baseId, table: c.bookings, id: recordId }); }
  catch { return { status: "error", error: "store-unavailable" }; }
  const f = (rec && rec.fields) || {};
  if (String(f.Email || "").trim().toLowerCase() !== email) return { status: "error", error: "not-yours" };
  return { status: "ok", html: certHtmlForRecord(rec) };
}

async function handler(event) {
  const session = resolveClient(event.headers || {}, Date.now(), process.env);
  if (!session) return { statusCode: 401, body: "unauthorized" };
  const q = event.queryStringParameters || {};
  const renewHeaders = session.renewedToken ? { "x-renewed-token": session.renewedToken } : {};
  if (q.recordId) {
    const out = await renderClientCert(q.recordId, session.email, {});
    if (out.status !== "ok") {
      const code = out.error === "not-yours" ? 403 : out.error === "missing-record" ? 400 : 502;
      return { statusCode: code, headers: { "Content-Type": "application/json", ...renewHeaders }, body: JSON.stringify(out) };
    }
    return { statusCode: 200, headers: { "Content-Type": "text/html; charset=utf-8", ...renewHeaders }, body: out.html };
  }
  const out = await listCerts(session.email, {});
  if (out.status !== "ok") return { statusCode: 502, headers: { "Content-Type": "application/json", ...renewHeaders }, body: JSON.stringify(out) };
  const body = { ...out, ...(session.renewedToken ? { renewedToken: session.renewedToken } : {}) };
  return { statusCode: 200, headers: { "Content-Type": "application/json", ...renewHeaders }, body: JSON.stringify(body) };
}

module.exports = { handler, listCerts, renderClientCert };
