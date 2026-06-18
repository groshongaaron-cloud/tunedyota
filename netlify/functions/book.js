// netlify/functions/book.js
const { getMarket } = require("./lib/markets.js");
const { keyToInstaller } = require("./lib/routing.js");
const { getEventForCity } = require("./lib/events.js");
const EVENTS = require("./lib/events-data.js");
const { cfg, listRecords, createRecord } = require("./lib/airtable.js");
const { isValidSlot, computeOpen } = require("./lib/slots.js");
const { sendEmail } = require("./lib/resend.js");
const { sendSms, normalizePhone } = require("./lib/sms.js");
const { buildIcs } = require("./lib/ics.js");
const tpl = require("./lib/templates.js");

const FROM = "Tuned Yota <info@tunedyota.com>";
const OWNER = "info@tunedyota.com";

async function processBooking(body, deps) {
  const { fetchImpl = fetch, env = process.env, send = sendEmail, sms = sendSms, now, log = console } = deps;
  const d = body || {};
  if (d.bot_field) return { status: "ignored" };
  const market = getMarket(d.city);
  if (!market) return { status: "error", error: "unknown-city" };
  if (!d.name || (!d.phone && !d.email)) return { status: "error", error: "missing-contact" };
  const inst = keyToInstaller(market.inst);
  const c = cfg(env);
  const event = await getEventForCity(market.city, { fetchImpl, sheetId: env.EVENTS_SHEET_ID, baked: EVENTS, log });

  async function priority(reason) {
    try {
      await createRecord({ fetchImpl, token: c.token, baseId: c.baseId, table: c.priority, fields: {
        City: market.city, Name: d.name, Phone: d.phone || "", Email: d.email || "",
        Vehicle: d.vehicle || "", Goals: d.goals || "", Installer: inst.key,
        Reason: reason === "full" ? "Event full" : "No event scheduled",
        "Event Date": event ? event.dateISO : "",
      } });
    } catch (e) { if (log.error) log.error("priority create", e.message); return { status: "error", error: "store-unavailable" }; }
    try { const m = tpl.buildPriorityInstallerEmail(d, inst, market, reason); await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: inst.email, cc: inst.email === OWNER ? undefined : OWNER, replyTo: d.email || undefined, subject: m.subject, html: m.html, text: m.text }); } catch (e) { if (log.error) log.error("prio inst email", e.message); }
    if (d.email) { try { const m = tpl.buildPriorityCustomerEmail(d, inst, market, reason); await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: d.email, replyTo: OWNER, subject: m.subject, html: m.html, text: m.text }); } catch (e) { if (log.error) log.error("prio cust email", e.message); } }
    if (d.phone) { try { await sms({ fetchImpl, to: normalizePhone(d.phone), body: tpl.buildPrioritySms(d, market), env }); } catch (e) { if (log.error) log.error("prio sms", e.message); } }
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

  try {
    await createRecord({ fetchImpl, token: c.token, baseId: c.baseId, table: c.bookings, fields: {
      City: market.city, "Event Date": event.dateISO, Slot: d.slot,
      Name: d.name, Phone: d.phone || "", Email: d.email || "",
      Vehicle: d.vehicle || "", Goals: d.goals || "", Installer: inst.key,
      Status: "Booked", Source: "find-your-exact-tune",
      "UTM Source": d.utm_source || "", "UTM Medium": d.utm_medium || "", "UTM Campaign": d.utm_campaign || "",
    } });
  } catch (e) { if (log.error) log.error("create", e.message); return { status: "error", error: "store-unavailable" }; }

  try { const m = tpl.buildBookingInstallerEmail(d, inst, market, event); await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: inst.email, cc: inst.email === OWNER ? undefined : OWNER, replyTo: d.email || undefined, subject: m.subject, html: m.html, text: m.text }); } catch (e) { if (log.error) log.error("inst email", e.message); }
  if (d.email) {
    try {
      const ics = buildIcs({ uid: `${event.dateISO}-${d.slot}-${now()}@tunedyota.com`, dateISO: event.dateISO, slot: d.slot, summary: `Tuned Yota — ${market.city} OTT Tune`, location: `${market.city}, ${market.state}`, description: `Your ${d.vehicle || "vehicle"} tune with ${inst.name}. Questions: ${inst.phone}`, stamp: now() });
      const m = tpl.buildBookingCustomerEmail(d, inst, market, event);
      await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: d.email, replyTo: OWNER, subject: m.subject, html: m.html, text: m.text, attachments: [{ filename: "tuned-yota-booking.ics", content: Buffer.from(ics).toString("base64") }] });
    } catch (e) { if (log.error) log.error("cust email", e.message); }
  }
  if (d.phone) { try { await sms({ fetchImpl, to: normalizePhone(d.phone), body: tpl.buildBookingSms(d, inst, market, event), env }); } catch (e) { if (log.error) log.error("sms", e.message); } }

  return { status: "booked", city: market.city, eventDateISO: event.dateISO, eventLabel: event.label, slot: d.slot };
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
