// netlify/functions/lib/roster-render.js
const { formatSlot } = require("./slots.js");
const { reasonKeyText, reasonKeyHtml } = require("./reasons.js");
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function bySlot(a, b) { return String(a.Slot || "").localeCompare(String(b.Slot || ""), undefined, { numeric: true }); }

function renderRosterEmail(event, bookings, waitlist) {
  const evLabel = `${event.city}, ${event.state || ""} · ${event.label || event.dateISO}`;
  const subject = `Tuned Yota — ${event.city} Roster · ${event.label || event.dateISO}`;
  const sorted = (bookings || []).slice().sort(bySlot);

  const head = ["Time", "Name", "Vehicle", "Phone", "Email", "Mods"];
  const bodyRows = sorted.map((b) => [
    b.Slot ? formatSlot(b.Slot) : "", b.Name || "", `${b.Vehicle || ""}${b["Model Year"] ? ` (${b["Model Year"]})` : ""}`, b.Phone || "", b.Email || "", b.Modifications || "",
  ]);

  const th = head.map((h) => `<th style="text-align:left;padding:4px 12px 4px 0;color:#7c8472;border-bottom:1px solid #ccc">${h}</th>`).join("");
  const trs = bodyRows.length
    ? bodyRows.map((r) => `<tr>${r.map((c) => `<td style="padding:4px 12px 4px 0;color:#3A2E26">${esc(c)}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="6" style="padding:8px 0;color:#7c8472">No bookings yet.</td></tr>`;

  const wl = (waitlist || []).map((w) => `<li>${esc(w.Name || "")} — ${esc(w.Phone || w.Email || "")}${w.Reason ? ` (${esc(w.Reason)})` : ""}</li>`).join("");
  const wlHtml = `<h3 style="color:#5B4B42;margin:18px 0 4px">Priority waitlist</h3>` + (wl ? `<ul>${wl}</ul>` : `<p style="color:#7c8472">None.</p>`);

  // Only show the Reason key when there's a waitlist — that's the only place a
  // Reason appears on the roster.
  const hasWaitlist = !!(waitlist && waitlist.length);

  const html =
    `<div style="font-family:Arial,sans-serif;color:#3A2E26;max-width:680px">` +
    `<h2 style="color:#5B4B42;margin:0 0 2px">${esc(evLabel)}</h2>` +
    `<p style="color:#7c8472;margin:0 0 12px">9:00 AM start${event.address ? ` · ${esc(event.address)}` : ""} · ${sorted.length} booked</p>` +
    `<table style="border-collapse:collapse;font-size:14px"><tr>${th}</tr>${trs}</table>` +
    wlHtml + (hasWaitlist ? reasonKeyHtml() : "") + `</div>`;

  const text =
    `${evLabel}\n9:00 AM start${event.address ? ` · ${event.address}` : ""}\n\n` +
    (bodyRows.length ? bodyRows.map((r) => r.join("  |  ")).join("\n") : "No bookings yet.") +
    `\n\nPriority waitlist:\n` + ((waitlist || []).map((w) => `- ${w.Name || ""} ${w.Phone || w.Email || ""}${w.Reason ? ` (${w.Reason})` : ""}`).join("\n") || "None.") +
    (hasWaitlist ? `\n\n` + reasonKeyText() : "");

  return { subject, html, text };
}
module.exports = { renderRosterEmail };
