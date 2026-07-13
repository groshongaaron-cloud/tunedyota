// netlify/functions/amsoil-followup.js
// Scheduled daily sweep: ~3 days after a tune, email the customer their tailored
// AMSOIL fluids + Preferred-Customer pitch. The "opportunity" is the completed
// booking itself. Mirrors certificate-dispatch.js: injectable deps, idempotent via
// an "AMSOIL Email Sent" stamp, Slack alert on failure. Backfill floor via
// AMSOIL_FOLLOWUP_START; opt-out + no-email + already-sent excluded by the query.
const { cfg, listRecords, updateRecord } = require("./lib/airtable.js");
const { sendEmail } = require("./lib/resend.js");
const { notifyOwner } = require("./lib/alert.js");
const { resolveFluids } = require("./lib/amsoil-fluids.js");
const { buildAmsoilEmail } = require("./lib/amsoil-email.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";
const FORMULA = 'AND({Status}="Completed", NOT({AMSOIL Email Sent}), NOT({AMSOIL Opt-Out}), {Email}!="")';
const dateOnly = (s) => String(s == null ? "" : s).slice(0, 10);
const daysAgoISO = (now, days) => new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);

async function runAmsoilFollowup(deps) {
  const { env = process.env, fetchImpl = fetch, now = new Date(),
          list = (a) => listRecords({ fetchImpl, ...a }),
          update = (a) => updateRecord({ fetchImpl, ...a }),
          send = sendEmail, notify = notifyOwner, log = console } = deps;
  const c = cfg(env);
  const floor = dateOnly(env.AMSOIL_FOLLOWUP_START || "");   // backfill guard; skip pre-launch tunes
  const dueBy = daysAgoISO(now, 3);                          // only tunes >= 3 days old
  const today = now.toISOString().slice(0, 10);

  let rows = [];
  try { rows = await list({ token: c.token, baseId: c.baseId, table: c.bookings, filterByFormula: FORMULA }); }
  catch (e) { if (log.error) log.error("amsoil list", e.message); return { ok: false, error: e.message }; }

  let sent = 0, skipped = 0;
  for (const row of rows) {
    const f = row.fields || {};
    const calDate = dateOnly(f["Calibration Date"] || f["Event Date"]);
    if (!calDate || (floor && calDate < floor) || calDate > dueBy) { skipped++; continue; }
    const fluids = resolveFluids(f.Vehicle, f["Model Year"]);
    if (!fluids) { skipped++; continue; }   // non-catalog vehicle; leave unmarked (self-heals if catalog grows)
    try {
      const { subject, html, text } = buildAmsoilEmail({ name: f.Name, vehicle: f.Vehicle, modelYear: f["Model Year"], fluids });
      await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: f.Email, replyTo: OWNER, subject, html, text });
      await update({ token: c.token, baseId: c.baseId, table: c.bookings, id: row.id, fields: { "AMSOIL Email Sent": today } });
      sent++;
    } catch (e) {
      if (log.error) log.error("amsoil send", e.message);
      try { await notify({ fetchImpl, webhookUrl: env.SLACK_WEBHOOK_URL, text: `⚠️ AMSOIL follow-up email FAILED — ${f.Name || "?"} · ${e.message}`, log }); }
      catch (e2) { if (log.error) log.error("amsoil notify", e2.message); }
    }
  }
  return { ok: true, sent, skipped, found: rows.length };
}

async function handler() { const r = await runAmsoilFollowup({}); return { statusCode: 200, body: JSON.stringify(r) }; }
module.exports = { handler, runAmsoilFollowup };
