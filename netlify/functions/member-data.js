// netlify/functions/member-data.js
// MY TUNED YOTA member payload — the one endpoint the member page hangs on,
// same for the web page and the native app. GET -> vehicle + odometer + per-system
// gauge values + full fluid sheet, all computed server-side so the bundled page
// stays dumb (and cacheable for offline). POST {odometer} logs a reading;
// POST {service:{system, miles}} records a fluid change (resets that gauge).
//
// Data model: everything member-mutable lives on the Clients row in optional
// columns — Odometer (number), "Odometer Date" (date), "Service Log" (JSON text,
// {"Engine Oil":{miles,date}, ...}). Writes go through create/updateTolerant so a
// column the base hasn't added yet drops instead of failing the whole write.
// Gauge baseline: the system's Service Log entry, else the odometer recorded at
// the tune (booking Mileage). No baseline or no odometer -> status "unknown",
// never a made-up "due".
//
// CORS: the native app calls from capacitor://localhost (iOS) / http://localhost
// (Android) — cross-origin to tunedyota.com. Preflight (OPTIONS) answers open;
// x-renewed-token is exposed so the app can persist sliding-session renewals.
const { cfg, escapeFormula, listRecords, createRecord, createTolerant, updateRecord, updateTolerant } = require("./lib/airtable.js");
const { resolveClient } = require("./lib/client-auth.js");
const { resolveFluids } = require("./lib/amsoil-fluids.js");
const { corsHeaders } = require("./lib/cors.js");

const OPTIONAL_COLUMNS = ["Odometer", "Odometer Date", "Service Log", "Vehicles"];
const MAX_MILES = 1500000;

function parseIntervalMiles(s) {
  const m = /([\d,]+)\s*mi\b/i.exec(String(s || ""));
  return m ? parseInt(m[1].replace(/,/g, ""), 10) : null;
}

function parseJson(raw, fallback) {
  try { const v = JSON.parse(raw || ""); return v && typeof v === "object" ? v : fallback; }
  catch { return fallback; }
}

function validMiles(n) {
  return Number.isInteger(n) && n > 0 && n <= MAX_MILES;
}

// One gauge per fluid system with a mile-based tuned interval (filters — unit
// "ea" — and time-based systems like coolant/brake don't get a dial).
// milesLeft = baseline + interval - odometer, clamped to the interval so a
// baseline logged ahead of the odometer can't overfill the arc.
function buildGauges(systems, odometerMiles, tuneMiles, serviceLog) {
  const log = serviceLog || {};
  const out = [];
  for (const s of systems || []) {
    const interval = parseIntervalMiles(s.tunedInterval);
    if (!interval || s.unit === "ea") continue;
    const logged = log[s.system] && validMiles(log[s.system].miles) ? log[s.system].miles : null;
    const baseline = logged != null ? logged : (validMiles(tuneMiles) ? tuneMiles : null);
    const g = { system: s.system, product: s.product, stockNo: s.stockNo || "",
      intervalMiles: interval, baselineMiles: baseline, milesLeft: null, status: "unknown" };
    if (baseline != null && validMiles(odometerMiles)) {
      g.milesLeft = Math.min(baseline + interval - odometerMiles, interval);
      g.status = g.milesLeft <= 0 ? "due" : g.milesLeft < interval * 0.15 ? "warn" : "ok";
    }
    out.push(g);
  }
  return out;
}

async function findClientRow(email, c, list) {
  const rows = await list({ token: c.token, baseId: c.baseId, table: c.clients,
    filterByFormula: `LOWER({Email})="${escapeFormula(email)}"` });
  return rows[0] || null;
}

async function latestCompletedBooking(email, c, list) {
  const rows = await list({ token: c.token, baseId: c.baseId, table: c.bookings,
    filterByFormula: `AND(LOWER({Email})="${escapeFormula(email)}", {Status}="Completed")`,
    fields: ["Vehicle", "Model Year", "Mileage", "OTT Calibration", "Calibration Date", "Event Date"] });
  const dated = rows.map((r) => ({ r, d: String((r.fields || {})["Calibration Date"] || (r.fields || {})["Event Date"] || "").slice(0, 10) }));
  dated.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));
  return (dated[0] || {}).r || null;
}

const EMPTY = { status: "ok", vehicle: null, calibration: null, odometer: null,
  gauges: [], fluidSheet: [], garageUrl: "", orderUrl: "" };

