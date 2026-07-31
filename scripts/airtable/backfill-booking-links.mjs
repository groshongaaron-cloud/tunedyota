// scripts/airtable/backfill-booking-links.mjs
// Copy legacy "Converted Booking" text ids into the real Booking linked field.
// Idempotent (already-linked rows skipped); dangling ids (booking since purged)
// skipped loudly; --dry-run prints the plan without writing.
//   AIRTABLE_TOKEN=.. AIRTABLE_BASE_ID=.. node scripts/airtable/backfill-booking-links.mjs [--dry-run]
const dry = process.argv.includes("--dry-run");
const token = process.env.AIRTABLE_TOKEN, baseId = process.env.AIRTABLE_BASE_ID;
if (!token || !baseId) { console.error("AIRTABLE_TOKEN and AIRTABLE_BASE_ID required"); process.exit(1); }
const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
async function listAll(table) {
  const out = []; let offset;
  do {
    const u = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
    u.searchParams.set("pageSize", "100");
    if (offset) u.searchParams.set("offset", offset);
    const r = await fetch(u, { headers: H });
    if (!r.ok) { console.error(`${table} list failed: ${r.status}`); process.exit(1); }
    const j = await r.json(); out.push(...(j.records || [])); offset = j.offset;
  } while (offset);
  return out;
}
const leads = await listAll("Priority List");
const bookingIds = new Set((await listAll("Bookings")).map((r) => r.id));
let linked = 0, dangling = 0, already = 0, none = 0;
for (const r of leads) {
  const f = r.fields || {};
  if (Array.isArray(f.Booking) && f.Booking.length) { already++; continue; }
  const legacy = String(f["Converted Booking"] || "").trim();
  if (!legacy) { none++; continue; }
  if (!bookingIds.has(legacy)) { console.log(`skip (dangling): ${r.id} "${f.Name || ""}" → ${legacy}`); dangling++; continue; }
  console.log(`${dry ? "would link" : "link"}: ${r.id} "${f.Name || ""}" → ${legacy}`);
  if (!dry) {
    const res = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent("Priority List")}/${r.id}`,
      { method: "PATCH", headers: H, body: JSON.stringify({ fields: { Booking: [legacy] } }) });
    if (!res.ok) { console.error(`  FAILED: ${res.status} ${await res.text()}`); process.exit(1); }
  }
  linked++;
}
console.log(`${dry ? "dry-run" : "done"}: ${linked} linked, ${already} already linked, ${dangling} dangling skipped, ${none} never converted, of ${leads.length} leads`);
