// scripts/smoke/crm-smoke-c.cjs — live smoke for sub-project C (one-flow close-out).
// Run: npx netlify dev:exec node scripts/smoke/crm-smoke-c.cjs
// Drives the real installer-closeout handler against live Airtable + Resend:
// gate (non-admin, missing report fields), full complete (cert email + consent
// evidence on the client record), idempotent re-complete, draft/resume, and an
// ott-report-review dry run (buildSubmissionRows for the month). Cleans up after
// itself; the two certificate emails land at info@tunedyota.com as evidence.
const assert = require("node:assert/strict");
const { cfg, createRecord, getRecord, listAllRecords, deleteRecord } = require("../../netlify/functions/lib/airtable.js");
const closeout = require("../../netlify/functions/installer-closeout.js");
const { CONSENT_VERSION } = require("../../netlify/functions/lib/consent.js");
const { flattenRecords } = require("../../netlify/functions/lib/report-sources.js");
const { monthFromKey, buildSubmissionRows } = require("../../netlify/functions/lib/ott-report.js");

const CERT_TO = "info@tunedyota.com";
const PHONE_1 = "(555) 010-4488", PHONE_2 = "(555) 010-4499";
const VIN_1 = "SMOKETESTC1234567", VIN_2 = "SMOKETESTC7654321";
// 1x1 transparent PNG — a real (tiny) signature artifact.
const SIG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const EVENT_DATE = "2026-08-01"; // past-dated: out of reminder sweeps, still in the 2026-08 OTT month

