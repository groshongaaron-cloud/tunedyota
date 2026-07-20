// site/amsoil-garage-render.js
/* TUNED YOTA × AMSOIL — pure Garage logic (no DOM). Shared by the page + tests. */
(function (root) {
  function parseVehicleParams(search) {
    var p = new URLSearchParams(search || "");
    var parts = (p.get("v") || "").split(/[:|]/);
    return {
      make: (parts[0] || "").trim() || null,
      model: (parts[1] || "").trim() || null,
      year: p.get("y") ? parseInt(p.get("y"), 10) : null,
      engine: (p.get("e") || "").trim() || null
    };
  }

  // Mirror of vehicle-pricing.parseYearRange semantics for "2022+" / "2007-2021".
  function inRange(rangeStr, year, currentYear) {
    if (year == null) return true;
    var CUR = currentYear || new Date().getFullYear();
    var s = String(rangeStr || ""), m;
    if ((m = s.match(/((?:19|20)\d{2})\s*(?:-|–|—|to)\s*((?:19|20)\d{2})/i)))
      return year >= Math.min(+m[1], +m[2]) && year <= Math.max(+m[1], +m[2]);
    if ((m = s.match(/((?:19|20)\d{2})\s*\+/))) return year >= +m[1] && year <= CUR;
    if ((m = s.match(/((?:19|20)\d{2})/))) return year === +m[1];
    return false;
  }

  // includeUnverified: the /amsoil-garage landing shows fluids for EVERY generation
  // (matching the certificate, which prints them unconditionally). The default stays
  // gated so any other caller keeps the verified-only contract.
  function resolveVehicle(params, catalog, currentYear, includeUnverified) {
    if (!params || !params.make || !params.model) return null;
    var mk = Object.keys(catalog.vehicles).find(function (k) {
      return k.toLowerCase() === String(params.make).toLowerCase();
    });
    if (!mk) return null;
    var md = Object.keys(catalog.vehicles[mk]).find(function (k) {
      return k.toLowerCase().replace(/\s+/g, "") === String(params.model).toLowerCase().replace(/\s+/g, "");
    });
    if (!md) return null;
    var gens = catalog.vehicles[mk][md].filter(function (g) { return includeUnverified || g.verified; });
    var matches = gens.filter(function (g) { return inRange(g.y, params.year, currentYear); });
    if (!matches.length && params.year == null) matches = gens.slice(0, 1);
    // Same year range can cover two engines (e.g. 4Runner 05-09 V6 vs V8): an e=
    // param picks the row; without it the first row wins but every candidate is
    // returned so the caller can offer the engine choice.
    var gen = matches[0] || null;
    if (params.engine && matches.length > 1) {
      var elow = String(params.engine).toLowerCase();
      gen = matches.find(function (g) {
        var ge = String(g.e || "").toLowerCase();
        return ge.indexOf(elow) >= 0 || elow.indexOf(ge) >= 0;
      }) || gen;
    }
    return gen ? { make: mk, model: md, gen: gen, matches: matches } : null;
  }

  // Year-dropdown options, one per generation row. When two rows share a year
  // range the option value/label carries the engine so both stay selectable.
  function yearOptions(gens) {
    return gens.map(function (g) {
      var dup = gens.some(function (o) { return o !== g && o.y === g.y; });
      return dup
        ? { value: g.y + "|" + g.e, label: g.y + " · " + g.e }
        : { value: g.y, label: g.y };
    });
  }

  function genForOption(gens, value) {
    if (!value) return null;
    var parts = String(value).split("|");
    return gens.find(function (g) {
      return g.y === parts[0] && (parts.length < 2 || g.e === parts[1]);
    }) || null;
  }

  function optionForGen(gens, gen) {
    var dup = gens.some(function (o) { return o !== gen && o.y === gen.y; });
    return dup ? gen.y + "|" + gen.e : gen.y;
  }

  function bundleTotal(gen, products) {
    return gen.bundle.reduce(function (sum, sku) {
      var p = products[sku];
      if (!p) return sum;
      return sum + (p.salePrice != null ? p.salePrice : p.retailPrice);
    }, 0);
  }

  var api = { parseVehicleParams: parseVehicleParams, inRange: inRange, resolveVehicle: resolveVehicle, bundleTotal: bundleTotal, yearOptions: yearOptions, genForOption: genForOption, optionForGen: optionForGen };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.AmsoilGarage = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
