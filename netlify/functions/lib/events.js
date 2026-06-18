// netlify/functions/lib/events.js
// Reads the published event Google Sheet (gviz CSV) and maps city -> event.
function parseCsv(text) {
  const rows = []; let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function toISO(label) {
  const s = String(label == null ? "" : label).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function parseEvents(csv) {
  const rows = parseCsv(csv || "");
  if (!rows.length) return {};
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const ci = {
    market: header.indexOf("market"), date: header.indexOf("date"),
    active: header.indexOf("active"), event: header.indexOf("event"),
    details: header.indexOf("details"),
  };
  const out = {};
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]; if (!row || ci.market < 0) continue;
    const city = (row[ci.market] || "").trim(); if (!city) continue;
    const activeRaw = (ci.active >= 0 ? row[ci.active] || "" : "").trim().toLowerCase();
    out[city.toLowerCase()] = {
      city, label: (ci.date >= 0 ? row[ci.date] || "" : "").trim(),
      dateISO: toISO(ci.date >= 0 ? row[ci.date] : ""),
      active: !["no", "false", "0"].includes(activeRaw),
      event: ci.event >= 0 ? (row[ci.event] || "").trim() : "",
      details: ci.details >= 0 ? (row[ci.details] || "").trim() : "",
    };
  }
  return out;
}
async function fetchEvents({ fetchImpl, sheetId, log = console }) {
  if (!sheetId) return {};
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) { if (log.warn) log.warn("events fetch status", res.status); return {}; }
    return parseEvents(await res.text());
  } catch (e) { if (log.warn) log.warn("events fetch failed", e.message); return {}; }
}
async function getEventForCity(city, deps) {
  const map = await fetchEvents(deps);
  const e = map[String(city == null ? "" : city).trim().toLowerCase()];
  if (!e || !e.active || !e.dateISO) return null;
  return e;
}
module.exports = { parseCsv, toISO, parseEvents, fetchEvents, getEventForCity };
