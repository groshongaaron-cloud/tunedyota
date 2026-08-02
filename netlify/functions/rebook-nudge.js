// netlify/functions/rebook-nudge.js
// Annual rebook nudge (funnel audit 2026-08-02). Roughly a year after a
// calibration, the customer gets ONE personal check-in inviting them back —
// unless a newer booking (same phone/email) shows they already rebooked.
// Email only: SMS would need an A2P-consent scope check; email with reply-to
// is safe and personal. The 11-13 month window means nobody gets nudged about
// an ancient install when this first turns on.
const { cfg, listAllRecords, updateRecord, updateTolerant } = require("./lib/airtable.js");
const { sendEmail } = require("./lib/resend.js");
const { keyToInstaller, normalizeInstallerKey } = require("./lib/routing.js");
const { referralUrl } = require("./lib/client-auth.js");
const { normalizePhone, normalizeEmail } = require("./lib/leads.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";
const MIN_MONTHS = 11, MAX_MONTHS = 13;
const MAX_PER_RUN = 20;
const BOOK_URL = "https://tunedyota.com/find-your-exact-tune";

function buildRebookEmail({ name, vehicle, installer, refUrl }) {
  const first = String(name || "").trim().split(/\s+/)[0] || "there";
  const veh = String(vehicle || "").trim() || "truck";
  const subject = `It's been about a year since we tuned the ${veh}`;
  const text = `Hi ${first},\n\n${installer} here from Tuned Yota — it's been about a year since we calibrated your ${veh}.\n\nIf you've added mods, changed your fuel, or just want everything freshened up and re-verified, we'd love to get you back on the schedule:\n${BOOK_URL}\n\nAnd if a friend's been eyeing your setup, here's your personal link — we'll take care of them:\n${refUrl}\n\nQuestions about whether a re-cal makes sense for you? Just reply — happy to talk it through honestly.\n\n— ${installer}, Tuned Yota`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#1a1a1a;max-width:560px">
<p>Hi ${first},</p>
<p>${installer} here from Tuned Yota &mdash; it's been about a year since we calibrated your ${veh}.</p>
<p>If you've added mods, changed your fuel, or just want everything freshened up and re-verified, we'd love to get you back on the schedule:</p>
<p><a href="${BOOK_URL}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">Grab a spot</a></p>
<p>And if a friend's been eyeing your setup, here's <a href="${refUrl}">your personal link</a> &mdash; we'll take care of them.</p>
<p>Questions about whether a re-cal makes sense for you? Just reply &mdash; happy to talk it through honestly.</p>
<p>&mdash; ${installer}, Tuned Yota</p></div>`;
  return { subject, text, html };
}

async function runRebookNudge(deps = {}) {
  const env = deps.env || process.env;
  const now = deps.now || new Date();
  const list = deps.list || ((a) => listAllRecords({ ...a }));
  const update = deps.update || ((a) => updateRecord({ ...a }));
  const send = deps.send || ((a) => sendEmail(a));
  const c = cfg(env);

  let recs = [];
  try { recs = await list({ token: c.token, baseId: c.baseId, table: c.bookings }); }
  catch (e) { return { sent: 0, error: "store-unavailable" }; }

  // A newer non-cancelled booking for the same person = they already rebooked.
  const rebooked = (f, calDate) => recs.some((r) => {
    const g = r.fields || {};
    if (g.Status === "Cancelled") return false;
    const d = String(g["Event Date"] || "").slice(0, 10);
    if (!d || d <= calDate) return false;
    const samePhone = normalizePhone(f.Phone) && normalizePhone(g.Phone) === normalizePhone(f.Phone);
    const sameEmail = normalizeEmail(f.Email) && normalizeEmail(g.Email) === normalizeEmail(f.Email);
    return samePhone || sameEmail;
  });

  const monthsBetween = (iso) => {
    const t = Date.parse(iso + "T00:00:00Z");
    return isNaN(t) ? NaN : (now.getTime() - t) / (30.44 * 86400000);
  };

  const due = recs.filter((r) => {
    const f = r.fields || {};
    if (f.Status !== "Completed") return false;
    if (!String(f.Email || "").trim()) return false;
    if (String(f["Rebook Nudge Sent"] || "").trim()) return false;
    const calDate = String(f["Calibration Date"] || "").slice(0, 10);
    const m = monthsBetween(calDate);
    if (isNaN(m) || m < MIN_MONTHS || m > MAX_MONTHS) return false;
    return !rebooked(f, calDate);
  }).slice(0, MAX_PER_RUN);

  let sent = 0;
  for (const r of due) {
    const f = r.fields || {};
    const inst = keyToInstaller(normalizeInstallerKey(f.Installer));
    const m = buildRebookEmail({ name: f.Name, vehicle: f.Vehicle, installer: inst.name || "Aaron",
      refUrl: referralUrl(f.Email, now.getTime(), env) });
    try {
      await send({ apiKey: env.RESEND_API_KEY, from: FROM, to: String(f.Email).trim(),
        replyTo: OWNER, subject: m.subject, text: m.text, html: m.html });
    } catch (e) { continue; }   // unstamped → next week retries
    await updateTolerant(update, { token: c.token, baseId: c.baseId, table: c.bookings, id: r.id,
      fields: { "Rebook Nudge Sent": now.toISOString().slice(0, 10) } }, ["Rebook Nudge Sent"]).catch(() => {});
    sent++;
  }
  return { sent, scanned: due.length };
}

async function handler() {
  const out = await runRebookNudge({});
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, runRebookNudge, buildRebookEmail };
