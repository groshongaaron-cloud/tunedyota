// netlify/functions/lib/slots.js
const SLOT_TIMES = ["9:00","9:20","9:40","10:00","10:20","10:40","11:00","11:20","11:40","12:00","12:20","12:40"];
const CAPACITY = SLOT_TIMES.length;
const SLOT_MINUTES = 20;
function computeOpen(takenSlots) {
  const taken = new Set((takenSlots || []).map((s) => String(s)));
  return SLOT_TIMES.filter((s) => !taken.has(s));
}
function isValidSlot(slot) { return SLOT_TIMES.includes(slot); }
function formatSlot(slot) {
  const [h, m] = String(slot).split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}
module.exports = { SLOT_TIMES, CAPACITY, SLOT_MINUTES, computeOpen, isValidSlot, formatSlot };
