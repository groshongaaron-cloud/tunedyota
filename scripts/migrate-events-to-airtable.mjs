// One-time (re-runnable) migration: copy the baked event schedule from
// netlify/functions/lib/events-data.js into the Airtable "Events" table, which
// lib/events.js now treats as the owner-editable source of truth (Airtable wins
// per city over baked data). Idempotent: rows already present (same Market+Date,
// case-insensitive) are skipped, so re-running never duplicates.
//
// Run:
//   AIRTABLE_TOKEN=pat... AIRTABLE_BASE_ID=app... node scripts/migrate-events-to-airtable.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const BAKED = require("../netlify/functions/lib/events-data.js");

const TOKEN = process.env.AIRTABLE_TOKEN;
const BASE = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_EVENTS_TABLE || "Events";
if (!TOKEN || !BASE) { console.error("Set AIRTABLE_TOKEN and AIRTABLE_BASE_ID env vars."); process.exit(1); }
const API = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}`;
const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

const title = (s) => String(s).split(" ").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);

async function api(url, opts) {
  const res = await fetch(url, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body)}`);
  return body;
}

async function listExisting() {
  const rows = [];
  let offset;
  do {
    const u = new URL(API);
    if (offset) u.searchParams.set("offset", offset);
    const body = await api(u, { headers: H });
    rows.push(...(body.records || []));
    offset = body.offset;
  } while (offset);
  return rows;
}

const wanted = [];
for (const [cityKey, evs] of Object.entries(BAKED)) {
  for (const e of asArray(evs)) {
    if (!e || !e.dateISO) continue;
    wanted.push({
      Market: title(cityKey),
      Date: e.dateISO,
      Label: e.label || "",
      Active: !!e.active,
      Event: e.event || "",
      Details: e.details || "",
      Address: e.address || "",
    });
  }
}

const existing = await listExisting();
const seen = new Set(existing.map((r) => `${String(r.fields.Market || "").trim().toLowerCase()}|${String(r.fields.Date || "").trim()}`));
const toCreate = wanted.filter((f) => !seen.has(`${f.Market.toLowerCase()}|${f.Date}`));
console.log(`baked events: ${wanted.length} · already in Airtable: ${wanted.length - toCreate.length} · creating: ${toCreate.length}`);

for (let i = 0; i < toCreate.length; i += 10) {
  const batch = toCreate.slice(i, i + 10);
  await api(API, { method: "POST", headers: H, body: JSON.stringify({ records: batch.map((fields) => ({ fields })), typecast: true }) });
  console.log(`  ✓ created ${Math.min(i + 10, toCreate.length)}/${toCreate.length}`);
}
console.log("done");
