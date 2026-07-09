// netlify/functions/installer-walkin.js
// Installer-scoped walk-in quick-add. Creates a Bookings record for one of the
// installer's own event markets, tagged Source "installer:walk-in" so the console
// surfaces it under "Walk-ins this month". Ownership is enforced by market routing.
const { cfg, createRecord, createTolerant } = require("./lib/airtable.js");
const { resolveInstaller } = require("./lib/installer-auth.js");
const { getMarket } = require("./lib/markets.js");
const { keyToInstaller } = require("./lib/routing.js");

async function processWalkin(body, deps) {
  const { env = process.env, fetchImpl = fetch, key,
          create = (a) => createRecord({ fetchImpl, ...a }) } = deps;
  const d = body || {};
  const name = String(d.name || "").trim();
  const phone = String(d.phone || "").trim();
  if (!name || !phone) return { status: "error", error: "missing-contact" };
  const city = String(d.city || "").trim();
  const market = getMarket(city);
  if (!market) return { status: "error", error: "unknown-city" };
  if (keyToInstaller(market.inst).key !== key) return { status: "error", error: "not-your-market" };
  const dateISO = String(d.dateISO || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return { status: "error", error: "bad-date" };

  const c = cfg(env);
  const vehicle = String(d.vehicle || "").trim();
  const fields = { City: market.city, "Event Date": dateISO, Name: name, Vehicle: vehicle,
    Phone: phone, Status: "Booked", Source: "installer:walk-in", Installer: key };
  let rec;
  try { rec = await createTolerant(create, { token: c.token, baseId: c.baseId, table: c.bookings, fields }, ["Source"]); }
  catch (e) { return { status: "error", error: "store-unavailable" }; }

  const id = rec && rec.id;
  return { status: "booked", recordId: id, booking: {
    id, city: market.city, dateISO, slot: "", slotLabel: "", name, vehicle, phone, email: "",
    mods: "", status: "Booked", isWalkin: true, calibration: "", vin: "", tuningPlatform: "",
    calibrationType: "", ecuId: "", gearSize: "", mileage: "" } };
}

async function handler(event) {
  const key = resolveInstaller(event.headers || {}, process.env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  const out = await processWalkin(body, { key });
  const code = out.status !== "error" ? 200 : (out.error === "store-unavailable" ? 502 : 400);
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, processWalkin };
