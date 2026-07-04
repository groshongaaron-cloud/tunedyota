// netlify/functions/lib/rebook-render.js
const { keyToInstaller } = require("./routing.js");
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function line(r) {
  const veh = `${r.Vehicle || "—"}${r["Model Year"] ? ` (${r["Model Year"]})` : ""}`;
  return `${r.Name || ""} — ${r.Phone || r.Email || ""} · ${veh} · ${r.City || "—"} · ${r.Reason || ""}${r["Event Date"] ? ` · ${r["Event Date"]}` : ""}`;
}
function groupBy(records, keyFn) {
  const m = new Map();
  for (const r of records) { const k = keyFn(r) || "—"; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  return m;
}
// Legend so owner + installers can decode the Reason column at a glance. These
// values MUST match what's actually stored (book.js / event-plan.js SWEEP_REASON)
// and SOP 5's Reason table — keep the three in sync.
const REASON_KEY = [
  ["Rebook — not completed", "Booked but not marked complete at the event — no-show or unfinished. Re-book them."],
  ["Event full", "Wanted a slot but the event was full — joined the waitlist."],
  ["No event scheduled", "Interested in a city with no event on the calendar yet."],
];
function renderRebookReport(records, opts = {}) {
  const title = opts.title || "Rebook backlog";
  const rows = records || [];
  const subject = `Tuned Yota — ${title} (${rows.length})`;
  if (!rows.length) {
    return {
      subject,
      text: `${title}\n\nNone outstanding.`,
      html: `<div style="font-family:Arial,sans-serif;color:#3A2E26"><h2 style="color:#5B4B42">${esc(title)}</h2><p>None outstanding.</p></div>`,
    };
  }
  const byCity = groupBy(rows, (r) => r.City);
  const byInst = groupBy(rows, (r) => (r.Installer ? keyToInstaller(r.Installer).name : "Unassigned"));
  const textSection = (label, map) => `${label}\n` +
    [...map.entries()].map(([k, list]) => `  ${k} (${list.length}):\n` + list.map((r) => `    - ${line(r)}`).join("\n")).join("\n") + "\n";
  const reasonKeyText = `\n\nREASON KEY:\n` + REASON_KEY.map(([r, m]) => `  • ${r} — ${m}`).join("\n");
  const text = `${title} — ${rows.length} outstanding\n\nALL:\n` + rows.map((r) => `- ${line(r)}`).join("\n") +
    `\n\n` + textSection("BY LOCATION:", byCity) + `\n` + textSection("BY INSTALLER:", byInst) + reasonKeyText;
  const htmlList = (list) => `<ul style="margin:2px 0 10px">` + list.map((r) => `<li style="color:#3A2E26">${esc(line(r))}</li>`).join("") + `</ul>`;
  const htmlSection = (label, map) => `<h3 style="color:#5B4B42;margin:14px 0 4px">${label}</h3>` +
    [...map.entries()].map(([k, list]) => `<p style="margin:6px 0 0;color:#7c8472;font-weight:700">${esc(k)} (${list.length})</p>${htmlList(list)}`).join("");
  const reasonKeyHtml = `<h3 style="color:#5B4B42;margin:16px 0 4px">Reason key</h3>` +
    `<ul style="margin:2px 0 10px;font-size:13px;color:#7c8472">` +
    REASON_KEY.map(([r, m]) => `<li><strong style="color:#3A2E26">${esc(r)}</strong> — ${esc(m)}</li>`).join("") + `</ul>`;
  const html = `<div style="font-family:Arial,sans-serif;color:#3A2E26;max-width:680px">` +
    `<h2 style="color:#5B4B42;margin:0 0 6px">${esc(title)} — ${rows.length} outstanding</h2>` +
    `<h3 style="color:#5B4B42;margin:14px 0 4px">All</h3>${htmlList(rows)}` +
    htmlSection("By location", byCity) + htmlSection("By installer", byInst) + reasonKeyHtml + `</div>`;
  return { subject, html, text };
}
module.exports = { renderRebookReport };
