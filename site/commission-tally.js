// site/commission-tally.js
/* TUNED YOTA — pure commission aggregation for the installer console header.
   Sums the per-booking `commission` the roster already resolved server-side (from the
   OTT price sheet). No price sheet here — just arithmetic. Loaded in the browser
   (window) and required by Node (tests), like site/amsoil-referral.js. */
(function (root) {
  function ymOf(iso) { return String(iso == null ? "" : iso).slice(0, 7); }
  function prevYm(ym) {
    var p = String(ym).split("-"), y = +p[0], m = +p[1];
    m -= 1; if (m < 1) { m = 12; y -= 1; }
    return y + "-" + String(m).padStart(2, "0");
  }
  function commissionTally(bookings, curYm) {
    var cur = String(curYm), last = prevYm(cur);
    var t = { month: { total: 0, tunes: 0, pending: 0 }, lastMonth: { total: 0 }, lifetime: { total: 0 }, byInstaller: {} };
    (bookings || []).forEach(function (b) {
      if (!b || b.status !== "Completed") return;
      var m = ymOf(b.dateISO), c = b.commission, resolved = typeof c === "number";
      if (resolved) t.lifetime.total += c;
      if (m === cur) {
        t.month.tunes += 1;
        if (resolved) { t.month.total += c; var k = b.installer || ""; if (k) t.byInstaller[k] = (t.byInstaller[k] || 0) + c; }
        else t.month.pending += 1;
      } else if (m === last && resolved) {
        t.lastMonth.total += c;
      }
    });
    return t;
  }
  var api = { commissionTally: commissionTally, prevYm: prevYm };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") { window.commissionTally = commissionTally; }
})(typeof globalThis !== "undefined" ? globalThis : this);
