// netlify/functions/lead-update.js
// Mutate one lead: setStage / logContact / setFollowup / reassign (admin) / convert / delete.
// Ownership is enforced by the lead's Installer (a regular installer may only touch
// their own; admin may touch any + reassign). `convert` creates a Bookings record
// (walk-in-style, any date) and links it back to the lead.
const { cfg, getRecord, updateRecord, updateTolerant, createRecord, createTolerant, deleteRecord } = require("./lib/airtable.js");
const { resolveInstaller, isAdmin } = require("./lib/installer-auth.js");
const { toLeadView, applyLeadUpdate, logLine, appendActivity } = require("./lib/leads.js");
const { getMarket } = require("./lib/markets.js");
const { keyToInstaller, normalizeInstallerKey } = require("./lib/routing.js");

async function handler(event, ctx = {}) {
  const env = ctx.env || process.env;
  const now = ctx.now || new Date();
  const key = resolveInstaller(event.headers || {}, env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  const admin = isAdmin(key, env);
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  const { id, action } = body;
  if (!id || !action) return { statusCode: 400, body: JSON.stringify({ error: "missing-id-or-action" }) };

  const c = cfg(env);
  const getImpl = ctx.getImpl || ((a) => getRecord({ ...a }));
  const updateImpl = ctx.updateImpl || ((a) => updateRecord({ ...a }));
  const createBookingImpl = ctx.createBookingImpl || ((a) => createRecord({ ...a }));

  let rec;
  try { rec = await getImpl({ token: c.token, baseId: c.baseId, table: c.priority, id }); }
  catch (e) { return { statusCode: 502, body: JSON.stringify({ error: "store-unavailable" }) }; }
  const lead = toLeadView(rec);
  if (!admin && (lead.installer || "") !== key) return { statusCode: 400, body: JSON.stringify({ error: "not-your-market" }) };
  if (action === "reassign" && !admin) return { statusCode: 400, body: JSON.stringify({ error: "admin-only" }) };

  // Permanent removal — for spam, duplicates, and test records. Real people who
  // aren't interested belong in "Not now" (history preserved), not deleted.
  if (action === "delete") {
    const deleteImpl = ctx.deleteImpl || ((a) => deleteRecord({ ...a }));
    try { await deleteImpl({ token: c.token, baseId: c.baseId, table: c.priority, id }); }
    catch (e) { return { statusCode: 502, body: JSON.stringify({ error: "store-unavailable" }) }; }
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "ok", deleted: true }) };
  }

  if (action === "convert") {
    const dateISO = String(body.dateISO || "").trim() || new Date(now).toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return { statusCode: 400, body: JSON.stringify({ error: "bad-date" }) };
    // Optional installer-assigned time ("10:30 AM"). Free text — Noah's slot-mode
    // markets have no fixed slot times, so the installer names the exact time.
    const time = String(body.time || "").trim().slice(0, 40);
    // Owner freedom: an explicit city (any text) overrides the lead's city; an admin
    // may direct-assign the booking to a chosen installer. Otherwise a known market
    // routes to its installer; an unknown city keeps the booking with the lead's
    // installer (or the converter) so it never silently changes hands.
    const city = String(body.city || "").trim() || lead.city;
    const market = getMarket(city);
    const override = admin ? normalizeInstallerKey(body.installer) : "";
    const owner = override || (market ? keyToInstaller(market.inst).key : (lead.installer || key));
    const bookCity = market ? market.city : city;
    const fields = { City: bookCity, "Event Date": dateISO, Name: lead.name,
      Vehicle: lead.vehicle, Phone: lead.phone, Email: lead.email, Goals: lead.goals,
      Status: "Booked", Source: `lead:${lead.channel || "convert"}`, Installer: owner };
    if (time) fields["Scheduled Time"] = time;
    let bk;
    try { bk = await createTolerant(createBookingImpl, { token: c.token, baseId: c.baseId, table: c.bookings, fields }, ["Source", "Goals", "Scheduled Time"]); }
    catch (e) { return { statusCode: 502, body: JSON.stringify({ error: "store-unavailable" }) }; }
    const patch = { "Converted Booking": bk && bk.id, Stage: "Booked",
      "Activity Log": appendActivity(lead.activity, logLine(now, `converted → booking ${bk && bk.id} (${bookCity} ${dateISO}${time ? " " + time : ""})`)) };
    try { await updateTolerant(updateImpl, { token: c.token, baseId: c.baseId, table: c.priority, id, fields: patch }, ["Converted Booking", "Stage", "Activity Log"]); }
    catch (e) { return { statusCode: 502, body: JSON.stringify({ error: "store-unavailable" }) }; }
    // The booking payload tells the console exactly WHERE this landed so it can take
    // the user there — a converted lead must never just vanish from view.
    const booking = { id: bk && bk.id, city: bookCity, dateISO, installer: owner, slot: "", slotLabel: "",
      scheduledTime: time, name: lead.name, vehicle: lead.vehicle, phone: lead.phone, email: lead.email,
      mods: "", status: "Booked", isWalkin: false, calibration: "", vin: "", tuningPlatform: "",
      calibrationType: "", ecuId: "", gearSize: "", mileage: "" };
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "ok", bookingId: bk && bk.id, stage: "Booked", booking }) };
  }

  const built = applyLeadUpdate(lead, action, body, now);
  if (built.error) return { statusCode: 400, body: JSON.stringify({ error: built.error }) };
  try {
    await updateTolerant(updateImpl, { token: c.token, baseId: c.baseId, table: c.priority, id, fields: built.fields },
      ["Stage", "Channel", "Next Follow-up", "Last Contact", "Activity Log", "Installer", "City"]);
  } catch (e) { return { statusCode: 502, body: JSON.stringify({ error: "store-unavailable" }) }; }
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "ok", fields: built.fields }) };
}
module.exports = { handler };
