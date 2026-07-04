// netlify/functions/book.js
const { getMarket } = require("./lib/markets.js");
const { keyToInstaller } = require("./lib/routing.js");
const { getEventForCity } = require("./lib/events.js");
const EVENTS = require("./lib/events-data.js");
const { cfg, listRecords, createRecord, createTolerant } = require("./lib/airtable.js");
const { isValidSlot, computeOpen } = require("./lib/slots.js");
const { triggerBackground } = require("./lib/background.js");

// book.js is the SYNCHRONOUS critical path: validate -> check slots -> create the
// Airtable record -> return a status the booking UI depends on (booked/conflict/
// priority + openSlots). All the slow, best-effort follow-up (installer/customer
// emails + the n8n ping) is handed to the `book-background` function so a cold-start
// timeout can never drop it or stall this response. See lib/background.js.
async function processBooking(body, deps) {
  const { fetchImpl = fetch, env = process.env, now = icsStamp, log = console,
          trigger = triggerBackground } = deps;
  const d = body || {};
  if (d.bot_field) return { status: "ignored" };
  const market = getMarket(d.city);
  if (!market) return { status: "error", error: "unknown-city" };
  if (!d.name || (!d.phone && !d.email)) return { status: "error", error: "missing-contact" };
  const inst = keyToInstaller(market.inst);
  const c = cfg(env);
  const event = await getEventForCity(market.city, { fetchImpl, sheetId: env.EVENTS_SHEET_ID, baked: EVENTS, log });

  // Schedule the slow notifications without blocking this response. Best-effort:
  // a failure to even enqueue must not break the booking the user just made.
  async function fire(job) {
    try { await trigger({ fetchImpl, env, name: "book-background", log, payload: job }); }
    catch (e) { if (log.error) log.error("trigger book-background", e.message); }
  }

  async function priority(reason) {
    const pfields = {
      City: market.city, Name: d.name, Phone: d.phone || "", Email: d.email || "",
      Vehicle: d.vehicle || "", "Model Year": d.modelYear || "", Goals: d.goals || "", Modifications: d.mods || "", Installer: inst.key,
      Reason: reason === "full" ? "Event full" : "No event scheduled",
      "Event Date": event ? event.dateISO : "",
    };
    if (reason === "full" && isValidSlot(d.slot)) pfields["Requested Slot"] = d.slot; // only set when a preference was picked
    let pid;
    try {
      const rec = await createTolerant(createRecord, { fetchImpl, token: c.token, baseId: c.baseId, table: c.priority, fields: pfields }, ["Modifications", "Model Year"]);
      pid = rec && rec.id;
    } catch (e) { if (log.error) log.error("priority create", e.message); return { status: "error", error: "store-unavailable" }; }
    await fire({ kind: "priority", d, inst, market, reason, recordId: pid });
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
      Vehicle: d.vehicle || "", "Model Year": d.modelYear || "", Goals: d.goals || "", Modifications: d.mods || "", Installer: inst.key,
      Status: "Booked", Source: d.source || "find-your-exact-tune",
      "UTM Source": d.utm_source || "", "UTM Medium": d.utm_medium || "", "UTM Campaign": d.utm_campaign || "",
    } }, ["Modifications", "Model Year"]);
    bid = rec && rec.id;
  } catch (e) { if (log.error) log.error("create", e.message); return { status: "error", error: "store-unavailable" }; }

  await fire({ kind: "booking", d, inst, market, event, recordId: bid, stamp: now() });

  // emailFailed is intentionally omitted: emails are sent in the background after
  // this returns, so it's unknown here. The UI defaults to "check your email", and
  // book-background independently Slack-alerts the owner if an email actually fails.
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
