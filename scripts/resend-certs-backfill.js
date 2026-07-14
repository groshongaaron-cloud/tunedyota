// One-off backfill: re-send Certificate of Calibration (v2) direct to customers for
// already-completed bookings that were originally delivered to the installer/info
// address. Same cert-building path as netlify/functions/certificate-dispatch.js.
// Modes:  dry (list) | preview (send ONE to info@, mark nothing) | send (all 12 → customers, mark)
// Run:  AIRTABLE_TOKEN=.. AIRTABLE_BASE_ID=.. RESEND_API_KEY=.. node scripts/resend-certs-backfill.js <mode>
const { cfg, listRecords, updateRecord, updateTolerant } = require("../netlify/functions/lib/airtable.js");
const { sendEmail } = require("../netlify/functions/lib/resend.js");
const { keyToInstaller } = require("../netlify/functions/lib/routing.js");
const { buildCertificate, certSerial } = require("../netlify/functions/lib/certificate.js");
const { resolveFluids } = require("../netlify/functions/lib/amsoil-fluids.js");
const { qrSvg } = require("../netlify/functions/lib/qr.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";
const MODE = process.argv[2] || "dry";
const has = (v) => String(v == null ? "" : v).trim().length > 0;

(async () => {
  const env = process.env;
  const c = cfg(env);
  const issueDate = new Date().toISOString().slice(0, 10);
  const update = (a) => updateRecord({ fetchImpl: fetch, ...a });

  const rows = await listRecords({ token: c.token, baseId: c.baseId, table: c.bookings, filterByFormula: '{Status}="Completed"' });
  const eligible = rows
    .filter((r) => { const f = r.fields || {}; return has(f.Email) && has(f["OTT Calibration"]) && f["Cert Delivery"] !== "customer"; })
    .sort((a, b) => String((a.fields || {})["Calibration Date"] || "").localeCompare(String((b.fields || {})["Calibration Date"] || "")));

  function buildFor(row) {
    const f = row.fields || {};
    const owner = Array.isArray(f.Installer) ? f.Installer[0] : f.Installer;
    const inst = keyToInstaller(owner);
    const fluids = resolveFluids(f.Vehicle, f["Model Year"]);
    const track = (to) => `https://tunedyota.com/.netlify/functions/amsoil-go?c=${encodeURIComponent(row.id)}&to=${to}`;
    const amsoil = { fluids, qrSvg: qrSvg(track("shop")), pcUrl: track("pc") };
    const certNo = certSerial(row.id, f["Calibration Date"], issueDate);
    return buildCertificate({ name: f.Name, vehicle: f.Vehicle, modelYear: f["Model Year"], vin: f.VIN,
      calibration: String(f["OTT Calibration"]).trim(), installer: inst.name, installerRegion: inst.region,
      calibrationDate: f["Calibration Date"], certNo, issueDate, amsoil });
  }
  async function sendCert(row, toEmail, subjPrefix) {
    const f = row.fields || {};
    const { subject, html } = buildFor(row);
    await sendEmail({ apiKey: env.RESEND_API_KEY, from: FROM, to: toEmail, replyTo: OWNER,
      subject: (subjPrefix || "") + subject,
      text: `Attached is your Tuned Yota Certificate of Calibration and AMSOIL maintenance reference for your ${f.Vehicle || "vehicle"}.`,
      attachments: [{ filename: "certificate.html", content: Buffer.from(html).toString("base64") }] });
  }

  if (MODE === "dry") {
    eligible.forEach((r, i) => { const f = r.fields || {}; console.log(`${i + 1}. ${f.Name} <${f.Email}>`); });
    console.log("eligible:", eligible.length);
    return;
  }
  if (MODE === "preview") {
    if (!eligible.length) { console.log("no eligible bookings"); return; }
    const row = eligible[0], f = row.fields || {};
    await sendCert(row, OWNER, "[PREVIEW — do not forward] ");
    console.log(`PREVIEW sent to ${OWNER}: cert for ${f.Name} (${f["Model Year"]} ${f.Vehicle} · ${f["OTT Calibration"]}). Record NOT marked.`);
    return;
  }
  if (MODE === "send") {
    let ok = 0, fail = 0;
    for (const row of eligible) {
      const f = row.fields || {};
      try {
        await sendCert(row, String(f.Email).trim(), "");
        await updateTolerant(update, { token: c.token, baseId: c.baseId, table: c.bookings, id: row.id, fields: {
          "Certificate Issued": issueDate, "Certificate Recipient": String(f.Email).trim(), "Cert Delivery": "customer" } },
          ["Certificate Issued", "Certificate Recipient", "Cert Delivery"]);
        ok++; console.log(`sent+marked: ${f.Name} <${f.Email}>`);
      } catch (e) { fail++; console.log(`FAIL: ${f.Name} <${f.Email}> — ${e.message}`); }
    }
    console.log(`\nDONE — sent ${ok}, failed ${fail}, of ${eligible.length} eligible`);
    return;
  }
  console.log("unknown mode:", MODE);
})().catch((e) => { console.error("fatal:", e.message); process.exit(1); });
