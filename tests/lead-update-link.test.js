// lead-update link/unlink: connect a lead to an EXISTING booking (and undo it).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/lead-update.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b",
  INSTALLER_TOKENS: '{"noah":"ntok","aaron":"atok"}', INSTALLER_ADMINS: "aaron" };
const ev = (token, body) => ({ headers: { "x-installer-token": token }, body: JSON.stringify(body) });
const leadRec = (installer) => ({ id: "recL1", fields: { Name: "Eli", Installer: installer, "Activity Log": "old" } });
const bookRec = { id: "recB1", fields: { Name: "Eli Soetenga", City: "Madison", "Event Date": "2026-08-01",
  Slot: "10:20", Status: "Booked", Installer: ["aaron"], Phone: "6194176865" } };

function ctxWith(over = {}) {
  const writes = [];
  return { writes, ctx: { env, now: new Date("2026-07-30T12:00:00Z"),
    getImpl: over.getImpl || (async (a) => (a.table === "Bookings" ? bookRec : leadRec("noah"))),
    updateImpl: async (a) => { writes.push(a); return { id: a.id, fields: a.fields }; }, ...over } };
}

test("link: patches the lead and returns the booking for jump-and-flash", async () => {
  const { writes, ctx } = ctxWith();
  const res = await handler(ev("ntok", { id: "recL1", action: "link", bookingId: "recB1" }), ctx);
  assert.equal(res.statusCode, 200);
  const out = JSON.parse(res.body);
  assert.equal(out.status, "ok");
  assert.equal(out.stage, "Booked");
  assert.equal(out.booking.id, "recB1");
  assert.equal(out.booking.city, "Madison");
  assert.deepEqual(writes[0].fields.Booking, ["recB1"]);
  assert.equal(writes[0].fields.Stage, "Booked");
  assert.match(writes[0].fields["Activity Log"], /linked → existing booking recB1/);
});

test("link: missing bookingId → 400, unknown booking → booking-not-found", async () => {
  const a = await handler(ev("ntok", { id: "recL1", action: "link" }), ctxWith().ctx);
  assert.equal(a.statusCode, 400);
  const { ctx } = ctxWith({ getImpl: async (x) => {
    if (x.table === "Bookings") throw new Error("airtable get 404");
    return leadRec("noah");
  } });
  const b = await handler(ev("ntok", { id: "recL1", action: "link", bookingId: "recGONE" }), ctx);
  assert.equal(b.statusCode, 400);
  assert.equal(JSON.parse(b.body).error, "booking-not-found");
});

test("link: an installer cannot touch another installer's lead", async () => {
  const { ctx } = ctxWith({ getImpl: async (a) => (a.table === "Bookings" ? bookRec : leadRec("cody")) });
  const res = await handler(ev("ntok", { id: "recL1", action: "link", bookingId: "recB1" }), ctx);
  assert.equal(JSON.parse(res.body).error, "not-your-market");
});

test("unlink clears both link fields and logs", async () => {
  const { writes, ctx } = ctxWith();
  const res = await handler(ev("ntok", { id: "recL1", action: "unlink" }), ctx);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(writes[0].fields.Booking, []);
  assert.equal(writes[0].fields["Converted Booking"], "");
  assert.equal(writes[0].fields.Stage, undefined);
});
