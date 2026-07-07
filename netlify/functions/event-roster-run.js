// netlify/functions/event-roster-run.js
// On-demand installer-roster email — token-gated HTTP endpoint. Builds the live
// roster for ?city=<city> from Airtable and emails it to info@tunedyota.com.
// Exists so a roster can be (re)sent OUTSIDE the once-daily 07:00 event-reminders
// tick — e.g. the tick was missed (the 2026-07-03 Fargo unknown-city bug). Reuses
// renderRosterEmail so the output is identical to the scheduled roster.
// Gated by INTERNAL_TASK_SECRET via the `x-ty-task` header (same as book-background).
const EVENTS = require("./lib/events-data.js");
const { fetchEvents, asArray } = require("./lib/events.js");
const { cfg, listAllRecords } = require("./lib/airtable.js");
const { sendEmail } = require("./lib/resend.js");
const { renderRosterEmail } = require("./lib/roster-render.js");
const { getMarket } = require("./lib/markets.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";

const norm = (s) => String(s == null ? "" : s).trim().toLowerCase();
const dateOnly = (s) => String(s == null ? "" : s).slice(0, 10); // tolerate a DateTime "Event Date"
function flatten(records) { return (records || []).map((r) => ({ ...r.fields, id: r.id })); }

async function runRosterSend(params, deps = {}) {
  const env = deps.env || process.env;
  const { fetchImpl = fetch, loadEvents = (a) => fetchEvents(a),
          listAll = (a) => listAllRecords({ fetchImpl, ...a }),
          send = sendEmail, log = console } = deps;

  if (!env.INTERNAL_TASK_SECRET || String(params.token || "") !== env.INTERNAL_TASK_SECRET) {
    return { status: "error", code: 401, error: "unauthorized" };
  }
  const city = norm(params.city);
  if (!city) return { status: "error", code: 400, error: "missing city" };

  const eventMap = await loadEvents({ fetchImpl, sheetId: env.EVENTS_SHEET_ID, baked: EVENTS, log });
  const evs = asArray(eventMap[city]).filter((e) => e && e.dateISO)
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const ev = params.date ? evs.find((e) => e.dateISO === params.date) : evs[0];
  if (!ev || !ev.dateISO) return { status: "error", code: 404, error: `no event for ${city}` };

  const c = cfg(env);
  const [bRecs, pRecs] = await Promise.all([
    listAll({ token: c.token, baseId: c.baseId, table: c.bookings }),
    listAll({ token: c.token, baseId: c.baseId, table: c.priority }),
  ]);
  // Same city+date match the scheduled roster uses; drop cancelled so the day-of
  // list is actionable (mirrors the installer-console roster).
  const bookings = flatten(bRecs).filter((b) =>
    norm(b.City) === norm(ev.city) && dateOnly(b["Event Date"]) === dateOnly(ev.dateISO) && norm(b.Status) !== "cancelled");
  const waitlist = flatten(pRecs).filter((p) => norm(p.City) === norm(ev.city));

  // Baked city is the lowercase map key with no state; render with the market's
  // proper-case name + state so the roster header reads "Fargo, ND", not "fargo, ".
  const mk = getMarket(ev.city);
  const evRender = { ...ev, city: mk ? mk.city : ev.city, state: ev.state || (mk ? mk.state : "") };
  const m = renderRosterEmail(evRender, bookings, waitlist);
  await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: OWNER, replyTo: OWNER,
    subject: `${m.subject} (on-demand)`, html: m.html, text: m.text });

  return { status: "ok", code: 200, city: ev.city, dateISO: ev.dateISO, booked: bookings.length, waitlist: waitlist.length };
}

function page(title, body) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
    `<div style="font-family:-apple-system,Arial,sans-serif;max-width:520px;margin:60px auto;padding:0 20px;color:#3A2E26"><h1 style="color:#5B4B42">${title}</h1>${body}</div>`;
}

async function handler(event) {
  const q = (event && event.queryStringParameters) || {};
  const h = (event && event.headers) || {};
  // Prefer the header (keeps the secret out of URL/query logs); fall back to ?token=.
  const token = h["x-ty-task"] || h["X-Ty-Task"] || h["X-TY-TASK"] || q.token || "";
  const out = await runRosterSend({ city: q.city, date: q.date, token }, {});
  const html = out.status === "ok"
    ? page("Roster sent ✓", `<p><strong>${out.city}</strong> (${out.dateISO}) — ${out.booked} booked, ${out.waitlist} waitlisted — emailed to ${OWNER}.</p>`)
    : page("Not sent", `<p>${out.error === "unauthorized" ? "This link is invalid or the token is missing." : out.error}</p>`);
  return { statusCode: out.code || 500, headers: { "Content-Type": "text/html; charset=utf-8" }, body: html };
}

module.exports = { handler, runRosterSend };
