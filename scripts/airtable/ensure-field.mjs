// scripts/airtable/ensure-field.mjs
// Idempotently create a field on an Airtable table via the metadata API (the
// Netlify AIRTABLE_TOKEN has schema scope since 2026-07-18). Companion to the
// createTolerant/updateTolerant pattern: code ships tolerant of the missing
// column, then this makes the column real so the data actually lands.
//
// Run (env injected, token never printed):
//   AIRTABLE_TOKEN=$(npx netlify env:get AIRTABLE_TOKEN) \
//   AIRTABLE_BASE_ID=$(npx netlify env:get AIRTABLE_BASE_ID) \
//   node scripts/airtable/ensure-field.mjs "Bookings" "Address" singleLineText "desc"
const [table, field, type = "singleLineText", description = ""] = process.argv.slice(2);
const token = process.env.AIRTABLE_TOKEN, baseId = process.env.AIRTABLE_BASE_ID;
if (!token || !baseId || !table || !field) {
  console.error("usage: AIRTABLE_TOKEN=.. AIRTABLE_BASE_ID=.. node ensure-field.mjs <table> <field> [type] [description]");
  process.exit(1);
}
const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const metaRes = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, { headers: H });
if (!metaRes.ok) { console.error(`meta list failed: ${metaRes.status} ${await metaRes.text()}`); process.exit(1); }
const tables = (await metaRes.json()).tables || [];
const tbl = tables.find((t) => t.name === table);
if (!tbl) { console.error(`table "${table}" not found (have: ${tables.map((t) => t.name).join(", ")})`); process.exit(1); }
const existing = (tbl.fields || []).find((f) => f.name === field);
if (existing) { console.log(`ok: "${field}" already exists on "${table}" (${existing.type}, ${existing.id})`); process.exit(0); }
const body = { name: field, type };
if (description) body.description = description;
const createRes = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables/${tbl.id}/fields`,
  { method: "POST", headers: H, body: JSON.stringify(body) });
if (!createRes.ok) { console.error(`create failed: ${createRes.status} ${await createRes.text()}`); process.exit(1); }
const created = await createRes.json();
console.log(`created: "${field}" on "${table}" (${created.type}, ${created.id})`);
