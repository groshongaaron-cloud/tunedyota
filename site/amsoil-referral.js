// site/amsoil-referral.js
/* TUNED YOTA × AMSOIL — referral-link helper.
   The ONLY place the dealer ZO number lives. Loaded in the browser (attaches to
   window) and required by Node (tests + price agent). Attribution sticks to the
   visitor's device for 30 days once they hit amsoil.com with ?zo= attached. */
(function (root) {
  var AMSOIL_ZO = "30713116";                 // Tuned Yota dealer referral (public; appears in URLs)
  var AMSOIL_BASE = "https://www.amsoil.com";

  // Append the referral param to any amsoil.com path or full URL.
  // ?zo= when there's no query yet, &zo= when there is; #fragment preserved.
  function amsoilUrl(pathOrUrl, zo) {
    zo = zo || AMSOIL_ZO;
    var url = String(pathOrUrl || "");
    if (!/^https?:\/\//i.test(url)) url = AMSOIL_BASE + (url.charAt(0) === "/" ? "" : "/") + url;
    var hash = "", hi = url.indexOf("#");
    if (hi !== -1) { hash = url.slice(hi); url = url.slice(0, hi); }
    var sep = url.indexOf("?") === -1 ? "?" : "&";
    return url + sep + "zo=" + encodeURIComponent(zo) + hash;
  }

  var api = { AMSOIL_ZO: AMSOIL_ZO, AMSOIL_BASE: AMSOIL_BASE, amsoilUrl: amsoilUrl };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") { window.AMSOIL_ZO = AMSOIL_ZO; window.amsoilUrl = amsoilUrl; window.AMSOIL_BASE = AMSOIL_BASE; }
})(typeof globalThis !== "undefined" ? globalThis : this);
