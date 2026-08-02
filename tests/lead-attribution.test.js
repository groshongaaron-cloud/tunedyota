// Source-and-generation integrity (owner directive 2026-08-02): every lead and
// booking must carry WHERE it came from (channel) and HOW it was generated
// (granular source), end to end. These tests pin the paths that were silently
// flattening or dropping attribution.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ensureClientRecordForBooking, channelForBooking } = require("../netlify/functions/lib/leads.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };

test("channelForBooking derives the channel from the booking's Source", () => {
  assert.equal(channelForBooking("find-your-exact-tune"), "web");
  assert.equal(channelForBooking("lead:sms"), "sms");
  assert.equal(channelForBooking("lead:instagram"), "instagram");
  assert.equal(channelForBooking("installer:walk-in"), "walk-in");
  assert.equal(channelForBooking("intake:facebook"), "facebook");
  assert.equal(channelForBooking("banks-reserve"), "web");
  assert.equal(channelForBooking(""), "walk-in", "no source at all → walk-in (installer-entered)");
});

test("ensureClientRecordForBooking: a source option rides onto the minted lead verbatim", async () => {
  const creates = [];
  const r = await ensureClientRecordForBooking("recB1",
    { Name: "Dana", Phone: "6055551212", City: "Madison", Installer: "aaron" },
    { env, channel: "web", source: "booking:find-your-exact-tune:tiktok",
      list: async () => [], create: async (a) => { creates.push(a); return { id: "recL9" }; }, update: async () => ({}) });
  assert.equal(r.minted, true);
  assert.equal(creates[0].fields.Source, "booking:find-your-exact-tune:tiktok");
  assert.equal(creates[0].fields.Channel, "web");
});

test("book-background mints the client record with the booking's REAL source + utm", async () => {
  const { processNotifications } = require("../netlify/functions/book-background.js");
  const calls = [];
  const inst = { key: "aaron", name: "Aaron", email: "a@x.com", phone: "555" };
  const market = { city: "Madison", state: "WI", inst: "aaron" };
  await processNotifications({ kind: "booking", recordId: "recB2", stamp: 1, inst, market,
      event: { dateISO: "2026-08-08", label: "Madison", address: "" },
      d: { name: "Dana", phone: "6055551212", email: "", vehicle: "Tundra", slot: "10:20",
        source: "find-your-exact-tune", utm_source: "tiktok" } },
    { env, fetchImpl: async () => ({ ok: true, json: async () => ({}) }),
      send: async () => ({}), notify: async () => ({}), update: async () => ({}),
      ping: async () => ({}), push: async () => ({}), webPush: async () => ({}),
      ensureClient: async (id, f, opts) => { calls.push({ id, f, opts }); return { leadId: "recL1" }; },
      log: { error() {} } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].opts.channel, "web");
  assert.match(calls[0].opts.source, /find-your-exact-tune/);
  assert.match(calls[0].opts.source, /tiktok/, "utm_source rides into the client record's Source");
});

test("close-out minting derives the channel from the booking, not hardcoded walk-in", async () => {
  const { processCloseout } = require("../netlify/functions/installer-closeout.js");
  const creates = [];
  const booking = { id: "recB3", fields: { Name: "Web Customer", Phone: "6055550000",
    City: "Madison", Installer: ["aaron"], Status: "Booked", "Event Date": "2026-08-01",
    Source: "find-your-exact-tune", Vehicle: "Tundra" } };
  await processCloseout({ recordId: "recB3", calibration: "Mild", vin: "SMOKETESTC0000001",
      tuningPlatform: "VFT", calibrationType: "9.2 New", ecuId: "E1", gearSize: "3.90",
      mileage: "1000", modelYear: "2021", customerEmail: "dana@example.com", preferredContact: "SMS" },
    { env: { ...env, RESEND_API_KEY: "k" }, key: "aaron", admin: true,
      get: async () => booking,
      update: async () => ({}),
      create: async (a) => { creates.push(a); return { id: "recL2" }; },
      list: async () => [],
      send: async () => ({}), log: { error() {} } });
  const minted = creates.find((a) => a.fields && a.fields.Channel);
  assert.ok(minted, "client record minted");
  assert.equal(minted.fields.Channel, "web", "web-funnel booking mints a WEB client record");
});

test("no-show waitlist row carries the booking's channel, not 'other'", async () => {
  const { processCloseout } = require("../netlify/functions/installer-closeout.js");
  const creates = [];
  const booking = { id: "recB4", fields: { Name: "Ghost", Phone: "6055550001", City: "Madison",
    Installer: ["aaron"], Status: "Booked", "Event Date": "2026-08-01", Source: "lead:sms" } };
  await processCloseout({ recordId: "recB4", action: "noshow", confirmed: true },
    { env, key: "aaron", admin: true,
      get: async () => booking, update: async () => ({}),
      create: async (a) => { creates.push(a); return { id: "recW1" }; },
      list: async () => [], send: async () => ({}), log: { error() {} } });
  assert.equal(creates.length, 1);
  assert.equal(creates[0].fields.Channel, "sms", "waitlist row keeps the original channel");
  assert.equal(creates[0].fields.Source, "installer:no-show", "source still says WHY it's waitlisted");
});

test("convert keeps the lead's granular source on the booking", async () => {
  const { handler } = require("../netlify/functions/lead-update.js");
  const creates = [];
  const ctx = { env: { ...env, INSTALLER_TOKENS: '{"aaron":"atok"}', INSTALLER_ADMINS: "aaron" },
    now: new Date("2026-08-02T12:00:00Z"),
    getImpl: async () => ({ id: "recL1", fields: { Name: "Ig Person", Installer: "aaron",
      Channel: "instagram", Source: "chat:instagram" } }),
    updateImpl: async () => ({}),
    createBookingImpl: async (a) => { creates.push(a); return { id: "recNEW" }; } };
  await handler({ headers: { "x-installer-token": "atok" },
    body: JSON.stringify({ id: "recL1", action: "convert", dateISO: "2026-08-08" }) }, ctx);
  assert.match(creates[0].fields.Source, /^lead:instagram/);
  assert.match(creates[0].fields.Source, /chat:instagram/, "granular origin preserved on the booking");
});

test("console can display every channel including chat", () => {
  const fs = require("node:fs");
  const html = fs.readFileSync("site/installer.html", "utf8");
  const m = /CHAN_ICON\s*=\s*\{([^}]*)\}/.exec(html);
  assert.ok(m, "CHAN_ICON map present");
  for (const ch of ["email", "sms", "phone", "facebook", "instagram", "walk-in", "ott-national", "web", "chat"])
    assert.ok(new RegExp("['\"]?" + ch.replace(/[-]/g, "\\-") + "['\"]?\\s*:").test(m[1]), "icon for " + ch);
});
