// One-off backfill (2026-07-26): completed bookings from the last month on the
// 2024+ turbo platforms (Tacoma 2024+, 4Runner 2025+, LC250) were closed out
// before the Stage tiers existed in the console, so their OTT Calibration holds
// a classic tier. Owner directive: set them to "Stage 1 Enhanced".
//
//   netlify dev:exec node scripts/backfill-stage1-enhanced.mjs           # dry run
//   netlify dev:exec node scripts/backfill-stage1-enhanced.mjs --apply   # write
//
// Skips records already on a Stage tier. Emailed certificates are unchanged
// (fixed HTML); the console's "View / download certificate" re-renders live
// from Airtable, so it will show the corrected tier.

const API = "https://api.airtable.com/v0";
const token = process.env.AIRTABLE_TOKEN;
const baseId = process.env.AIRTABLE_BASE_ID;
const table = process.env.AIRTABLE_BOOKINGS_TABLE || "Bookings";
if (!token || !baseId) { console.error("Missing AIRTABLE_TOKEN / AIRTABLE_BASE_ID"); process.exit(1); }

const APPLY = process.argv.includes("--apply");
const SINCE = "2026-06-26"; // last month, inclusive
const TODAY = "2026-07-26";

// Like stageEligible() in site/installer.html, but STRICTER on 4Runner: the
// turbo 4Runner starts at model year 2025, so a "2024 4Runner" here is the
// 5th-gen V6 and is excluded (the console still offers Stage options on
// ambiguous walk-in text — never hide — but a backfill must not overwrite a
// valid classic tier on a V6 truck; owner-confirmed 2026-07-26).
function stageEligible(vehicle, modelYear) {
  const v = String(vehicle || "");
  if (!/tacoma|4\s*runner|land\s*cruiser|lc\s*-?\s*250/i.test(v)) return false;
  if (/lc\s*-?\s*250/i.test(v)) return true;
  if (/2\.4\s*L\s*-?\s*T/i.test(v)) return true;
  if (/\b20(?:2[4-9]|[3-9]\d)\s*\+/.test(v)) return true;
  if (/\b(?:19|20)\d{2}\s*[-–]\s*(?:19|20)\d{2}/.test(v)) return false;
  let y = parseInt(modelYear, 10) || 0;
  if (!y) for (const t of v.match(/\b(?:19|20)\d{2}\b/g) || []) y = Math.max(y, +t);
  return y >= (/4\s*runner/i.test(v) ? 2025 : 2024);
}

async function listAll(filterByFormula) {
  const out = [];
  let offset;
  do {
    const params = new URLSearchParams({ pageSize: "100", filterByFormula });
    if (offset) params.set("offset", offset);
    const res = await fetch(`${API}/${baseId}/${encodeURIComponent(table)}?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`airtable list ${res.status}: ${await res.text().catch(() => "")}`);
    const j = await res.json();
    out.push(...(j.records || []));
    offset = j.offset;
  } while (offset);
  return out;
}

const records = await listAll(`{Status}="Completed"`);
const matches = [];
for (const r of records) {
  const f = r.fields || {};
  const date = String(f["Calibration Date"] || f["Event Date"] || "").slice(0, 10);
  if (!date || date < SINCE || date > TODAY) continue;
  if (!stageEligible(f.Vehicle, f["Model Year"])) continue;
  matches.push({ id: r.id, name: f.Name || "", vehicle: f.Vehicle || "", modelYear: f["Model Year"] || "", date, cal: f["OTT Calibration"] || "" });
}

if (!matches.length) { console.log("No completed 2024+ turbo-truck bookings in the window. Nothing to do."); process.exit(0); }
for (const m of matches) {
  const skip = /^stage\b/i.test(m.cal);
  console.log(`${skip ? "SKIP (already Stage)" : APPLY ? "UPDATE" : "WOULD UPDATE"}  ${m.id}  ${m.date}  ${m.name}  ·  ${m.vehicle}${m.modelYear ? ` (${m.modelYear})` : ""}  ·  "${m.cal}" → "Stage 1 Enhanced"`);
  if (skip || !APPLY) continue;
  const res = await fetch(`${API}/${baseId}/${encodeURIComponent(table)}/${m.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { "OTT Calibration": "Stage 1 Enhanced" }, typecast: true }),
  });
  if (!res.ok) console.error(`  FAILED ${res.status}: ${await res.text().catch(() => "")}`);
}
console.log(APPLY ? "Done." : "Dry run — re-run with --apply to write.");
