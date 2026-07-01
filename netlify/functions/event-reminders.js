// netlify/functions/event-reminders.js
// Hourly scheduled function. Acts only at 07:00 America/Chicago (2 h before the
// 9 AM event start). Sends installer rosters (30/15/10/2/0d), customer address
// notifications (10/2d), and runs the post-event waitlist sweep (-1d).
const EVENTS = require("./lib/events-data.js");
const { fetchEvents } = require("./lib/events.js");
const { cfg, listAllRecords, createRecord, createTolerant } = require("./lib/airtable.js");
const { getMarket } = require("./lib/markets.js");
const { keyToInstaller } = require("./lib/routing.js");
const { sendEmail } = require("./lib/resend.js");
const { notifyOwner } = require("./lib/alert.js");
const { centralParts } = require("./lib/central-time.js");
const { planDispatch, SWEEP_REASON } = require("./lib/event-plan.js");
const { renderRosterEmail } = require("./lib/roster-render.js");
const { renderRebookReport } = require("./lib/rebook-render.js");
const tpl = require("./lib/templates.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";

function flatten(records) { return (records || []).map((r) => ({ ...r.fields, id: r.id })); }

async function runReminders(deps) {
  const { env = process.env, now = new Date(), fetchImpl = fetch,
          loadEvents = (a) => fetchEvents(a),
          listAll = (a) => listAllRecords({ fetchImpl, ...a }),
          create = (a) => createRecord({ fetchImpl, ...a }),
          send = sendEmail, notify = notifyOwner, log = console } = deps;
  // At-most-once relies on the once-daily 07:00 gate: every reminder offset is an
  // exact integer-day match, so it fires on a single calendar day, and per-action
  // try/catch below means this function always resolves (no error → no Netlify
  // retry of the same tick). The sweep additionally self-dedups against existing
  // priority records, so a rare double-invocation won't duplicate waitlist rows.
  const nowCentral = centralParts(now);
  if (nowCentral.hour !== 7) return { ok: true, skipped: "off-hour" };

  const c = cfg(env);
  const eventMap = await loadEvents({ fetchImpl, sheetId: env.EVENTS_SHEET_ID, baked: EVENTS, log });
  const events = Object.values(eventMap);
  const [bRecs, pRecs] = await Promise.all([
    listAll({ token: c.token, baseId: c.baseId, table: c.bookings }),
    listAll({ token: c.token, baseId: c.baseId, table: c.priority }),
  ]);
  const bookings = flatten(bRecs);
  const priority = flatten(pRecs);

  const actions = planDispatch({ events, bookings, priority, nowCentral });
  const failures = [];

  for (const act of actions) {
    const market = getMarket(act.event.city);
    if (!market) {
      // An event city with no markets.js entry would silently route to the
      // Aaron fallback — surface it instead so routing gaps are visible.
      failures.push(`unknown-city:${act.event.city}`);
      if (log.warn) log.warn("reminder: unknown event city", act.event.city);
      continue;
    }
    const inst = keyToInstaller(market.inst);
    try {
      if (act.type === "installer-roster") {
        const m = renderRosterEmail(act.event, act.bookings, act.waitlist);
        await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: inst.email, replyTo: OWNER,
          subject: `${m.subject} (${act.daysUntil === 0 ? "morning-of" : act.daysUntil + "-day"})`, html: m.html, text: m.text });
      } else if (act.type === "customer-notify") {
        const m = tpl.buildEventReminderCustomerEmail(act.booking, act.event, inst, act.daysUntil);
        await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: act.booking.Email, replyTo: OWNER,
          subject: m.subject, html: m.html, text: m.text });
      } else if (act.type === "waitlist-sweep") {
        const b = act.booking;
        await createTolerant(create, { token: c.token, baseId: c.baseId, table: c.priority, fields: {
          City: act.event.city, Name: b.Name || "", Phone: b.Phone || "", Email: b.Email || "",
          Vehicle: b.Vehicle || "", Modifications: b.Modifications || "", Installer: inst.key,
          Reason: SWEEP_REASON, "Event Date": b["Event Date"] || act.event.dateISO,
        } }, ["Modifications"]);
      }
    } catch (e) {
      failures.push(`${act.type}:${act.event.city}:${e.message}`);
      if (log.error) log.error("reminder action", act.type, e.message);
    }
  }

  if (failures.length) {
    try { await notify({ fetchImpl, webhookUrl: env.SLACK_WEBHOOK_URL, text: `⚠️ event-reminders had ${failures.length} failure(s): ${failures.join(" · ")}`, log }); }
    catch (e) { if (log.error) log.error("reminder notify", e.message); }
  }

  const swept = actions.filter((a) => a.type === "waitlist-sweep");
  if (swept.length) {
    const rows = swept.map((a) => {
      const mk = getMarket(a.event.city);
      return {
        Name: a.booking.Name, Phone: a.booking.Phone, Email: a.booking.Email, Vehicle: a.booking.Vehicle,
        City: a.event.city, Reason: SWEEP_REASON, "Event Date": a.event.dateISO,
        Installer: mk ? keyToInstaller(mk.inst).key : "aaron",
      };
    });
    try {
      const m = renderRebookReport(rows, { title: `Post-event rebook — ${nowCentral.dateISO}` });
      await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: OWNER, replyTo: OWNER,
        subject: m.subject, html: m.html, text: m.text });
    } catch (e) { if (log.error) log.error("rebook report", e.message); }
  }

  return { ok: true, actions: actions.length, failures: failures.length };
}

async function handler() { const r = await runReminders({}); return { statusCode: 200, body: JSON.stringify(r) }; }
module.exports = { handler, runReminders };
