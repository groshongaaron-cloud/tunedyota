// netlify/functions/client-garage.js
// Account-backed My Garage. GET -> stored vehicles; PUT {vehicles, merge?} ->
// sanitized write (merge:true unions with what's stored — used once to absorb a
// device's localStorage garage on first login, so nothing a client saved is lost).
// Vehicles keep the {make, model, year} shape the AMSOIL + Magnuson catalogs key
// on, so future parts fitment attaches to these records without a remodel.
const { cfg, escapeFormula, listRecords, createRecord, updateRecord } = require("./lib/airtable.js");
const { resolveClient } = require("./lib/client-auth.js");

const MAX_VEHICLES = 20;

function mergeVehicles(a, b) {
  const seen = new Set(), out = [];
  for (const v of [...(a || []), ...(b || [])]) {
    if (!v || !v.make || !v.model) continue;
    const clean = { make: String(v.make).slice(0, 40), model: String(v.model).slice(0, 40),
      year: String(v.year || "").slice(0, 10) };
    const key = (clean.make + "|" + clean.model + "|" + clean.year).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= MAX_VEHICLES) break;
  }
  return out;
}

function parseVehicles(raw) {
  try { const v = JSON.parse(raw || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

// Concurrent first-time writes (e.g. two tabs racing on first login) can create
// duplicate Clients rows for the same email. findRow deterministically picks the
// first row (creation order), so all subsequent reads/writes stay consistent on
// that one row. Accepted v1 limitation; deduplication can run as a background job.
async function findRow(email, c, list) {
  const rows = await list({ token: c.token, baseId: c.baseId, table: c.clients,
    filterByFormula: `LOWER({Email})="${escapeFormula(email)}"` });
  return rows[0] || null;
}

async function getGarage(email, deps = {}) {
  const { env = process.env, fetchImpl = fetch, list = (a) => listRecords({ fetchImpl, ...a }) } = deps;
  const c = cfg(env);
  try {
    const row = await findRow(email, c, list);
    return { status: "ok", vehicles: row ? mergeVehicles(parseVehicles(row.fields.Vehicles), []) : [] };
  } catch { return { status: "error", error: "store-unavailable" }; }
}

async function putGarage(email, body, deps = {}) {
  const { env = process.env, fetchImpl = fetch, now = Date.now(),
    list = (a) => listRecords({ fetchImpl, ...a }),
    create = (a) => createRecord({ fetchImpl, ...a }),
    update = (a) => updateRecord({ fetchImpl, ...a }) } = deps;
  const c = cfg(env);
  const incoming = mergeVehicles((body && body.vehicles) || [], []);
  try {
    const row = await findRow(email, c, list);
    const vehicles = body && body.merge && row
      ? mergeVehicles(parseVehicles(row.fields.Vehicles), incoming) : incoming;
    if (row) {
      await update({ token: c.token, baseId: c.baseId, table: c.clients, id: row.id,
        fields: { Vehicles: JSON.stringify(vehicles) } });
    } else {
      const today = new Date(now).toISOString().slice(0, 10);
      await create({ token: c.token, baseId: c.baseId, table: c.clients,
        fields: { Email: email, "Created At": today, "Last Login": today, Vehicles: JSON.stringify(vehicles) } });
    }
    return { status: "ok", vehicles };
  } catch { return { status: "error", error: "store-unavailable" }; }
}

async function handler(event) {
  const session = resolveClient(event.headers || {}, Date.now(), process.env);
  if (!session) return { statusCode: 401, body: "unauthorized" };
  const renewHeaders = session.renewedToken ? { "x-renewed-token": session.renewedToken } : {};
  const renew = session.renewedToken ? { renewedToken: session.renewedToken } : {};
  let out;
  if (event.httpMethod === "GET") out = await getGarage(session.email, {});
  else if (event.httpMethod === "PUT" || event.httpMethod === "POST") {
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad-json" }; }
    out = await putGarage(session.email, body, {});
  } else return { statusCode: 405, body: "method-not-allowed" };
  return { statusCode: out.status === "ok" ? 200 : 502,
    headers: { "Content-Type": "application/json", ...renewHeaders }, body: JSON.stringify({ ...out, ...renew }) };
}

module.exports = { handler, getGarage, putGarage, mergeVehicles };
