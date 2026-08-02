// netlify/functions/installer-closeout.js
// Per-installer close-out: mark a booking Completed (+ OTT Calibration) or No-show.
// On completion, emails the Certificate of Calibration immediately (daily
// certificate-dispatch backstops any send failure). Ownership is re-checked server-side.
const { cfg, getRecord, updateRecord, updateTolerant, createRecord, createTolerant, listAllRecords } = require("./lib/airtable.js");
const { resolveInstaller, isAdmin } = require("./lib/installer-auth.js");
const { keyToInstaller, normalizeInstallerKey, smsNumberFor } = require("./lib/routing.js");
const { sendSms } = require("./lib/twilio.js");
const { sendWebPush } = require("./lib/webpush.js");
const { buildCertificate, certSerial, CAL_OPTIONS } = require("./lib/certificate.js");
const { sendEmail } = require("./lib/resend.js");
const { resolveFluids } = require("./lib/amsoil-fluids.js");
const { qrSvg } = require("./lib/qr.js");
const { accountLink, referralUrl } = require("./lib/client-auth.js");
const { ensureClientRecordForBooking, toLeadView, logLine, appendActivity, channelForBooking } = require("./lib/leads.js");
const { CONSENT_VERSION } = require("./lib/consent.js");
const { withCors } = require("./lib/cors.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";
const dateOnly = (s) => String(s == null ? "" : s).slice(0, 10);

const PREFERRED = ["SMS", "Email", "Messenger", "Instagram", "Call"];

// Best-effort, fail-open, AWAITED (Lambda freeze): push contact prefs, year,
// and consent evidence to the client record. Consent requires BOTH the toggle
// and a captured signature — the signed booking is the evidence artifact.
async function propagateToClient({ c, list, update, create, env, fetchImpl, log, now, recordId, f, d,
                                   customerEmail, modelYear, signatureCaptured }) {
  const pref = PREFERRED.includes(String(d.preferredContact || "").trim()) ? String(d.preferredContact).trim() : "";
  const consent = d.marketingConsent === true && signatureCaptured;
  if (!customerEmail && !pref && !modelYear && !consent) return;
  const r = await ensureClientRecordForBooking(recordId,
    { Name: f.Name, Phone: f.Phone || "", Email: f.Email || "", City: f.City || "",
      Vehicle: f.Vehicle || "", "Model Year": f["Model Year"] || modelYear || "", Installer: f.Installer },
    // Channel from the booking's real origin — a web-funnel booking closed out at
    // the event must not mint a "walk-in" client record (owner directive 2026-08-02).
    { env, fetchImpl, now, channel: channelForBooking(f.Source),
      source: f.Source ? `booking:${f.Source}` : "", list, create, update });
  if (!r || !r.leadId) return;
  const cur = r.minted ? null : toLeadView((await list({ token: c.token, baseId: c.baseId, table: c.priority }))
    .find((x) => x.id === r.leadId) || null);
  const patch = {};
  if (customerEmail && (!cur || !cur.email)) patch.Email = customerEmail;
  if (pref) patch["Preferred Contact"] = pref;
  if (modelYear && (!cur || !cur.modelYear)) patch["Model Year"] = modelYear;
  if (consent && (!cur || !cur.marketingConsent)) {
    patch["Marketing Consent"] = now.toISOString().slice(0, 10);
    patch["Consent Version"] = CONSENT_VERSION;
    patch["Activity Log"] = appendActivity((cur && cur.activity) || "",
      logLine(now, `a2p marketing consent (${CONSENT_VERSION}) — signature on booking ${recordId}`));
  }
  if (!Object.keys(patch).length) return;
  await updateTolerant(update, { token: c.token, baseId: c.baseId, table: c.priority, id: r.leadId, fields: patch },
    ["Email", "Preferred Contact", "Model Year", "Marketing Consent", "Consent Version", "Activity Log"]);
}

async function processCloseout(body, deps) {
  const { env = process.env, fetchImpl = fetch, now = new Date(), key, admin = false,
          get = (a) => getRecord({ fetchImpl, ...a }),
          update = (a) => updateRecord({ fetchImpl, ...a }),
          create = (a) => createRecord({ fetchImpl, ...a }),
          list = (a) => listAllRecords({ fetchImpl, ...a }),
          send = sendEmail, log = console,
          sms = (a) => sendSms(a, { fetchImpl, env }),
          webPush = (k, m) => sendWebPush(k, m, { env, fetchImpl }) } = deps;
  const d = body || {};
  if (!d.recordId) return { status: "error", error: "missing-record" };
  const c = cfg(env);

  let rec;
  try { rec = await get({ token: c.token, baseId: c.baseId, table: c.bookings, id: d.recordId }); }
  catch (e) { if (log.error) log.error("closeout get", e.message); return { status: "error", error: "store-unavailable" }; }
  const f = (rec && rec.fields) || {};
  // Airtable returns Installer as a single-select string OR a multi-select array
  // (the live base uses multi-select → ["aaron"]), and legacy options carry long
  // labels ("Noah - Milwaukee, …"). Normalize before the ownership check.
  const owner = normalizeInstallerKey(f.Installer);
  // Admins may close out any installer's booking; regular installers only their own.
  // The certificate + waitlist still route to the OWNING installer (see below), so an
  // admin close-out never misattributes the job.
  if (!admin && owner !== key) return { status: "error", error: "not-yours" };

  // Soft-delete (owner decision 2026-07-27): Cancelled vanishes from roster +
  // calendar (both filter it) but stays in Airtable; purge-cancelled.js hard-
  // deletes 30 days after "Cancelled At". uncancel = the console's Undo.
  if (d.action === "cancel") {
    if (f.Status === "Completed" || f.Status === "Cancelled") return { status: "error", error: "not-open" };
    try {
      await updateTolerant(update, { token: c.token, baseId: c.baseId, table: c.bookings, id: d.recordId,
        fields: { Status: "Cancelled", "Cancelled At": now.toISOString(), "Cancelled By": key } },
        ["Cancelled At", "Cancelled By"]);
    } catch (e) { if (log.error) log.error("closeout cancel", e.message); return { status: "error", error: "store-unavailable" }; }
    return { status: "cancelled" };
  }
  if (d.action === "uncancel") {
    if (f.Status !== "Cancelled") return { status: "error", error: "not-cancelled" };
    try {
      await updateTolerant(update, { token: c.token, baseId: c.baseId, table: c.bookings, id: d.recordId,
        // null clears regardless of column type ("" would 422 if the column ever becomes a Date field)
        fields: { Status: "Booked", "Cancelled At": null, "Cancelled By": null } },
        ["Cancelled At", "Cancelled By"]);
    } catch (e) { if (log.error) log.error("closeout uncancel", e.message); return { status: "error", error: "store-unavailable" }; }
    return { status: "uncancelled" };
  }

  if (d.action === "noshow") {
    if (d.confirmed !== true) return { status: "error", error: "unconfirmed" };
    if (f.Status === "No-show") return { status: "noshow", alreadyWaitlisted: true };
    try { await update({ token: c.token, baseId: c.baseId, table: c.bookings, id: d.recordId, fields: { Status: "No-show" } }); }
    catch (e) { if (log.error) log.error("closeout noshow", e.message); return { status: "error", error: "store-unavailable" }; }
    let waitlisted = false;
    try {
      const fields = { City: f.City || "", Name: f.Name || "", Phone: f.Phone || "", Email: f.Email || "",
        Vehicle: f.Vehicle || "", Modifications: f.Modifications || "", Installer: owner,
        Reason: `No-show — ${f.City || ""} ${dateOnly(f["Event Date"])}`.trim(), Source: "installer:no-show",
        // Source says WHY they're waitlisted; Channel keeps WHERE they came from —
        // without it the row displays as "other" and the origin is lost.
        Channel: channelForBooking(f.Source) };
      await createTolerant(create, { token: c.token, baseId: c.baseId, table: c.priority, fields }, ["Modifications", "Source", "Channel"]);
      waitlisted = true;
    } catch (e) { if (log.error) log.error("closeout waitlist", e.message); }
    return { status: "noshow", waitlisted };
  }

  // resend-cert (owner ask 2026-08-02): regenerate + re-send the certificate from
  // the CURRENT record after a data correction (e.g. wrong engine picked at
  // booking, fixed via installer-reschedule). Every certificate VIEW re-renders
  // live from the record, so only the emailed snapshot is stale — this replaces
  // it. certSerial is deterministic, so the corrected copy supersedes the
  // original under the same certificate number. Explicit + confirmed: an edit
  // never auto-emails the customer.
  if (d.action === "resend-cert") {
    if (d.confirmed !== true) return { status: "error", error: "unconfirmed" };
    if (f.Status !== "Completed") return { status: "error", error: "not-completed" };
    const calibration = String(f["OTT Calibration"] || "").trim();
    if (!calibration) return { status: "error", error: "no-calibration" };
    // Optional email override — also the recovery for installer-fallback certs
    // (no customer email at close-out): add the email here and resend.
    const customerEmail = String(d.customerEmail || f.Email || "").trim();
    const inst = keyToInstaller(owner);
    const toCustomer = !!customerEmail;
    const to = toCustomer ? customerEmail : inst.email;
    const issueDate = now.toISOString().slice(0, 10);
    const calibrationDate = String(f["Calibration Date"] || f["Event Date"] || "").slice(0, 10) || issueDate;
    const reissue = !!f["Certificate Sent"];
    try {
      const certNo = certSerial(d.recordId, calibrationDate, issueDate);
      const fluids = resolveFluids(f.Vehicle, f["Model Year"]);
      const track = (t) => `https://tunedyota.com/.netlify/functions/amsoil-go?c=${encodeURIComponent(d.recordId)}&to=${t}`;
      const amsoil = { fluids, qrSvg: qrSvg(track("shop")), pcUrl: track("pc") };
      const referralLink = customerEmail ? referralUrl(customerEmail, now.getTime(), env) : "";
      const { subject, html } = buildCertificate({
        name: f.Name, vehicle: f.Vehicle, modelYear: f["Model Year"], vin: f.VIN, calibration,
        installer: inst.name, installerRegion: inst.region, calibrationDate, certNo, issueDate, amsoil, referralLink });
      await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to, replyTo: OWNER,
        subject: reissue ? `${subject} (corrected)` : subject,
        text: (reissue ? "This corrected certificate supersedes the earlier copy — same certificate number.\n\n" : "") + (toCustomer
          ? `Attached is your Tuned Yota Certificate of Calibration and AMSOIL maintenance reference for your ${f.Vehicle || "vehicle"}.\n\nView your certificates & AMSOIL garage anytime: ${accountLink(customerEmail, Date.now(), env)}`
          : `Attached is the Certificate of Calibration for ${f.Name || "your customer"} — no customer email on file; please forward it to them.`),
        attachments: [{ filename: "certificate.html", content: Buffer.from(html).toString("base64") }] });
    } catch (e) { if (log.error) log.error("closeout resend", e.message); return { status: "error", error: "send-failed" }; }
    const meta = { "Certificate Sent": true, "Certificate Issued": issueDate, "Certificate Recipient": to,
      "Cert Delivery": toCustomer ? "customer" : "installer-fallback" };
    if (reissue) meta["Certificate Reissued"] = now.toISOString();
    if (customerEmail && customerEmail !== String(f.Email || "").trim()) meta.Email = customerEmail;
    try {
      await updateTolerant(update, { token: c.token, baseId: c.baseId, table: c.bookings, id: d.recordId, fields: meta },
        ["Certificate Issued", "Certificate Recipient", "Cert Delivery", "Certificate Reissued", "Email"]);
    } catch (e) { if (log.error) log.error("closeout resend meta", e.message); }
    return { status: "resent", to, toCustomer, reissue };
  }

  // Normalize report fields here so both draft and complete paths share them.
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
  const modelYear = /^(19|20)\d{2}$/.test(String(d.modelYear || "").trim()) ? String(d.modelYear).trim() : "";
  const customerEmail = String(d.customerEmail || f.Email || "").trim();

  // Draft (owner decision 2026-07-31): an unfinished close-out saves everything
  // entered and lands in the console's Drafts bucket. Real fields write
  // immediately (they ARE the data); only Status/cert wait for complete.
  if (d.action === "draft") {
    if (f.Status === "Completed" || f.Status === "Cancelled") return { status: "error", error: "not-open" };
    const fields = { "Closeout Draft": true };
    if (vin) fields.VIN = vin;
    if (tuningPlatform) fields["Tuning Platform"] = tuningPlatform;
    if (calibrationType) fields["Calibration Type"] = calibrationType;
    if (ecuId) fields["ECU ID"] = ecuId;
    if (gearSize) fields["Gear Size"] = gearSize;
    if (mileage) fields.Mileage = Number(mileage);
    if (modelYear && !String(f["Model Year"] || "").trim()) fields["Model Year"] = modelYear;
    if (customerEmail) fields.Email = customerEmail;
    if (CAL_OPTIONS.includes(String(d.calibration || "").trim())) fields["OTT Calibration"] = String(d.calibration).trim();
    try {
      await updateTolerant(update, { token: c.token, baseId: c.baseId, table: c.bookings, id: d.recordId, fields },
        ["Closeout Draft", "VIN", "Tuning Platform", "Calibration Type", "ECU ID", "Gear Size", "Mileage", "Model Year", "Email", "OTT Calibration"]);
    } catch (e) { if (log.error) log.error("closeout draft", e.message); return { status: "error", error: "store-unavailable" }; }
    try {
      await propagateToClient({ c, list, update, create, env, fetchImpl, log, now,
        recordId: d.recordId, f, d, customerEmail, modelYear, signatureCaptured: false });
    } catch (e) { if (log.error) log.error("closeout propagate", e.message); }
    return { status: "draft" };
  }

  // complete — idempotent: once the certificate is issued the calibration is
  // locked, so a re-submit (e.g. a double-tap) must not send a second cert.
  if (f["Certificate Sent"]) return { status: "completed", certSent: true, alreadySent: true };
  const calibration = String(d.calibration || "").trim();
  if (!CAL_OPTIONS.includes(calibration)) return { status: "error", error: "bad-calibration" };
  // Report-field gate (owner decision 2026-07-31): an installer completes only a
  // report-ready record; the ADMIN may skip anything (never-block-the-owner).
  // "Present" = supplied now or already on the booking. The console pre-fills
  // most of these, so the gate normally costs zero taps.
  if (d.action !== "draft" && !admin) {
    const finals = { VIN: vin, "Tuning Platform": tuningPlatform, "Calibration Type": calibrationType,
      "ECU ID": ecuId, "Gear Size": gearSize, Mileage: mileage, "Model Year": modelYear };
    const missing = Object.keys(finals).filter((k) => !String(finals[k] || "").trim() && !String(f[k] == null ? "" : f[k]).trim());
    if (missing.length) return { status: "error", error: "report-fields-missing", missing };
  }
  const issueDate = now.toISOString().slice(0, 10);
  // Calibration Date = the day the calibration was actually applied (the event
  // day), NOT the day the installer closes it out. The monthly OTT report buckets
  // by this date, so a late close-out (e.g. a June 28 event closed out in July)
  // must still report under June. Falls back to today only when there's no event
  // date (e.g. a walk-in with no scheduled event).
  const calibrationDate = String(f["Event Date"] || "").slice(0, 10) || issueDate;
  const completeFields = { Status: "Completed", "OTT Calibration": calibration, "Calibration Date": calibrationDate,
    "Closeout Draft": false };
  if (vin) completeFields.VIN = vin;
  if (tuningPlatform) completeFields["Tuning Platform"] = tuningPlatform;
  if (calibrationType) completeFields["Calibration Type"] = calibrationType;
  if (ecuId) completeFields["ECU ID"] = ecuId;
  if (gearSize) completeFields["Gear Size"] = gearSize;
  if (mileage) completeFields["Mileage"] = Number(mileage);
  if (modelYear && !String(f["Model Year"] || "").trim()) completeFields["Model Year"] = modelYear;
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
      ["Closeout Draft", "VIN", "Tuning Platform", "Calibration Type", "ECU ID", "Gear Size", "Mileage", "Model Year", "Email", "Certificate Issued", "Certificate Recipient", "Cert Delivery", "Customer Signature"]);
  } catch (e) { if (log.error) log.error("closeout complete", e.message); return { status: "error", error: "store-unavailable" }; }

  const signatureCaptured = !!completeFields["Customer Signature"];
  try {
    await propagateToClient({ c, list, update, create, env, fetchImpl, log, now,
      recordId: d.recordId, f, d, customerEmail, modelYear, signatureCaptured });
  } catch (e) { if (log.error) log.error("closeout propagate", e.message); }

  let certSent = false;
  try {
    const certNo = certSerial(d.recordId, calibrationDate, issueDate);
    const fluids = resolveFluids(f.Vehicle, f["Model Year"]);
    const track = (to) => `https://tunedyota.com/.netlify/functions/amsoil-go?c=${encodeURIComponent(d.recordId)}&to=${to}`;
    const amsoil = { fluids, qrSvg: qrSvg(track("shop")), pcUrl: track("pc") };
    // Personal "refer a friend" link (only when we have the customer's email — the
    // referrer is the customer). No-reward, gratitude-based; see lib/certificate.js.
    const referralLink = customerEmail ? referralUrl(customerEmail, now.getTime(), env) : "";
    const { subject, html } = buildCertificate({
      name: f.Name, vehicle: f.Vehicle, modelYear: f["Model Year"], vin, calibration, installer: inst.name,
      installerRegion: inst.region, calibrationDate, certNo, issueDate, amsoil, referralLink });
    await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to,
      replyTo: OWNER, subject,
      text: toCustomer
        ? `Attached is your Tuned Yota Certificate of Calibration and AMSOIL maintenance reference for your ${f.Vehicle || "vehicle"}.\n\nView your certificates & AMSOIL garage anytime: ${accountLink(customerEmail, Date.now(), env)}`
        : `Attached is the Certificate of Calibration for ${f.Name || "your customer"} — no customer email on file; please forward it to them.`,
      attachments: [{ filename: "certificate.html", content: Buffer.from(html).toString("base64") }] });
    await update({ token: c.token, baseId: c.baseId, table: c.bookings, id: d.recordId, fields: { "Certificate Sent": true } });
    certSent = true;
  } catch (e) { if (log.error) log.error("closeout cert", e.message); }

  // Fallback nudge (funnel audit 2026-08-02): a cert without a customer email
  // lands in the installer's inbox — and the customer is often still standing
  // there. SMS + push right now so the installer grabs the email and resends,
  // instead of the cert quietly rotting in their mailbox. Best-effort.
  if (certSent && !toCustomer) {
    const nudge = `TY: no email on file for ${f.Name || "the customer"} — their certificate went to YOUR inbox. Grab their email while you can, add it in the console, and resend the cert.`;
    try { await sms({ to: smsNumberFor(owner, env), body: nudge }); }
    catch (e) { if (log.error) log.error("cert nudge sms", e.message); }
    try { await webPush(owner, { title: "Certificate needs an email", body: `${f.Name || "Customer"} — add their email + resend`, url: "/installer.html" }); }
    catch (e) { if (log.error) log.error("cert nudge push", e.message); }
  }

  return { status: "completed", certSent };
}

async function handler(event) {
  const key = resolveInstaller(event.headers || {}, process.env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  const out = await processCloseout(body, { key, admin: isAdmin(key, process.env) });
  // Default client errors to 400; 502 only when the store itself failed
  // (matches installer-reschedule.js — "not-open"/"not-cancelled" are 400s).
  const code = out.status !== "error" ? 200
    : out.error === "not-yours" ? 403
    : (out.error === "store-unavailable" || out.error === "send-failed") ? 502 : 400;
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler: withCors(handler), processCloseout };
