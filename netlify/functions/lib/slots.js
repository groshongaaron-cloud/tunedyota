// netlify/functions/lib/slots.js
// Slot policy is per installer. Aaron/Cody markets book fixed 20-minute times.
// Noah's markets book 10 GENERIC slots ("Slot 1".."Slot 10"): the customer
// reserves a spot, and Noah assigns the actual time (Bookings."Scheduled Time")
// from the console — and can adjust the date — after the booking lands.
const SLOT_TIMES = ["9:00","9:20","9:40","10:00","10:20","10:40","11:00","11:20","11:40","12:00","12:20","12:40"];
const GENERIC_SLOTS = Array.from({ length: 10 }, (_, i) => `Slot ${i + 1}`);
const SLOT_MODE_INSTALLERS = ["noah"];
const CAPACITY = SLOT_TIMES.length;
const SLOT_MINUTES = 20;
function slotMode(instKey) { return SLOT_MODE_INSTALLERS.includes(String(instKey || "")) ? "generic" : "times"; }
function slotsFor(instKey) { return slotMode(instKey) === "generic" ? GENERIC_SLOTS : SLOT_TIMES; }
function capacityFor(instKey) { return slotsFor(instKey).length; }
function computeOpen(takenSlots, instKey) {
  const taken = new Set((takenSlots || []).map((s) => String(s)));
  return slotsFor(instKey).filter((s) => !taken.has(s));
}
function isValidSlot(slot, instKey) { return slotsFor(instKey).includes(slot); }
// Optional per-event slot window (event.firstSlot / event.lastSlot, "H:MM").
// Events with hours narrower than the default grid (e.g. a 10-to-noon event)
// only offer slots inside the window. Non-time labels (generic slot mode) and
// events without a window pass through untouched.
function windowSlots(all, ev) {
  const first = ev && ev.firstSlot, last = ev && ev.lastSlot;
  if (!first && !last) return all;
  const mins = (t) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + (m || 0); };
  return (all || []).filter((s) => !/^\d{1,2}:\d{2}$/.test(String(s)) ||
    ((!first || mins(s) >= mins(first)) && (!last || mins(s) <= mins(last))));
}
function formatSlot(slot) {
  const s = String(slot);
  if (!/^\d{1,2}:\d{2}$/.test(s)) return s;   // generic labels pass through
  const [h, m] = s.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}
module.exports = { SLOT_TIMES, GENERIC_SLOTS, CAPACITY, SLOT_MINUTES, slotMode, slotsFor, capacityFor, computeOpen, isValidSlot, windowSlots, formatSlot };
