// netlify/functions/book.js
const { getMarket } = require("./lib/markets.js");
const { keyToInstaller } = require("./lib/routing.js");
const { getEventsForCity } = require("./lib/events.js");
const EVENTS = require("./lib/events-data.js");
const { cfg, listRecords, createRecord, createTolerant } = require("./lib/airtable.js");
const { isValidSlot, computeOpen, windowSlots, slotsFor, slotMode } = require("./lib/slots.js");
const { normalizePhone, normalizeEmail } = require("./lib/leads.js");
const { triggerBackground } = require("./lib/background.js");
const { verifyReferral } = require("./lib/client-auth.js");
const { pcmProtocol } = require("./lib/pcm-protocol.js");

// The back-to-back suggestion for a second truck: the open slot adjacent to the
// client's existing one (later preferred). Meaningless in generic slot mode —
// Noah assigns real times from the console — so it stays blank there.
function adjacentOpen(existingSlot, open, instKey) {
  if (slotMode(instKey) === "generic") return "";
  const grid = slotsFor(instKey);
  const i = grid.indexOf(String(existingSlot || ""));
  if (i < 0) return "";
  if (open.includes(grid[i + 1])) return grid[i + 1];
  if (open.includes(grid[i - 1])) return grid[i - 1];
  return "";
}

