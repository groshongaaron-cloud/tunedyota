const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processBooking } = require("../netlify/functions/book.js");

function harness({ events, taken = [] }) {
  const created = [];
  const emails = [];
  const texts = [];
  const fetchImpl = async (url, opts) => {
    if (url.includes("docs.google.com")) return { ok: true, text: async () => events };
    if (url.includes("api.airtable.com")) {
      if (opts && opts.method === "POST") { const b = JSON.parse(opts.body); created.push({ url, fields: b.fields }); return { ok: true, json: async () => ({ id: "r1" }) }; }
      return { ok: true, json: async () => ({ records: taken.map((s) => ({ fields: { Slot: s } })) }) };
    }
    throw new Error("unexpected " + url);
  };
  const deps = {
    fetchImpl,
    env: { EVENTS_SHEET_ID: "x", AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", RESEND_API_KEY: "re" },
    send: async (a) => { emails.push(a); return { id: "e" }; },
    sms: async (a) => { texts.push(a); return { sent: true }; },
    now: () => "20260101T000000Z",
    log: { warn() {}, error() {} },
  };
  return { deps, created, emails, texts };
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
test("happy path booked -> creates booking + sends email + sms", async () => {
  const h = harness({ events: EV });
  const r = await processBooking({ ...base, slot: "9:20" }, h.deps);
  assert.equal(r.status, "booked");
  assert.equal(r.slot, "9:20");
  assert.equal(h.created[0].fields.Slot, "9:20");
  assert.equal(h.created[0].fields.Installer, "cody");
  assert.ok(h.emails.length >= 2);
  assert.equal(h.texts.length, 1);
  assert.ok(h.emails.some((e) => e.attachments));
});
