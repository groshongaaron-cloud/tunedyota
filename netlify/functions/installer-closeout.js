// netlify/functions/installer-closeout.js
// Per-installer close-out: mark a booking Completed (+ OTT Calibration) or No-show.
// On completion, emails the Certificate of Calibration immediately (daily
// certificate-dispatch backstops any send failure). Ownership is re-checked server-side.
const { cfg, getRecord, updateRecord, updateTolerant, createRecord, createTolerant } = require("./lib/airtable.js");
const { resolveInstaller, isAdmin } = require("./lib/installer-auth.js");
const { keyToInstaller } = require("./lib/routing.js");
const { buildCertificate, certSerial, CAL_OPTIONS } = require("./lib/certificate.js");
const { sendEmail } = require("./lib/resend.js");
const { resolveFluids } = require("./lib/amsoil-fluids.js");
const { qrSvg } = require("./lib/qr.js");
const { accountLink } = require("./lib/client-auth.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";
const dateOnly = (s) => String(s == null ? "" : s).slice(0, 10);

async function processCloseout(body, deps) {
  const { env = process.env, fetchImpl = fetch, now = new Date(), key, admin = false,
          get = (a) => getRecord({ fetchImpl, ...a }),
          update = (a) => updateRecord({ fetchImpl, ...a }),
          create = (a) => createRecord({ fetchImpl, ...a }),
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
  // Admins may close out any installer's booking; regular installers only their own.
  // The certificate + waitlist still route to the OWNING installer (see below), so an
  // admin close-out never misattributes the job.
  if (!admin && owner !== key) return { status: "error", error: "not-yours" };

  if (d.action === "noshow") {
    if (d.confirmed !== true) return { status: "error", error: "unconfirmed" };
    if (f.Status === "No-show") return { status: "noshow", alreadyWaitlisted: true };
    try { await update({ token: c.token, baseId: c.baseId, table: c.bookings, id: d.recordId, fields: { Status: "No-show" } }); }
    catch (e) { if (log.error) log.error("closeout noshow", e.message); return { status: "error", error: "store-unavailable" }; }
    let waitlisted = false;
    try {
      const fields = { City: f.City || "", Name: f.Name || "", Phone: f.Phone || "", Email: f.Email || "",
        Vehicle: f.Vehicle || "", Modifications: f.Modifications || "", Installer: owner,
        Reason: `No-show — ${f.City || ""} ${dateOnly(f["Event Date"])}`.trim(), Source: "installer:no-show" };
      await createTolerant(create, { token: c.token, baseId: c.baseId, table: c.priority, fields }, ["Modifications", "Source"]);
      waitlisted = true;
    } catch (e) { if (log.error) log.error("closeout waitlist", e.message); }
    return { status: "noshow", waitlisted };
  }

  // complete — idempotent: once the certificate is issued the calibration is
  // locked, so a re-submit (e.g. a double-tap) must not send a second cert.
  if (f["Certificate Sent"]) return { status: "completed", certSent: true, alreadySent: true };
  const calibration = String(d.calibration || "").trim();
  if (!CAL_OPTIONS.includes(calibration)) return { status: "error", error: "bad-calibration" };
  // VIN: normalize to the standard 17-char uppercase form (strip spaces/dashes).
  // Optional at this layer so a close-out is never blocked; the console enforces it.
  const vin = String(d.vin || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  // OTT commission-submission fields — additive, installer-entered, NEVER on the
  // customer certificate. All optional at this layer so completion + cert never
  // depend on them; the installer console requires them and the owner confirms the
  // monthly draft. See lib/ott-commission.js + docs/ott/README.md.
  const tuningPlatform = String(d.tuningPlatform || "").trim().toUpperCase();
  const calibrationType = String(d.calibrationType || "").trim();
  const ecuId = String(d.ecuId || "").trim().toUpperCase();
  const gearSize = String(d.gearSize || "").trim();
  const mileage = String(d.mileage == null ? "" : d.mileage).replace(/[^0-9]/g, "");
  const issueDate = now.toISOString().slice(0, 10);
  // Calibration Date = the day the calibration was actually applied (the event
  // day), NOT the day the installer closes it out. The monthly OTT report buckets
  // by this date, so a late close-out (e.g. a June 28 event closed out in July)
  // must still report under June. Falls back to today only when there's no event
  // date (e.g. a walk-in with no scheduled event).
  const calibrationDate = String(f["Event Date"] || "").slice(0, 10) || issueDate;
  const customerEmail = String(d.customerEmail || f.Email || "").trim();
  const completeFields = { Status: "Completed", "OTT Calibration": calibration, "Calibration Date": calibrationDate };
  if (vin) completeFields.VIN = vin;
  if (tuningPlatform) completeFields["Tuning Platform"] = tuningPlatform;
  if (calibrationType) completeFields["Calibration Type"] = calibrationType;
  if (ecuId) completeFields["ECU ID"] = ecuId;
  if (gearSize) completeFields["Gear Size"] = gearSize;
  if (mileage) completeFields["Mileage"] = Number(mileage);
  // Resolve recipient before updateTolerant so delivery metadata is persisted together
  // with Status/Calibration in the first write (tolerant retry drops only missing cols).
  const inst = keyToInstaller(owner);
  const toCustomer = !!customerEmail;
  const to = toCustomer ? customerEmail : inst.email;
  if (customerEmail) completeFields.Email = customerEmail;
  completeFields["Certificate Issued"] = issueDate;
  completeFields["Certificate Recipient"] = to;
  completeFields["Cert Delivery"] = toCustomer ? "customer" : "installer-fallback";
  // Customer sign-off signature (satisfaction/acceptance proof). Optional, additive,
  // record-only — never printed on the certificate. Accept only a PNG data URL under a
  // sane cap; anything else is ignored so a bad signature never blocks completion.
  const signature = String(d.signature || "");
  if (/^data:image\/png;base64,/.test(signature) && signature.length <= 200000) {
    completeFields["Customer Signature"] = signature;
  }
  try {
    // updateTolerant: if the base hasn't added a column yet, drop only the missing
    // optional field(s) and retry, so the completion (Status/Calibration) still persists.
    await updateTolerant(update, { token: c.token, baseId: c.baseId, table: c.bookings, id: d.recordId, fields: completeFields },
      ["VIN", "Tuning Platform", "Calibration Type", "ECU ID", "Gear Size", "Mileage", "Email", "Certificate Issued", "Certificate Recipient", "Cert Delivery", "Customer Signature"]);
  } catch (e) { if (log.error) log.error("closeout complete", e.message); return { status: "error", error: "store-unavailable" }; }

  let certSent = false;
  try {
    const certNo = certSerial(d.recordId, calibrationDate, issueDate);
    const fluids = resolveFluids(f.Vehicle, f["Model Year"]);
    const track = (to) => `https://tunedyota.com/.netlify/functions/amsoil-go?c=${encodeURIComponent(d.recordId)}&to=${to}`;
    const amsoil = { fluids, qrSvg: qrSvg(track("shop")), pcUrl: track("pc") };
    const { subject, html } = buildCertificate({
      name: f.Name, vehicle: f.Vehicle, modelYear: f["Model Year"], vin, calibration, installer: inst.name,
      installerRegion: inst.region, calibrationDate, certNo, issueDate, amsoil });
    await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to,
      replyTo: OWNER, subject,
      text: toCustomer
        ? `Attached is your Tuned Yota Certificate of Calibration and AMSOIL maintenance reference for your ${f.Vehicle || "vehicle"}.\n\nView your certificates & AMSOIL garage anytime: ${accountLink(customerEmail, Date.now(), env)}`
        : `Attached is the Certificate of Calibration for ${f.Name || "your customer"} — no customer email on file; please forward it to them.`,
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
  const out = await processCloseout(body, { key, admin: isAdmin(key, process.env) });
  const code = out.status !== "error" ? 200
    : out.error === "not-yours" ? 403
    : (out.error === "bad-calibration" || out.error === "missing-record" || out.error === "unconfirmed") ? 400 : 502;
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, processCloseout };
