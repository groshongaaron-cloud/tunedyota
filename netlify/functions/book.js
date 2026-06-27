// netlify/functions/book.js
const { getMarket } = require("./lib/markets.js");
const { keyToInstaller } = require("./lib/routing.js");
const { getEventForCity } = require("./lib/events.js");
const EVENTS = require("./lib/events-data.js");
const { cfg, listRecords, createRecord, createTolerant, updateRecord } = require("./lib/airtable.js");
const { isValidSlot, computeOpen } = require("./lib/slots.js");
const { sendEmail } = require("./lib/resend.js");
const { notifyOwner } = require("./lib/alert.js");
const { buildIcs } = require("./lib/ics.js");
const tpl = require("./lib/templates.js");

// Sender must be on the Resend-verified domain (send.tunedyota.events).
// The mailbox (events@) is arbitrary — Resend sends from it without an inbox.
// Replies still route to the real info@ inbox via replyTo/OWNER below.
const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";

// Surface an email-send failure without ever breaking the booking flow:
// fire a Resend-independent Slack alert, and best-effort flag the record.
async function reportEmailFailure({ fetchImpl, env, notify, update, c, table, id, d, city, reason, log }) {
  const who = d.phone || d.email || "no contact";
  try {
    await notify({ fetchImpl, webhookUrl: env.SLACK_WEBHOOK_URL,
      text: `⚠️ Booking email FAILED — ${d.name} · ${city} · ${who} · reason: ${reason}`, log });
  } catch (e) { if (log.error) log.error("notify", e.message); }
  if (id) {
    try {
      await update({ fetchImpl, token: c.token, baseId: c.baseId, table, id, fields: { "Email Status": "FAILED" } });
    } catch (e) { if (log.error) log.error("flag", e.message); }
  }
}

async function processBooking(body, deps) {
  const { fetchImpl = fetch, env = process.env, send = sendEmail, now, log = console,
          notify = notifyOwner, update = updateRecord } = deps;
  const d = body || {};
  if (d.bot_field) return { status: "ignored" };
  const market = getMarket(d.city);
  if (!market) return { status: "error", error: "unknown-city" };
  if (!d.name || (!d.phone && !d.email)) return { status: "error", error: "missing-contact" };
  const inst = keyToInstaller(market.inst);
  const c = cfg(env);
  const event = await getEventForCity(market.city, { fetchImpl, sheetId: env.EVENTS_SHEET_ID, baked: EVENTS, log });

  async function priority(reason) {
    const pfields = {
      City: market.city, Name: d.name, Phone: d.phone || "", Email: d.email || "",
      Vehicle: d.vehicle || "", Goals: d.goals || "", Modifications: d.mods || "", Installer: inst.key,
      Reason: reason === "full" ? "Event full" : "No event scheduled",
      "Event Date": event ? event.dateISO : "",
    };
    if (reason === "full" && isValidSlot(d.slot)) pfields["Requested Slot"] = d.slot; // only set when a preference was picked
    let pid;
    try {
      const rec = await createTolerant(createRecord, { fetchImpl, token: c.token, baseId: c.baseId, table: c.priority, fields: pfields }, ["Modifications"]);
      pid = rec && rec.id;
    } catch (e) { if (log.error) log.error("priority create", e.message); return { status: "error", error: "store-unavailable" }; }
    let ok = true, why = "";
    try { const m = tpl.buildPriorityInstallerEmail(d, inst, market, reason); await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: inst.email, cc: inst.email === OWNER ? undefined : OWNER, replyTo: d.email || undefined, subject: m.subject, html: m.html, text: m.text }); } catch (e) { ok = false; why = e.message; if (log.error) log.error("prio inst email", e.message); }
    if (d.email) { try { const m = tpl.buildPriorityCustomerEmail(d, inst, market, reason); await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: d.email, replyTo: OWNER, subject: m.subject, html: m.html, text: m.text }); } catch (e) { ok = false; why = why || e.message; if (log.error) log.error("prio cust email", e.message); } }
    if (!ok) await reportEmailFailure({ fetchImpl, env, notify, update, c, table: c.priority, id: pid, d, city: market.city, reason: why, log });
    return { status: "priority", reason };
  }

  if (!event) return priority("no-event");

  let taken = [];
  try {
    const formula = `AND({City}="${market.city}",{Event Date}="${event.dateISO}",{Status}!="Cancelled")`;
    const recs = await listRecords({ fetchImpl, token: c.token, baseId: c.baseId, table: c.bookings, filterByFormula: formula, fields: ["Slot"] });
    taken = recs.map((r) => r.fields.Slot).filter(Boolean);
  } catch (e) { if (log.error) log.error("list", e.message); return { status: "error", error: "store-unavailable" }; }

  const open = computeOpen(taken);
  if (open.length === 0) return priority("full");
  if (!d.slot || !isValidSlot(d.slot) || !open.includes(d.slot)) return { status: "conflict", openSlots: open };

  let bid;
  try {
    const rec = await createTolerant(createRecord, { fetchImpl, token: c.token, baseId: c.baseId, table: c.bookings, fields: {
      City: market.city, "Event Date": event.dateISO, Slot: d.slot,
      Name: d.name, Phone: d.phone || "", Email: d.email || "",
      Vehicle: d.vehicle || "", Goals: d.goals || "", Modifications: d.mods || "", Installer: inst.key,
      Status: "Booked", Source: d.source || "find-your-exact-tune",
      "UTM Source": d.utm_source || "", "UTM Medium": d.utm_medium || "", "UTM Campaign": d.utm_campaign || "",
    } }, ["Modifications"]);
    bid = rec && rec.id;
  } catch (e) { if (log.error) log.error("create", e.message); return { status: "error", error: "store-unavailable" }; }

  let instOk = true, custOk = true, why = "";
  try { const m = tpl.buildBookingInstallerEmail(d, inst, market, event); await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: inst.email, cc: inst.email === OWNER ? undefined : OWNER, replyTo: d.email || undefined, subject: m.subject, html: m.html, text: m.text }); } catch (e) { instOk = false; why = e.message; if (log.error) log.error("inst email", e.message); }
  if (d.email) {
    try {
      const ics = buildIcs({ uid: `${event.dateISO}-${d.slot}-${now()}@tunedyota.com`, dateISO: event.dateISO, slot: d.slot, summary: `Tuned Yota — ${market.city} OTT Tune`, location: `${market.city}, ${market.state}`, description: `Your ${d.vehicle || "vehicle"} tune with ${inst.name}. Questions: ${inst.phone}`, stamp: now() });
      const m = tpl.buildBookingCustomerEmail(d, inst, market, event);
      await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: d.email, replyTo: OWNER, subject: m.subject, html: m.html, text: m.text, attachments: [{ filename: "tuned-yota-booking.ics", content: Buffer.from(ics).toString("base64") }] });
    } catch (e) { custOk = false; why = why || e.message; if (log.error) log.error("cust email", e.message); }
  }
  const emailFailed = d.email ? !custOk : false;
  if (!instOk || (d.email && !custOk)) await reportEmailFailure({ fetchImpl, env, notify, update, c, table: c.bookings, id: bid, d, city: market.city, reason: why, log });

  return { status: "booked", city: market.city, eventDateISO: event.dateISO, eventLabel: event.label, slot: d.slot, emailFailed };
}

function icsStamp() { return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"); }
async function handler(event) {
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  const out = await processBooking(body, { fetchImpl: fetch, env: process.env, now: icsStamp });
  const code = out.status === "error" ? 502 : out.status === "conflict" ? 409 : 200;
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, processBooking };
