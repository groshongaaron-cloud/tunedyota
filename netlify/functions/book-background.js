// netlify/functions/book-background.js
//
// Netlify *background* function (the "-background" suffix is what makes it one):
// invoked by book.js after a booking/priority record is created. It runs the slow,
// best-effort follow-up — installer + customer emails (+.ics) and the fire-and-forget
// n8n ping — off the synchronous request path, so a cold-start timeout can never drop
// the ping (the old failure mode) or stall the booking response. Up to 15 min runtime.
const { cfg, updateRecord } = require("./lib/airtable.js");
const { sendEmail } = require("./lib/resend.js");
const { notifyOwner } = require("./lib/alert.js");
const { pingN8n } = require("./lib/n8n.js");
const { sendPush } = require("./lib/push.js");
const { sendWebPush } = require("./lib/webpush.js");
const { buildIcs } = require("./lib/ics.js");
const tpl = require("./lib/templates.js");

// Sender must be on the Resend-verified domain (send.tunedyota.events).
// The mailbox (events@) is arbitrary — Resend sends from it without an inbox.
// Replies still route to the real info@ inbox via replyTo/OWNER below.
const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";

// Surface an email-send failure without ever breaking the flow: fire a
// Resend-independent Slack alert, and best-effort flag the record.
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

// Run the notifications for one scheduled job. `job` is what book.js posts:
//   { kind:"booking", d, inst, market, event, recordId, stamp }
//   { kind:"priority", d, inst, market, reason, recordId }
async function processNotifications(job, deps) {
  const { fetchImpl = fetch, env = process.env, send = sendEmail, log = console,
          notify = notifyOwner, update = updateRecord, ping = pingN8n, push = sendPush,
          webPush = sendWebPush } = deps;
  const c = cfg(env);
  const d = (job && job.d) || {};
  const inst = job && job.inst;
  const market = job && job.market;
  if (!inst || !market) { if (log.error) log.error("processNotifications: malformed job"); return { ok: false }; }

  if (job.kind === "priority") {
    const reason = job.reason;
    let ok = true, why = "";
    try { const m = tpl.buildPriorityInstallerEmail(d, inst, market, reason); await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: inst.email, cc: inst.email === OWNER ? undefined : OWNER, replyTo: d.email || undefined, subject: m.subject, html: m.html, text: m.text }); } catch (e) { ok = false; why = e.message; if (log.error) log.error("prio inst email", e.message); }
    if (d.email) { try { const m = tpl.buildPriorityCustomerEmail(d, inst, market, reason); await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: d.email, replyTo: OWNER, subject: m.subject, html: m.html, text: m.text }); } catch (e) { ok = false; why = why || e.message; if (log.error) log.error("prio cust email", e.message); } }
    if (!ok) await reportEmailFailure({ fetchImpl, env, notify, update, c, table: c.priority, id: job.recordId, d, city: market.city, reason: why, log });
    return { ok: true };
  }

  // booking
  const event = job.event;
  let instOk = true, custOk = true, why = "";
  try { const m = tpl.buildBookingInstallerEmail(d, inst, market, event); await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: inst.email, cc: inst.email === OWNER ? undefined : OWNER, replyTo: d.email || undefined, subject: m.subject, html: m.html, text: m.text }); } catch (e) { instOk = false; why = e.message; if (log.error) log.error("inst email", e.message); }
  try {
    if (inst && inst.key) await push(inst.key, { title: "New booking", body: `${d.name || "A customer"} — ${market.city}`, data: { recordId: job.recordId || "" } });
  } catch (e) { if (log.error) log.error("booking push", e.message); }
  try {
    if (inst && inst.key) await webPush(inst.key, { title: "New booking", body: `${d.name || "A customer"} — ${market.city}`, url: "/installer.html" });
  } catch (e) { if (log.error) log.error("booking webpush", e.message); }
  if (d.email) {
    try {
      const icsLoc = (event.address && !/to be released/i.test(event.address)) ? event.address : `${market.city}, ${market.state}`;
      const ics = buildIcs({ uid: `${event.dateISO}-${d.slot}-${job.stamp}@tunedyota.com`, dateISO: event.dateISO, slot: d.slot, summary: `Tuned Yota — ${market.city} OTT Tune`, location: icsLoc, description: `Your ${d.vehicle || "vehicle"} tune with ${inst.name}. Questions: ${inst.phone}`, stamp: job.stamp });
      const m = tpl.buildBookingCustomerEmail(d, inst, market, event);
      await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: d.email, replyTo: OWNER, subject: m.subject, html: m.html, text: m.text, attachments: [{ filename: "tuned-yota-booking.ics", content: Buffer.from(ics).toString("base64") }] });
    } catch (e) { custOk = false; why = why || e.message; if (log.error) log.error("cust email", e.message); }
  }
  const emailFailed = d.email ? !custOk : false;
  if (!instOk || (d.email && !custOk)) await reportEmailFailure({ fetchImpl, env, notify, update, c, table: c.bookings, id: job.recordId, d, city: market.city, reason: why, log });

  // Fire-and-forget ping to n8n (Slack #bookings, etc.). No-op unless
  // N8N_BOOKING_WEBHOOK_URL is set; never throws. Carries the real emailFailed.
  await ping({ fetchImpl, url: env.N8N_BOOKING_WEBHOOK_URL, log, payload: {
    event: "booking", status: "booked",
    name: d.name, email: d.email || "", phone: d.phone || "",
    vehicle: d.vehicle || "", modelYear: d.modelYear || "", goals: d.goals || "", mods: d.mods || "",
    city: market.city, state: market.state, slot: d.slot,
    eventDateISO: event.dateISO, eventLabel: event.label,
    installer: { key: inst.key, name: inst.name, email: inst.email, phone: inst.phone },
    source: d.source || "find-your-exact-tune",
    utm: { source: d.utm_source || "", medium: d.utm_medium || "", campaign: d.utm_campaign || "" },
    emailFailed,
  } });

  return { ok: true, emailFailed };
}

async function handler(event) {
  // Shared-secret gate, fail closed: jobs must present INTERNAL_TASK_SECRET
  // (book.js attaches it). An unset secret is a deployment error, not an
  // open endpoint — same contract as event-roster-run.js.
  const h = event.headers || {};
  const got = h["x-ty-task"] || h["X-Ty-Task"] || h["X-TY-TASK"] || "";
  if (!process.env.INTERNAL_TASK_SECRET || got !== process.env.INTERNAL_TASK_SECRET) {
    return { statusCode: 401, body: "unauthorized" };
  }
  let job = {};
  try { job = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  try { await processNotifications(job, { fetchImpl: fetch, env: process.env }); }
  catch (e) { console.error("processNotifications", e && e.message); }
  return { statusCode: 200, body: "ok" };
}
module.exports = { handler, processNotifications };
