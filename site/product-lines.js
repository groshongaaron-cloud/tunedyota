// site/product-lines.js — pluggable product-line registry (profit centers).
// One adapter per supplier line; onboarding a new supplier = one new entry in
// LINES + its data file. Fitment keys on {make, model, year}; `year` accepts a
// plain year ("2015"), a garage option value ("2024|2.4L-T I4"), or a range.
// The checkout mode is structural compliance: 'converge' may render Buy;
// 'reserve' renders Reserve + referral ONLY (AMSOIL G-4000 §7.6 — no direct
// checkout); 'referral' renders links only.
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./amsoil-garage-render.js"));
  } else {
    root.TYProductLines = factory(root.AmsoilGarage);
  }
})(typeof self !== "undefined" ? self : this, function (AG) {
  function yearNum(year) {
    var m = String(year == null ? "" : year).match(/(19|20)\d{2}/);
    return m ? parseInt(m[0], 10) : null;
  }

  // Which CTAs a checkout mode may render — tested; do not widen casually.
  function ctasFor(mode) {
    if (mode === "converge") return ["buy"];
    if (mode === "reserve") return ["reserve", "referral"];
    return ["referral"];
  }

  function ciKey(obj, want) {
    if (!obj) return null;
    var w = String(want || "").toLowerCase();
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) if (keys[i].toLowerCase() === w) return keys[i];
    return null;
  }

  function magnusonItems(vehicle, catalog) {
    if (!vehicle || !catalog || !Array.isArray(catalog.applications)) return [];
    var name = (String(vehicle.make || "") + " " + String(vehicle.model || "")).trim().toLowerCase();
    var y = yearNum(vehicle.year);
    var out = [];
    catalog.applications.forEach(function (app) {
      if (String(app.vehicle || "").toLowerCase() !== name) return;
      if (y != null && !AG.inRange(app.years, y)) return;
      (app.kits || []).forEach(function (k) {
        out.push({ sku: k.sku, name: k.name, price: k.retail, blurb: k.note || (app.engine + " · " + app.years), url: "/" + app.slug });
      });
    });
    return out;
  }

  function amsoilGen(vehicle, garage) {
    if (!vehicle || !garage || !garage.vehicles) return null;
    var mk = ciKey(garage.vehicles, vehicle.make);
    var md = mk ? ciKey(garage.vehicles[mk], vehicle.model) : null;
    if (!md) return null;
    var gens = garage.vehicles[mk][md];
    var byOption = AG.genForOption(gens, String(vehicle.year || ""));
    if (byOption) return byOption;
    var y = yearNum(vehicle.year);
    if (y == null) return null;
    for (var i = 0; i < gens.length; i++) if (AG.inRange(gens[i].y, y)) return gens[i];
    return null;
  }

  function amsoilItems(vehicle, garage) {
    var gen = amsoilGen(vehicle, garage);
    if (!gen || !Array.isArray(gen.bundle)) return [];
    var out = [];
    gen.bundle.forEach(function (sku) {
      var p = (garage.products || {})[sku];
      if (!p) return;
      out.push({ sku: sku, name: p.name, price: p.salePrice != null ? p.salePrice : p.retailPrice, blurb: null, url: "/amsoil-garage" });
    });
    return out;
  }

  var LINES = [
    { id: "magnuson", label: "Power — Magnuson", icon: "⚡", checkout: "converge",
      itemsFor: function (vehicle, data) { return magnusonItems(vehicle, (data || {}).magnuson); } },
    { id: "amsoil", label: "Fluids — AMSOIL", icon: "🛢", checkout: "reserve",
      itemsFor: function (vehicle, data) { return amsoilItems(vehicle, (data || {}).amsoil); } },
  ];

  function linesFor(vehicle, data) {
    return LINES.map(function (l) {
      return { id: l.id, label: l.label, icon: l.icon, checkout: l.checkout, ctas: ctasFor(l.checkout), items: l.itemsFor(vehicle, data) };
    });
  }

  return { LINES: LINES, linesFor: linesFor, ctasFor: ctasFor, yearNum: yearNum, amsoilGen: amsoilGen };
});
