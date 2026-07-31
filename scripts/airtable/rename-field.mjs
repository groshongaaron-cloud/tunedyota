// scripts/airtable/rename-field.mjs — rename a field via the metadata API.
// Idempotent: exits 0 if the target name already exists.
//   AIRTABLE_TOKEN=.. AIRTABLE_BASE_ID=.. node scripts/airtable/rename-field.mjs <table> <from> <to>
const [table, from, to] = process.argv.slice(2);
const token = process.env.AIRTABLE_TOKEN, baseId = process.env.AIRTABLE_BASE_ID;
if (!token || !baseId || !table || !from || !to) {
  console.error("usage: AIRTABLE_TOKEN=.. AIRTABLE_BASE_ID=.. node rename-field.mjs <table> <from> <to>");
  process.exit(1);
}
const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const metaRes = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, { headers: H });
if (!metaRes.ok) { console.error(`meta list failed: ${metaRes.status} ${await metaRes.text()}`); process.exit(1); }
const tbl = ((await metaRes.json()).tables || []).find((t) => t.name === table);
if (!tbl) { console.error(`table "${table}" not found`); process.exit(1); }
if ((tbl.fields || []).find((f) => f.name === to)) { console.log(`ok: "${to}" already exists on "${table}"`); process.exit(0); }
const fld = (tbl.fields || []).find((f) => f.name === from);
if (!fld) { console.error(`field "${from}" not found on "${table}" (have: ${(tbl.fields || []).map((f) => f.name).join(", ")})`); process.exit(1); }
const res = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables/${tbl.id}/fields/${fld.id}`,
  { method: "PATCH", headers: H, body: JSON.stringify({ name: to }) });
if (!res.ok) { console.error(`rename failed: ${res.status} ${await res.text()}`); process.exit(1); }
console.log(`renamed: "${from}" → "${to}" on "${table}"`);
