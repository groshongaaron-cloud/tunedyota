// scripts/airtable/ensure-purchases-table.mjs
// Idempotently create the "Purchases" table (Customer 360 ownership log) via the
// Airtable metadata API (Netlify AIRTABLE_TOKEN has schema scope since 2026-07-18).
// Companion to add-purchase.js / customer-view.js fetchManualPurchases — those ship
// tolerant of the missing table; this makes it real so manual purchases land.
//
// If the table already exists, adds only any missing fields (safe to re-run).
// Primary field must be a text type (Airtable rejects date/select/currency as
// primary), so "Item" is first; field ORDER is irrelevant to the app (it reads by
// name). Table name overridable via AIRTABLE_PURCHASES_TABLE.
//
// Run (env injected, token never printed):
//   AIRTABLE_TOKEN=$(npx netlify env:get AIRTABLE_TOKEN) \
//   AIRTABLE_BASE_ID=$(npx netlify env:get AIRTABLE_BASE_ID) \
//   node scripts/airtable/ensure-purchases-table.mjs
const token = process.env.AIRTABLE_TOKEN, baseId = process.env.AIRTABLE_BASE_ID;
const tableName = process.env.AIRTABLE_PURCHASES_TABLE || "Purchases";
if (!token || !baseId) {
  console.error("usage: AIRTABLE_TOKEN=.. AIRTABLE_BASE_ID=.. node scripts/airtable/ensure-purchases-table.mjs");
  process.exit(1);
}
const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

// Field definitions — "Item" first (primary, must be text).
const FIELDS = [
  { name: "Item", type: "singleLineText" },
  { name: "Date", type: "date", options: { dateFormat: { name: "iso", format: "YYYY-MM-DD" } } },
  { name: "Category", type: "singleSelect", options: { choices: ["OTT Tune", "AMSOIL", "Banks", "Magnuson", "Other"].map((name) => ({ name })) } },
  { name: "Amount", type: "currency", options: { precision: 2, symbol: "$" } },
  { name: "Vehicle", type: "singleLineText" },
  { name: "Phone", type: "singleLineText" },
  { name: "Email", type: "singleLineText" },
  { name: "Name", type: "singleLineText" },
  { name: "Installer", type: "singleLineText" },
  { name: "Notes", type: "multilineText" },
];

const metaRes = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, { headers: H });
if (!metaRes.ok) { console.error(`meta list failed: ${metaRes.status} ${await metaRes.text()}`); process.exit(1); }
const tables = (await metaRes.json()).tables || [];
const existing = tables.find((t) => t.name === tableName);

if (existing) {
  console.log(`table "${tableName}" already exists (${existing.id}) — checking fields…`);
  const have = new Set((existing.fields || []).map((f) => f.name));
  const missing = FIELDS.filter((f) => !have.has(f.name));
  if (!missing.length) { console.log(`ok: all ${FIELDS.length} fields present, nothing to do.`); process.exit(0); }
  for (const f of missing) {
    const res = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables/${existing.id}/fields`,
      { method: "POST", headers: H, body: JSON.stringify(f) });
    if (!res.ok) { console.error(`add field "${f.name}" failed: ${res.status} ${await res.text()}`); process.exit(1); }
    console.log(`added missing field "${f.name}" (${f.type})`);
  }
  console.log(`done: added ${missing.length} missing field(s) to "${tableName}".`);
  process.exit(0);
}

const body = { name: tableName, description: "Customer 360 ownership log: in-person/manual purchases (AMSOIL, Banks, Magnuson, tunes). Read-merged with auto-derived booking tunes.", fields: FIELDS };
const createRes = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
  { method: "POST", headers: H, body: JSON.stringify(body) });
if (!createRes.ok) { console.error(`create table failed: ${createRes.status} ${await createRes.text()}`); process.exit(1); }
const created = await createRes.json();
console.log(`created table "${created.name}" (${created.id}) with ${created.fields.length} fields:`);
for (const f of created.fields) console.log(`  - ${f.name} (${f.type})`);
