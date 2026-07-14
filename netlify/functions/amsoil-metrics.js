// netlify/functions/amsoil-metrics.js
// Admin-only AMSOIL funnel metrics for the installer console. Aggregates the
// "AMSOIL Clicks" table (cert / follow-up / public-page clicks) plus booking-level
// cert + PC-Customer flags into: totals, clicks by source, the certs→clicks→PC
// funnel, a 14-day sparkline, and the most recent clicks. Read-only.
const { cfg, listAllRecords } = require("./lib/airtable.js");
const { resolveInstaller, isAdmin } = require("./lib/installer-auth.js");

const CLICKS = (env) => env.AIRTABLE_CLICKS_TABLE || "AMSOIL Clicks";
const dOnly = (s) => String(s == null ? "" : s).slice(0, 10);
const truthy = (v) => v === true || v === 1 || (typeof v === "string" && v.trim() !== "" && !/^(false|no|0|off)$/i.test(v));

// Pure aggregator — clicks: [{Booking,Destination,Source,"Clicked At"}],
// bookings: [{id, fields}]. `now` injectable for deterministic daily buckets.
function aggregate(clicks, bookings, now = new Date()) {
  const byId = {};
  for (const b of bookings || []) byId[b.id] = b.fields || {};
  let shop = 0, pc = 0;
  const uniq = new Set(), src = {}, dayMap = {}, recent = [];
  for (const cl of clicks || []) {
    const dest = cl.Destination === "pc" ? "pc" : "shop";
    if (dest === "pc") pc++; else shop++;
    if (cl.Booking) uniq.add(cl.Booking);
    const s = (cl.Source && String(cl.Source).trim()) || (cl.Booking ? "cert" : "other");
    (src[s] = src[s] || { source: s, clicks: 0, shop: 0, pc: 0 }).clicks++;
    src[s][dest]++;
    const day = dOnly(cl["Clicked At"]);
    if (day) dayMap[day] = (dayMap[day] || 0) + 1;
    recent.push({ at: cl["Clicked At"] || "", source: s, destination: dest,
      name: (byId[cl.Booking] && byId[cl.Booking].Name) || "" });
  }
  let certsSent = 0, pcCustomers = 0;
  for (const b of bookings || []) {
    const f = b.fields || {};
    if (truthy(f["Certificate Sent"]) || (f["Certificate Issued"] && String(f["Certificate Issued"]).trim())) certsSent++;
    if (truthy(f["PC Customer"])) pcCustomers++;
  }
  const daily = [];
  for (let i = 13; i >= 0; i--) {
    const d = dOnly(new Date(now.getTime() - i * 86400000).toISOString());
    daily.push({ date: d, clicks: dayMap[d] || 0 });
  }
  recent.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return {
    totals: { clicks: shop + pc, shop, pc, bookingsWithClicks: uniq.size },
    bySource: Object.values(src).sort((a, b) => b.clicks - a.clicks),
    funnel: { certsSent, certClicks: uniq.size, pcCustomers },
    daily,
    recent: recent.slice(0, 15),
  };
}

async function handler(event) {
  const key = resolveInstaller((event && event.headers) || {}, process.env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  if (!isAdmin(key, process.env)) return { statusCode: 403, body: "forbidden" };
  try {
    const c = cfg(process.env);
    const [clickRecs, bookingRecs] = await Promise.all([
      listAllRecords({ token: c.token, baseId: c.baseId, table: CLICKS(process.env) }),
      listAllRecords({ token: c.token, baseId: c.baseId, table: c.bookings }),
    ]);
    const out = aggregate(clickRecs.map((r) => r.fields || {}), bookingRecs.map((r) => ({ id: r.id, fields: r.fields || {} })));
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
  } catch (e) {
    return { statusCode: 502, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: e.message }) };
  }
}
module.exports = { handler, aggregate };
