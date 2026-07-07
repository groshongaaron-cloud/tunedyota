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
  const bookings = [{ id: "b1", fields: { City: "Green Bay", "Event Date": "2026-09-12", Slot: "9:00", Name: "A", Email: "a@x.com", "Model Year": "2019", Status: "Booked" } }];
  const d = deps({ now: new Date("2026-09-13T12:00:00Z"), listAll: async ({ table }) => (table === "Bookings" ? bookings : []) });
  await runReminders(d);
  assert.equal(d._creates.length, 1);
  assert.equal(d._creates[0].fields.Reason, "Rebook — not completed");
  assert.equal(d._creates[0].fields.City, "Green Bay");
  assert.equal(d._creates[0].fields["Model Year"], "2019"); // model year persists onto the swept priority record
});

test("baked events (no embedded city) route correctly — no unknown-city failure", async () => {
  // Reproduces the real prod path: baked events-data.js keys by city but the
  // event object has no `city` field. fetchEvents must backfill it, else every
  // event fails getMarket → unknown-city:undefined and matches zero bookings.
  const { fetchEvents } = require("../netlify/functions/lib/events.js");
  const baked = { fargo: { dateISO: "2026-07-03", label: "July 3, 2026", active: true, address: "123 Test Rd" } };
  const bookings = [{ id: "b1", fields: { City: "Fargo", "Event Date": "2026-07-03", Name: "A", Email: "a@x.com", Status: "Booked" } }];
  const failures = [];
  const d = deps({
    now: new Date("2026-07-03T12:00:00Z"), // 07:00 CDT, du === 0
    loadEvents: (a) => fetchEvents({ ...a, baked, sheetId: "" }),
    listAll: async ({ table }) => (table === "Bookings" ? bookings : []),
    notify: async (a) => { failures.push(a.text); return { ok: true }; },
  });
  await runReminders(d);
  assert.equal(failures.length, 0, `expected no failures, got: ${failures.join("; ")}`);
  assert.ok(d._sends.some((s) => /Roster/.test(s.subject || "")), "installer roster sent");
  assert.ok(d._sends.some((s) => s.to === "a@x.com"), "customer notified");
});

test("a city with two dates flattens to two events", () => {
  const { flattenEvents } = require("../netlify/functions/lib/events.js");
  const eventMap = { "twin cities": [
    { city: "twin cities", dateISO: "2026-08-29", label: "Aug 29", active: true },
    { city: "twin cities", dateISO: "2026-10-16", label: "Oct 16", active: true },
  ] };
  assert.equal(flattenEvents(eventMap).length, 2);
});

test("sends a post-event rebook report to the owner when a sweep occurs", async () => {
  // Event was yesterday (du === -1) → waitlist-sweep → post-event rebook report.
  // 2026-07-04T12:00:00Z = 07:00 CDT (UTC-5), so hour===7 passes the gate.
  const eventDate = "2026-07-03";
  const today = "2026-07-04";
  const bookings = [{ id: "b1", fields: { City: "Green Bay", "Event Date": eventDate, Slot: "9:00", Name: "Walk In", Email: "w@x.com", Vehicle: "2016-2023 Toyota Tacoma 3.5L V6", "Model Year": "2019", Status: "Booked" } }];
  const events = { "green bay": { city: "Green Bay", state: "WI", dateISO: eventDate, label: "Jul 3, 2026", active: true, address: "123 Dyno Rd" } };
  const d = deps({
    now: new Date(`${today}T12:00:00Z`),
    loadEvents: async () => events,
    listAll: async ({ table }) => (table === "Bookings" ? bookings : []),
  });
  await runReminders(d);
  const report = d._sends.find((m) => /Post-Event Summary/.test(m.subject || ""));
  assert.ok(report, "expected a Post-Event Summary report email");
  assert.match(report.subject, /Green Bay \(2026-07-03\)/);  // names the event + date
  assert.match(report.text, /\(2019\)/);                     // exact model year appears in the report
  assert.equal(report.to, "info@tunedyota.com");
});
