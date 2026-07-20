// scripts/amsoil-fleet-audit.mjs
// Fleet Fluid Audit one-pager (amsoil-commercial-launch-kit.md): the closing
// deliverable for commercial prospects — every unit in their fleet mapped to
// its AMSOIL product, fill quantity, and interval, on one branded page.
//
// Two modes:
//   --blank                     -> printable BLANK capture form (bring to Touch 1)
//   <equipment.json>            -> finished audit from a captured equipment list
// Output: fleet-audit-<slug>.html in the current directory. Open + print to PDF.
//
// Data integrity: Toyota/Lexus vehicles resolve through the garage catalog
// (VERIFIED capacities + real AMSOIL stock numbers). Commercial equipment maps
// to AMSOIL's commercial line by NAME with AMSOIL's own published guidance —
// no invented codes, no invented capacities ("per OEM manual" where unknown).
//
// equipment.json shape:
// { "business": "OZ Lawn Care", "contact": "Mike", "units": [
//   {"unit": "2014 Toyota Tundra 5.7L crew", "type": "vehicle", "vehicle": "Toyota Tundra", "year": 2014},
//   {"unit": "Exmark zero-turns (x3)", "type": "zero-turn"},
//   {"unit": "Stihl trimmers & blowers (x6)", "type": "2-stroke"},
//   {"unit": "Walk-behind mowers (x4)", "type": "small-engine"},
//   {"unit": "F-350 dump (diesel)", "type": "diesel"},
//   {"unit": "Skid steer", "type": "other"} ] }
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { resolveFluids } = require("../netlify/functions/lib/amsoil-fluids.js");

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Commercial-line mapping (AMSOIL Commercial Products dealer brief). Names only —
// quantities stay "per OEM manual" unless the garage verified them.
const COMMERCIAL = {
  "2-stroke": [{ product: "SABER Professional Synthetic 2-Stroke Oil", qty: "mix 1.3 oz/gal (100:1)", interval: "every tank", note: "one ratio for all handhelds; cuts oil cost 50%+ at 100:1" }],
  "small-engine": [{ product: "AMSOIL Synthetic Small-Engine Oil", qty: "per OEM manual", interval: "200 hrs / 1 yr", note: "severe-service formulation" }],
  "zero-turn": [
    { product: "AMSOIL Synthetic Small-Engine Oil (engine)", qty: "per OEM manual", interval: "200 hrs / 1 yr", note: "" },
    { product: "AMSOIL Synthetic Hydrostatic Transmission Fluid", qty: "per OEM manual", interval: "up to 2× OEM interval", note: "purpose-built for hydro drives" },
  ],
  diesel: [{ product: "AMSOIL Synthetic Diesel Oil (grade per OEM spec)", qty: "per OEM manual", interval: "per AMSOIL spec for duty cycle", note: "heavy-duty protection, extended drains" }],
  grease: [{ product: "AMSOIL Synthetic Multi-Purpose Grease", qty: "as needed", interval: "per lube schedule", note: "" }],
  other: [{ product: "(assessed on review)", qty: "", interval: "", note: "we'll spec this unit with you" }],
};

export function rowsForUnit(u) {
  if (u.type === "vehicle" && u.vehicle) {
    const fluids = resolveFluids(u.vehicle, u.year);
    if (fluids) {
      return fluids.systems
        .filter((s) => s.system !== "Transmission")
        .map((s) => ({
          unit: u.unit, product: s.product + (s.stockNo ? ` (${s.stockNo})` : ""),
          qty: /filter/i.test(s.system) ? "1" : (s.capacity && s.verified ? `${s.capacity} ${s.unit || "qt"}` : "per OEM manual"),
          interval: s.tunedInterval || "severe service",
          note: s.capacity && s.verified ? "verified capacity" : "",
        }));
    }
  }
  return (COMMERCIAL[u.type] || COMMERCIAL.other).map((r) => ({ unit: u.unit, ...r }));
}

