// scripts/smoke/crm-smoke-convert.cjs — live smoke for convert-from-lead.
// Run: npx netlify dev:exec node scripts/smoke/crm-smoke-convert.cjs
// Drives the real lead-update convert against live Airtable: inline corrections
// ride into the booking AND back onto the lead, Model Year + Modifications carry,
// and the slot choice lands in the booking's Slot column (occupies capacity).
// Self-cleaning.
const assert = require("node:assert/strict");
const { cfg, createRecord, getRecord, deleteRecord } = require("../../netlify/functions/lib/airtable.js");
const leadUpdate = require("../../netlify/functions/lead-update.js");

async function main() {
  const c = cfg(process.env);
  assert.ok(c.token && c.baseId, "AIRTABLE env missing — run under netlify dev:exec");
  const tokens = JSON.parse(process.env.INSTALLER_TOKENS || "{}");
  const admins = String(process.env.INSTALLER_ADMINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const adminKey = admins.find(k => tokens[k]);
  assert.ok(adminKey, "no admin installer token in env");
  const headers = { "x-installer-token": tokens[adminKey] };

  const lead = await createRecord({ token: c.token, baseId: c.baseId, table: c.priority, fields: {
    Name: "Text (555) 010-4466", Channel: "sms", Phone: "(555) 010-4466",
    City: "Unassigned", Stage: "New", Installer: adminKey,
    Modifications: "35s, level kit", Goals: "SMOKE-CONVERT " + new Date().toISOString(),
    "Activity Log": "[smoke] convert lead",
  }});
  console.log(`lead: ${lead.id} (placeholder name, no vehicle/year)`);

  let bookingId = "";
  let failed = false;
  try {
    const res = await leadUpdate.handler({ headers, body: JSON.stringify({
      id: lead.id, action: "convert", dateISO: "2026-08-01", city: "Lakeville",
      slot: "10:20", name: "Smoke Convert", vehicle: "2019 Toyota Tundra 5.7L", modelYear: "2019",
      email: "smoke-convert@tunedyota.com" }) });
    assert.equal(res.statusCode, 200, "convert status: " + res.body);
    const out = JSON.parse(res.body);
    bookingId = out.bookingId;
    assert.equal(out.booking.slot, "10:20");
    assert.equal(out.booking.slotLabel, "10:20 AM");
    assert.equal(out.booking.modelYear, "2019");
    console.log(`PASS convert response: booking ${bookingId}, slot 10:20 AM, year 2019`);

    const bk = await getRecord({ token: c.token, baseId: c.baseId, table: c.bookings, id: bookingId });
    const bf = bk.fields;
    assert.equal(bf.Name, "Smoke Convert", "corrected name on booking");
    assert.equal(bf.Vehicle, "2019 Toyota Tundra 5.7L");
    assert.equal(String(bf["Model Year"]), "2019", "model year rides");
    assert.equal(bf.Modifications, "35s, level kit", "modifications ride");
    assert.equal(bf.Slot, "10:20", "slot occupies capacity in Airtable");
    assert.equal(bf.Email, "smoke-convert@tunedyota.com");
    assert.equal(bf.Status, "Booked");
    console.log("PASS booking record: corrections + year + mods + slot all in Airtable");

    const lr = await getRecord({ token: c.token, baseId: c.baseId, table: c.priority, id: lead.id });
    const lf = lr.fields;
    assert.equal(lf.Name, "Smoke Convert", "corrected name written back to lead");
    assert.equal(lf.Vehicle, "2019 Toyota Tundra 5.7L", "vehicle written back");
    assert.equal(String(lf["Model Year"]), "2019", "year written back");
    assert.equal(lf.Stage, "Booked");
    assert.ok((lf.Booking || []).includes(bookingId), "lead linked to booking");
    assert.ok(String(lf["Activity Log"] || "").includes("10:20 AM"), "audit line names the slot");
    console.log("PASS lead record: corrections written back, linked, audit line carries slot");

    const bad = await leadUpdate.handler({ headers, body: JSON.stringify({
      id: lead.id, action: "convert", dateISO: "2026-08-01", slot: "13:37" }) });
    assert.equal(bad.statusCode, 400, "garbage slot rejected");
    assert.equal(JSON.parse(bad.body).error, "bad-slot");
    console.log("PASS garbage slot → 400 bad-slot, no booking minted");
  } catch (e) {
    failed = true;
    console.error("SMOKE FAILURE:", e && e.message);
  } finally {
    for (const [table, id] of [[c.priority, lead.id], [c.bookings, bookingId]]) {
      if (!id) continue;
      try { await deleteRecord({ token: c.token, baseId: c.baseId, table, id }); console.log(`cleanup: deleted ${id}`); }
      catch (e) { console.error(`cleanup FAILED ${id}:`, e.message); }
    }
  }
  if (failed) process.exit(1);
  console.log("\nSMOKE CONVERT: ALL CHECKS PASSED");
}
main().catch(e => { console.error(e); process.exit(1); });
