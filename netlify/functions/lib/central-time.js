// netlify/functions/lib/central-time.js
// Central-time helpers. Uses Intl so DST (CDT/CST) is handled automatically.
function centralParts(date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  let hour = parseInt(p.hour, 10);
  if (hour === 24) hour = 0; // some platforms emit "24" for midnight
  return { dateISO: `${p.year}-${p.month}-${p.day}`, hour };
}
function daysBetweenISO(fromISO, toISO) {
  const u = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((u(toISO) - u(fromISO)) / 86400000);
}
module.exports = { centralParts, daysBetweenISO };
