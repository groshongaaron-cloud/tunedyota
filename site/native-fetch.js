// site/native-fetch.js — APP-BUNDLE-ONLY bootstrap. sync-web.mjs injects a
// <script> tag for this file into bundled HTML; no web page references it.
// Rewrites relative Netlify-function URLs to the live site so the native
// WebView (local-bundle origin) reaches production; CapacitorHttp (enabled in
// app/capacitor.config.ts) then performs the request natively, avoiding CORS.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else {
    var api = factory();
    if (api.isNative(root)) api.install(root);
  }
})(typeof self !== "undefined" ? self : this, function () {
  var BASE = "https://tunedyota.com";
  function isNative(w) {
    return !!(w && w.Capacitor && w.Capacitor.isNativePlatform && w.Capacitor.isNativePlatform());
  }
  function rewriteFnUrl(url) {
    if (typeof url === "string" && url.indexOf("/.netlify/") === 0) return BASE + url;
    return url;
  }
  function install(w) {
    var orig = w.fetch.bind(w);
    w.fetch = function (input, init) {
      return orig(typeof input === "string" ? rewriteFnUrl(input) : input, init);
    };
  }
  return { BASE: BASE, isNative: isNative, rewriteFnUrl: rewriteFnUrl, install: install };
});