const STYLE = `<style>
  @page{margin:14mm}
  body{font-family:'Lato','Helvetica Neue',Arial,sans-serif;color:#3A2E26;margin:0;padding:24px;background:#fff}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #191C1E;padding-bottom:12px}
  .brand{font-weight:900;font-size:22px;letter-spacing:.12em;text-transform:uppercase;color:#5B4B42}
  .sub{font-size:11px;color:#7c8472;text-transform:uppercase;letter-spacing:.08em;margin-top:4px}
  .meta{text-align:right;font-size:12px;color:#5D4B40}
  h1{font-size:24px;margin:18px 0 2px;color:#191C1E}
  .for{font-size:13px;color:#7c8472;margin:0 0 14px}
  table{width:100%;border-collapse:collapse;font-size:12.5px}
  th{text-align:left;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#7c8472;padding:8px 8px 6px;border-bottom:2px solid #191C1E}
  td{padding:8px;border-bottom:1px solid #e4e2dd;vertical-align:top}
  td.qty,th.qty{white-space:nowrap}
  .v{color:#1F3A2E;font-weight:800;font-size:10px;text-transform:uppercase}
  .blank td{height:26px}
  .foot{margin-top:18px;padding-top:12px;border-top:1px solid #e4e2dd;font-size:12px;color:#5D4B40;line-height:1.55}
  .foot b{color:#191C1E}
</style>`;

function shell(title, businessLine, table, footNote) {
  const today = new Date().toISOString().slice(0, 10);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${esc(title)}</title>${STYLE}</head><body>
  <div class="head"><div><div class="brand">Tuned Yota</div><div class="sub">Authorized AMSOIL Dealer · Lakeville, Minnesota</div></div>
  <div class="meta">(612) 406-7117 · info@tunedyota.com<br>tunedyota.com · ${today}</div></div>
  <h1>Fleet Fluid Audit</h1>
  <p class="for">${businessLine}</p>
  ${table}
  <div class="foot">${footNote}</div>
</body></html>`;
}

export function buildBlankForm() {
  const rows = Array.from({ length: 12 }, () =>
    `<tr class="blank"><td></td><td></td><td></td><td></td></tr>`).join("\n");
  const table = `<table><thead><tr><th style="width:34%">Unit (year / make / model / qty)</th><th style="width:22%">Type (truck · mower · 2-stroke · diesel · other)</th><th style="width:22%">Current oil & where bought</th><th style="width:22%">Pain points / notes</th></tr></thead><tbody>${rows}</tbody></table>`;
  return shell("Fleet Fluid Audit — capture form", `Business: ______________________________ &nbsp;&nbsp; Contact: ____________________ &nbsp;&nbsp; Phone: ____________________`,
    table,
    `We'll turn this list into your fleet's one-page fluid schedule — exact product, fill quantity, and change interval for every unit — free, within a week. <b>Tuned Yota · Authorized AMSOIL Dealer.</b>`);
}

export function buildAudit(data) {
  const rows = (data.units || []).flatMap(rowsForUnit);
  const body = rows.map((r) =>
    `<tr><td>${esc(r.unit)}</td><td>${esc(r.product)}${r.note === "verified capacity" ? ' <span class="v">✓ verified</span>' : ""}</td><td class="qty">${esc(r.qty)}</td><td>${esc(r.interval)}${r.note && r.note !== "verified capacity" ? `<br><span style="color:#7c8472;font-size:11px">${esc(r.note)}</span>` : ""}</td></tr>`).join("\n");
  const table = `<table><thead><tr><th style="width:26%">Unit</th><th style="width:38%">AMSOIL product</th><th class="qty">Fill</th><th style="width:24%">Interval</th></tr></thead><tbody>${body}</tbody></table>`;
  return shell(`Fleet Fluid Audit — ${data.business || ""}`,
    `Prepared for <b>${esc(data.business || "")}</b>${data.contact ? ` · ${esc(data.contact)}` : ""}`,
    table,
    `Quantities marked <span class="v">✓ verified</span> are cross-checked against factory service specifications; "per OEM manual" quantities we'll confirm with you before first order. <b>Next step:</b> an AMSOIL commercial account gets your business commercial pricing on everything above, shipped direct — setup takes minutes. Call or text <b>(612) 406-7117</b>.`);
}

// ---- CLI ----
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop());
if (isMain) {
  const arg = process.argv[2];
  if (!arg) { console.log("usage: node scripts/amsoil-fleet-audit.mjs --blank | <equipment.json>"); process.exit(1); }
  let html, out;
  if (arg === "--blank") { html = buildBlankForm(); out = "fleet-audit-blank.html"; }
  else {
    const data = JSON.parse(fs.readFileSync(arg, "utf8"));
    html = buildAudit(data);
    out = `fleet-audit-${String(data.business || "fleet").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.html`;
  }
  fs.writeFileSync(out, html);
  console.log(`wrote ${out} — open in a browser and print to PDF`);
}
