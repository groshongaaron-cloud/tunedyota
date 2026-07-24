// netlify/functions/installer-walkin.js
// Installer walk-in / call-in quick-add. Walk-ins are EVERYDAY business, not only at
// scheduled events — a client can call in on ANY day between events. Creates a
// Bookings record (Source "installer:walk-in") for the installer's market on any
// date (defaults to today), which then flows through the normal close-out → cert +
// OTT commission report exactly like an at-event walk-in. Ownership is enforced by
// market routing. See memory: "walk-ins are EVERYDAY, not event-only".
const { cfg, createRecord, createTolerant, escapeFormula, listRecords } = require("./lib/airtable.js");
const { resolveInstaller, isAdmin } = require("./lib/installer-auth.js");
const { getMarket } = require("./lib/markets.js");
const { keyToInstaller, normalizeInstallerKey } = require("./lib/routing.js");

async function processWalkin(body, deps) {
  const { env = process.env, fetchImpl = fetch, now = new Date(), key, admin = false,
          create = (a) => createRecord({ fetchImpl, ...a }),
          list = (a) => listRecords({ fetchImpl, ...a }) } = deps;
  const d = body || {};
  const name = String(d.name || "").trim();
  const phone = String(d.phone || "").trim();
  const clientKey = String(d.clientKey || "").trim();
  if (!name || !phone) return { status: "error", error: "missing-contact" };
  const city = String(d.city || "").trim();
  const market = getMarket(city);
  // Ownership: a known market routes to its installer (regular installers may only
  // add to their own markets). An UNKNOWN city is not a roadblock — the owner books
  // any city/location freely and the booking belongs to whoever adds it. An admin
  // may direct-assign any booking to a chosen installer, overriding routing.
  const override = admin ? normalizeInstallerKey(d.installer) : "";
  let ownerKey;
  if (market) {
    ownerKey = keyToInstaller(market.inst).key;
    if (!admin && ownerKey !== key) return { status: "error", error: "not-your-market" };
  } else {
    ownerKey = key;
  }
  if (override) ownerKey = override;
  const bookCity = market ? market.city : city;
  // Any valid date is accepted (everyday walk-ins aren't tied to a scheduled event);
  // default to today when omitted. Event Date = the tune date, so the OTT report
  // (which buckets by Calibration Date = Event Date) lands in the correct month.
  const dateISO = String(d.dateISO || "").trim() || now.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return { status: "error", error: "bad-date" };

  const c = cfg(env);
  const vehicle = String(d.vehicle || "").trim();
  const email = String(d.email || "").trim();
  const time = String(d.time || "").trim().slice(0, 40);
  // Best-effort dedupe: an offline walk-in replay carries a client-generated clientKey.
  // If a booking already exists with that Client Key, return it instead of creating a
  // duplicate. An absent Client Key column simply yields no match — swallow errors and
  // fall through to create.
  if (clientKey) {
    try {
      const dupes = await list({ token: c.token, baseId: c.baseId, table: c.bookings, filterByFormula: `{Client Key}="${escapeFormula(clientKey)}"` });
      if (dupes && dupes.length) {
        const g = dupes[0], gf = g.fields || {};
        return { status: "booked", recordId: g.id, booking: {
          id: g.id, city: gf.City || bookCity, dateISO: String(gf["Event Date"] || dateISO).slice(0, 10),
          installer: ownerKey, slot: "", slotLabel: "", scheduledTime: gf["Scheduled Time"] || time,
          name: gf.Name || name, vehicle: gf.Vehicle || vehicle,
          phone: gf.Phone || phone, email: gf.Email || email, mods: gf.Modifications || "", status: gf.Status || "Booked",
          isWalkin: true, calibration: "", vin: "", tuningPlatform: "", calibrationType: "", ecuId: "", gearSize: "", mileage: "" } };
      }
    } catch (e) { /* column may not exist yet — fall through to create */ }
  }
  const fields = { City: bookCity, "Event Date": dateISO, Name: name, Vehicle: vehicle,
    Phone: phone, Email: email, Status: "Booked", Source: "installer:walk-in", Installer: ownerKey };
  if (clientKey) fields["Client Key"] = clientKey;
  if (time) fields["Scheduled Time"] = time;
  let rec;
  try { rec = await createTolerant(create, { token: c.token, baseId: c.baseId, table: c.bookings, fields }, ["Source", "Email", "Client Key", "Scheduled Time"]); }
  catch (e) { return { status: "error", error: "store-unavailable" }; }

  const id = rec && rec.id;
  return { status: "booked", recordId: id, booking: {
    id, city: bookCity, dateISO, installer: ownerKey, slot: "", slotLabel: "", scheduledTime: time,
    name, vehicle, phone, email,
    mods: "", status: "Booked", isWalkin: true, calibration: "", vin: "", tuningPlatform: "",
    calibrationType: "", ecuId: "", gearSize: "", mileage: "" } };
}

async function handler(event) {
  const key = resolveInstaller(event.headers || {}, process.env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  const out = await processWalkin(body, { key, admin: isAdmin(key, process.env) });
  const code = out.status !== "error" ? 200 : (out.error === "store-unavailable" ? 502 : 400);
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, processWalkin };
