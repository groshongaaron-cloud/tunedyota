const EVENTS = require("./events-data.js");
const { MARKETS } = require("./markets.js");

// title-case the lowercase event keys ("twin cities" -> "Twin Cities")
function titleCase(s) { return s.replace(/\b\w/g, (c) => c.toUpperCase()); }

// city (lowercase) -> { state, inst } from MARKETS
function marketIndex() {
  const ix = {};
  for (const m of MARKETS) ix[m.city.toLowerCase()] = { state: m.state, inst: m.inst };
  return ix;
}

function eventsList() {
  const ix = marketIndex();
  return Object.entries(EVENTS).map(([key, ev]) => {
    const m = ix[key] || {};
    return { city: titleCase(key), state: m.state || "", dateISO: ev.dateISO, label: ev.label, installerKey: m.inst || "", active: ev.active !== false };
  });
}

function flattenRecords(records) {
  return (records || []).map((r) => ({ ...r.fields, id: r.id, createdTime: r.createdTime }));
}

module.exports = { eventsList, flattenRecords };
