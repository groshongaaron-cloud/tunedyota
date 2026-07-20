// Public soft opt-in for not-ready researchers: capture an email into the nurture
// sequence and send step 1 immediately. Creates/dedupes a Priority List lead
// (Source "lead-magnet") through the shared lead pipeline, then stamps the nurture
// step so the daily sweep advances it. Fail-soft: a send failure never loses the lead.
const { processLeadIngest } = require("./lib/leads.js");
const { cfg, updateRecord, updateTolerant } = require("./lib/airtable.js");
const { sendEmail } = require("./lib/resend.js");
const { buildNurtureEmail } = require("./lib/nurture-email.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function processOptin(body, deps) {
  const { env = process.env, fetchImpl = fetch, now = new Date(),
          ingest = (b, d) => processLeadIngest(b, d),
          update = (a) => updateRecord({ fetchImpl, ...a }),
          send = sendEmail, log = console } = deps;
  const d = body || {};
  if (d.bot_field) return { status: "ignored" };
  const email = String(d.email || "").trim();
  if (!EMAIL_RE.test(email)) return { status: "error", error: "bad-email" };
  const today = now.toISOString().slice(0, 10);

  let rec;
  try {
    rec = await ingest({ name: d.name || email.split("@")[0], email, vehicle: d.vehicle || "", city: d.city || "",
      channel: "email", source: "lead-magnet", message: "Lead-magnet opt-in (nurture)" }, { env, fetchImpl, now });
  } catch (e) { if (log.error) log.error("nurture ingest", e.message); return { status: "error", error: "store-unavailable" }; }
  const recordId = rec && rec.recordId;

  const c = cfg(env);
  if (recordId) {
    // Stamp step 1 so the daily sweep picks up steps 2..N. Tolerant of a base that
    // hasn't added the columns yet — the opt-in + step-1 email still succeed.
    try {
      await updateTolerant(update, { token: c.token, baseId: c.baseId, table: c.priority, id: recordId,
        fields: { "Nurture Step": 1, "Nurture Last Sent": today } }, ["Nurture Step", "Nurture Last Sent"]);
    } catch (e) { if (log.error) log.error("nurture stamp", e.message); }
  }

  let sent = false;
  try {
    const m = buildNurtureEmail(1, { name: d.name, vehicle: d.vehicle });
    await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: email, replyTo: OWNER, subject: m.subject, html: m.html, text: m.text });
    sent = true;
  } catch (e) { if (log.error) log.error("nurture send1", e.message); }

  return { status: "ok", recordId, sent };
}

async function handler(event) {
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  const out = await processOptin(body, {});
  const code = out.status === "error" ? (out.error === "bad-email" ? 400 : 502) : 200;
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, processOptin };
