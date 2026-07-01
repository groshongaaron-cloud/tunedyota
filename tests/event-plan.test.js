const { test } = require("node:test");
const assert = require("node:assert/strict");
const { planDispatch, SWEEP_REASON } = require("../netlify/functions/lib/event-plan.js");

const ev = { city: "Green Bay", state: "WI", dateISO: "2026-09-12", label: "Sep 12, 2026", active: true, address: "123 Dyno Rd" };
const bk = (over) => ({ City: "Green Bay", "Event Date": "2026-09-12", Slot: "9:00", Name: "A", Email: "a@x.com", Status: "Booked", ...over });

test("no actions unless it is 7 AM Central", () => {
  const at = (h) => planDispatch({ events: [ev], bookings: [bk()], priority: [], nowCentral: { dateISO: "2026-09-12", hour: h } });
  assert.equal(at(6).length, 0);
  assert.equal(at(8).length, 0);
  assert.ok(at(7).length > 0);
});
test("installer roster at 30/15/10/2/0 days", () => {
  for (const [date, du] of [["2026-08-13", 30], ["2026-08-28", 15], ["2026-09-02", 10], ["2026-09-10", 2], ["2026-09-12", 0]]) {
    const a = planDispatch({ events: [ev], bookings: [bk()], priority: [], nowCentral: { dateISO: date, hour: 7 } });
    const roster = a.find((x) => x.type === "installer-roster");
    assert.ok(roster, `roster expected at ${du}d`);
    assert.equal(roster.daysUntil, du);
  }
});
test("no roster on a non-offset day", () => {
  const a = planDispatch({ events: [ev], bookings: [bk()], priority: [], nowCentral: { dateISO: "2026-09-05", hour: 7 } });
  assert.ok(!a.some((x) => x.type === "installer-roster"));
});
test("customer notify at 10 and 2 days, skips cancelled + no-email", () => {
  const bookings = [bk(), bk({ Status: "Cancelled", Email: "c@x.com" }), bk({ Email: "" })];
  const a = planDispatch({ events: [ev], bookings, priority: [], nowCentral: { dateISO: "2026-09-10", hour: 7 } });
  const notes = a.filter((x) => x.type === "customer-notify");
  assert.equal(notes.length, 1);
  assert.equal(notes[0].booking.Email, "a@x.com");
});
test("post-event sweep at -1 for all non-completed, dedup against existing", () => {
  const bookings = [bk({ Status: "Booked", Email: "a@x.com" }), bk({ Status: "No-show", Email: "n@x.com" }), bk({ Status: "Cancelled", Email: "c@x.com" }), bk({ Status: "Completed", Email: "done@x.com" })];
  const priority = [{ City: "Green Bay", Email: "a@x.com", "Event Date": "2026-09-12", Reason: SWEEP_REASON }];
  const a = planDispatch({ events: [ev], bookings, priority, nowCentral: { dateISO: "2026-09-13", hour: 7 } });
  const swept = a.filter((x) => x.type === "waitlist-sweep").map((x) => x.booking.Email).sort();
  assert.deepEqual(swept, ["c@x.com", "n@x.com"]); // a@ already queued, done@ completed
});
test("a T-0 (event morning) event produces a customer-notify per booked emailed row", () => {
  const { planDispatch } = require("../netlify/functions/lib/event-plan.js");
  const nowCentral = { hour: 7, dateISO: "2026-09-12" };
  const events = [{ active: true, city: "Green Bay", dateISO: "2026-09-12" }];
  const bookings = [
    { City: "Green Bay", "Event Date": "2026-09-12", Email: "a@x.com", Status: "Booked" },
    { City: "Green Bay", "Event Date": "2026-09-12", Email: "", Status: "Booked" },
    { City: "Green Bay", "Event Date": "2026-09-12", Email: "c@x.com", Status: "Cancelled" },
  ];
  const actions = planDispatch({ events, bookings, priority: [], nowCentral });
  const custs = actions.filter((a) => a.type === "customer-notify" && a.daysUntil === 0);
  assert.equal(custs.length, 1);
  assert.equal(custs[0].booking.Email, "a@x.com");
});
