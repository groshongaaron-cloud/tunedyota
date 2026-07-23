// netlify/functions/lib/events.js
// Reads the published event Google Sheet (gviz CSV) and maps city -> [events].
// A city now holds an ARRAY of event objects (multi-date support). Single-object
// baked entries are normalized to a one-element array via asArray().
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

// --- parseEvents: build city -> array (append duplicates) ---
function parseEvents(csv) {
  const rows = parseCsv(csv || "");
  if (!rows.length) return {};
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const ci = {
    market: header.indexOf("market"), date: header.indexOf("date"),
    active: header.indexOf("active"), event: header.indexOf("event"),
    details: header.indexOf("details"), address: header.indexOf("address"),
  };
  const out = {};
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]; if (!row || ci.market < 0) continue;
    const city = (row[ci.market] || "").trim(); if (!city) continue;
    const activeRaw = (ci.active >= 0 ? row[ci.active] || "" : "").trim().toLowerCase();
    const rec = {
      city, label: (ci.date >= 0 ? row[ci.date] || "" : "").trim(),
      dateISO: toISO(ci.date >= 0 ? row[ci.date] : ""),
      active: !["no", "false", "0"].includes(activeRaw),
      event: ci.event >= 0 ? (row[ci.event] || "").trim() : "",
      details: ci.details >= 0 ? (row[ci.details] || "").trim() : "",
      address: ci.address >= 0 ? (row[ci.address] || "").trim() : "",
    };
    (out[city.toLowerCase()] || (out[city.toLowerCase()] = [])).push(rec);
  }
  return out;
}

// --- normalization + flattening helpers ---
function asArray(v) { return Array.isArray(v) ? v : (v ? [v] : []); }
function flattenEvents(map) {
  const out = [];
  for (const key of Object.keys(map || {})) for (const e of asArray(map[key])) out.push(e);
  return out;
}
function todayISO(now) {
  const d = now || new Date(); const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// --- Airtable "Events" table: the owner-editable source of truth ---
// Rows map Market/Date/Label/Active/Event/Details/Address to the same event shape
// the sheet parser produces. Results are cached briefly so the booking path doesn't
// pay an Airtable round-trip per request, and a stale cache is served if a refresh
// fails — the live table degrades to last-known-good, then to sheet/baked data.
const _airtableEventsCache = new Map(); // `${baseId}/${table}` -> { at, byCity }

function eventFromAirtableFields(f = {}) {
  const s = (v) => String(v == null ? "" : v).trim();
  const dateText = s(f.Date);
  return {
    city: s(f.Market),
    label: s(f.Label) || dateText,
    dateISO: toISO(dateText),
    active: f.Active === true,
    event: s(f.Event),
    details: s(f.Details),
    address: s(f.Address),
    firstSlot: s(f["First Slot"]),
    lastSlot: s(f["Last Slot"]),
  };
}

async function fetchAirtableEvents({ fetchImpl, env, log = console, cacheTtlMs = 60000 }) {
  const token = env && env.AIRTABLE_TOKEN, baseId = env && env.AIRTABLE_BASE_ID;
  if (!token || !baseId) return null;
  const table = env.AIRTABLE_EVENTS_TABLE || "Events";
  const key = `${baseId}/${table}`;
  const hit = _airtableEventsCache.get(key);
  if (hit && Date.now() - hit.at < cacheTtlMs) return hit.byCity;
  try {
    const records = [];
    let offset;
    do {
      const params = new URLSearchParams();
      if (offset) params.set("offset", offset);
      const res = await fetchImpl(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}?${params}`,
        { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`airtable events ${res.status}`);
      const body = await res.json();
      records.push(...(body.records || []));
      offset = body.offset;
    } while (offset);
    const byCity = {};
    for (const r of records) {
      const e = eventFromAirtableFields(r && r.fields);
      if (!e.city) continue;
      const k = e.city.toLowerCase();
      (byCity[k] || (byCity[k] = [])).push(e);
    }
    _airtableEventsCache.set(key, { at: Date.now(), byCity });
    return byCity;
  } catch (e) {
    if (log.warn) log.warn("airtable events fetch failed", e.message);
    return hit ? hit.byCity : null; // stale-but-known beats empty
  }
}

// --- fetch: city -> array; per city, Airtable wins over sheet, sheet over baked ---
async function fetchEvents(deps) {
  const { fetchImpl, sheetId, baked = {}, log = console } = deps;
  let fromSheet = {};
  if (sheetId) {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
    try {
      const res = await fetchImpl(url);
      if (res.ok) fromSheet = parseEvents(await res.text());
      else if (log.warn) log.warn("events fetch status", res.status);
    } catch (e) { if (log.warn) log.warn("events fetch failed", e.message); }
  }
  const fromAirtable = (await fetchAirtableEvents(deps)) || {};
  const merged = {};
  for (const key of Object.keys(baked)) merged[key] = asArray(baked[key]);
  for (const key of Object.keys(fromSheet)) merged[key] = fromSheet[key]; // a configured sheet overrides baked
  for (const key of Object.keys(fromAirtable)) merged[key] = fromAirtable[key]; // the Events table overrides both
  // Baked entries are keyed by city but don't embed a `city` field. Downstream
  // routing (getMarket) + roster/booking filtering key off ev.city — backfill it
  // from the map key so baked events don't route to unknown-city:undefined.
  for (const key of Object.keys(merged)) {
    merged[key] = merged[key].map((e) => (e && !e.city ? { ...e, city: key } : e));
  }
  return merged;
}

// --- funnel/booking helpers: future-filtered, soonest-first ---
async function getEventsForCity(city, deps, now) {
  const map = await fetchEvents(deps);
  const key = String(city == null ? "" : city).trim().toLowerCase();
  const today = todayISO(now);
  return asArray(map[key])
    .filter((e) => e && e.active && e.dateISO && e.dateISO >= today)
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
}
async function getCurrentEventForCity(city, deps, now) {
  return (await getEventsForCity(city, deps, now))[0] || null;
}

// --- ops helper: every active dated event, no future filter ---
async function getAllActiveEvents(deps) {
  const map = await fetchEvents(deps);
  return flattenEvents(map).filter((e) => e && e.active && e.dateISO);
}

// --- back-compat: soonest active dated event regardless of past/future ---
async function getEventForCity(city, deps) {
  const map = await fetchEvents(deps);
  const key = String(city == null ? "" : city).trim().toLowerCase();
  const list = asArray(map[key])
    .filter((e) => e && e.active && e.dateISO)
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  return list[0] || null;
}

module.exports = { parseCsv, toISO, parseEvents, fetchEvents, fetchAirtableEvents, getEventForCity, getEventsForCity, getCurrentEventForCity, getAllActiveEvents, flattenEvents, asArray };