async function getMemberData(email, deps = {}) {
  const { env = process.env, fetchImpl = fetch, list = (a) => listRecords({ fetchImpl, ...a }) } = deps;
  const c = cfg(env);
  let booking, row;
  try {
    [booking, row] = await Promise.all([latestCompletedBooking(email, c, list), findClientRow(email, c, list)]);
  } catch { return { status: "error", error: "store-unavailable" }; }

  const f = (booking && booking.fields) || {};
  const garage = parseJson(row && row.fields.Vehicles, []);
  const firstGarage = Array.isArray(garage) && garage[0] && garage[0].make ? garage[0] : null;

  let vehicle = null;
  if (booking) {
    vehicle = { vehicle: String(f.Vehicle || ""), modelYear: String(f["Model Year"] || ""), source: "booking" };
  } else if (firstGarage) {
    vehicle = { vehicle: (firstGarage.make + " " + firstGarage.model).trim(),
      modelYear: String(firstGarage.year || ""), source: "garage" };
  }
  if (!vehicle) return { ...EMPTY };

  const calibrationDate = String(f["Calibration Date"] || f["Event Date"] || "").slice(0, 10);
  const calibration = booking ? { name: String(f["OTT Calibration"] || ""),
    date: calibrationDate, recordId: booking.id } : null;

  // Odometer: the newest truth wins, and it never goes backwards — a booking
  // closed out after a stale member reading carries the higher miles.
  const tuneMiles = validMiles(Number(f.Mileage)) ? Number(f.Mileage) : null;
  const memberMiles = row && validMiles(Number(row.fields.Odometer)) ? Number(row.fields.Odometer) : null;
  let odometer = null;
  if (memberMiles != null && (tuneMiles == null || memberMiles >= tuneMiles)) {
    odometer = { miles: memberMiles, date: String(row.fields["Odometer Date"] || "").slice(0, 10), source: "member" };
  } else if (tuneMiles != null) {
    odometer = { miles: tuneMiles, date: calibrationDate, source: "booking" };
  }

  const fluids = resolveFluids(vehicle.vehicle, vehicle.modelYear);
  if (fluids) vehicle.engine = fluids.engine;
  const serviceLog = parseJson(row && row.fields["Service Log"], {});
  const gauges = fluids ? buildGauges(fluids.systems, odometer && odometer.miles, tuneMiles, serviceLog) : [];

  return { status: "ok", vehicle, calibration, odometer, gauges,
    fluidSheet: fluids ? fluids.systems : [],
    garageUrl: fluids ? fluids.garageUrl : "", orderUrl: fluids ? fluids.orderUrl : "" };
}

async function putMemberLog(email, body, deps = {}) {
  const { env = process.env, fetchImpl = fetch, now = Date.now(),
    list = (a) => listRecords({ fetchImpl, ...a }),
    create = (a) => createRecord({ fetchImpl, ...a }),
    update = (a) => updateRecord({ fetchImpl, ...a }) } = deps;
  const b = body || {};
  const odometer = "odometer" in b ? Number(b.odometer) : null;
  const service = b.service || null;
  const hasOdo = odometer != null && validMiles(odometer);
  const hasService = !!(service && String(service.system || "").trim() && validMiles(Number(service.miles)));
  if (("odometer" in b && !hasOdo) || (service && !hasService) || (!hasOdo && !hasService)) {
    return { status: "error", error: "bad-request" };
  }
  const today = new Date(now).toISOString().slice(0, 10);
  const c = cfg(env);
  try {
    const row = await findClientRow(email, c, list);
    const fields = {};
    if (hasOdo) { fields.Odometer = odometer; fields["Odometer Date"] = today; }
    if (hasService) {
      const log = parseJson(row && row.fields["Service Log"], {});
      log[String(service.system).slice(0, 48)] = { miles: Number(service.miles), date: today };
      fields["Service Log"] = JSON.stringify(log);
    }
    if (row) {
      await updateTolerant(update, { token: c.token, baseId: c.baseId, table: c.clients,
        id: row.id, fields }, OPTIONAL_COLUMNS);
    } else {
      await createTolerant(create, { token: c.token, baseId: c.baseId, table: c.clients,
        fields: { Email: email, "Created At": today, "Last Login": today, ...fields } }, OPTIONAL_COLUMNS);
    }
    return { status: "ok", ...(hasOdo ? { odometer: { miles: odometer, date: today, source: "member" } } : {}) };
  } catch { return { status: "error", error: "store-unavailable" }; }
}

async function handler(event) {
  const headers = corsHeaders(((event.headers || {}).origin || "").toString());
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };
  const session = resolveClient(event.headers || {}, Date.now(), process.env);
  if (!session) return { statusCode: 401, headers, body: "unauthorized" };
  if (session.renewedToken) headers["x-renewed-token"] = session.renewedToken;
  let out;
  if (event.httpMethod === "GET") out = await getMemberData(session.email, {});
  else if (event.httpMethod === "POST") {
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, headers, body: "bad-json" }; }
    out = await putMemberLog(session.email, body, {});
  } else return { statusCode: 405, headers, body: "method-not-allowed" };
  const code = out.status === "ok" ? 200 : out.error === "bad-request" ? 400 : 502;
  return { statusCode: code, headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ ...out, ...(session.renewedToken ? { renewedToken: session.renewedToken } : {}) }) };
}

module.exports = { handler, getMemberData, putMemberLog, buildGauges, parseIntervalMiles, corsHeaders };
