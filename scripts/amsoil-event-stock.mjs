// scripts/amsoil-event-stock.mjs
// Per-event AMSOIL stocking list: reads upcoming bookings, maps each booked
// vehicle to its garage kit (lib/amsoil-fluids resolveFluids — engine/year
// aware), and aggregates exact purchase quantities per event so the installer
// brings precisely what the day's trucks need (sop-install-day-amsoil-pitch.md).
//
// Quantity rules: qt-unit systems -> ceil(verified capacity); filters -> 1 ea.
// Transmission is EXCLUDED (sealed/overflow fill — no honest stock qty).
// Unverified capacities are listed as "verify" lines, never a guessed number.
//
// Run (needs Airtable env):  netlify dev:exec node scripts/amsoil-event-stock.mjs
//   [--date YYYY-MM-DD] [--city "Sioux Falls"]     (default: all upcoming events)
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { resolveFluids } = require("../netlify/functions/lib/amsoil-fluids.js");

// ---- pure logic (tested by tests/amsoil-event-stock.test.js) ----
export function kitForBooking(f) {
  const fluids = resolveFluids(f.Vehicle, f["Model Year"]);
  if (!fluids) return { name: f.Name, vehicle: f.Vehicle, unresolved: true, items: [], verify: [] };
  const items = [], verify = [];
  for (const s of fluids.systems) {
    if (s.system === "Transmission") continue;               // sealed/overflow — no stock qty
    if (/filter/i.test(s.system)) { items.push({ stockNo: s.stockNo, product: s.product, qty: 1, unit: "ea", system: s.system }); continue; }
    if (!s.capacity) continue;
    if (!s.verified) { verify.push({ system: s.system, product: s.product }); continue; }
    items.push({ stockNo: s.stockNo, product: s.product, qty: Math.ceil(s.capacity), unit: s.unit || "qt", system: s.system });
  }
  return { name: f.Name, vehicle: `${fluids.make} ${fluids.model} ${fluids.engine}`.trim(), items, verify };
}

export function buildStockList(bookings) {
  const events = {};
  for (const f of bookings) {
    const key = `${f["Event Date"] || "unscheduled"} — ${f.City || "?"}`;
    (events[key] ||= { trucks: [], totals: {}, verify: [], unresolved: [] });
    const ev = events[key];
    const kit = kitForBooking(f);
    if (kit.unresolved) { ev.unresolved.push(`${kit.name} — ${kit.vehicle}`); continue; }
    ev.trucks.push(kit);
    for (const it of kit.items) {
      const t = (ev.totals[it.stockNo || it.product] ||= { stockNo: it.stockNo, product: it.product, qty: 0, unit: it.unit });
      t.qty += it.qty;
    }
    for (const v of kit.verify) ev.verify.push(`${kit.name} (${kit.vehicle}): ${v.system} — capacity unverified, check owner's manual`);
  }
  return events;
}

export function renderStockList(events) {
  const out = [];
  for (const [key, ev] of Object.entries(events)) {
    out.push(`\n═══ ${key} — ${ev.trucks.length} booked truck(s) ═══`);
    out.push("\nSTOCK TO BRING (aggregate):");
    const totals = Object.values(ev.totals).sort((a, b) => b.qty - a.qty);
    for (const t of totals) out.push(`  ${String(t.qty).padStart(3)} ${t.unit.padEnd(3)} ${t.stockNo ? `[${t.stockNo}] ` : ""}${t.product}`);
    out.push("\nPER TRUCK:");
    for (const k of ev.trucks) {
      out.push(`  • ${k.name} — ${k.vehicle}`);
      for (const it of k.items) out.push(`      ${it.qty} ${it.unit} ${it.product} (${it.system})`);
    }
    if (ev.verify.length) { out.push("\nVERIFY BEFORE SELLING:"); for (const v of ev.verify) out.push(`  ⚠ ${v}`); }
    if (ev.unresolved.length) { out.push("\nNOT IN THE GARAGE CATALOG (quote manually):"); for (const u of ev.unresolved) out.push(`  ? ${u}`); }
    out.push("\nReminder: full-refresh pitch + PC enrollment at payment — see docs/operations/sop-install-day-amsoil-pitch.md");
  }
  return out.join("\n");
}

// ---- CLI (Airtable I/O) ----
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop());
if (isMain) {
  const { cfg, listRecords } = require("../netlify/functions/lib/airtable.js");
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : ""; };
  const date = arg("--date"), city = arg("--city");
  const today = new Date().toISOString().slice(0, 10);
  const clauses = ['{Status}!="Cancelled"', '{Status}!="Completed"'];
  clauses.push(date ? `{Event Date}="${date}"` : `{Event Date}>="${today}"`);
  if (city) clauses.push(`{City}="${city}"`);
  const c = cfg(process.env);
  const rows = await listRecords({ token: c.token, baseId: c.baseId, table: c.bookings,
    filterByFormula: `AND(${clauses.join(",")})`,
    fields: ["Name", "Vehicle", "Model Year", "Event Date", "City", "Status"] });
  const bookings = rows.map((r) => r.fields || {});
  if (!bookings.length) { console.log("No upcoming bookings matched."); process.exit(0); }
  console.log(renderStockList(buildStockList(bookings)));
}