// book.js is the SYNCHRONOUS critical path: validate -> check slots -> create the
// Airtable record -> return a status the booking UI depends on (booked/conflict/
// priority + openSlots). All the slow, best-effort follow-up (installer/customer
// emails + the n8n ping) is handed to the `book-background` function so a cold-start
// timeout can never drop it or stall this response. See lib/background.js.
async function processBooking(body, deps) {
  const { fetchImpl = fetch, env = process.env, now = icsStamp, log = console,
          trigger = triggerBackground, nowDate, nowMs = Date.now() } = deps;
  const d = body || {};
  if (d.bot_field) return { status: "ignored" };
  const market = getMarket(d.city);
  if (!market) return { status: "error", error: "unknown-city" };
  if (!d.name || (!d.phone && !d.email)) return { status: "error", error: "missing-contact" };
  // Protocol Selection Guide gate: every booking must pin its flash protocol, so
  // a guide vehicle whose engine (or exact year, on split ranges) can't
  // disambiguate it is rejected up front. Non-guide vehicles have no protocol to
  // pick and pass through. The web funnels always send engine + exact year, so
  // this only stops hand-crafted or degraded submissions.
  const proto = pcmProtocol(d.vehicle, d.modelYear);
  if (proto && proto.confirm) return { status: "error", error: "missing-engine" };
  const inst = keyToInstaller(market.inst);
  // Referral attribution (no-reward, gratitude-based): a signed ref token in the
  // funnel link identifies the referrer by email. Ignore a self-referral (same
  // email) and any tampered/expired token. Stored so the owner can say thanks.
  const rv = d.ref ? verifyReferral(d.ref, nowMs, env) : null;
  const referredBy = (rv && rv.email && rv.email !== String(d.email || "").trim().toLowerCase()) ? rv.email : "";
  const c = cfg(env);
  const list = await getEventsForCity(market.city, { fetchImpl, env, sheetId: env.EVENTS_SHEET_ID, baked: EVENTS, log }, nowDate);
  const event = d.dateISO ? list.find((e) => e.dateISO === d.dateISO) : list[0];

  // Schedule the slow notifications without blocking this response. Best-effort:
  // a failure to even enqueue must not break the booking the user just made.
  async function fire(job) {
    try { await trigger({ fetchImpl, env, name: "book-background", log, payload: job }); }
    catch (e) { if (log.error) log.error("trigger book-background", e.message); }
  }

  async function priority(reason, extra = {}) {
    const pfields = {
      City: market.city, Name: d.name, Phone: d.phone || "", Email: d.email || "",
      Vehicle: d.vehicle || "", "Model Year": d.modelYear || "", Goals: d.goals || "", Modifications: d.mods || "", Installer: inst.key,
      Reason: reason === "full" ? "Event full" : reason === "multi-truck" ? "Multi-truck request" : "No event scheduled",
      "Event Date": event ? event.dateISO : "",
      ...(referredBy ? { "Referred By": referredBy } : {}),
    };
    if (reason === "full" && isValidSlot(d.slot, market.inst)) pfields["Requested Slot"] = d.slot; // only set when a preference was picked
    if (reason === "multi-truck" && extra.suggestedSlot) pfields["Requested Slot"] = extra.suggestedSlot; // the back-to-back plan
    let pid;
    try {
      const rec = await createTolerant(createRecord, { fetchImpl, token: c.token, baseId: c.baseId, table: c.priority, fields: pfields }, ["Modifications", "Model Year", "Referred By"]);
      pid = rec && rec.id;
    } catch (e) { if (log.error) log.error("priority create", e.message); return { status: "error", error: "store-unavailable" }; }
    await fire({ kind: "priority", d: reason === "multi-truck" ? { ...d, suggestedSlot: extra.suggestedSlot || "" } : d, inst, market, reason, recordId: pid });
    return { status: "priority", reason };
  }

  if (!event) return priority("no-event");

  let recs = [];
  try {
    const formula = `AND({City}="${market.city}",{Event Date}="${event.dateISO}",{Status}!="Cancelled")`;
    recs = await listRecords({ fetchImpl, token: c.token, baseId: c.baseId, table: c.bookings, filterByFormula: formula, fields: ["Slot", "Phone", "Email"] });
  } catch (e) { if (log.error) log.error("list", e.message); return { status: "error", error: "store-unavailable" }; }
  const taken = recs.map((r) => r.fields.Slot).filter(Boolean);

  const eventSlots = windowSlots(slotsFor(market.inst), event);
  const open = computeOpen(taken, market.inst).filter((s) => eventSlots.includes(s));

  // One booking per client per event (owner rule 2026-07-30). A duplicate attempt
  // becomes a Multi-truck request the installer grants from the console — never a
  // silent second booking eating event capacity.
  const pKey = normalizePhone(d.phone), eKey = normalizeEmail(d.email);
  const dupe = recs.find((r) => {
    const f = r.fields || {};
    return (pKey && normalizePhone(f.Phone) === pKey) || (eKey && normalizeEmail(f.Email) === eKey);
  });
  if (dupe) {
    const suggestedSlot = adjacentOpen(dupe.fields.Slot, open, market.inst);
    const p = await priority("multi-truck", { suggestedSlot });
    if (p.status === "error") return p;
    return { status: "multi-truck", existingSlot: dupe.fields.Slot || "", suggestedSlot,
      installerName: (inst.name || "").split(" ")[0], city: market.city, eventDateISO: event.dateISO };
  }

  if (open.length === 0) return priority("full");
  if (!d.slot || !isValidSlot(d.slot, market.inst) || !open.includes(d.slot)) return { status: "conflict", openSlots: open };

  let bid;
  try {
    const rec = await createTolerant(createRecord, { fetchImpl, token: c.token, baseId: c.baseId, table: c.bookings, fields: {
      City: market.city, "Event Date": event.dateISO, Slot: d.slot,
      Name: d.name, Phone: d.phone || "", Email: d.email || "",
      Vehicle: d.vehicle || "", "Model Year": d.modelYear || "", Goals: d.goals || "", Modifications: d.mods || "", Installer: inst.key,
      Status: "Booked", Source: d.source || "find-your-exact-tune",
      "UTM Source": d.utm_source || "", "UTM Medium": d.utm_medium || "", "UTM Campaign": d.utm_campaign || "",
      ...(referredBy ? { "Referred By": referredBy } : {}),
    } }, ["Modifications", "Model Year", "Referred By"]);
    bid = rec && rec.id;
  } catch (e) { if (log.error) log.error("create", e.message); return { status: "error", error: "store-unavailable" }; }

  await fire({ kind: "booking", d, inst, market, event, recordId: bid, stamp: now(), referredBy });

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
  const code = out.error === "missing-engine" ? 400 : out.status === "error" ? 502 : out.status === "conflict" ? 409 : 200;
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, processBooking };