async function main() {
  const c = cfg(process.env);
  assert.ok(c.token && c.baseId, "AIRTABLE env missing — run under netlify dev:exec");
  const tokens = JSON.parse(process.env.INSTALLER_TOKENS || "{}");
  const admins = String(process.env.INSTALLER_ADMINS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  const instKey = Object.keys(tokens).find(k => !admins.includes(k.toLowerCase()));
  assert.ok(instKey, "no NON-admin installer token in env (gate needs one)");
  const headers = { "x-installer-token": tokens[instKey] };
  console.log(`non-admin installer: ${instKey}`);
  const post = (body) => closeout.handler({ headers, body: JSON.stringify(body) });

  const mkBooking = (name, phone) => createRecord({ token: c.token, baseId: c.baseId, table: c.bookings, fields: {
    Name: name, City: "Lakeville", "Event Date": EVENT_DATE, Status: "Booked",
    Installer: [instKey], Vehicle: "Toyota Tundra 5.7L", Phone: phone,
    Goals: "SMOKE-C " + new Date().toISOString(), Source: "smoke:crm-c",
  }});

  const bk1 = await mkBooking("Smoke Closeout", PHONE_1);
  console.log(`booking 1 (full close-out): ${bk1.id}`);
  const cleanupIds = { bookings: [bk1.id], leads: [] };
  let failed = false;
  try {
    // 1) Gate: non-admin complete with no report fields → 400 report-fields-missing, display names.
    const gateRes = await post({ recordId: bk1.id, calibration: "Mild" });
    assert.equal(gateRes.statusCode, 400, "gate should 400: " + gateRes.body);
    const gate = JSON.parse(gateRes.body);
    assert.equal(gate.error, "report-fields-missing");
    for (const n of ["VIN", "Tuning Platform", "Calibration Type", "ECU ID", "Gear Size", "Mileage", "Model Year"])
      assert.ok(gate.missing.includes(n), "gate names " + n);
    console.log("PASS gate: 400 report-fields-missing →", JSON.stringify(gate.missing));

    // 2) Full complete: all report fields + cert email + preferred contact + consent + signature.
    const compRes = await post({ recordId: bk1.id, calibration: "Mild",
      vin: VIN_1, tuningPlatform: "VFT", calibrationType: "9.2 New", ecuId: "TEST123",
      gearSize: "3.90", mileage: "45000", modelYear: "2021",
      customerEmail: CERT_TO, preferredContact: "SMS", marketingConsent: true, signature: SIG });
    assert.equal(compRes.statusCode, 200, "complete status: " + compRes.body);
    const comp = JSON.parse(compRes.body);
    assert.equal(comp.status, "completed");
    assert.equal(comp.certSent, true, "certificate email sent via Resend");
    console.log("PASS complete: status completed, cert email sent to " + CERT_TO);

    // 3) Booking record verification: report-complete + year backfill + delivery + signature.
    const b1 = await getRecord({ token: c.token, baseId: c.baseId, table: c.bookings, id: bk1.id });
    const f1 = b1.fields;
    assert.equal(f1.Status, "Completed");
    assert.equal(f1.VIN, VIN_1);
    assert.equal(String(f1["Model Year"]), "2021", "model year backfilled");
    assert.equal(f1["Tuning Platform"], "VFT");
    assert.equal(f1["Calibration Type"], "9.2 New");
    assert.equal(f1["ECU ID"], "TEST123");
    assert.equal(f1["Gear Size"], "3.90");
    assert.equal(Number(f1.Mileage), 45000);
    assert.equal(f1["Calibration Date"], EVENT_DATE, "calibration date = event day");
    assert.equal(f1["Cert Delivery"], "customer");
    assert.equal(f1["Certificate Recipient"], CERT_TO);
    assert.equal(f1["Certificate Sent"], true);
    assert.ok(String(f1["Customer Signature"] || "").startsWith("data:image/png;base64,"), "signature stored");
    console.log("PASS booking record: report-complete in Airtable (all OTT fields + cert metadata + signature)");

    // 4) Client record: minted lead carries email/pref/consent evidence + activity line naming the booking.
    const leads = await listAllRecords({ token: c.token, baseId: c.baseId, table: c.priority });
    const cl = leads.find(r => (r.fields.Phone || "") === PHONE_1);
    assert.ok(cl, "client record minted for booking 1");
    cleanupIds.leads.push(cl.id);
    const today = new Date().toISOString().slice(0, 10);
    assert.equal(cl.fields.Email, CERT_TO, "email propagated");
    assert.equal(cl.fields["Preferred Contact"], "SMS", "preferred contact propagated");
    assert.equal(cl.fields["Marketing Consent"], today, "consent date stamped");
    assert.equal(cl.fields["Consent Version"], CONSENT_VERSION, "consent version stamped");
    assert.ok(String(cl.fields["Activity Log"] || "").includes(`a2p marketing consent (${CONSENT_VERSION}) — signature on booking ${bk1.id}`),
      "activity line names the booking");
    assert.ok((cl.fields.Booking || []).includes(bk1.id), "client record linked to booking");
    console.log(`PASS client record ${cl.id}: Email + Preferred Contact + Marketing Consent ${today} + ${CONSENT_VERSION} + activity line`);

    // 5) Idempotency: re-complete must NOT send a second certificate.
    const again = JSON.parse((await post({ recordId: bk1.id, calibration: "Mild" })).body);
    assert.equal(again.alreadySent, true, "second complete is a no-op");
    console.log("PASS idempotent: re-complete → alreadySent, no second cert");

    // 6) Draft: second booking, half-fill, save draft.
    const bk2 = await mkBooking("Smoke Draft", PHONE_2);
    cleanupIds.bookings.push(bk2.id);
    console.log(`booking 2 (draft/resume): ${bk2.id}`);
    const draftRes = await post({ recordId: bk2.id, action: "draft", vin: VIN_2, mileage: "61000" });
    assert.equal(JSON.parse(draftRes.body).status, "draft", "draft saved: " + draftRes.body);
    const b2d = await getRecord({ token: c.token, baseId: c.baseId, table: c.bookings, id: bk2.id });
    assert.equal(b2d.fields["Closeout Draft"], true, "Closeout Draft flag set (Drafts chip source)");
    assert.equal(b2d.fields.VIN, VIN_2, "draft persisted VIN");
    assert.equal(Number(b2d.fields.Mileage), 61000, "draft persisted mileage");
    assert.equal(b2d.fields.Status, "Booked", "draft leaves booking open");
    assert.ok(!b2d.fields["Certificate Sent"], "no cert on draft");
    console.log("PASS draft: fields persisted, flag set, booking still open");

    // 7) Resume: complete with the remaining fields (VIN/mileage already on the booking → gate satisfied).
    const resRes = await post({ recordId: bk2.id, calibration: "Medium",
      tuningPlatform: "VFT", calibrationType: "9.2 Update", ecuId: "TEST456",
      gearSize: "Stock", modelYear: "2019", customerEmail: CERT_TO });
    const res2 = JSON.parse(resRes.body);
    assert.equal(res2.status, "completed", "resume complete: " + resRes.body);
    assert.equal(res2.certSent, true, "cert sent on resume");
    const b2 = await getRecord({ token: c.token, baseId: c.baseId, table: c.bookings, id: bk2.id });
    // Airtable omits unchecked checkboxes from record JSON — cleared reads as undefined.
    assert.ok(!b2.fields["Closeout Draft"], "complete clears draft flag");
    assert.equal(b2.fields.Status, "Completed");
    console.log("PASS resume: draft completed, flag cleared, cert sent");
    const cl2 = (await listAllRecords({ token: c.token, baseId: c.baseId, table: c.priority }))
      .find(r => (r.fields.Phone || "") === PHONE_2);
    if (cl2) cleanupIds.leads.push(cl2.id);

    // 8) OTT report dry run: both rows fully populated for the 2026-08 submission.
    const recs = await listAllRecords({ token: c.token, baseId: c.baseId, table: c.bookings });
    const rows = buildSubmissionRows(flattenRecords(recs), monthFromKey("2026-08"));
    for (const [vin, bits] of [[VIN_1, ["2021", "VFT", "9.2 New", "TEST123", "3.90", "45000"]],
                               [VIN_2, ["2019", "VFT", "9.2 Update", "TEST456", "Stock", "61000"]]]) {
      const row = rows.find(r => JSON.stringify(r).includes(vin));
      assert.ok(row, "OTT submission row present for " + vin);
      const s = JSON.stringify(row);
      for (const bit of bits) assert.ok(s.includes(bit), `OTT row ${vin} carries ${bit}: ${s}`);
      console.log(`PASS OTT dry run row (${vin}):`, s.slice(0, 240));
    }
  } catch (e) {
    failed = true;
    console.error("SMOKE FAILURE:", e && e.message);
  } finally {
    for (const id of cleanupIds.leads) {
      try { await deleteRecord({ token: c.token, baseId: c.baseId, table: c.priority, id }); console.log(`cleanup: deleted lead ${id}`); }
      catch (e) { console.error(`cleanup FAILED lead ${id}:`, e.message); }
    }
    for (const id of cleanupIds.bookings) {
      try { await deleteRecord({ token: c.token, baseId: c.baseId, table: c.bookings, id }); console.log(`cleanup: deleted booking ${id}`); }
      catch (e) { console.error(`cleanup FAILED booking ${id}:`, e.message); }
    }
  }
  if (failed) process.exit(1);
  console.log("\nSMOKE C: ALL CHECKS PASSED (2 smoke certificates landed at " + CERT_TO + " — safe to delete)");
}
main().catch(e => { console.error(e); process.exit(1); });
