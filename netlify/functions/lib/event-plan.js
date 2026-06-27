// netlify/functions/lib/event-plan.js
// Pure planner: decides every reminder/sweep action from data + the current
// Central-time moment. No I/O. Acts only at 07:00 America/Chicago.
const { daysBetweenISO } = require("./central-time.js");

const SWEEP_REASON = "Rebook — not completed";
const INSTALLER_OFFSETS = [30, 15, 10, 2, 0];
const CUSTOMER_OFFSETS = [10, 2];
const norm = (s) => String(s == null ? "" : s).trim().toLowerCase();

function planDispatch({ events = [], bookings = [], priority = [], nowCentral }) {
  const actions = [];
  if (!nowCentral || nowCentral.hour !== 7) return actions;
  const today = nowCentral.dateISO;

  for (const ev of events) {
    if (!ev || !ev.active || !ev.dateISO) continue;
    const du = daysBetweenISO(today, ev.dateISO);
    const evBookings = bookings.filter((b) => norm(b.City) === norm(ev.city) && b["Event Date"] === ev.dateISO);

    if (INSTALLER_OFFSETS.includes(du)) {
      const evWaitlist = priority.filter((p) => norm(p.City) === norm(ev.city));
      actions.push({ type: "installer-roster", event: ev, daysUntil: du, bookings: evBookings, waitlist: evWaitlist });
    }

    if (CUSTOMER_OFFSETS.includes(du)) {
      for (const b of evBookings) {
        if (norm(b.Status) === "cancelled" || !b.Email) continue;
        actions.push({ type: "customer-notify", event: ev, daysUntil: du, booking: b });
      }
    }

    if (du === -1) {
      const queued = new Set(
        priority.filter((p) => p.Reason === SWEEP_REASON)
          .map((p) => `${norm(p.Email)}|${p["Event Date"] || ""}`)
      );
      for (const b of evBookings) {
        if (norm(b.Status) === "completed") continue;
        const key = `${norm(b.Email)}|${b["Event Date"] || ""}`;
        if (queued.has(key)) continue;
        actions.push({ type: "waitlist-sweep", event: ev, booking: b });
      }
    }
  }
  return actions;
}
module.exports = { planDispatch, SWEEP_REASON, INSTALLER_OFFSETS, CUSTOMER_OFFSETS };
