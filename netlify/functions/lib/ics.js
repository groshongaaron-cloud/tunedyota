// netlify/functions/lib/ics.js
function pad(n) { return String(n).padStart(2, "0"); }
function dtLocal(dateISO, slot, addMin = 0) {
  const [Y, M, D] = dateISO.split("-").map(Number);
  let [h, m] = slot.split(":").map(Number);
  m += addMin; h += Math.floor(m / 60); m = ((m % 60) + 60) % 60;
  return `${Y}${pad(M)}${pad(D)}T${pad(h)}${pad(m)}00`;
}
function buildIcs({ uid, dateISO, slot, durationMin = 20, summary, location, description, stamp }) {
  const esc = (s) => String(s == null ? "" : s).replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Tuned Yota//Booking//EN", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${dtLocal(dateISO, slot)}`,
    `DTEND:${dtLocal(dateISO, slot, durationMin)}`,
    `SUMMARY:${esc(summary)}`,
    `LOCATION:${esc(location)}`,
    `DESCRIPTION:${esc(description)}`,
    "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n");
}
module.exports = { dtLocal, buildIcs };
