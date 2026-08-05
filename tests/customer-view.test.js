// tests/customer-view.test.js
// Customer 360 aggregation: phone-keyed matching, installer scoping, partial degradation.
const test = require("node:test");
const assert = require("node:assert");
const { handler } = require("../netlify/functions/customer-view.js");

const ENV = { INSTALLER_TOKENS: JSON.stringify({ aaron: "tokA", noah: "tokN" }),
  INSTALLER_ADMINS: "aaron", AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b",
  TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "tw" };
const H = (tok) => ({ "x-installer-token": tok });

const BOOKINGS = [
  { id: "bk1", fields: { Name: "Sam", Phone: "(651) 278-1401", Vehicle: "2021 Tundra", City: "Lakeville",
    "Event Date": "2026-07-10", Status: "Completed", "OTT Calibration": "Spicy", "Certificate Sent": true, Installer: "noah" } },
  { id: "bk2", fields: { Name: "Sam", Phone: "6512781401", City: "Lakeville", "Event Date": "2026-08-10", Status: "Booked", Installer: "noah" } },
  { id: "bk3", fields: { Name: "Other", Phone: "5551112222", "Event Date": "2026-07-01", Status: "Completed", Installer: "noah" } },
  { id: "bk4", fields: { Name: "Sam", Phone: "651-278-1401", "Event Date": "2026-06-01", Status: "Cancelled", Installer: "noah" } },
];
const LEADS = [
  { id: "ld1", fields: { Name: "Sam", Phone: "+1 651 278 1401", Stage: "Booked", Installer: "noah", "Last Contact": "2026-07-09" } },
  { id: "ld2", fields: { Name: "Sam2", Email: "sam@x.com", Stage: "New", Installer: "cody" } },
];
const CHATS = [
  { id: "cs1", fields: { "Session ID": "sms:+16512781401", Phone: "+16512781401", Status: "closed",
    Transcript: JSON.stringify([{ role: "user", text: "on my way", at: 1 }]), "Last Activity": "2026-07-28T21:00:00Z", Installer: "noah" } },
  { id: "cs2", fields: { "Session ID": "web:zzz", Phone: "5551112222", Transcript: "[]", Installer: "" } },
];
function listFor(tables) {
  return async ({ table }) => {
    if (/booking/i.test(table)) return tables.bookings || [];
    if (/priority/i.test(table)) return tables.leads || [];
    if (/chat/i.test(table)) return tables.chats || [];
    return [];
  };
}
const twilioOk = async (url) => ({ ok: true, json: async () => ({ calls:
  /To=/.test(url) ? [{ sid: "CA1", direction: "inbound", from: "+16512781401", to: "+16125550000", status: "completed", start_time: "Tue, 28 Jul 2026 20:00:00 +0000", duration: "95" }]
                  : [{ sid: "CA1", direction: "inbound", from: "+16512781401", to: "+16125550000", status: "completed", start_time: "Tue, 28 Jul 2026 20:00:00 +0000", duration: "95" },
                     { sid: "CA2", direction: "outbound-api", from: "+16125550000", to: "+16512781401", status: "completed", start_time: "Mon, 27 Jul 2026 20:00:00 +0000", duration: "10" }] }) });

test("401 without a token", async () => {
  const res = await handler({ httpMethod: "GET", headers: {}, queryStringParameters: { phone: "6512781401" } }, { env: ENV });
  assert.equal(res.statusCode, 401);
});

test("400 without phone or email", async () => {
  const res = await handler({ httpMethod: "GET", headers: H("tokN"), queryStringParameters: {} }, { env: ENV });
  assert.equal(res.statusCode, 400);
});

