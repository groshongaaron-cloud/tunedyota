// netlify/functions/installer-roster.js
// Live, per-installer event roster. Scoped to the authenticated installer's key.
const { cfg, listRecords } = require("./lib/airtable.js");
const { resolveInstaller, isAdmin } = require("./lib/installer-auth.js");
const { formatSlot } = require("./lib/slots.js");
const { flexFuelNote } = require("./lib/flex-fuel.js");
const { getAllActiveEvents } = require("./lib/events.js");
const { getMarket } = require("./lib/markets.js");
const { keyToInstaller, normalizeInstallerKey } = require("./lib/routing.js");
const EVENTS = require("./lib/events-data.js");
const { deriveVehicle, resolveCommission } = require("./lib/ott-commission.js");

const dateOnly = (s) => String(s == null ? "" : s).slice(0, 10);
const bySlot = (a, b) => String(a.slot || "").localeCompare(String(b.slot || ""), undefined, { numeric: true });

// Bound a promise so a stalled upstream can't hang the whole roster. Rejects with
// `msg` after `ms`; always clears its timer so it never keeps the process alive.
function withTimeout(promise, ms, msg) {
  let t;
  const timeout = new Promise((_, reject) => { t = setTimeout(() => reject(new Error(msg || "timeout")), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

async function buildRoster(deps) {
  const { env = process.env, fetchImpl = fetch, now = new Date(), key, admin = false, log = console,
          eventsTimeoutMs = 6000,
          list = (a) => listRecords({ fetchImpl, ...a }),
          loadEvents = () => getAllActiveEvents({ fetchImpl, env, sheetId: env.EVENTS_SHEET_ID, baked: EVENTS, log }) } = deps;
  const c = cfg(env);
  // Admins see every installer's roster; regular installers are scoped to their own
  // key. FIND (not equality) so records tagged with a legacy long-label option
  // ("Noah - Milwaukee, …") still reach their installer; keys are trusted values
  // from resolveInstaller, never user input.
  const filterByFormula = admin
    ? `{Status}!="Cancelled"`
    : `AND(FIND("${key}", LOWER({Installer}&""))>0,{Status}!="Cancelled")`;
  const recs = await list({ token: c.token, baseId: c.baseId, table: c.bookings, filterByFormula });
  const today = now.toISOString().slice(0, 10);
  const bookings = recs.map((r) => {
    const f = r.fields || {};
    const src = String(f.Source || "");
    // Installer arrives as a single-select string, multi-select array, or legacy
    // long label — normalize to the canonical key.
    const owner = normalizeInstallerKey(f.Installer);
    let commission = null;
    if (f.Status === "Completed") {
      const dv = deriveVehicle(f.Vehicle || "");
      commission = resolveCommission({
        vehicleType: dv.vehicleType, engine: dv.engine,
        year: f["Model Year"] || dv.year,
        tuningPlatform: f["Tuning Platform"], calibrationType: f["Calibration Type"],
      });
    }
    return {
      id: r.id, city: f.City || "", dateISO: dateOnly(f["Event Date"]), installer: owner || "",
      slot: f.Slot || "", slotLabel: f.Slot ? formatSlot(f.Slot) : "",
      name: f.Name || "", vehicle: f.Vehicle || "", phone: f.Phone || "", email: f.Email || "",
      mods: f.Modifications || "", modelYear: f["Model Year"] || "", status: f.Status || "Booked",
      flexFuelNote: flexFuelNote(f.Vehicle),   // Policy 0011 day-of reminder for Tundras
      isWalkin: /^(intake|installer):walk-in/i.test(src),
      ott: /(^|[:\s])ott-/i.test(src),
      calibration: f["OTT Calibration"] || "", vin: f.VIN || "",
      tuningPlatform: f["Tuning Platform"] || "", calibrationType: f["Calibration Type"] || "",
      ecuId: f["ECU ID"] || "", gearSize: f["Gear Size"] || "", mileage: f.Mileage || "",
      certDelivery: f["Cert Delivery"] || "",
      signed: !!(f["Customer Signature"] && String(f["Customer Signature"]).trim()),
      commission,
    };
  }).sort((a, b) => a.dateISO.localeCompare(b.dateISO) || bySlot(a, b));

  // Scheduled events dated today-or-later in the caller's markets (all markets when
  // admin). Lets the console show upcoming days that have no bookings yet and accept
  // the first walk-in. Additive + best-effort: a fetch failure just yields no events.
  let events = [];
  try {
    const seen = {};
    for (const e of await withTimeout(loadEvents(), eventsTimeoutMs, "events load timeout")) {
      if (!e || !e.dateISO || e.dateISO < today) continue;
      const market = getMarket(e.city);
      if (!market) continue;
      const ownerKey = keyToInstaller(market.inst).key;
      if (!admin && ownerKey !== key) continue;
      const k = market.city + "|" + e.dateISO;
      if (seen[k]) continue;
      seen[k] = 1;
      events.push({ city: market.city, dateISO: e.dateISO, installer: ownerKey });
    }
    events.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  } catch (e) { if (log && log.warn) log.warn("roster events", e.message); events = []; }

  return { installer: key, admin: !!admin, today, bookings, events,
    reviewUrl: String((env.GOOGLE_REVIEW_URL || "")).trim(),
    vapidPublicKey: String((env.VAPID_PUBLIC_KEY || "")).trim() };
}

async function handler(event) {
  const key = resolveInstaller(event.headers || {}, process.env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  try {
    const out = await buildRoster({ key, admin: isAdmin(key, process.env) });
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
  } catch (e) { return { statusCode: 502, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: e.message }) }; }
}
module.exports = { handler, buildRoster };
