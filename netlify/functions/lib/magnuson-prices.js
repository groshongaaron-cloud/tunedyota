// Server-side SKU -> price lookup from the SAME single source of truth the site
// uses (site/magnuson-catalog.js sets window.MAGNUSON_CATALOG). Loaded with a
// window shim, mirroring tests/magnuson-schema-image.test.js — so there is no
// second price table to drift. Payment amounts MUST come from here, never from
// the browser.
const path = require("path");
const CATALOG_PATH = path.join(__dirname, "..", "..", "..", "site", "magnuson-catalog.js");

function loadCatalog() {
  const prev = Object.prototype.hasOwnProperty.call(global, "window") ? global.window : undefined;
  global.window = {};
  delete require.cache[require.resolve(CATALOG_PATH)];
  require(CATALOG_PATH);
  const cat = global.window.MAGNUSON_CATALOG;
  if (prev === undefined) delete global.window; else global.window = prev;
  if (!cat || !Array.isArray(cat.applications)) throw new Error("MAGNUSON_CATALOG failed to load");
  return cat;
}

// SKU -> { name, retail, vehicle }. The same SKU may appear under several
// applications (e.g. the TVS1900 upgrade kit) — that's fine only if every
// occurrence agrees on the price; a conflict means the catalog itself is
// inconsistent and we refuse to sell at either number.
function priceMap(cat) {
  const map = {};
  for (const app of (cat || loadCatalog()).applications) {
    for (const kit of app.kits || []) {
      if (!kit.sku || typeof kit.retail !== "number") continue;
      const seen = map[kit.sku];
      if (seen && seen.retail !== kit.retail) {
        throw new Error(`catalog price conflict for ${kit.sku}: ${seen.retail} vs ${kit.retail}`);
      }
      if (!seen) map[kit.sku] = { name: kit.name, retail: kit.retail, vehicle: app.vehicle };
    }
  }
  return map;
}

let cached = null;
function priceForSku(sku) {
  if (!cached) cached = priceMap();
  return cached[String(sku || "").trim()] || null;
}

module.exports = { loadCatalog, priceMap, priceForSku };
