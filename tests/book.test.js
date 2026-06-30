const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processBooking } = require("../netlify/functions/book.js");

// book.js is now the synchronous path only: validate -> slot check -> create the
// Airtable record -> hand a job to `trigger` (the book-background invocation) ->
// return the user-facing status. Emails + the n8n ping live in book-background.js
// (covered by tests/book-background.test.js).
function harness({ events, taken = [] }) {
  const created = [];
  const fetchImpl = async (url, opts) => {
    if (url.includes("docs.google.com")) return { ok: true, text: async () => events };
    if (url.includes("api.airtable.com")) {
      if (opts && opts.method === "POST") { const b = JSON.parse(opts.body); created.push({ url, fields: b.fields }); return { ok: true, json: async () => ({ id: "r1" }) }; }
      return { ok: true, json: async () => ({ records: taken.map((s) => ({ fields: { Slot: s } })) }) };
    }
    throw new Error("unexpected " + url);
  };
  const jobs = [];
  const deps = {
    fetchImpl,
    env: { EVENTS_SHEET_ID: "x", AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" },
    trigger: async (a) => { jobs.push(a); return { ok: true }; },
    now: () => "20260101T000000Z",
    log: { warn() {}, error() {} },
  };
  return { deps, created, jobs };
}
const base = { city: "Sioux Falls", name: "Jane", phone: "(612) 406-7117", email: "jane@x.com", vehicle: "Tacoma", goals: "Power" };
const EV = "Market,Date,Active\nSioux Falls,2026-07-12,yes\n";

test("honeypot ignored — no record, no job scheduled", async () => {
  const h = harness({ events: EV });
  const r = await processBooking({ ...base, slot: "9:00", bot_field: "x" }, h.deps);
  assert.equal(r.status, "ignored");
  assert.equal(h.jobs.length, 0);
  assert.equal(h.created.length, 0);
});
test("unknown city errors — no job", async () => {
  const h = harness({ events: EV });
  assert.equal((await processBooking({ ...base, city: "Atlantis", slot: "9:00" }, h.deps)).status, "error");
  assert.equal(h.jobs.length, 0);
});
test("missing contact errors — no job", async () => {
  const h = harness({ events: EV });
  assert.equal((await processBooking({ city: "Sioux Falls", name: "Jane", slot: "9:00" }, h.deps)).status, "error");
  assert.equal(h.jobs.length, 0);
});
test("no event -> priority (no-event), schedules a priority job", async () => {
  const h = harness({ events: "Market,Date,Active\nSioux Falls,nope,yes\n" });
  const r = await processBooking({ ...base, slot: "9:00" }, h.deps);
  assert.equal(r.status, "priority");
  assert.equal(r.reason, "no-event");
  assert.ok(h.created[0].url.includes("Priority"));
  assert.equal(h.jobs.length, 1);
  assert.equal(h.jobs[0].name, "book-background");
  assert.equal(h.jobs[0].payload.kind, "priority");
  assert.equal(h.jobs[0].payload.reason, "no-event");
  assert.equal(h.jobs[0].payload.recordId, "r1");
});
test("taken slot -> conflict, no job scheduled", async () => {
  const h = harness({ events: EV, taken: ["9:00"] });
  const r = await processBooking({ ...base, slot: "9:00" }, h.deps);
  assert.equal(r.status, "conflict");
  assert.ok(r.openSlots.length === 11);
  assert.equal(h.jobs.length, 0);
});
test("full -> priority (full), schedules a priority job", async () => {
  const all = ["9:00","9:20","9:40","10:00","10:20","10:40","11:00","11:20","11:40","12:00","12:20","12:40"];
  const h = harness({ events: EV, taken: all });
  const r = await processBooking({ ...base, slot: "9:00" }, h.deps);
  assert.equal(r.status, "priority");
  assert.equal(r.reason, "full");
  assert.equal(h.created[0].fields["Requested Slot"], "9:00");
  assert.equal(h.jobs.length, 1);
  assert.equal(h.jobs[0].payload.kind, "priority");
  assert.equal(h.jobs[0].payload.reason, "full");
});
test("happy path booked -> creates booking record + schedules a booking job", async () => {
  const h = harness({ events: EV });
  const r = await processBooking({ ...base, slot: "9:20" }, h.deps);
  assert.equal(r.status, "booked");
  assert.equal(r.slot, "9:20");
  assert.equal(h.created[0].fields.Slot, "9:20");
  assert.equal(h.created[0].fields.Installer, "cody");
  assert.equal(h.jobs.length, 1);
  const job = h.jobs[0].payload;
  assert.equal(job.kind, "booking");
  assert.equal(job.recordId, "r1");
  assert.equal(job.d.email, base.email);
  assert.equal(job.inst.key, "cody");
  assert.equal(job.inst.email, "cody@tunedyota.com");
  assert.equal(job.market.city, "Sioux Falls");
  assert.equal(job.event.dateISO, "2026-07-12");
  assert.equal(job.stamp, "20260101T000000Z");
});
test("booked response omits emailFailed (resolved later in background)", async () => {
  const h = harness({ events: EV });
  const r = await processBooking({ ...base, slot: "9:20" }, h.deps);
  assert.equal(r.status, "booked");
  assert.equal("emailFailed" in r, false);
});
test("no email given -> still books; job carries empty email", async () => {
  const h = harness({ events: EV });
  const r = await processBooking({ ...base, email: "", slot: "9:20" }, h.deps);
  assert.equal(r.status, "booked");
  assert.equal(h.jobs[0].payload.d.email, "");
});
test("source flag tags the booking record + rides along in the job", async () => {
  const h = harness({ events: EV });
  const r = await processBooking({ ...base, slot: "9:20", source: "OTT Update" }, h.deps);
  assert.equal(r.status, "booked");
  assert.equal(h.created[0].fields.Source, "OTT Update");
  assert.equal(h.jobs[0].payload.d.source, "OTT Update");
});
test("booking source defaults when flag absent", async () => {
  const h = harness({ events: EV });
  await processBooking({ ...base, slot: "9:40" }, h.deps);
  assert.equal(h.created[0].fields.Source, "find-your-exact-tune");
});
test("mods field persisted on booking record", async () => {
  const EV_OMAHA = "Market,Date,Active\nOmaha,2026-08-15,yes\n";
  const h = harness({ events: EV_OMAHA });
  const r = await processBooking({ city: "Omaha", name: "Bob", phone: "(402) 555-1234", email: "bob@x.com", vehicle: "Tundra", goals: "Power", slot: "9:00", mods: "3in lift, 35s" }, h.deps);
  assert.equal(r.status, "booked");
  assert.equal(h.created[0].fields.Modifications, "3in lift, 35s");
});
test("a failure to enqueue the background job does not break the booking", async () => {
  const h = harness({ events: EV });
  h.deps.trigger = async () => { throw new Error("enqueue down"); };
  const r = await processBooking({ ...base, slot: "9:20" }, h.deps);
  assert.equal(r.status, "booked");
});

test("booking survives a missing Modifications column (retries without it)", async () => {
  const created = [];
  const fetchImpl = async (url, opts) => {
    if (url.includes("docs.google.com")) return { ok: true, text: async () => EV };
    if (url.includes("api.airtable.com")) {
      if (opts && opts.method === "POST") {
        const b = JSON.parse(opts.body);
        if ("Modifications" in b.fields) return { ok: false, status: 422, text: async () => '{"error":{"type":"UNKNOWN_FIELD_NAME","message":"Unknown field name: Modifications"}}' };
        created.push(b.fields);
        return { ok: true, json: async () => ({ id: "r1" }) };
      }
      return { ok: true, json: async () => ({ records: [] }) };
    }
    throw new Error("unexpected " + url);
  };
  const deps = { fetchImpl, env: { EVENTS_SHEET_ID: "x", AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" }, trigger: async () => ({ ok: true }), now: () => "20260101T000000Z", log: { warn() {}, error() {} } };
  const r = await processBooking({ ...base, slot: "9:00", mods: "lift" }, deps);
  assert.equal(r.status, "booked");
  assert.equal(created.length, 1);
  assert.ok(!("Modifications" in created[0]));
});
