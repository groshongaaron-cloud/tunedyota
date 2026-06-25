// Pure metrics. Inputs are flat field objects (each carries createdTime).
const ACTIVE = (b) => String(b.Status || "Booked") !== "Cancelled";
const DAY = 86400000;

function dnum(iso) { return iso ? new Date(iso).getTime() : NaN; }
function daysBetween(a, b) { return Math.round((b - a) / DAY); }
function monthKey(d) { return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; }
function inRange(iso, lo, hi) { const t = dnum(iso); return t >= lo && t < hi; }
function tally(arr, keyFn) {
  const m = new Map();
  for (const x of arr) { const k = keyFn(x); if (!k) continue; m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}
function topKey(arr, keyFn) { const t = tally(arr, keyFn); return t.length ? t[0].name : ""; }

function contactRow(x, outcome) {
  return {
    createdDate: (x.createdTime || "").slice(0, 10),
    name: x.Name || "", phone: x.Phone || "", email: x.Email || "",
    city: x.City || x.market || "", state: x.State || "",
    vehicle: x.Vehicle || "", goals: x.Goals || "",
    source: x.Source || x.source || "", utmSource: x["UTM Source"] || "",
    utmMedium: x["UTM Medium"] || "", utmCampaign: x["UTM Campaign"] || "",
    installer: x.Installer || "", outcome, calibrationDate: x["Calibration Date"] || "",
  };
}
function outcomeOf(b) { const s = String(b.Status || "Booked"); return s === "Completed" ? "Won" : (s === "No-show" || s === "Cancelled") ? "Lost" : "Open"; }

function buildReport({ bookings = [], priority = [], leads = [], events = [], capacity = 12, now }) {
  const nowT = now.getTime();
  const mk = monthKey(now);
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const lastMonthStart = lastMonth.getTime();
  const lastMonthSameDay = Date.UTC(lastMonth.getUTCFullYear(), lastMonth.getUTCMonth(), now.getUTCDate() + 1);

  const all = [...bookings, ...priority, ...leads];
  const mtd = (x) => dnum(x.createdTime) >= monthStart;
  const submissionsMTD = all.filter(mtd);
  const bookingsMTD = bookings.filter(mtd);

  // deltas
  const last7 = all.filter((x) => inRange(x.createdTime, nowT - 7 * DAY, nowT)).length;
  const prev7 = all.filter((x) => inRange(x.createdTime, nowT - 14 * DAY, nowT - 7 * DAY)).length;
  const lastMonthToDate = all.filter((x) => inRange(x.createdTime, lastMonthStart, lastMonthSameDay)).length;

  // won/lost/open (MTD bookings)
  const won = bookingsMTD.filter((b) => outcomeOf(b) === "Won").length;
  const lost = bookingsMTD.filter((b) => outcomeOf(b) === "Lost").length;
  const open = bookingsMTD.filter((b) => outcomeOf(b) === "Open").length;
  const conversionPct = (won + lost) ? Math.round((won / (won + lost)) * 100) : 0;
  const calDays = bookings.filter((b) => b.Status === "Completed" && b["Calibration Date"])
    .map((b) => daysBetween(dnum(b.createdTime), dnum(b["Calibration Date"]))).filter((n) => !isNaN(n));
  const avgDaysToCalibration = calDays.length ? Math.round(calDays.reduce((a, b) => a + b, 0) / calDays.length) : null;

  // per-event
  const startToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const eventRows = events.map((ev) => {
    const evT = dnum(ev.dateISO);
    const past = evT < startToday;
    const evBookings = bookings.filter((b) => b.City === ev.city && b["Event Date"] === ev.dateISO);
    const live = evBookings.filter(ACTIVE);
    const booked = live.length;
    const openSlots = Math.max(0, capacity - booked);
    const fillPct = Math.round((booked / capacity) * 100);
    const daysUntil = daysBetween(startToday, evT);
    const pace = past ? "past" : openSlots === 0 ? "full" : (daysUntil <= 7 && fillPct < 50) ? "slow" : "on-track";
    const newThisWeek = evBookings.filter((b) => inRange(b.createdTime, nowT - 7 * DAY, nowT)).length;
    const wl = priority.filter((p) => p.City === ev.city && p.Reason === "Event full").length;
    const sb = { completed: 0, noshow: 0, cancelled: 0, booked: 0 };
    for (const b of evBookings) { const s = String(b.Status || "Booked"); if (s === "Completed") sb.completed++; else if (s === "No-show") sb.noshow++; else if (s === "Cancelled") sb.cancelled++; else sb.booked++; }
    return {
      city: ev.city, state: ev.state, dateISO: ev.dateISO, label: ev.label, installer: ev.installerKey,
      daysUntil, past, capacity, booked, open: openSlots, fillPct, newThisWeek, pace,
      waitlist: wl, statusBreakdown: sb, vehicles: tally(evBookings, (b) => b.Vehicle),
      topSource: topKey(evBookings, (b) => b["UTM Source"]),
      calibrationDates: evBookings.filter((b) => b["Calibration Date"]).map((b) => b["Calibration Date"]),
    };
  }).filter((e) => !e.past || monthKey(new Date(e.dateISO)) === mk);

  // closed roster (Completed with Calibration Date this month)
  const closedRoster = bookings
    .filter((b) => b.Status === "Completed" && b["Calibration Date"] && monthKey(new Date(b["Calibration Date"])) === mk)
    .map((b) => ({ name: b.Name || "", installer: b.Installer || "", calibrationDate: b["Calibration Date"], vehicle: b.Vehicle || "" }));

  // contacts (dedup by email then phone, newest wins)
  const rows = [
    ...bookings.map((b) => contactRow(b, outcomeOf(b))),
    ...priority.map((p) => contactRow(p, "Open")),
    ...leads.map((l) => contactRow(l, "Open")),
  ].sort((a, b) => (b.createdDate || "").localeCompare(a.createdDate || ""));
  const seen = new Set(); const contacts = [];
  for (const r of rows) { const key = (r.email || r.phone || "").toLowerCase(); if (!key) { contacts.push(r); continue; } if (seen.has(key)) continue; seen.add(key); contacts.push(r); }

  // latent demand
  const latentDemand = tally(priority.filter((p) => p.Reason === "No event scheduled"), (p) => p.City)
    .map((x) => ({ city: x.name, count: x.count }));

  // action items
  const actionItems = [];
  for (const e of eventRows) {
    if (e.pace === "slow") actionItems.push(`Slow fill: ${e.city} ${e.label} — ${e.fillPct}% booked, ${e.open} open, ${e.daysUntil}d out.`);
    if (e.pace === "full" && e.waitlist > 0) actionItems.push(`${e.city} ${e.label} FULL with ${e.waitlist} on the waitlist — consider more capacity.`);
  }
  for (const c of latentDemand) actionItems.push(`Latent demand: ${c.count} waiting in ${c.city} (no event scheduled) — candidate market to book.`);
  const failedEmail = bookings.filter((b) => b["Email Status"] === "FAILED").length;
  if (failedEmail) actionItems.push(`${failedEmail} booking(s) flagged Email Status=FAILED — reach those customers manually.`);
  const completedNoDate = bookings.filter((b) => b.Status === "Completed" && !b["Calibration Date"]).length;
  if (completedNoDate) actionItems.push(`${completedNoDate} Completed booking(s) missing Calibration Date — fill in for accurate closed-loop.`);

  const priorMonthClose = now.getUTCDate() <= 7 ? (() => {
    const pmk = monthKey(lastMonth);
    const pm = bookings.filter((b) => monthKey(new Date(b.createdTime)) === pmk);
    return { monthLabel: pmk, total: all.filter((x) => monthKey(new Date(x.createdTime)) === pmk).length,
      won: pm.filter((b) => outcomeOf(b) === "Won").length, lost: pm.filter((b) => outcomeOf(b) === "Lost").length };
  })() : null;

  const slotsFilled = eventRows.reduce((a, e) => a + e.booked, 0);

  return {
    generatedFor: { now: now.toISOString(), monthLabel: mk },
    rollup: {
      mtdTotal: submissionsMTD.length, bookings: bookingsMTD.length,
      priority: priority.filter(mtd).length, leads: leads.filter(mtd).length,
      deltaVsPriorWeek: last7 - prev7, deltaVsLastMonth: submissionsMTD.length - lastMonthToDate,
      slotsFilled, totalCapacity: eventRows.length * capacity,
      won, lost, open, conversionPct, avgDaysToCalibration,
    },
    priorMonthClose,
    events: eventRows,
    byMarket: tally(bookings, (b) => b.City),
    byInstaller: tally(bookings, (b) => b.Installer),
    byVehicle: tally(bookings, (b) => b.Vehicle),
    attribution: { source: tally(bookings, (b) => b["UTM Source"]), medium: tally(bookings, (b) => b["UTM Medium"]), campaign: tally(bookings, (b) => b["UTM Campaign"]) },
    latentDemand, closedRoster, actionItems, contacts,
  };
}

module.exports = { buildReport, outcomeOf };
