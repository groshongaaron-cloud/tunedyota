// scripts/smoke/crm-smoke-b.cjs — live smoke for sub-project B (duplicate merge).
// Run: npx netlify dev:exec node scripts/smoke/crm-smoke-b.cjs
// Stages a web+sms lead pair sharing a phone (the pre-existing-duplicate condition
// B8 handles — ingest itself dedupes same-phone on arrival), links the newer dup to
// a real booking, then drives leads-list (strip data) and lead-update (merge) through
// the actual handlers against live Airtable. Cleans up after itself.
const assert = require("node:assert/strict");
const { cfg, createRecord, getRecord, listAllRecords, deleteRecord } = require("../../netlify/functions/lib/airtable.js");
const leadsList = require("../../netlify/functions/leads-list.js");
const leadUpdate = require("../../netlify/functions/lead-update.js");

const SMOKE_PHONE = "(555) 010-4477";
const SMOKE_TAG = "SMOKE-B " + new Date().toISOString();

async function main() {
  const c = cfg(process.env);
  assert.ok(c.token && c.baseId, "AIRTABLE env missing — run under netlify dev:exec");
  const tokens = JSON.parse(process.env.INSTALLER_TOKENS || "{}");
  const admins = String(process.env.INSTALLER_ADMINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const adminKey = admins.find(k => tokens[k]);
  assert.ok(adminKey, "no admin installer token in env");
  const headers = { "x-installer-token": tokens[adminKey] };
  console.log(`admin key: ${adminKey}`);

  // Pick an old completed booking to exercise the Leads mirror.
  const bookings = await listAllRecords({ token: c.token, baseId: c.baseId, table: c.bookings });
  const bk = bookings
    .filter(r => (r.fields.Status || "") === "Completed")
    .sort((a, b) => String(a.fields["Event Date"] || "").localeCompare(String(b.fields["Event Date"] || "")))[0];
  assert.ok(bk, "no completed booking found");
  const mirrorBefore = (bk.fields.Leads || []).slice();
  console.log(`booking: ${bk.id} "${bk.fields.Name}" ${bk.fields["Event Date"]} — Leads mirror before: [${mirrorBefore.join(", ")}]`);

  // Older lead (web) — will survive. Newer lead (sms) — linked to booking, will be absorbed.
  const leadW = await createRecord({ token: c.token, baseId: c.baseId, table: c.priority, fields: {
    Name: "Smoke Web", Channel: "web", Phone: SMOKE_PHONE, Email: "smoke-b@tunedyota.com",
    City: "Unassigned", Stage: "New", Installer: adminKey, Goals: SMOKE_TAG,
    "Activity Log": "[smoke] web lead created",
  }});
  console.log(`lead W (web, older):  ${leadW.id}`);
  await new Promise(r => setTimeout(r, 2000)); // distinct Created Time ordering
  const leadS = await createRecord({ token: c.token, baseId: c.baseId, table: c.priority, fields: {
    Name: "Smoke Sms", Channel: "sms", Phone: SMOKE_PHONE,
    City: "Unassigned", Stage: "Contacted", Installer: adminKey, Goals: SMOKE_TAG,
    "Client Notes": "[smoke] note riding the duplicate",
    "Activity Log": "[smoke] sms lead created", Booking: [bk.id],
  }});
  console.log(`lead S (sms, newer):  ${leadS.id} (linked to booking)`);

  let failed = false;
  try {
    // 1) leads-list must flag both as duplicates of each other (this is the strip's data).
    const listRes = await leadsList.handler({ headers, queryStringParameters: {} });
    assert.equal(listRes.statusCode, 200, "leads-list status");
    const { leads } = JSON.parse(listRes.body);
    const w = leads.find(l => l.id === leadW.id), s = leads.find(l => l.id === leadS.id);
    assert.ok(w && s, "both smoke leads present in payload");
    assert.ok((w.duplicates || []).some(d => d.id === leadS.id), "W flags S as duplicate");
    assert.ok((s.duplicates || []).some(d => d.id === leadW.id), "S flags W as duplicate");
    console.log("PASS duplicate detection: both cards would show the strip");
    console.log("  W.duplicates:", JSON.stringify(w.duplicates));

    // 2) Merge via the handler — survivor must be the older (W).
    const mergeRes = await leadUpdate.handler({ headers, body: JSON.stringify({ id: leadW.id, action: "merge", duplicateId: leadS.id }) });
    assert.equal(mergeRes.statusCode, 200, "merge status: " + mergeRes.body);
    const m = JSON.parse(mergeRes.body);
    assert.equal(m.merged, true, "merged");
    assert.equal(m.survivorId, leadW.id, "older web lead survives");
    assert.equal(m.deleted, true, "duplicate row deleted");
    console.log("PASS merge:", mergeRes.body);

    // 3) Survivor carries combined notes/links + audit line.
    const surv = await getRecord({ token: c.token, baseId: c.baseId, table: c.priority, id: leadW.id });
    assert.ok(String(surv.fields["Activity Log"] || "").includes(`merged in ${leadS.id}`), "audit line on survivor");
    assert.ok(String(surv.fields["Client Notes"] || "").includes("note riding the duplicate"), "dup notes absorbed");
    assert.ok((surv.fields.Booking || []).includes(bk.id), "booking link absorbed onto survivor");
    assert.equal(surv.fields.Stage, "Contacted", "stage advanced from dup");
    console.log("PASS survivor state: audit line + notes + booking link + stage advance");

    // 4) Duplicate row gone from Airtable.
    let gone = false;
    try { await getRecord({ token: c.token, baseId: c.baseId, table: c.priority, id: leadS.id }); }
    catch (e) { gone = /40[34]/.test(String(e.message)); }
    assert.ok(gone, "duplicate row gone from Airtable");
    console.log("PASS duplicate row deleted from Airtable");

    // 5) Booking's Leads mirror intact: survivor present, dup absent, originals preserved.
    const bkAfter = await getRecord({ token: c.token, baseId: c.baseId, table: c.bookings, id: bk.id });
    const mirror = bkAfter.fields.Leads || [];
    assert.ok(mirror.includes(leadW.id), "mirror holds survivor");
    assert.ok(!mirror.includes(leadS.id), "mirror dropped deleted dup");
    for (const prev of mirrorBefore) assert.ok(mirror.includes(prev), "pre-existing mirror entry preserved: " + prev);
    console.log(`PASS booking Leads mirror intact: [${mirror.join(", ")}]`);
  } catch (e) {
    failed = true;
    console.error("SMOKE FAILURE:", e && e.message);
  } finally {
    // Cleanup: remove smoke leads (deleting the survivor also restores the mirror).
    for (const id of [leadW.id, leadS.id]) {
      try { await deleteRecord({ token: c.token, baseId: c.baseId, table: c.priority, id }); console.log(`cleanup: deleted ${id}`); }
      catch (e) { if (!/40[34]/.test(String(e.message))) console.error(`cleanup FAILED for ${id}:`, e.message); }
    }
    const bkFinal = await getRecord({ token: c.token, baseId: c.baseId, table: c.bookings, id: bk.id });
    const finalMirror = bkFinal.fields.Leads || [];
    assert.deepEqual(finalMirror.sort(), mirrorBefore.slice().sort(), "mirror restored to pre-smoke state");
    console.log("cleanup: booking mirror restored");
  }
  if (failed) process.exit(1);
  console.log("\nSMOKE B: ALL CHECKS PASSED");
}
main().catch(e => { console.error(e); process.exit(1); });
