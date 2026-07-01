// netlify/functions/installer-closeout.js
// Per-installer close-out: mark a booking Completed (+ OTT Calibration) or No-show.
// On completion, emails the Certificate of Calibration immediately (daily
// certificate-dispatch backstops any send failure). Ownership is re-checked server-side.
const { cfg, getRecord, updateRecord } = require("./lib/airtable.js");
const { resolveInstaller } = require("./lib/installer-auth.js");
const { keyToInstaller } = require("./lib/routing.js");
const { buildCertificate, certSerial, CAL_OPTIONS } = require("./lib/certificate.js");
const { sendEmail } = require("./lib/resend.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";

async function processCloseout(body, deps) {
  const { env = process.env, fetchImpl = fetch, now = new Date(), key,
          get = (a) => getRecord({ fetchImpl, ...a }),
          update = (a) => updateRecord({ fetchImpl, ...a }),
          send = sendEmail, log = console } = deps;
  const d = body || {};
  if (!d.recordId) return { status: "error", error: "missing-record" };
  const c = cfg(env);

  let rec;
  try { rec = await get({ token: c.token, baseId: c.baseId, table: c.bookings, id: d.recordId }); }
  catch (e) { if (log.error) log.error("closeout get", e.message); return { status: "error", error: "store-unavailable" }; }
  const f = (rec && rec.fields) || {};
  // Airtable returns Installer as a single-select string OR a multi-select array
  // (the live base uses multi-select → ["aaron"]). Normalize before the ownership check.
  const owner = Array.isArray(f.Installer) ? f.Installer[0] : f.Installer;
  if (owner !== key) return { status: "error", error: "not-yours" };

  if (d.action === "noshow") {
    try { await update({ token: c.token, baseId: c.baseId, table: c.bookings, id: d.recordId, fields: { Status: "No-show" } }); }
    catch (e) { if (log.error) log.error("closeout noshow", e.message); return { status: "error", error: "store-unavailable" }; }
    return { status: "noshow" };
  }

  // complete — idempotent: once the certificate is issued the calibration is
  // locked, so a re-submit (e.g. a double-tap) must not send a second cert.
  if (f["Certificate Sent"]) return { status: "completed", certSent: true, alreadySent: true };
  const calibration = String(d.calibration || "").trim();
  if (!CAL_OPTIONS.includes(calibration)) return { status: "error", error: "bad-calibration" };
  const issueDate = now.toISOString().slice(0, 10);
  try {
    await update({ token: c.token, baseId: c.baseId, table: c.bookings, id: d.recordId,
      fields: { Status: "Completed", "OTT Calibration": calibration, "Calibration Date": issueDate } });
  } catch (e) { if (log.error) log.error("closeout complete", e.message); return { status: "error", error: "store-unavailable" }; }

  let certSent = false;
  try {
    const inst = keyToInstaller(owner);
    const certNo = certSerial(d.recordId, issueDate, issueDate);
    const { subject, html } = buildCertificate({
      name: f.Name, vehicle: f.Vehicle, calibration, installer: inst.name,
      installerRegion: inst.region, calibrationDate: issueDate, certNo, issueDate });
    await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: inst.email,
      cc: inst.email === OWNER ? undefined : OWNER, replyTo: OWNER, subject,
      text: `Attached is the Tuned Yota Certificate of Calibration for ${f.Name || "your customer"}. Open certificate.html, confirm the OTT Calibration, then Print -> Save as PDF and send it to the customer.`,
      attachments: [{ filename: "certificate.html", content: Buffer.from(html).toString("base64") }] });
    await update({ token: c.token, baseId: c.baseId, table: c.bookings, id: d.recordId, fields: { "Certificate Sent": true } });
    certSent = true;
  } catch (e) { if (log.error) log.error("closeout cert", e.message); }

  return { status: "completed", certSent };
}

async function handler(event) {
  const key = resolveInstaller(event.headers || {}, process.env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  const out = await processCloseout(body, { key });
  const code = out.status !== "error" ? 200
    : out.error === "not-yours" ? 403
    : (out.error === "bad-calibration" || out.error === "missing-record") ? 400 : 502;
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, processCloseout };