test("matches formatted phone variants, excludes Cancelled, newest first", async () => {
  const res = await handler({ httpMethod: "GET", headers: H("tokN"), queryStringParameters: { phone: "(651) 278-1401" } },
    { env: ENV, listImpl: listFor({ bookings: BOOKINGS, leads: LEADS, chats: CHATS }), fetchImpl: twilioOk });
  const out = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(out.bookings.map((b) => b.id), ["bk2", "bk1"]);
  assert.equal(out.bookings[1].calibration, "Spicy");
  assert.equal(out.leads.length, 1);
  assert.equal(out.chats.length, 1);
  assert.equal(out.chats[0].lastText, "on my way");
});

test("non-admin never sees another installer's bookings/leads", async () => {
  const foreign = [{ id: "bkX", fields: { Name: "Sam", Phone: "6512781401", "Event Date": "2026-07-01", Status: "Completed", Installer: "aaron" } }];
  const res = await handler({ httpMethod: "GET", headers: H("tokN"), queryStringParameters: { phone: "6512781401" } },
    { env: ENV, listImpl: listFor({ bookings: foreign, leads: [] }), fetchImpl: twilioOk });
  const out = JSON.parse(res.body);
  assert.equal(out.bookings.length, 0);
});

test("admin sees all; calls deduped by sid across To/From queries", async () => {
  const res = await handler({ httpMethod: "GET", headers: H("tokA"), queryStringParameters: { phone: "6512781401" } },
    { env: ENV, listImpl: listFor({ bookings: BOOKINGS, leads: LEADS, chats: CHATS }), fetchImpl: twilioOk });
  const out = JSON.parse(res.body);
  assert.equal(out.bookings.length, 2);
  assert.deepEqual(out.calls.map((c) => c.sid), ["CA1", "CA2"]);
});

test("email matches leads when no phone", async () => {
  const res = await handler({ httpMethod: "GET", headers: H("tokA"), queryStringParameters: { email: "SAM@x.com" } },
    { env: ENV, listImpl: listFor({ leads: LEADS }), fetchImpl: twilioOk });
  const out = JSON.parse(res.body);
  assert.deepEqual(out.leads.map((l) => l.id), ["ld2"]);
  assert.equal(out.bookings.length, 0);
});

test("a failing source degrades to empty + partial:true", async () => {
  const res = await handler({ httpMethod: "GET", headers: H("tokN"), queryStringParameters: { phone: "6512781401" } },
    { env: ENV, listImpl: async ({ table }) => { if (/chat/i.test(table)) throw new Error("boom"); return listFor({ bookings: BOOKINGS, leads: LEADS })({ table }); },
      fetchImpl: twilioOk });
  const out = JSON.parse(res.body);
  assert.equal(out.partial, true);
  assert.equal(out.chats.length, 0);
  assert.equal(out.bookings.length, 2);
});

test("customer-view returns a purchases timeline (completed-booking tunes + manual rows)", async () => {
  const cfg = require("../netlify/functions/lib/airtable.js").cfg;
  const ENV2 = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", INSTALLER_TOKENS: JSON.stringify({ aaron: "S" }), INSTALLER_ADMINS: "aaron" };
  const c = cfg(ENV2);
  const listImpl = async ({ table }) => {
    if (table === c.bookings) return [{ id: "bk1", fields: { Name: "Pat", Phone: "612-406-7117", Vehicle: "2022 Tacoma", "Event Date": "2022-05-01", Status: "Completed", "OTT Calibration": "Stage 1", Installer: "aaron" } }];
    if (table === c.purchases) return [{ id: "p1", fields: { Date: "2026-08-01", Category: "Banks", Item: "PedalMonster", Phone: "612-406-7117", Installer: "aaron" } }];
    return [];
  };
  const res = await handler({ httpMethod: "GET", headers: { "x-installer-token": "S" }, queryStringParameters: { phone: "612-406-7117" } },
    { env: ENV2, listImpl, fetchImpl: async () => ({ ok: false, json: async () => ({}) }) });
  const body = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(body.purchases.length, 2);
  assert.equal(body.purchases[0].category, "Banks");    // 2026 newest first
  assert.equal(body.purchases[1].category, "OTT Tune"); // derived from the completed booking
});
