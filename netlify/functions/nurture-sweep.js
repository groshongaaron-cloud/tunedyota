// Daily sweep: advance the researcher nurture sequence. For each Priority List
// lead that opted into the lead magnet (Source "lead-magnet"), is still an active
// (unbooked, unconverted) lead, and whose last nurture email is >= GAP_DAYS old,
// send the next step and advance. Idempotent via Nurture Step + Nurture Last Sent;
// stops after the final step or once the lead books/converts. Mirrors amsoil-followup.
const { cfg, listRecords, updateRecord, updateTolerant } = require("./lib/airtable.js");
const { sendEmail } = require("./lib/resend.js");
const { notifyOwner } = require("./lib/alert.js");
const { buildNurtureEmail, STEPS } = require("./lib/nurture-email.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";
const GAP_DAYS = 3;
const ACTIVE = ["New", "Contacted", "Qualified", "Following up"];
const FORMULA = `AND(FIND("lead-magnet", {Source}&""), {Email}!="", {Nurture Step}>=1, {Nurture Step}<${STEPS})`;
const dateOnly = (s) => String(s == null ? "" : s).slice(0, 10);
const daysAgoISO = (now, days) => new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);

async function runNurtureSweep(deps) {
  const { env = process.env, fetchImpl = fetch, now = new Date(),
          list = (a) => listRecords({ fetchImpl, ...a }),
          update = (a) => updateRecord({ fetchImpl, ...a }),
          send = sendEmail, notify = notifyOwner, log = console } = deps;
  const c = cfg(env);
  const dueBy = daysAgoISO(now, GAP_DAYS);
  const today = now.toISOString().slice(0, 10);

  let rows = [];
  try { rows = await list({ token: c.token, baseId: c.baseId, table: c.priority, filterByFormula: FORMULA }); }
  catch (e) { if (log.error) log.error("nurture list", e.message); return { ok: false, error: e.message }; }

  let sent = 0, skipped = 0;
  for (const row of rows) {
    const f = row.fields || {};
    const stage = f.Stage || "New";
    const step = Number(f["Nurture Step"] || 0);
    const lastSent = dateOnly(f["Nurture Last Sent"]);
    // Stop for booked/converted leads, when not yet due, or when the sequence is done.
    if (!ACTIVE.includes(stage) || f["Converted Booking"]) { skipped++; continue; }
    if (!lastSent || lastSent > dueBy) { skipped++; continue; }
    if (!(step >= 1 && step < STEPS)) { skipped++; continue; }
    const next = step + 1;
    try {
      const m = buildNurtureEmail(next, { name: f.Name, vehicle: f.Vehicle });
      await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: f.Email, replyTo: OWNER, subject: m.subject, html: m.html, text: m.text });
      await updateTolerant(update, { token: c.token, baseId: c.baseId, table: c.priority, id: row.id,
        fields: { "Nurture Step": next, "Nurture Last Sent": today } }, ["Nurture Step", "Nurture Last Sent"]);
      sent++;
    } catch (e) {
      if (log.error) log.error("nurture send", e.message);
      try { await notify({ fetchImpl, webhookUrl: env.SLACK_WEBHOOK_URL, text: `⚠️ Nurture email FAILED — ${f.Name || f.Email} step ${next}: ${e.message}`, log }); }
      catch (e2) { if (log.error) log.error("nurture notify", e2.message); }
    }
  }
  return { ok: true, sent, skipped, found: rows.length };
}

async function handler() { const r = await runNurtureSweep({}); return { statusCode: 200, body: JSON.stringify(r) }; }
module.exports = { handler, runNurtureSweep };
