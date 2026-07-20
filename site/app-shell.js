// site/app-shell.js — pure logic for the client app shell (site/app.html):
// hash routing, deep-link map, guest-garage store. UMD so node --test can
// exercise it. Shares the web guest-garage key so web<->app behavior matches.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TYAppShell = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var GARAGE_KEY = "ty_amsoil_garage"; // same key as amsoil-garage.html:337
  var TOKEN_KEY = "ty_client_token";   // same key as account.html:77
  var TABS = ["garage", "shop", "book", "chat"];

  function parseRoute(hash) {
    var h = String(hash || "").replace(/^#/, "");
    if (!h) return { view: "garage", arg: null };
    var parts = h.split("/");
    if (parts[0] === "vehicle") {
      var i = parseInt(parts[1], 10);
      return { view: "vehicle", arg: isNaN(i) || i < 0 ? 0 : i };
    }
    if (parts[0] === "shop") return { view: "shop", arg: parts[1] || null };
    if (TABS.indexOf(parts[0]) !== -1) return { view: parts[0], arg: null };
    return { view: "garage", arg: null };
  }

  function tabFor(view) { return view === "vehicle" ? "garage" : view; }

  // Universal-link paths -> shell hash (spec §9). null = not ours.
  function routeForLink(pathname) {
    var p = String(pathname || "").replace(/\/+$/, "") || "/";
    if (p === "/app" || p === "/account") return "#garage";
    if (p === "/magnuson-supercharger-pricing" || p === "/supercharger") return "#shop/magnuson";
    if (p.indexOf("/amsoil") === 0) return "#shop/amsoil";
    if (p === "/book" || p.indexOf("/book/") === 0) return "#book";
    return null;
  }

  function loadGarage(storage) {
    try {
      var v = JSON.parse(storage.getItem(GARAGE_KEY) || "[]");
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function saveGarage(storage, list) {
    try { storage.setItem(GARAGE_KEY, JSON.stringify(list)); } catch (e) {}
    return list;
  }
  function vehicleKey(v) {
    return [v && v.make, v && v.model, v && v.year].map(function (s) { return String(s || "").toLowerCase(); }).join("|");
  }
  function addVehicle(list, v) {
    if (!v || !v.make || !v.model || !v.year) return list;
    var key = vehicleKey(v);
    if (list.some(function (x) { return vehicleKey(x) === key; })) return list;
    return list.concat([{ make: String(v.make).slice(0, 40), model: String(v.model).slice(0, 40), year: String(v.year) }]).slice(0, 20);
  }
  function removeVehicle(list, i) { return list.filter(function (_, ix) { return ix !== i; }); }

  return { GARAGE_KEY: GARAGE_KEY, TOKEN_KEY: TOKEN_KEY, TABS: TABS, parseRoute: parseRoute, tabFor: tabFor, routeForLink: routeForLink, loadGarage: loadGarage, saveGarage: saveGarage, addVehicle: addVehicle, removeVehicle: removeVehicle, vehicleKey: vehicleKey };
});
