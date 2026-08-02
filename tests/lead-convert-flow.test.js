// Convert-from-lead is the capture program's payoff: everything captured at first
// touch must ride into the booking, the installer may correct fields inline (writes
// back to the lead — records stay consistent), and a slot choice must OCCUPY the
// slot so converted bookings count against event capacity like any other booking.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/lead-update.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b",
  INSTALLER_TOKENS: '{"noah":"ntok","aaron":"atok"}', INSTALLER_ADMINS: "aaron" };
const ev = (token, body) => ({ headers: { "x-installer-token": token }, body: JSON.stringify(body) });
const leadRec = () => ({ id: "recL1", fields: { Name: "Text (612) 555-0134", Installer: "aaron",
  Phone: "(612) 555-0134", Vehicle: "", "Model Year": "2021", Modifications: "35s, level kit",
  Goals: "towing", "Activity Log": "old" } });

function convCtx() {
  const writes = [], creates = [];
  return { writes, creates, ctx: { env, now: new Date("2026-08-02T12:00:00Z"),
    getImpl: async () => leadRec(),
    updateImpl: async (a) => { writes.push(a); return {}; },
    createBookingImpl: async (a) => { creates.push(a); return { id: "recNEW" }; } } };
}

test("convert carries Model Year and Modifications from the lead to the booking", async () => {
  const { creates, ctx } = convCtx();
  const res = await handler(ev("atok", { id: "recL1", action: "convert", dateISO: "2026-08-08" }), ctx);
  assert.equal(res.statusCode, 200);
  assert.equal(creates[0].fields["Model Year"], "2021");
  assert.equal(creates[0].fields.Modifications, "35s, level kit");
});

test("convert overrides correct the booking AND write back to the lead", async () => {
  const { writes, creates, ctx } = convCtx();
  const res = await handler(ev("atok", { id: "recL1", action: "convert", dateISO: "2026-08-08",
    name: "Eli Soetenga", vehicle: "2019 Tundra 5.7L", modelYear: "2019",
    phone: "(608) 555-0100", email: "eli@example.com" }), ctx);
  assert.equal(res.statusCode, 200);
  const bf = creates[0].fields;
  assert.equal(bf.Name, "Eli Soetenga");
  assert.equal(bf.Vehicle, "2019 Tundra 5.7L");
  assert.equal(bf["Model Year"], "2019");
  assert.equal(bf.Phone, "(608) 555-0100");
  assert.equal(bf.Email, "eli@example.com");
  const lp = writes[0].fields;
  assert.equal(lp.Name, "Eli Soetenga", "corrected name written back to lead");
  assert.equal(lp.Vehicle, "2019 Tundra 5.7L", "corrected vehicle written back to lead");
  assert.equal(lp["Model Year"], "2019");
  assert.equal(lp.Phone, "(608) 555-0100");
  assert.equal(lp.Email, "eli@example.com");
});

test("convert without overrides patches no contact fields onto the lead", async () => {
  const { writes, ctx } = convCtx();
  await handler(ev("atok", { id: "recL1", action: "convert", dateISO: "2026-08-08" }), ctx);
  const lp = writes[0].fields;
  for (const k of ["Name", "Vehicle", "Phone", "Email", "Model Year"])
    assert.equal(lp[k], undefined, k + " untouched when not overridden");
});

test("convert with a slot writes Slot so the booking occupies event capacity", async () => {
  const { creates, ctx } = convCtx();
  const res = await handler(ev("atok", { id: "recL1", action: "convert", dateISO: "2026-08-08",
    city: "Madison", slot: "10:20" }), ctx);
  assert.equal(res.statusCode, 200);
  assert.equal(creates[0].fields.Slot, "10:20");
  const out = JSON.parse(res.body);
  assert.equal(out.booking.slot, "10:20");
  assert.match(out.booking.slotLabel || "", /10:20 AM/);
});

test("convert validates the slot against the owning installer's slot set", async () => {
  const { creates, ctx } = convCtx();
  const res = await handler(ev("atok", { id: "recL1", action: "convert", dateISO: "2026-08-08",
    city: "Madison", slot: "13:37" }), ctx);
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).error, "bad-slot");
  assert.equal(creates.length, 0, "no booking minted on bad slot");
});

test("convert response booking carries modelYear for the console card", async () => {
  const { ctx } = convCtx();
  const res = await handler(ev("atok", { id: "recL1", action: "convert", dateISO: "2026-08-08" }), ctx);
  assert.equal(JSON.parse(res.body).booking.modelYear, "2021");
});

test("a garbage modelYear override is ignored, lead's year still rides", async () => {
  const { creates, ctx } = convCtx();
  await handler(ev("atok", { id: "recL1", action: "convert", dateISO: "2026-08-08", modelYear: "banana" }), ctx);
  assert.equal(creates[0].fields["Model Year"], "2021");
});
