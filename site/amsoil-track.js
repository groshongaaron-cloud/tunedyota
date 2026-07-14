// site/amsoil-track.js — TUNED YOTA × AMSOIL page click instrumentation.
// Loaded on every AMSOIL page. At runtime it rewrites outbound amsoil.com links to
// route through /.netlify/functions/amsoil-go (which logs the click by source, then
// 302s to the SAME destination with the dealer ?zo=). The rendered HTML keeps direct
// amsoil.com links, so crawlers and no-JS visitors are unaffected — this is pure
// progressive enhancement for attribution. The source is derived from the page slug.
(function (root) {
  var TRACK = "/.netlify/functions/amsoil-go";

  // The relative amsoil.com target ("/path?query#hash", zo stripped) for a link, or ""
  // if the href isn't an amsoil.com URL. Used as the ?p= so the destination is preserved.
  function relTarget(href, loc) {
    var base = "https://www.amsoil.com";
    var u;
    try { u = new URL(String(href || ""), (loc && loc.href) || base); } catch (e) { return ""; }
    if (!/(^|\.)amsoil\.com$/i.test(u.hostname)) return "";
    u.searchParams.delete("zo");
    var qs = u.searchParams.toString();
    return u.pathname + (qs ? "?" + qs : "") + (u.hash || "");
  }
  // shop vs pc — only for the metrics label + fallback destination.
  function destOf(rel) { return /offers\/pc|preferred-customer/i.test(rel) ? "pc" : "shop"; }
  // page slug -> source tag, e.g. "/amsoil-tundra.html" -> "page:amsoil-tundra".
  function sourceOf(loc) {
    var p = ((loc && loc.pathname) || "").replace(/^\/+/, "").replace(/\.html$/, "");
    return "page:" + (p || "home").slice(0, 50);
  }
  function trackerHref(rel, loc) {
    return TRACK + "?to=" + destOf(rel) + "&s=" + encodeURIComponent(sourceOf(loc)) + "&p=" + encodeURIComponent(rel);
  }
  // Rewrite every amsoil.com link on the page (idempotent — skips already-tracked ones).
  function instrument(doc, loc) {
    var as = doc.querySelectorAll("a[href]");
    for (var i = 0; i < as.length; i++) {
      var a = as[i], href = a.getAttribute("href") || "";
      if (href.indexOf("amsoil-go") >= 0) continue;
      var rel = relTarget(href, loc);
      if (!rel) continue;
      a.setAttribute("href", trackerHref(rel, loc));
    }
  }

  var api = { relTarget: relTarget, destOf: destOf, sourceOf: sourceOf, trackerHref: trackerHref, instrument: instrument };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document !== "undefined") {
    var run = function () { instrument(document, location); };
    if (document.readyState !== "loading") run();
    else document.addEventListener("DOMContentLoaded", run);
    // The AMSOIL Garage injects product links after load; re-run on DOM changes so
    // those get tracked too. instrument() is idempotent, so re-runs are cheap/safe.
    if (typeof MutationObserver !== "undefined") {
      var mo = new MutationObserver(function () { run(); });
      var start = function () { if (document.body) mo.observe(document.body, { childList: true, subtree: true }); };
      if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
