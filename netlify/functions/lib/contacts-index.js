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

module.exports = { normalizeName, personKey, splitName };
