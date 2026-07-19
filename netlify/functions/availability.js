// netlify/functions/availability.js
const { getMarket } = require("./lib/markets.js");
const { getEventsForCity } = require("./lib/events.js");
const { cfg, listRecords } = require("./lib/airtable.js");
const { slotsFor, capacityFor, slotMode, computeOpen, formatSlot } = require("./lib/slots.js");
const EVENTS = require("./lib/events-data.js");

async function getAvailability(city, deps) {
  const { fetchImpl = fetch, env = process.env, log = console, now } = deps;
  const market = getMarket(city);
  if (!market) return { city, hasEvent: false, error: "unknown-city" };
  const list = await getEventsForCity(market.city, { fetchImpl, env, sheetId: env.EVENTS_SHEET_ID, baked: EVENTS, log }, now);
  if (!list.length) return { city: market.city, hasEvent: false, events: [] };
  const c = cfg(env);
  const allSlots = slotsFor(market.inst);
  const slotLabels = Object.fromEntries(allSlots.map((s) => [s, formatSlot(s)]));
  const events = [];
  for (const event of list) {
    let taken = [];
    try {
      const formula = `AND({City}="${market.city}",{Event Date}="${event.dateISO}",{Status}!="Cancelled")`;
      const recs = await listRecords({ fetchImpl, token: c.token, baseId: c.baseId, table: c.bookings, filterByFormula: formula, fields: ["Slot"] });
      taken = recs.map((r) => r.fields.Slot).filter(Boolean);
    } catch (e) {
      if (log.error) log.error("availability list failed", e.message);
      return { city: market.city, hasEvent: true, error: "store-unavailable", events: [] };
    }
    const openSlots = computeOpen(taken, market.inst);
    events.push({
      dateISO: event.dateISO, eventLabel: event.label, details: event.details || "", address: event.address || "",
      openSlots, takenSlots: allSlots.filter((s) => !openSlots.includes(s)),
      full: openSlots.length === 0, slotLabels,
    });
  }
  const soonest = events[0];
  return {
    city: market.city, hasEvent: true, capacity: capacityFor(market.inst), slotMode: slotMode(market.inst), events,
    eventDateISO: soonest.dateISO, eventLabel: soonest.eventLabel, details: soonest.details,
    openSlots: soonest.openSlots, takenSlots: soonest.takenSlots, full: soonest.full, slotLabels,
  };
}
async function handler(event) {
  const city = (event.queryStringParameters || {}).city || "";
  const out = await getAvailability(city, { fetchImpl: fetch, env: process.env });
  return { statusCode: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(out) };
}
module.exports = { handler, getAvailability };
