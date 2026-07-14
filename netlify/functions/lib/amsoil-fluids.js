// netlify/functions/lib/amsoil-fluids.js
// Pure lookup: (vehicle string, model year) -> the AMSOIL Garage fluids entry for
// that platform, with each system's product name + official stock number resolved
// from the catalog, plus the pre-filtered garage URL. Returns null when the vehicle
// isn't in the catalog. No I/O beyond require()-ing the static JSON. Feeds Certificate v2.
const CATALOG = require("../../../site/amsoil-garage.json");

function yearInRange(y, year) {
  if (!y || isNaN(year)) return false;
  if (/all\s*years/i.test(y)) return true;
  let m;
  if ((m = /^(\d{4})\s*\+$/.exec(y))) return year >= +m[1];
  if ((m = /^(\d{4})\s*[-–—]\s*(\d{4})$/.exec(y))) return year >= +m[1] && year <= +m[2];
  if ((m = /^(\d{4})$/.exec(y))) return year === +m[1];
  return false;
}

// Prefer a row whose engine appears in the vehicle string; within that, one whose
// year range contains the model year; else the first candidate.
function pickRow(rows, vlow, year) {
  if (!rows || !rows.length) return null;
  const byEngine = rows.filter((r) => r.e && vlow.indexOf(String(r.e).toLowerCase()) >= 0);
  const pool = byEngine.length ? byEngine : rows;
  const byYear = pool.filter((r) => yearInRange(r.y, year));
  return (byYear[0] || pool[0]);
}

// Tuned Yota AMSOIL dealer/ZO referral number — mirrors site/amsoil-referral.js
// (public; appears in URLs). Landing on amsoil.com with ?zo= sets a 30-day referral
// cookie on the customer's device so the order is credited to the dealer. Used by the
// certificate QR + the follow-up email so attribution is set the moment they land.
const AMSOIL_ZO = "30713116";
const ORDER_URL = "https://www.amsoil.com/shop/?zo=" + AMSOIL_ZO;

function garageUrl(make, model, year) {
  const q = "make=" + encodeURIComponent(make) + "&model=" + encodeURIComponent(model) +
    (year ? "&year=" + encodeURIComponent(year) : "");
  return "https://tunedyota.com/amsoil-garage?" + q;
}

function resolveFluids(vehicle, modelYear) {
  const vlow = String(vehicle || "").toLowerCase();
  const year = parseInt(String(modelYear || "").trim(), 10);
  const makes = CATALOG.vehicles || {};
  const products = CATALOG.products || {};
  for (const make of Object.keys(makes)) {
    if (vlow.indexOf(make.toLowerCase()) < 0) continue;
    // Longest model name first so "Land Cruiser" wins before any shorter substring.
    const names = Object.keys(makes[make]).sort((a, b) => b.length - a.length);
    for (const model of names) {
      if (vlow.indexOf(model.toLowerCase()) < 0) continue;
      const row = pickRow(makes[make][model], vlow, year);
      if (!row) return null;
      const systems = (row.systems || []).map((s) => {
        const p = products[s.sku] || {};
        return {
          system: s.system, product: p.name || s.sku, stockNo: p.stockNo || "",
          capacity: s.capacity, unit: s.unit || "",
          factoryInterval: s.factoryInterval || "", tunedInterval: s.tunedInterval || "",
        };
      });
      const yr = !isNaN(year) ? year : (/(\d{4})/.exec(row.y) || [])[1] || "";
      return { make, model, engine: row.e || "", systems, garageUrl: garageUrl(make, model, yr), orderUrl: ORDER_URL };
    }
  }
  return null;
}

module.exports = { resolveFluids, yearInRange };
