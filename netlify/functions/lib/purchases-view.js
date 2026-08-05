// netlify/functions/lib/purchases-view.js
// Pure purchase/ownership merge for Customer 360. Derives a "tune" purchase from
// each COMPLETED booking and merges with manually-logged Purchases rows into one
// date-sorted ownership timeline. No I/O — unit-tested directly.
function deriveTunes(bookings) {
  return (bookings || []).filter((b) => b.status === "Completed").map((b) => ({
    source: "booking", recordId: b.id, date: b.dateISO || "", category: "OTT Tune",
    item: [b.calibration || "OTT tune", b.vehicle].filter(Boolean).join(" — "),
    amount: "", vehicle: b.vehicle || "", installer: b.installer || "", cert: !!b.certSent,
  }));
}

function toPurchaseView(r) {
  const f = r.fields || {};
  return { source: "manual", recordId: r.id, date: String(f.Date || "").slice(0, 10),
    category: f.Category || "Other", item: f.Item || "",
    amount: f.Amount != null ? f.Amount : "", vehicle: f.Vehicle || "",
    installer: f.Installer || "", notes: f.Notes || "" };
}

function mergePurchases(tunes, manual) {
  return [...(tunes || []), ...(manual || [])].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

module.exports = { deriveTunes, toPurchaseView, mergePurchases };
