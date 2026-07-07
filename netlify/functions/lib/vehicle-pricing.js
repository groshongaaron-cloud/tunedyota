// netlify/functions/lib/vehicle-pricing.js
// Server-side per-vehicle OTT pricing, sourced from lib/vehicles.json (a byte-exact
// copy of the funnel's inline VEHICLES config — kept honest by tests/vehicles-parity.test.js).
// Powers the WebMCP `get_vehicle_pricing` tool. Read-only; no quotes are committed here.
const VEHICLES = require("./vehicles.json");

// Mirror of the funnel's parseYearRange: "2016-2023" -> {lo,hi}; "2024+" -> {lo, hi:currentYear};
// a bare "2019" -> {lo:2019, hi:2019}.
function parseYearRange(str, currentYear) {
  const CUR = currentYear || new Date().getFullYear();
  const s = String(str == null ? "" : str);
  let m = s.match(/((?:19|20)\d{2})\s*(?:-|–|—|to)\s*((?:19|20)\d{2})/i);
  if (m) return { lo: Math.min(+m[1], +m[2]), hi: Math.max(+m[1], +m[2]) };
  m = s.match(/((?:19|20)\d{2})\s*(?:\+|present|current|newer|now)/i);
  if (m) return { lo: +m[1], hi: CUR };
  m = s.match(/((?:19|20)\d{2})/);
  if (m) return { lo: +m[1], hi: +m[1] };
  return null;
}

function canonicalMake(make) {
  if (!make) return null;
  const k = String(make).trim().toLowerCase();
  return Object.keys(VEHICLES).find((mk) => mk.toLowerCase() === k) || null;
}
function canonicalModel(make, model) {
  const mk = canonicalMake(make);
  if (!mk || !model) return null;
  const k = String(model).trim().toLowerCase().replace(/\s+/g, "");
  return Object.keys(VEHICLES[mk]).find((md) => md.toLowerCase().replace(/\s+/g, "") === k) || null;
}
function makes() { return Object.keys(VEHICLES); }
function models(make) { const mk = canonicalMake(make); return mk ? Object.keys(VEHICLES[mk]) : []; }
function catalog() { return makes().reduce((o, mk) => { o[mk] = models(mk); return o; }, {}); }

function configPricing(cfg) {
  const out = { years: cfg.y, engine: cfg.e, ottTuneFrom: cfg.base };
  if (cfg.custom) out.customCalibration = cfg.custom;
  if (cfg.sc) out.forcedInduction = { type: cfg.turbo ? "Turbo Performance Calibration" : "Supercharger Calibration", from: cfg.sc };
  if (cfg.carb) out.carbNote = cfg.carb;
  if (cfg.note) out.note = cfg.note;
  return out;
}

const DISCLAIMER = "Suggested starting prices (USD); final quote confirmed at booking. Every calibration keeps factory emissions fully intact and EPA-compliant. See exact options at https://tunedyota.com/find-your-exact-tune";

// Return pricing for a make/model, optionally narrowed to a year.
// - no make -> the supported catalog
// - make only -> that make's models
// - make + model -> every config (year range + prices)
// - make + model + year -> the config(s) covering that year
function priceVehicle(args, currentYear) {
  const { make, model, year } = args || {};
  if (!make) return { supported: null, message: "Provide a make + model (+ optional year). Tuned Yota supports these Toyota and Lexus platforms:", catalog: catalog() };
  const mk = canonicalMake(make);
  if (!mk) return { supported: false, message: `"${make}" is not a supported make. Tuned Yota tunes Toyota and Lexus.`, makes: makes() };
  if (!model) return { supported: null, make: mk, message: `Provide a ${mk} model + optional year.`, models: models(mk) };
  const md = canonicalModel(mk, model);
  if (!md) return { supported: false, make: mk, message: `"${model}" is not a supported ${mk} model.`, models: models(mk) };

  let configs = VEHICLES[mk][md];
  let matchedYear = null;
  if (year != null && String(year) !== "") {
    const y = parseInt(String(year), 10);
    if (!isNaN(y)) {
      matchedYear = y;
      configs = configs.filter((cfg) => { const r = parseYearRange(cfg.y, currentYear); return r && y >= r.lo && y <= r.hi; });
    }
  }
  if (!configs.length) {
    const ranges = VEHICLES[mk][md].map((c) => c.y);
    return { supported: false, make: mk, model: md, year: matchedYear, message: `No listed calibration for a ${matchedYear || ""} ${mk} ${md}. Supported year ranges: ${ranges.join(", ")}.`, availableRanges: ranges };
  }
  return { supported: true, make: mk, model: md, year: matchedYear, currency: "USD", disclaimer: DISCLAIMER, options: configs.map(configPricing) };
}

module.exports = { parseYearRange, makes, models, catalog, priceVehicle, canonicalMake, canonicalModel, VEHICLES };
