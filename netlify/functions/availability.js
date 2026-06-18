// netlify/functions/availability.js
const { getMarket } = require("./lib/markets.js");
const { getEventForCity } = require("./lib/events.js");
const { cfg, listRecords } = require("./lib/airtable.js");
const { SLOT_TIMES, CAPACITY, computeOpen, formatSlot } = require("./lib/slots.js");
const EVENTS = require("./lib/events-data.js");

async function getAvailability(city, deps) {
  const { fetchImpl = fetch, env = process.env, log = console } = deps;
  const market = getMarket(city);
  if (!market) return { city, hasEvent: false, error: "unknown-city" };
  const event = await getEventForCity(market.city, { fetchImpl, sheetId: env.EVENTS_SHEET_ID, baked: EVENTS, log });
  if (!event) return { city: market.city, hasEvent: false };
  const c = cfg(env);
  const base = { city: market.city, hasEvent: true, eventDateISO: event.dateISO, eventLabel: event.label, details: event.details || "", capacity: CAPACITY };
  let taken = [];
  try {
    const formula = `AND({City}="${market.city}",{Event Date}="${event.dateISO}",{Status}!="Cancelled")`;
    const recs = await listRecords({ fetchImpl, token: c.token, baseId: c.baseId, table: c.bookings, filterByFormula: formula, fields: ["Slot"] });
    taken = recs.map((r) => r.fields.Slot).filter(Boolean);
  } catch (e) { if (log.error) log.error("availability list failed", e.message); return { ...base, error: "store-unavailable" }; }
  const openSlots = computeOpen(taken);
  return {
    ...base, openSlots,
    takenSlots: SLOT_TIMES.filter((s) => !openSlots.includes(s)),
    full: openSlots.length === 0,
    slotLabels: Object.fromEntries(SLOT_TIMES.map((s) => [s, formatSlot(s)])),
  };
}
async function handler(event) {
  const city = (event.queryStringParameters || {}).city || "";
  const out = await getAvailability(city, { fetchImpl: fetch, env: process.env });
  return { statusCode: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(out) };
}
module.exports = { handler, getAvailability };
