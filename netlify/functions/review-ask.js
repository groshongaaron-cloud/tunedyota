// netlify/functions/review-ask.js
// Post-install review ask (funnel audit 2026-08-02). A few days after the
// certificate lands, the customer gets ONE short personal note: how'd it go,
// here's the Google review link, and your refer-a-friend link. Dormant until
// GOOGLE_REVIEW_URL is set (same env the console QR overlay + AMSOIL email
// use) — configuring that one var turns the whole motion on.
const { cfg, listAllRecords, updateRecord, updateTolerant } = require("./lib/airtable.js");
const { sendEmail } = require("./lib/resend.js");
const { keyToInstaller, normalizeInstallerKey } = require("./lib/routing.js");
const { referralUrl } = require("./lib/client-auth.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";
const WAIT_DAYS = 2;      // let the install settle before asking
const WINDOW_DAYS = 14;   // never backfill stale completions
const MAX_PER_RUN = 20;

function buildReviewEmail({ name, vehicle, installer, reviewUrl: rUrl, refUrl }) {
  const first = String(name || "").trim().split(/\s+/)[0] || "there";
  const veh = String(vehicle || "").trim() || "truck";
  const subject = `How's the ${veh} running?`;
  const text = `Hi ${first},\n\n${installer} here from Tuned Yota — hope the ${veh} has been putting a grin on your face since the tune.\n\nIf the experience was worth it, a quick Google review helps other Toyota owners find us:\n${rUrl}\n\nAnd if a friend wants the same setup, send them your personal link — we'll take care of them:\n${refUrl}\n\nAnything not right? Just reply to this email and I'll make it right.\n\n— ${installer}, Tuned Yota`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#1a1a1a;max-width:560px">
<p>Hi ${first},</p>
<p>${installer} here from Tuned Yota &mdash; hope the ${veh} has been putting a grin on your face since the tune.</p>
<p>If the experience was worth it, a quick Google review helps other Toyota owners find us:</p>
<p><a href="${rUrl}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">Leave a review</a></p>
<p>And if a friend wants the same setup, send them <a href="${refUrl}">your personal link</a> &mdash; we'll take care of them.</p>
<p>Anything not right? Just reply and I'll make it right.</p>
<p>&mdash; ${installer}, Tuned Yota</p></div>`;
  return { subject, text, html };
}

async function runReviewAsk(deps = {}) {
  const env = deps.env || process.env;
  const now = deps.now || new Date();
  const list = deps.list || ((a) => listAllRecords({ ...a }));
  const update = deps.update || ((a) => updateRecord({ ...a }));
  const send = deps.send || ((a) => sendEmail(a));
  const rUrl = String(env.GOOGLE_REVIEW_URL || "").trim();
  if (!rUrl) return { sent: 0, dormant: true };
  const c = cfg(env);

  let recs = [];
  try { recs = await list({ token: c.token, baseId: c.baseId, table: c.bookings }); }
  catch (e) { return { sent: 0, error: "store-unavailable" }; }

  const todayMs = now.getTime();
  const due = recs.filter((r) => {
    const f = r.fields || {};
    if (f.Status !== "Completed" || !f["Certificate Sent"]) return false;
    if (!String(f.Email || "").trim()) return false;
    if (String(f["Review Ask Sent"] || "").trim()) return false;
    const t = Date.parse(String(f["Certificate Issued"] || "").slice(0, 10) + "T00:00:00Z");
    if (isNaN(t)) return false;
    const days = (todayMs - t) / 86400000;
    return days >= WAIT_DAYS && days <= WINDOW_DAYS;
  }).slice(0, MAX_PER_RUN);

  let sent = 0;
  for (const r of due) {
    const f = r.fields || {};
    const inst = keyToInstaller(normalizeInstallerKey(f.Installer));
    const m = buildReviewEmail({ name: f.Name, vehicle: f.Vehicle, installer: inst.name || "Aaron",
      reviewUrl: rUrl, refUrl: referralUrl(f.Email, now.getTime(), env) });
    try {
      await send({ apiKey: env.RESEND_API_KEY, from: FROM, to: String(f.Email).trim(),
        replyTo: OWNER, subject: m.subject, text: m.text, html: m.html });
    } catch (e) { continue; }   // unstamped → tomorrow retries
    await updateTolerant(update, { token: c.token, baseId: c.baseId, table: c.bookings, id: r.id,
      fields: { "Review Ask Sent": now.toISOString().slice(0, 10) } }, ["Review Ask Sent"]).catch(() => {});
    sent++;
  }
  return { sent, scanned: due.length };
}

async function handler() {
  const out = await runReviewAsk({});
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, runReviewAsk, buildReviewEmail };
