const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processNotifications } = require("../netlify/functions/book-background.js");

// book-background.js runs the slow follow-up for a job posted by book.js:
// installer + customer emails (+.ics) and the fire-and-forget n8n ping. Real
// templates are used (only the transports are mocked), mirroring the prior
// end-to-end assertions that lived in book.test.js.
function harness() {
  const emails = [], notifies = [], updates = [], pings = [];
  const deps = {
    fetchImpl: async () => ({ ok: true, json: async () => ({}) }),
    env: { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", RESEND_API_KEY: "re", SLACK_WEBHOOK_URL: "https://hooks.slack.test/x" },
    send: async (a) => { emails.push(a); return { id: "e" }; },
    notify: async (a) => { notifies.push(a); return { ok: true }; },
    update: async (a) => { updates.push(a); return { id: a.id }; },
    ping: async (a) => { pings.push(a); return { ok: true }; },
    log: { warn() {}, error() {} },
  };
  return { deps, emails, notifies, updates, pings };
}

const inst = { key: "cody", name: "Cody", email: "cody@tunedyota.com", phone: "(605) 555-0000" };
const market = { city: "Sioux Falls", state: "SD", inst: "cody" };
const event = { dateISO: "2026-07-12", label: "July 12, 2026" };
const d = { name: "Jane", phone: "(612) 406-7117", email: "jane@x.com", vehicle: "Tacoma", goals: "Power", slot: "9:20" };
const bookingJob = (over = {}) => ({ kind: "booking", d: { ...d, ...(over.d || {}) }, inst, market, event, recordId: "r1", stamp: "20260101T000000Z", ...over });
const priorityJob = (over = {}) => ({ kind: "priority", d: { ...d, ...(over.d || {}) }, inst, market, reason: over.reason || "no-event", recordId: "p1" });

test("booking job emails installer + customer with a calendar invite", async () => {
  const h = harness();
  const r = await processNotifications(bookingJob(), h.deps);
  assert.equal(r.ok, true);
  assert.ok(h.emails.some((e) => e.to === "cody@tunedyota.com"));  // installer
  assert.ok(h.emails.some((e) => e.to === d.email));               // customer
  assert.ok(h.emails.some((e) => e.attachments));                  // .ics invite
});
test("no customer email -> installer only", async () => {
  const h = harness();
  await processNotifications(bookingJob({ d: { email: "" } }), h.deps);
  assert.ok(!h.emails.some((e) => e.to === d.email));
  assert.ok(h.emails.some((e) => e.to === "cody@tunedyota.com"));
});
test("source flag surfaces the re-flash in the installer email", async () => {
  const h = harness();
  await processNotifications(bookingJob({ d: { source: "OTT Update" } }), h.deps);
  const i = h.emails.find((e) => e.to === "cody@tunedyota.com");
  assert.ok(i && /Free OTT Update/.test(i.text), "installer email should flag the re-flash");
});
test("failed customer email -> alert + Airtable flag + ping emailFailed true", async () => {
  const h = harness();
  h.deps.send = async (a) => { if (a.to === d.email) throw new Error("Resend 403: domain not verified"); return { id: "e" }; };
  h.deps.env.N8N_BOOKING_WEBHOOK_URL = "https://ty.app.n8n.cloud/webhook/ty-booking";
  const r = await processNotifications(bookingJob(), h.deps);
  assert.equal(r.emailFailed, true);
  assert.equal(h.notifies.length, 1);
  assert.match(h.notifies[0].text, /Booking email FAILED/);
  assert.equal(h.updates.length, 1);
  assert.equal(h.updates[0].fields["Email Status"], "FAILED");
  assert.equal(h.pings[0].payload.emailFailed, true);
});
test("all emails succeed -> no alert, no flag, ping emailFailed false", async () => {
  const h = harness();
  const r = await processNotifications(bookingJob(), h.deps);
  assert.ok(!r.emailFailed);
  assert.equal(h.notifies.length, 0);
  assert.equal(h.updates.length, 0);
  assert.equal(h.pings[0].payload.emailFailed, false);
});
test("booking job pings n8n with the booking payload", async () => {
  const h = harness();
  h.deps.env.N8N_BOOKING_WEBHOOK_URL = "https://ty.app.n8n.cloud/webhook/ty-booking";
  await processNotifications(bookingJob(), h.deps);
  assert.equal(h.pings.length, 1);
  assert.equal(h.pings[0].url, "https://ty.app.n8n.cloud/webhook/ty-booking");
  assert.equal(h.pings[0].payload.event, "booking");
  assert.equal(h.pings[0].payload.city, "Sioux Falls");
  assert.equal(h.pings[0].payload.slot, "9:20");
  assert.equal(h.pings[0].payload.installer.key, "cody");
});
test("booking job carries the exact model year into the n8n payload", async () => {
  const h = harness();
  h.deps.env.N8N_BOOKING_WEBHOOK_URL = "https://ty.app.n8n.cloud/webhook/ty-booking";
  await processNotifications(bookingJob({ d: { modelYear: "2019" } }), h.deps);
  assert.equal(h.pings[0].payload.modelYear, "2019");
});
test("a best-effort n8n ping failure does not break the flow", async () => {
  const h = harness();
  h.deps.env.N8N_BOOKING_WEBHOOK_URL = "https://x";
  h.deps.ping = async () => ({ ok: false, error: "n8n down" });
  const r = await processNotifications(bookingJob(), h.deps);
  assert.equal(r.ok, true);
});
test("priority job sends both priority emails", async () => {
  const h = harness();
  const r = await processNotifications(priorityJob(), h.deps);
  assert.equal(r.ok, true);
  assert.ok(h.emails.some((e) => e.to === "cody@tunedyota.com"));
  assert.ok(h.emails.some((e) => e.to === d.email));
});
test("priority email failure -> alert (no throw)", async () => {
  const h = harness();
  h.deps.send = async () => { throw new Error("Resend 403"); };
  const r = await processNotifications(priorityJob(), h.deps);
  assert.equal(r.ok, true);
  assert.equal(h.notifies.length, 1);
});
test("priority job does NOT ping n8n", async () => {
  const h = harness();
  h.deps.env.N8N_BOOKING_WEBHOOK_URL = "https://x";
  await processNotifications(priorityJob(), h.deps);
  assert.equal(h.pings.length, 0);
});
test("a malformed job is handled without throwing", async () => {
  const h = harness();
  const r = await processNotifications({ kind: "booking" }, h.deps);
  assert.equal(r.ok, false);
  assert.equal(h.emails.length, 0);
});
