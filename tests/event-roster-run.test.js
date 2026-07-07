const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runRosterSend } = require("../netlify/functions/event-roster-run.js");

function deps(over = {}) {
  const sends = [];
  // Shape as fetchEvents returns it (city backfilled from the map key).
  const baked = { fargo: { city: "fargo", dateISO: "2026-07-03", label: "July 3, 2026", active: true, address: "1666 1st Ave N" } };
  const bookings = [
    { id: "b1", fields: { City: "Fargo", "Event Date": "2026-07-03", Slot: "9:00", Name: "A", Email: "a@x.com", Status: "Booked" } },
    { id: "b2", fields: { City: "Fargo", "Event Date": "2026-07-03", Slot: "9:30", Name: "Cancelled Carl", Status: "Cancelled" } },
    { id: "b3", fields: { City: "Madison", "Event Date": "2026-08-01", Name: "Other", Status: "Booked" } },
  ];
  const priority = [{ id: "p1", fields: { City: "Fargo", Name: "Wait W", Phone: "555" } }];
  return {
    env: { INTERNAL_TASK_SECRET: "s3cret", AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", RESEND_API_KEY: "re" },
    loadEvents: async () => baked,
    listAll: async ({ table }) => (table === "Bookings" ? bookings : priority),
    send: async (a) => { sends.push(a); return { id: "e" }; },
    log: { warn() {}, error() {} },
    _sends: sends,
    ...over,
  };
}

test("unauthorized without the secret", async () => {
  const d = deps();
  const r = await runRosterSend({ city: "fargo", token: "wrong" }, d);
  assert.equal(r.code, 401);
  assert.equal(d._sends.length, 0);
});

test("emails the Fargo roster to the owner, cancelled dropped, other cities excluded", async () => {
  const d = deps();
  const r = await runRosterSend({ city: "Fargo", token: "s3cret" }, d);
  assert.equal(r.code, 200);
  assert.equal(r.booked, 1, "only the 1 non-cancelled Fargo booking");
  assert.equal(r.waitlist, 1);
  assert.equal(d._sends.length, 1);
  const m = d._sends[0];
  assert.equal(m.to, "info@tunedyota.com");
  assert.match(m.subject, /Fargo Roster/);
  assert.ok(m.html.includes("a@x.com"), "booked customer present");
  assert.ok(!m.html.includes("Cancelled Carl"), "cancelled booking omitted");
  assert.ok(!m.html.includes("Other"), "other-city booking omitted");
});

test("404 for an unknown city", async () => {
  const d = deps();
  const r = await runRosterSend({ city: "nowhere", token: "s3cret" }, d);
  assert.equal(r.code, 404);
  assert.equal(d._sends.length, 0);
});

test("date param selects second date when city has two events", async () => {
  const twoDateBaked = {
    fargo: [
      { city: "fargo", dateISO: "2026-07-03", label: "July 3, 2026", active: true, address: "1666 1st Ave N" },
      { city: "fargo", dateISO: "2026-10-16", label: "Oct 16, 2026", active: true, address: "1666 1st Ave N" },
    ],
  };
  const bookings = [
    { id: "b1", fields: { City: "Fargo", "Event Date": "2026-07-03", Slot: "9:00", Name: "A", Email: "a@x.com", Status: "Booked" } },
    { id: "b2", fields: { City: "Fargo", "Event Date": "2026-10-16", Slot: "9:00", Name: "B", Email: "b@x.com", Status: "Booked" } },
  ];
  const d = deps({ loadEvents: async () => twoDateBaked, listAll: async ({ table }) => (table === "Bookings" ? bookings : []) });
  const r = await runRosterSend({ city: "fargo", date: "2026-10-16", token: "s3cret" }, d);
  assert.equal(r.code, 200);
  assert.equal(r.dateISO, "2026-10-16");
  assert.equal(r.booked, 1, "only the Oct 16 booking");
});
