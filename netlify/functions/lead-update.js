// netlify/functions/lead-update.js
// Mutate one lead: setStage / logContact / setFollowup / reassign (admin) / convert.
// Ownership is enforced by the lead's Installer (a regular installer may only touch
// their own; admin may touch any + reassign). `convert` creates a Bookings record
// (walk-in-style, any date) and links it back to the lead.
const { cfg, getRecord, updateRecord, updateTolerant, createRecord, createTolerant } = require("./lib/airtable.js");
const { resolveInstaller, isAdmin } = require("./lib/installer-auth.js");
const { toLeadView, applyLeadUpdate, logLine, appendActivity } = require("./lib/leads.js");
const { getMarket } = require("./lib/markets.js");
const { keyToInstaller } = require("./lib/routing.js");

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

  if (action === "convert") {
    const dateISO = String(body.dateISO || "").trim() || new Date(now).toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return { statusCode: 400, body: JSON.stringify({ error: "bad-date" }) };
    // Optional installer-assigned time ("10:30 AM"). Free text — Noah's slot-mode
    // markets have no fixed slot times, so the installer names the exact time.
    const time = String(body.time || "").trim().slice(0, 40);
    const market = getMarket(lead.city);
    const owner = market ? keyToInstaller(market.inst).key : (lead.installer || key);
    const fields = { City: market ? market.city : lead.city, "Event Date": dateISO, Name: lead.name,
      Vehicle: lead.vehicle, Phone: lead.phone, Email: lead.email, Goals: lead.goals,
      Status: "Booked", Source: `lead:${lead.channel || "convert"}`, Installer: owner };
    if (time) fields["Scheduled Time"] = time;
    let bk;
    try { bk = await createTolerant(createBookingImpl, { token: c.token, baseId: c.baseId, table: c.bookings, fields }, ["Source", "Goals", "Scheduled Time"]); }
    catch (e) { return { statusCode: 502, body: JSON.stringify({ error: "store-unavailable" }) }; }
    const patch = { "Converted Booking": bk && bk.id, Stage: "Booked",
      "Activity Log": appendActivity(lead.activity, logLine(now, `converted → booking ${bk && bk.id} (${dateISO}${time ? " " + time : ""})`)) };
    try { await updateTolerant(updateImpl, { token: c.token, baseId: c.baseId, table: c.priority, id, fields: patch }, ["Converted Booking", "Stage", "Activity Log"]); }
    catch (e) { return { statusCode: 502, body: JSON.stringify({ error: "store-unavailable" }) }; }
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "ok", bookingId: bk && bk.id, stage: "Booked" }) };
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
