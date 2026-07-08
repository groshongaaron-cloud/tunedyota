/* ═══════════════════════════════════════════════════════════════
   TUNED YOTA · Product schema injector
   Builds schema.org Product/Offer JSON-LD from MAGNUSON_CATALOG so
   Google Shopping-style rich results & AI answer engines always see
   live, accurate pricing. Include AFTER /magnuson-catalog.js.

   Behavior:
   - On /magnuson-supercharger-pricing → ItemList of every kit.
   - On a vehicle page (body[data-veh-slug]) → Products for that
     vehicle only.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  var C = window.MAGNUSON_CATALOG;
  if (!C) return;

  var BUSINESS = {
    "@type": "AutomotiveBusiness",
    "@id": "https://tunedyota.com/#business",
    "name": "Tuned Yota",
    "telephone": "+1-612-406-7117",
    "url": "https://tunedyota.com/"
  };

  function productFor(app, kit) {
    return {
      "@type": "Product",
      "name": kit.name + " — " + app.vehicle + " " + app.years + " (" + app.engine + ")",
      "sku": kit.sku,
      "mpn": kit.sku,
      "brand": { "@type": "Brand", "name": "Magnuson Superchargers" },
      "category": "Vehicle Superchargers & Parts",
      "description": kit.name + " for " + app.years + " " + app.vehicle + " with the " + app.engine +
        ". Genuine Magnuson hardware sold by Tuned Yota, an authorized Magnuson dealer, installer, servicer and calibrator specializing in Toyota and Lexus. Ships to the lower 48; installation and OTT calibration available in the Upper Midwest.",
      "offers": {
        "@type": "Offer",
        "url": "https://tunedyota.com/" + app.slug,
        "price": String(kit.retail),
        "priceCurrency": "USD",
        "priceValidUntil": "2026-12-31",
        "availability": "https://schema.org/InStock",
        "itemCondition": "https://schema.org/NewCondition",
        "seller": BUSINESS
      }
    };
  }

  var slug = document.body.getAttribute("data-veh-slug");
  var apps = slug ? C.applications.filter(function (a) { return a.slug === slug; }) : C.applications;

  var products = [];
  var seen = {};
  apps.forEach(function (app) {
    app.kits.forEach(function (kit) {
      var key = kit.sku + "|" + app.slug;
      if (seen[key]) return;
      seen[key] = 1;
      products.push(productFor(app, kit));
    });
  });
  if (!products.length) return;

  var ld = slug && products.length === 1 ? Object.assign({ "@context": "https://schema.org" }, products[0]) : {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Magnuson Supercharger Kits for Toyota & Lexus — Tuned Yota",
    "numberOfItems": products.length,
    "itemListElement": products.map(function (p, i) {
      return { "@type": "ListItem", "position": i + 1, "item": p };
    })
  };

  var s = document.createElement("script");
  s.type = "application/ld+json";
  s.textContent = JSON.stringify(ld);
  document.head.appendChild(s);
})();
