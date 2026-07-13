const { cfg, listRecords, updateRecord, updateTolerant } = require("./lib/airtable.js");
const { sendEmail } = require("./lib/resend.js");
const { notifyOwner } = require("./lib/alert.js");
const { keyToInstaller } = require("./lib/routing.js");
const { buildCertificate, certSerial } = require("./lib/certificate.js");
const { resolveFluids } = require("./lib/amsoil-fluids.js");
const { qrSvg } = require("./lib/qr.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";
const FORMULA = 'AND({Status}="Completed", NOT({Certificate Sent}))';

async function dispatchCertificates(deps) {
  const { env = process.env, fetchImpl = fetch, now = new Date(),
          list = (a) => listRecords({ fetchImpl, ...a }),
          update = (a) => updateRecord({ fetchImpl, ...a }),
          send = sendEmail, notify = notifyOwner, log = console } = deps;
  const issueDate = now.toISOString().slice(0, 10);
  const c = cfg(env);
  let rows = [];
  try {
    rows = await list({ token: c.token, baseId: c.baseId, table: c.bookings, filterByFormula: FORMULA });
  } catch (e) { if (log.error) log.error("cert list", e.message); return { ok: false, error: e.message }; }

  let sent = 0;
  const held = [];
  for (const row of rows) {
    const f = row.fields || {};
    const calibration = String(f["OTT Calibration"] || "").trim();
    // Hold the certificate until the installer records the calibration, rather
    // than send a blank one. Left unmarked, so a later run sends it once set.
    if (!calibration) { held.push(f.Name || row.id); continue; }
    const inst = keyToInstaller(f.Installer);
    const customerEmail = String(f.Email || "").trim();
    const to = customerEmail || inst.email;
    const fluids = resolveFluids(f.Vehicle, f["Model Year"]);
    const amsoil = { fluids, qrSvg: qrSvg((fluids && fluids.garageUrl) || "https://tunedyota.com/amsoil-garage") };
    const certNo = certSerial(row.id, f["Calibration Date"], issueDate);
    const { subject, html } = buildCertificate({
      name: f.Name, vehicle: f.Vehicle, modelYear: f["Model Year"], vin: f.VIN, calibration,
      installer: inst.name, installerRegion: inst.region,
      calibrationDate: f["Calibration Date"], certNo, issueDate, amsoil,
    });
    try {
      await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM,
        to, replyTo: OWNER,
        subject,
        text: customerEmail
          ? `Attached is your Tuned Yota Certificate of Calibration and AMSOIL maintenance reference for your ${f.Vehicle || "vehicle"}.`
          : `Attached is the Certificate of Calibration for ${f.Name || "your customer"} — no customer email on file; please forward it to them.`,
        attachments: [{ filename: "certificate.html", content: Buffer.from(html).toString("base64") }] });
      await updateTolerant(update, { token: c.token, baseId: c.baseId, table: c.bookings, id: row.id, fields: {
        "Certificate Sent": true,
        "Certificate Issued": issueDate,
        "Certificate Recipient": to,
        "Cert Delivery": customerEmail ? "customer" : "installer-fallback",
      } }, ["Certificate Issued", "Certificate Recipient", "Cert Delivery"]);
      sent++;
    } catch (e) {
      if (log.error) log.error("cert send", e.message);
      try { await notify({ fetchImpl, webhookUrl: env.SLACK_WEBHOOK_URL, text: `⚠️ Certificate email FAILED — ${f.Name || "?"} · ${inst.name} · reason: ${e.message}`, log }); }
      catch (e2) { if (log.error) log.error("cert notify", e2.message); }
    }
  }
  if (held.length) {
    try { await notify({ fetchImpl, webhookUrl: env.SLACK_WEBHOOK_URL, text: `⚠️ ${held.length} certificate(s) held — set the OTT Calibration to release: ${held.join(", ")}`, log }); }
    catch (e) { if (log.error) log.error("cert held notify", e.message); }
  }
  return { ok: true, sent, held: held.length, found: rows.length };
}

async function handler() { const r = await dispatchCertificates({}); return { statusCode: 200, body: JSON.stringify(r) }; }
module.exports = { handler, dispatchCertificates };
