// netlify/functions/lib/contacts-index.js
// Pure dedup/merge for the console Contacts directory. Turns per-source
// contributions (Bookings, Leads, Clients) into one deduped person per human
// with a lightweight index row. No I/O — unit-tested directly.
const { normalizePhone, normalizeEmail } = require("./leads.js");

function normalizeName(s) {
  return String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, " ");
}

// Dedup key: phone (last 10) wins, else email, else name+vehicle. "" when
// nothing identifies the person (the caller drops those).
function personKey(c) {
  const p = normalizePhone(c.phone);
  if (p) return "p:" + p;
  const e = normalizeEmail(c.email);
  if (e) return "e:" + e;
  const nv = normalizeName(c.name) + "|" + normalizeName(c.vehicle);
  return nv === "|" ? "" : "n:" + nv;
}

function splitName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

// Merge per-source contributions into one row per person. For scalar fields the
// most-recently-active non-empty value wins; dates take the max; source record
// ids are collected. Territory = assigned installer, else the market covering
// the city (getMarket), else "".
function buildContactIndex(contributions, { getMarket } = {}) {
  const groups = new Map();
  for (const c of contributions || []) {
    const key = personKey(c);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  const rows = [];
  for (const [key, list] of groups) {
    const byRecency = [...list].sort((a, b) => String(b.activityDate || "").localeCompare(String(a.activityDate || "")));
    const pick = (field) => { for (const c of byRecency) { if (c[field]) return c[field]; } return ""; };
    const name = pick("name");
    const installer = pick("installer");
    const city = pick("city");
    const market = installer ? null : (getMarket ? getMarket(city) : null);
    const territory = installer || (market && market.inst) || "";
    const sources = { bookingIds: [], leadIds: [], clientId: "" };
    for (const c of list) {
      if (c.source === "booking" && c.recordId) sources.bookingIds.push(c.recordId);
      else if (c.source === "lead" && c.recordId) sources.leadIds.push(c.recordId);
      else if (c.source === "client" && c.recordId) sources.clientId = c.recordId;
    }
    const lastActivity = byRecency.reduce((m, c) => (String(c.activityDate || "") > m ? String(c.activityDate || "") : m), "");
    rows.push(Object.assign({
      personKey: key, displayName: name || pick("phone") || pick("email") || "Unknown",
      phone: pick("phone"), email: pick("email"), vehicle: pick("vehicle"), modelYear: pick("modelYear"),
      city, territory, sources, lastActivity,
    }, splitName(name)));
  }
  return rows.sort((a, b) => (normalizeName(a.lastName + " " + a.firstName) < normalizeName(b.lastName + " " + b.firstName) ? -1 : 1));
}

module.exports = { normalizeName, personKey, splitName, buildContactIndex };
