// netlify/functions/intake.js
// Secret-gated staff intake: create a booking ("book") or a priority lead ("lead")
// from any channel (text/phone/email/facebook/instagram/walk-in/other). Reuses the
// same libs as book.js. Sends NO customer email (walk-ins are present; future-dated
// bookings still get the normal reminders).
const { getMarket } = require("./lib/markets.js");
const { keyToInstaller } = require("./lib/routing.js");
const { getEventForCity } = require("./lib/events.js");
const EVENTS = require("./lib/events-data.js");
const { cfg, listRecords, createRecord, createTolerant } = require("./lib/airtable.js");
const { isValidSlot, computeOpen } = require("./lib/slots.js");

function authed(headers, env) {
  const secret = env && env.INTAKE_SECRET;
  if (!secret) return false; // fail closed when unconfigured
  const got = (headers["x-intake-secret"] || headers["X-Intake-Secret"] || "").toString();
  return got === secret;
}

async function processIntake(body, deps) {
  const { fetchImpl = fetch, env = process.env, log = console,
          create = (a) => createRecord({ fetchImpl, ...a }),
          list = async ({ token, baseId, table, city, dateISO }) => {
            const formula = `AND({City}="${city}",{Event Date}="${dateISO}",{Status}!="Cancelled")`;
            const recs = await listRecords({ fetchImpl, token, baseId, table, filterByFormula: formula, fields: ["Slot"] });
            return recs.map((r) => r.fields.Slot).filter(Boolean);
          },
          loadEvent = (city) => getEventForCity(city, { fetchImpl, sheetId: env.EVENTS_SHEET_ID, baked: EVENTS, log }) } = deps;

  const d = body || {};
  const channel = String(d.channel || "other").toLowerCase();
  const source = `intake:${channel}`;
  const market = getMarket(d.city);
  if (!d.name || (!d.phone && !d.email)) return { status: "error", error: "missing-contact" };
  const c = cfg(env);

  if (d.mode === "lead") {
    // Leads tolerate an unknown/blank area: store them in a general "Unassigned"
    // bucket (City "Unassigned", blank Installer) so nothing is lost before the
    // region/installer is known. The owner triages + assigns these later.
    const instKey = market ? keyToInstaller(market.inst).key : "";
    const fields = {
      City: market ? market.city : "Unassigned", Name: d.name, Phone: d.phone || "", Email: d.email || "",
      Vehicle: d.vehicle || "", Goals: d.goals || "", Modifications: d.mods || "",
      Reason: "No event scheduled", Source: source,
    };
    if (instKey) fields.Installer = instKey; // omit when unassigned (leave the select blank)
    try {
      const rec = await createTolerant(create, { token: c.token, baseId: c.baseId, table: c.priority, fields }, ["Modifications", "Source"]);
      return { status: "lead", recordId: rec && rec.id, installer: instKey || "unassigned", unassigned: !market };
    } catch (e) { if (log.error) log.error("intake lead", e.message); return { status: "error", error: "store-unavailable" }; }
  }

  // book mode — requires a real market + a scheduled event
  if (!market) return { status: "error", error: "unknown-city" };
  const inst = keyToInstaller(market.inst);
  const event = await loadEvent(market.city);
  if (!event) return { status: "error", error: "no-event" };
  let taken = [];
  try {
    taken = await list({ token: c.token, baseId: c.baseId, table: c.bookings, city: market.city, dateISO: event.dateISO });
  } catch (e) { if (log.error) log.error("intake list", e.message); return { status: "error", error: "store-unavailable" }; }
  const open = computeOpen(taken);
  if (!d.slot || !isValidSlot(d.slot) || !open.includes(d.slot)) return { status: "conflict", openSlots: open };
  try {
    const rec = await createTolerant(create, { token: c.token, baseId: c.baseId, table: c.bookings, fields: {
      City: market.city, "Event Date": event.dateISO, Slot: d.slot,
      Name: d.name, Phone: d.phone || "", Email: d.email || "",
      Vehicle: d.vehicle || "", Goals: d.goals || "", Modifications: d.mods || "",
      Installer: inst.key, Status: "Booked", Source: source,
    } }, ["Modifications"]);
    return { status: "booked", city: market.city, eventDateISO: event.dateISO, eventLabel: event.label, slot: d.slot, installer: inst.key, recordId: rec && rec.id };
  } catch (e) { if (log.error) log.error("intake create", e.message); return { status: "error", error: "store-unavailable" }; }
}

async function handler(event) {
  if (!authed(event.headers || {}, process.env)) return { statusCode: 401, body: "unauthorized" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  const out = await processIntake(body, { fetchImpl: fetch, env: process.env });
  const code = out.status === "error" ? 502 : out.status === "conflict" ? 409 : 200;
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, processIntake, authed };
