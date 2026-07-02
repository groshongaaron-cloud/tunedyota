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
  const rows = recs.map((r) => ({ ...r.fields, id: r.id })).filter((f) => dateOnly(f["Event Date"]) >= today);
  const events = new Map();
  for (const f of rows) {
    const ek = `${f.City}|${dateOnly(f["Event Date"])}`;
    if (!events.has(ek)) events.set(ek, { city: f.City, dateISO: dateOnly(f["Event Date"]), bookings: [] });
    events.get(ek).bookings.push({
      id: f.id, slot: f.Slot || "", slotLabel: f.Slot ? formatSlot(f.Slot) : "",
      name: f.Name || "", vehicle: f.Vehicle || "", phone: f.Phone || "", email: f.Email || "",
      mods: f.Modifications || "", status: f.Status || "Booked", calibration: f["OTT Calibration"] || "",
      vin: f.VIN || "",
    });
  }
  const out = [...events.values()].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  out.forEach((e) => e.bookings.sort(bySlot));
  return { installer: key, events: out };
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
