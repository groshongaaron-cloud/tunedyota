const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processBooking } = require("../netlify/functions/book.js");

function harness({ events, taken = [] }) {
  const created = [];
  const emails = [];
  const fetchImpl = async (url, opts) => {
    if (url.includes("docs.google.com")) return { ok: true, text: async () => events };
    if (url.includes("api.airtable.com")) {
      if (opts && opts.method === "POST") { const b = JSON.parse(opts.body); created.push({ url, fields: b.fields }); return { ok: true, json: async () => ({ id: "r1" }) }; }
      return { ok: true, json: async () => ({ records: taken.map((s) => ({ fields: { Slot: s } })) }) };
    }
    throw new Error("unexpected " + url);
  };
  const notifies = [];
  const updates = [];
  const deps = {
    fetchImpl,
    env: { EVENTS_SHEET_ID: "x", AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", RESEND_API_KEY: "re", SLACK_WEBHOOK_URL: "https://hooks.slack.test/x" },
    send: async (a) => { emails.push(a); return { id: "e" }; },
    notify: async (a) => { notifies.push(a); return { ok: true }; },
    update: async (a) => { updates.push(a); return { id: a.id }; },
    now: () => "20260101T000000Z",
    log: { warn() {}, error() {} },
  };
  return { deps, created, emails, notifies, updates };
}
const base = { city: "Sioux Falls", name: "Jane", phone: "(612) 406-7117", email: "jane@x.com", vehicle: "Tacoma", goals: "Power" };
const EV = "Market,Date,Active\nSioux Falls,2026-07-12,yes\n";

test("honeypot ignored", async () => {
  const h = harness({ events: EV });
  const r = await processBooking({ ...base, slot: "9:00", bot_field: "x" }, h.deps);
  assert.equal(r.status, "ignored");
});
test("unknown city errors", async () => {
  const h = harness({ events: EV });
  assert.equal((await processBooking({ ...base, city: "Atlantis", slot: "9:00" }, h.deps)).status, "error");
});
test("missing contact errors", async () => {
  const h = harness({ events: EV });
  assert.equal((await processBooking({ city: "Sioux Falls", name: "Jane", slot: "9:00" }, h.deps)).status, "error");
});
test("no event -> priority (no-event)", async () => {
  const h = harness({ events: "Market,Date,Active\nSioux Falls,nope,yes\n" });
  const r = await processBooking({ ...base, slot: "9:00" }, h.deps);
  assert.equal(r.status, "priority");
  assert.equal(r.reason, "no-event");
  assert.ok(h.created[0].url.includes("Priority"));
});
test("taken slot -> conflict", async () => {
  const h = harness({ events: EV, taken: ["9:00"] });
  const r = await processBooking({ ...base, slot: "9:00" }, h.deps);
  assert.equal(r.status, "conflict");
  assert.ok(r.openSlots.length === 11);
});
test("full -> priority (full)", async () => {
  const all = ["9:00","9:20","9:40","10:00","10:20","10:40","11:00","11:20","11:40","12:00","12:20","12:40"];
  const h = harness({ events: EV, taken: all });
  const r = await processBooking({ ...base, slot: "9:00" }, h.deps);
  assert.equal(r.status, "priority");
  assert.equal(r.reason, "full");
  assert.equal(h.created[0].fields["Requested Slot"], "9:00");
});
test("happy path booked -> creates booking + emails installer + customer", async () => {
  const h = harness({ events: EV });
  const r = await processBooking({ ...base, slot: "9:20" }, h.deps);
  assert.equal(r.status, "booked");
  assert.equal(r.slot, "9:20");
  assert.equal(h.created[0].fields.Slot, "9:20");
  assert.equal(h.created[0].fields.Installer, "cody");
  assert.ok(h.emails.some((e) => e.to === "cody@tunedyota.com"));  // installer
  assert.ok(h.emails.some((e) => e.to === base.email));            // customer
  assert.ok(h.emails.some((e) => e.attachments));                  // calendar invite
});
test("no email given -> books without sending a customer email", async () => {
  const h = harness({ events: EV });
  const r = await processBooking({ ...base, email: "", slot: "9:20" }, h.deps);
  assert.equal(r.status, "booked");
  assert.ok(!h.emails.some((e) => e.to === base.email));           // no customer email
  assert.ok(h.emails.some((e) => e.to === "cody@tunedyota.com"));  // installer still notified
});
test("failed customer email -> alert + Airtable flag + emailFailed", async () => {
  const h = harness({ events: EV });
  h.deps.send = async (a) => {                 // installer ok, customer throws
    if (a.to === base.email) throw new Error("Resend 403: domain not verified");
    return { id: "e" };
  };
  const r = await processBooking({ ...base, slot: "9:20" }, h.deps);
  assert.equal(r.status, "booked");
  assert.equal(r.emailFailed, true);
  assert.equal(h.notifies.length, 1);
  assert.match(h.notifies[0].text, /Booking email FAILED/);
  assert.equal(h.updates.length, 1);
  assert.equal(h.updates[0].fields["Email Status"], "FAILED");
});
test("all emails succeed -> no alert, no flag, emailFailed falsy", async () => {
  const h = harness({ events: EV });
  const r = await processBooking({ ...base, slot: "9:40" }, h.deps);
  assert.equal(r.status, "booked");
  assert.ok(!r.emailFailed);
  assert.equal(h.notifies.length, 0);
  assert.equal(h.updates.length, 0);
});
test("priority email failure -> alert (no throw into flow)", async () => {
  const h = harness({ events: "Market,Date,Active\nSioux Falls,nope,yes\n" }); // no event -> priority
  h.deps.send = async () => { throw new Error("Resend 403"); };
  const r = await processBooking({ ...base, slot: "9:00" }, h.deps);
  assert.equal(r.status, "priority");
  assert.equal(h.notifies.length, 1);
});
