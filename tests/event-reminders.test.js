const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runReminders } = require("../netlify/functions/event-reminders.js");

function deps(over = {}) {
  const sends = [], creates = [];
  // Green Bay → noah (markets.js); event is 2 days out from `now`.
  const events = { "green bay": { city: "Green Bay", state: "WI", dateISO: "2026-09-12", label: "Sep 12, 2026", active: true, address: "123 Dyno Rd" } };
  const bookings = [{ id: "b1", fields: { City: "Green Bay", "Event Date": "2026-09-12", Slot: "9:00", Name: "A", Email: "a@x.com", Status: "Booked" } }];
  return {
    env: { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", RESEND_API_KEY: "re", SLACK_WEBHOOK_URL: "https://hooks.slack.test/x" },
    now: new Date("2026-09-10T12:00:00Z"), // 07:00 CDT, 2 days before
    loadEvents: async () => events,
    listAll: async ({ table }) => (table === "Bookings" ? bookings : []),
    create: async (a) => { creates.push(a); return { id: "p1" }; },
    send: async (a) => { sends.push(a); return { id: "e" }; },
    notify: async () => ({ ok: true }),
    log: { warn() {}, error() {} },
    _sends: sends, _creates: creates,
    ...over,
  };
}

test("2-day mark: installer roster to noah + customer notify", async () => {
  const d = deps();
  await runReminders(d);
  const toNoah = d._sends.find((s) => s.to === "noah@tunedyota.com");
  assert.ok(toNoah, "roster to installer");
  assert.match(toNoah.subject, /Roster/);
  const toCust = d._sends.find((s) => s.to === "a@x.com");
  assert.ok(toCust, "customer notify");
  assert.ok(toCust.html.includes("123 Dyno Rd"));
});
test("off-hour does nothing", async () => {
  const d = deps({ now: new Date("2026-09-10T20:00:00Z") }); // 15:00 CDT
  await runReminders(d);
  assert.equal(d._sends.length, 0);
});
test("post-event sweep creates a priority record", async () => {
  const bookings = [{ id: "b1", fields: { City: "Green Bay", "Event Date": "2026-09-12", Slot: "9:00", Name: "A", Email: "a@x.com", Status: "Booked" } }];
  const d = deps({ now: new Date("2026-09-13T12:00:00Z"), listAll: async ({ table }) => (table === "Bookings" ? bookings : []) });
  await runReminders(d);
  assert.equal(d._creates.length, 1);
  assert.equal(d._creates[0].fields.Reason, "Rebook — not completed");
  assert.equal(d._creates[0].fields.City, "Green Bay");
});

test("sends a post-event rebook report to the owner when a sweep occurs", async () => {
  // Event was yesterday (du === -1) → waitlist-sweep → post-event rebook report.
  // 2026-07-04T12:00:00Z = 07:00 CDT (UTC-5), so hour===7 passes the gate.
  const eventDate = "2026-07-03";
  const today = "2026-07-04";
  const bookings = [{ id: "b1", fields: { City: "Green Bay", "Event Date": eventDate, Slot: "9:00", Name: "Walk In", Email: "w@x.com", Status: "Booked" } }];
  const events = { "green bay": { city: "Green Bay", state: "WI", dateISO: eventDate, label: "Jul 3, 2026", active: true, address: "123 Dyno Rd" } };
  const d = deps({
    now: new Date(`${today}T12:00:00Z`),
    loadEvents: async () => events,
    listAll: async ({ table }) => (table === "Bookings" ? bookings : []),
  });
  await runReminders(d);
  const report = d._sends.find((m) => /Post-event rebook/.test(m.subject || ""));
  assert.ok(report, "expected a post-event rebook report email");
  assert.equal(report.to, "info@tunedyota.com");
});
