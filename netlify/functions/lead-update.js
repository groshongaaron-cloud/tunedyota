// netlify/functions/lead-update.js
// Mutate one lead: setStage / logContact / setFollowup / reassign (admin) / convert / delete.
// Ownership is enforced by the lead's Installer (a regular installer may only touch
// their own; admin may touch any + reassign). `convert` creates a Bookings record
// (walk-in-style, any date) and links it back to the lead.
const { cfg, getRecord, updateRecord, updateTolerant, createRecord, createTolerant, deleteRecord } = require("./lib/airtable.js");
const { resolveInstaller, isAdmin } = require("./lib/installer-auth.js");
const { toLeadView, applyLeadUpdate, logLine, appendActivity, toBookingSummary, buildLinkPatch, buildUnlinkPatch, computeMerge } = require("./lib/leads.js");
const { getMarket } = require("./lib/markets.js");
const { keyToInstaller, normalizeInstallerKey } = require("./lib/routing.js");
const { isValidSlot, formatSlot } = require("./lib/slots.js");
const { withCors } = require("./lib/cors.js");

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
    // Inline corrections (capture payoff, 2026-08-02): the installer may fix
    // name/vehicle/year/phone/email right in the convert strip. Corrections ride
    // into the booking AND write back to the lead so the records never diverge.
    const ov = {
      Name: String(body.name || "").trim(),
      Vehicle: String(body.vehicle || "").trim(),
      Phone: String(body.phone || "").trim(),
      Email: String(body.email || "").trim(),
      "Model Year": /^(19|20)\d{2}$/.test(String(body.modelYear || "").trim()) ? String(body.modelYear).trim() : "",
    };
    const eff = { Name: ov.Name || lead.name, Vehicle: ov.Vehicle || lead.vehicle,
      Phone: ov.Phone || lead.phone, Email: ov.Email || lead.email,
      "Model Year": ov["Model Year"] || lead.modelYear };
    // A slot choice occupies real event capacity (the same Slot column
    // availability.js counts) — without it a converted booking is invisible
    // to the slot grid and the day silently overbooks.
    const slot = String(body.slot || "").trim();
    if (slot && !isValidSlot(slot, owner)) return { statusCode: 400, body: JSON.stringify({ error: "bad-slot" }) };
    const fields = { City: bookCity, "Event Date": dateISO, Name: eff.Name,
      Vehicle: eff.Vehicle, Phone: eff.Phone, Email: eff.Email, Goals: lead.goals,
      Status: "Booked",
      // Channel plus generation: keep the lead's granular origin (e.g. chat:instagram)
      // on the booking so attribution survives conversion (owner directive 2026-08-02).
      Source: `lead:${lead.channel || "convert"}` +
        (lead.source && lead.source !== `lead:${lead.channel}` ? ` (${lead.source})` : ""),
      Installer: owner };
    if (eff["Model Year"]) fields["Model Year"] = eff["Model Year"];
    if (lead.modifications) fields.Modifications = lead.modifications;
    if (slot) fields.Slot = slot;
    if (time) fields["Scheduled Time"] = time;
    let bk;
    try { bk = await createTolerant(createBookingImpl, { token: c.token, baseId: c.baseId, table: c.bookings, fields }, ["Source", "Goals", "Scheduled Time", "Model Year", "Modifications", "Slot"]); }
    catch (e) { return { statusCode: 502, body: JSON.stringify({ error: "store-unavailable" }) }; }
    const patch = { "Converted Booking": bk && bk.id, Booking: bk && bk.id ? [bk.id] : [], Stage: "Booked",
      "Activity Log": appendActivity(lead.activity, logLine(now, `converted → booking ${bk && bk.id} (${bookCity} ${dateISO}${slot ? " " + formatSlot(slot) : ""}${time ? " " + time : ""})`)) };
    for (const k of Object.keys(ov)) if (ov[k] && ov[k] !== (k === "Model Year" ? lead.modelYear : lead[k.toLowerCase()])) patch[k] = ov[k];
    try { await updateTolerant(updateImpl, { token: c.token, baseId: c.baseId, table: c.priority, id, fields: patch }, ["Converted Booking", "Booking", "Stage", "Activity Log", "Name", "Vehicle", "Phone", "Email", "Model Year"]); }
    catch (e) { return { statusCode: 502, body: JSON.stringify({ error: "store-unavailable" }) }; }
    // The booking payload tells the console exactly WHERE this landed so it can take
    // the user there — a converted lead must never just vanish from view.
    const booking = { id: bk && bk.id, city: bookCity, dateISO, installer: owner,
      slot, slotLabel: slot ? formatSlot(slot) : "",
      scheduledTime: time, name: eff.Name, vehicle: eff.Vehicle, phone: eff.Phone, email: eff.Email,
      modelYear: eff["Model Year"] || "",
      mods: lead.modifications || "", status: "Booked", isWalkin: false, calibration: "", vin: "", tuningPlatform: "",
      calibrationType: "", ecuId: "", gearSize: "", mileage: "" };
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "ok", bookingId: bk && bk.id, stage: "Booked", booking }) };
  }

  // Link to an EXISTING booking — the dedupe motion. Same end-state as convert
  // (Stage Booked, link, audit line) without creating a record. The response
  // carries the booking so the console can jump-and-flash it (no silent outcomes).
  if (action === "link") {
    const bookingId = String(body.bookingId || "").trim();
    if (!bookingId) return { statusCode: 400, body: JSON.stringify({ error: "missing-booking-id" }) };
    let bkRec;
    try { bkRec = await getImpl({ token: c.token, baseId: c.baseId, table: c.bookings, id: bookingId }); }
    catch (e) {
      const notFound = /40[34]/.test(String(e && e.message));
      return { statusCode: notFound ? 400 : 502, body: JSON.stringify({ error: notFound ? "booking-not-found" : "store-unavailable" }) };
    }
    const booking = toBookingSummary(bkRec);
    try {
      await updateTolerant(updateImpl, { token: c.token, baseId: c.baseId, table: c.priority, id, fields: buildLinkPatch(lead, booking, now) },
        ["Booking", "Converted Booking", "Stage", "Activity Log"]);
    } catch (e) { return { statusCode: 502, body: JSON.stringify({ error: "store-unavailable" }) }; }
    return { statusCode: 200, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ok", stage: "Booked", bookingId: booking.id, booking }) };
  }

  if (action === "unlink") {
    try {
      await updateTolerant(updateImpl, { token: c.token, baseId: c.baseId, table: c.priority, id, fields: buildUnlinkPatch(lead, now) },
        ["Booking", "Converted Booking", "Activity Log"]);
    } catch (e) { return { statusCode: 502, body: JSON.stringify({ error: "store-unavailable" }) }; }
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "ok", unlinked: true }) };
  }

  // Merge two client records (owner decisions 2026-07-31): absorb-and-delete,
  // survivor = earlier Created Time. Human-confirmed only — the console's
  // duplicate strip is the sole caller. Absorb is written and verified BEFORE
  // the delete; a failed delete returns deleted:false and the retry (computeMerge
  // is idempotent via the audit stamp) re-attempts only the delete.
  if (action === "merge") {
    const deleteImpl = ctx.deleteImpl || ((a) => deleteRecord({ ...a }));
    const duplicateId = String(body.duplicateId || "").trim();
    if (!duplicateId || duplicateId === id) return { statusCode: 400, body: JSON.stringify({ error: "missing-duplicate-id" }) };
    let dupRec;
    try { dupRec = await getImpl({ token: c.token, baseId: c.baseId, table: c.priority, id: duplicateId }); }
    catch (e) {
      const notFound = /40[34]/.test(String(e && e.message));
      return { statusCode: notFound ? 400 : 502, body: JSON.stringify({ error: notFound ? "duplicate-not-found" : "store-unavailable" }) };
    }
    const dupLead = toLeadView(dupRec);
    if (!admin && (dupLead.installer || "") !== key) return { statusCode: 400, body: JSON.stringify({ error: "not-your-market" }) };
    const m = computeMerge(rec, dupRec, now);
    if (Object.keys(m.fields).length) {
      try {
        await updateTolerant(updateImpl, { token: c.token, baseId: c.baseId, table: c.priority, id: m.survivorId, fields: m.fields },
          ["Preferred Contact", "Marketing Consent", "Consent Version", "Model Year", "Client Notes", "Goals",
           "Modifications", "Next Follow-up", "Follow-up Message", "Last Contact", "Stage", "Booking",
           "Converted Booking", "Activity Log"]);
      } catch (e) { return { statusCode: 502, body: JSON.stringify({ error: "store-unavailable" }) }; }
    }
    let deleted = true;
    try { await deleteImpl({ token: c.token, baseId: c.baseId, table: c.priority, id: m.duplicateId }); }
    catch (e) { deleted = false; }
    return { statusCode: 200, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ok", merged: true, survivorId: m.survivorId, deleted }) };
  }

  const built = applyLeadUpdate(lead, action, body, now);
  if (built.error) return { statusCode: 400, body: JSON.stringify({ error: built.error }) };
  try {
    await updateTolerant(updateImpl, { token: c.token, baseId: c.baseId, table: c.priority, id, fields: built.fields },
      ["Stage", "Channel", "Next Follow-up", "Follow-up Message", "Last Contact", "Activity Log", "Installer", "City"]);
  } catch (e) { return { statusCode: 502, body: JSON.stringify({ error: "store-unavailable" }) }; }
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "ok", fields: built.fields }) };
}
module.exports = { handler: withCors(handler) };
