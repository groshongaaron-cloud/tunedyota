// netlify/functions/installer-roster.js
// Live, per-installer event roster. Scoped to the authenticated installer's key.
const { cfg, listRecords } = require("./lib/airtable.js");
const { resolveInstaller } = require("./lib/installer-auth.js");
const { formatSlot } = require("./lib/slots.js");

const dateOnly = (s) => String(s == null ? "" : s).slice(0, 10);
const bySlot = (a, b) => String(a.slot || "").localeCompare(String(b.slot || ""), undefined, { numeric: true });

async function buildRoster(deps) {
  const { env = process.env, fetchImpl = fetch, now = new Date(), key,
          list = (a) => listRecords({ fetchImpl, ...a }) } = deps;
  const c = cfg(env);
  const recs = await list({ token: c.token, baseId: c.baseId, table: c.bookings,
    filterByFormula: `AND({Installer}="${key}",{Status}!="Cancelled")` });
  const today = now.toISOString().slice(0, 10);
  const bookings = recs.map((r) => {
    const f = r.fields || {};
    const src = String(f.Source || "");
    return {
      id: r.id, city: f.City || "", dateISO: dateOnly(f["Event Date"]),
      slot: f.Slot || "", slotLabel: f.Slot ? formatSlot(f.Slot) : "",
      name: f.Name || "", vehicle: f.Vehicle || "", phone: f.Phone || "", email: f.Email || "",
      mods: f.Modifications || "", status: f.Status || "Booked",
      isWalkin: /^(intake|installer):walk-in/i.test(src),
      calibration: f["OTT Calibration"] || "", vin: f.VIN || "",
      tuningPlatform: f["Tuning Platform"] || "", calibrationType: f["Calibration Type"] || "",
      ecuId: f["ECU ID"] || "", gearSize: f["Gear Size"] || "", mileage: f.Mileage || "",
    };
  }).sort((a, b) => a.dateISO.localeCompare(b.dateISO) || bySlot(a, b));
  return { installer: key, today, bookings };
}

async function handler(event) {
  const key = resolveInstaller(event.headers || {}, process.env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  try {
    const out = await buildRoster({ key });
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
  } catch (e) { return { statusCode: 502, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: e.message }) }; }
}
module.exports = { handler, buildRoster };
