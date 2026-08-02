// netlify/functions/installer-reschedule.js
// Per-installer schedule control on an OPEN booking: set/adjust the Event Date and
// assign the exact time ("Scheduled Time"). Built for slot-mode markets (Noah's
// customers reserve a generic slot; he names the time and may move the date), but
// available to every installer on their own bookings. Ownership re-checked
// server-side; admins may adjust any. Completed bookings accept IDENTITY
// corrections only (name / vehicle / model year — owner ask 2026-08-02: a customer
// picked the wrong engine at booking); their dates stay locked because Event/
// Calibration dates feed the certificate and the monthly OTT report buckets.
// Cancelled bookings are fully locked.
const { cfg, getRecord, updateRecord, updateTolerant } = require("./lib/airtable.js");
const { resolveInstaller, isAdmin } = require("./lib/installer-auth.js");
const { normalizeInstallerKey } = require("./lib/routing.js");
const { withCors } = require("./lib/cors.js");

async function processReschedule(body, deps) {
  const { env = process.env, fetchImpl = fetch, key, admin = false, log = console,
          get = (a) => getRecord({ fetchImpl, ...a }),
          update = (a) => updateRecord({ fetchImpl, ...a }) } = deps;
  const d = body || {};
  if (!d.recordId) return { status: "error", error: "missing-record" };
  const dateISO = String(d.dateISO || "").trim();
  const time = String(d.time || "").trim();
  // Install address — set/updated here "once we know the address" (a booking often
  // arrives before the client's location is confirmed). Free text, never required.
  const address = String(d.address || "").trim();
  // Customer name correction (owner ask 2026-07-30): channel adapters create
  // bookings named "Text (xxx) xxx-xxxx" — the installer fixes them here.
  const name = String(d.name || "").trim();
  const vehicle = String(d.vehicle || "").trim();
  // Exact model year — it prints on the certificate, so it must be correctable
  // wherever the vehicle is.
  const modelYear = String(d.modelYear || "").trim();
  if (dateISO && !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return { status: "error", error: "bad-date" };
  if (time.length > 40) return { status: "error", error: "bad-time" };
  if (address.length > 200) return { status: "error", error: "bad-address" };
  if (name.length > 80) return { status: "error", error: "bad-name" };
  if (vehicle.length > 120) return { status: "error", error: "bad-vehicle" };
  if (modelYear && !/^(19|20)\d{2}$/.test(modelYear)) return { status: "error", error: "bad-year" };
  if (!dateISO && !time && !address && !name && !vehicle && !modelYear) return { status: "error", error: "nothing-to-change" };

  const c = cfg(env);
  let rec;
  try { rec = await get({ token: c.token, baseId: c.baseId, table: c.bookings, id: d.recordId }); }
  catch (e) { if (log.error) log.error("reschedule get", e.message); return { status: "error", error: "store-unavailable" }; }
  const f = (rec && rec.fields) || {};
  const owner = normalizeInstallerKey(f.Installer);
  if (!admin && owner !== key) return { status: "error", error: "not-yours" };
  if (f.Status === "Cancelled") return { status: "error", error: "not-open" };
  // Completed: identity corrections only. A request that also touches the
  // schedule is refused whole — no partial writes.
  if (f.Status === "Completed" && (dateISO || time || address)) return { status: "error", error: "not-open" };

  const fields = {};
  if (dateISO) fields["Event Date"] = dateISO;
  if (time) fields["Scheduled Time"] = time;
  if (address) fields.Address = address;
  if (name && name !== String(f.Name || "").trim()) fields.Name = name;
  if (vehicle && vehicle !== String(f.Vehicle || "").trim()) fields.Vehicle = vehicle;
  if (modelYear && modelYear !== String(f["Model Year"] || "").trim()) fields["Model Year"] = modelYear;
  try {
    await updateTolerant(update, { token: c.token, baseId: c.baseId, table: c.bookings, id: d.recordId, fields }, ["Scheduled Time", "Address", "Model Year"]);
  } catch (e) { if (log.error) log.error("reschedule update", e.message); return { status: "error", error: "store-unavailable" }; }
  return { status: "ok", dateISO: dateISO || String(f["Event Date"] || "").slice(0, 10), time: time || String(f["Scheduled Time"] || ""),
    address: address || String(f.Address || ""), name: name || String(f.Name || ""), vehicle: vehicle || String(f.Vehicle || ""),
    modelYear: modelYear || String(f["Model Year"] || "") };
}

async function handler(event) {
  const key = resolveInstaller(event.headers || {}, process.env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  const out = await processReschedule(body, { key, admin: isAdmin(key, process.env) });
  const code = out.status !== "error" ? 200
    : out.error === "not-yours" ? 403
    : out.error === "store-unavailable" ? 502 : 400;
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler: withCors(handler), processReschedule };
