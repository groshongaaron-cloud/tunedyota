// site/share.js
// "Get OTT Now!" share helper. Pure shareLinks() is node-testable; the DOM wiring
// (native share sheet + desktop fallback popover) runs only in the browser.
(function (root) {
  var SHARE_URL = "https://tunedyota.com/get-ott-now";
  var TEXT = "Get your Toyota or Lexus OTT tune — pick your vehicle and schedule with a Tuned Yota installer.";

  function shareLinks(url, text) {
    var u = encodeURIComponent(url);
    var t = encodeURIComponent(text);
    var tu = encodeURIComponent(text + " " + url);
    return {
      sms: "sms:?&body=" + tu,
      email: "mailto:?subject=" + encodeURIComponent("Get OTT Now — Tuned Yota") + "&body=" + tu,
      facebook: "https://www.facebook.com/sharer/sharer.php?u=" + u,
      reddit: "https://www.reddit.com/submit?url=" + u + "&title=" + t,
    };
  }

  if (typeof document !== "undefined") {
    var openFallback = function () {
      var existing = document.getElementById("ty-share-pop");
      if (existing) { existing.remove(); return; }
      var L = shareLinks(SHARE_URL, TEXT);
      var box = "flex:1;min-width:64px;text-align:center;padding:9px;border:1px solid #d8d2ca;border-radius:8px;color:#3A2E26;text-decoration:none";
      var pop = document.createElement("div");
      pop.id = "ty-share-pop";
      pop.setAttribute("style", "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;background:#fff;border:1px solid #d8d2ca;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.18);padding:14px 16px;max-width:340px;width:92%;font-family:-apple-system,Arial,sans-serif;color:#3A2E26");
      pop.innerHTML =
        '<div style="font-weight:700;margin-bottom:8px">Share “Get OTT Now”</div>' +
        '<button id="ty-copy" type="button" style="width:100%;padding:11px;margin:0 0 8px;border:0;border-radius:8px;background:#5B4B42;color:#fff;font-weight:700">Copy link</button>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<a href="' + L.sms + '" style="' + box + '">Text</a>' +
        '<a href="' + L.email + '" style="' + box + '">Email</a>' +
        '<a href="' + L.facebook + '" target="_blank" rel="noopener" style="' + box + '">Facebook</a>' +
        '<a href="' + L.reddit + '" target="_blank" rel="noopener" style="' + box + '">Reddit</a>' +
        '</div>' +
        '<div style="font-size:12px;color:#7c8472;margin-top:8px">Instagram, TikTok &amp; YouTube: tap Copy link, then paste it into your post or DM.</div>' +
        '<button id="ty-share-close" type="button" style="width:100%;padding:8px;margin-top:8px;border:0;background:none;color:#7c8472">Close</button>';
      document.body.appendChild(pop);
      document.getElementById("ty-copy").addEventListener("click", function () {
        var mark = function () { var c = document.getElementById("ty-copy"); if (c) c.textContent = "Copied!"; };
        if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(SHARE_URL).then(mark).catch(function () {}); }
        else { var ta = document.createElement("textarea"); ta.value = SHARE_URL; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); mark(); } catch (e) {} ta.remove(); }
      });
      document.getElementById("ty-share-close").addEventListener("click", function () { pop.remove(); });
    };
    var wire = function () {
      var btns = document.querySelectorAll("[data-share-ott]");
      Array.prototype.forEach.call(btns, function (btn) {
        btn.addEventListener("click", function () {
          if (navigator.share) { navigator.share({ title: "Get OTT Now — Tuned Yota", text: TEXT, url: SHARE_URL }).catch(function () {}); return; }
          openFallback();
        });
      });
    };
    if (document.readyState !== "loading") wire(); else document.addEventListener("DOMContentLoaded", wire);
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { shareLinks: shareLinks };
  else root.TYShare = { shareLinks: shareLinks };
})(typeof window !== "undefined" ? window : this);
