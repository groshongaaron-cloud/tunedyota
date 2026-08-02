// Cert installer-fallback nudge (funnel audit 2026-08-02): when a certificate
// has no customer email and lands in the installer's inbox instead, the
// installer gets an immediate SMS + web push — the customer is often still
// standing there, so "grab their email and resend" is actionable NOW.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processCloseout } = require("../netlify/functions/installer-closeout.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b",
  INSTALLER_SMS_NUMBERS: '{"aaron":"+16125550000"}' };

const booking = (over = {}) => ({ id: "recB1", fields: { Name: "Walk Up", Phone: "6055550101",
  City: "Madison", Installer: ["aaron"], Status: "Booked", "Event Date": "2026-08-01",
  Vehicle: "Tundra", Source: "installer:walk-in", ...over } });

function run(bk, body = {}, over = {}) {
  const smses = [], pushes = [];
  return processCloseout({ recordId: "recB1", calibration: "Mild", ...body },
    { env, key: "aaron", admin: true,
      get: async () => bk, update: async () => ({}), create: async () => ({ id: "recL1" }),
      list: async () => [], send: async () => ({}), log: { error() {} },
      sms: async (a) => { smses.push(a); return {}; },
      webPush: async (k, m) => { pushes.push({ k, m }); return {}; },
      ...over }).then((out) => ({ out, smses, pushes }));
}

test("no customer email → cert falls back to installer AND the installer gets SMS + push", async () => {
  const { out, smses, pushes } = await run(booking());
  assert.equal(out.status, "completed");
  assert.equal(smses.length, 1);
  assert.equal(smses[0].to, "+16125550000");
  assert.match(smses[0].body, /Walk Up/, "names the customer");
  assert.match(smses[0].body, /email/i, "tells the installer to grab the email");
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].k, "aaron");
});

test("customer email present → cert goes to customer, no nudge", async () => {
  const { smses, pushes } = await run(booking(), { customerEmail: "dana@example.com" });
  assert.equal(smses.length, 0);
  assert.equal(pushes.length, 0);
});

test("nudge failures never fail the completion", async () => {
  const { out } = await run(booking(), {}, {
    sms: async () => { throw new Error("twilio 500"); },
    webPush: async () => { throw new Error("push dead"); } });
  assert.equal(out.status, "completed");
});
