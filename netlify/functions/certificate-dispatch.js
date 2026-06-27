const { cfg, listRecords, updateRecord } = require("./lib/airtable.js");
const { sendEmail } = require("./lib/resend.js");
const { notifyOwner } = require("./lib/alert.js");
const { keyToInstaller } = require("./lib/routing.js");
const { buildCertificate, certSerial } = require("./lib/certificate.js");

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
  for (const row of rows) {
    const f = row.fields || {};
    const inst = keyToInstaller(f.Installer);
    const certNo = certSerial(row.id, f["Calibration Date"], issueDate);
    const { subject, html } = buildCertificate({
      name: f.Name, vehicle: f.Vehicle, calibration: f["OTT Calibration"],
      installer: inst.name, installerRegion: inst.region,
      calibrationDate: f["Calibration Date"], certNo, issueDate,
    });
    try {
      await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM,
        to: inst.email, cc: inst.email === OWNER ? undefined : OWNER, replyTo: OWNER,
        subject,
        text: `Attached is the Tuned Yota Certificate of Calibration for ${f.Name || "your customer"}. Open certificate.html in a browser, confirm the OTT Calibration selection, then Print → Save as PDF and send it to the customer.`,
        attachments: [{ filename: "certificate.html", content: Buffer.from(html).toString("base64") }] });
      await update({ token: c.token, baseId: c.baseId, table: c.bookings, id: row.id, fields: { "Certificate Sent": true } });
      sent++;
    } catch (e) {
      if (log.error) log.error("cert send", e.message);
      try { await notify({ fetchImpl, webhookUrl: env.SLACK_WEBHOOK_URL, text: `⚠️ Certificate email FAILED — ${f.Name || "?"} · ${inst.name} · reason: ${e.message}`, log }); }
      catch (e2) { if (log.error) log.error("cert notify", e2.message); }
    }
  }
  return { ok: true, sent, found: rows.length };
}

async function handler() { const r = await dispatchCertificates({}); return { statusCode: 200, body: JSON.stringify(r) }; }
module.exports = { handler, dispatchCertificates };
