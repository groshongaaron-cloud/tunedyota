// netlify/functions/lib/reasons.js
// Single source of truth for the Priority-List `Reason` values + their plain-English
// meanings. These strings MUST match what's actually stored (book.js priority path
// + event-plan.js SWEEP_REASON) and SOP 5's Reason table. Used by BOTH the rebook
// reports (rebook-render.js) and the installer roster (roster-render.js) so the
// "Reason key" legend can never drift between surfaces.
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

const REASON_KEY = [
  ["Rebook — not completed", "Booked but not marked complete at the event — no-show or unfinished. Re-book them."],
  ["Event full", "Wanted a slot but the event was full — joined the waitlist."],
  ["No event scheduled", "Interested in a city with no event on the calendar yet."],
];

// Plain-text legend block (no surrounding blank lines — the caller spaces it).
function reasonKeyText() {
  return `REASON KEY:\n` + REASON_KEY.map(([r, m]) => `  • ${r} — ${m}`).join("\n");
}

// HTML legend block (a small heading + list). Muted so it reads as a footnote.
function reasonKeyHtml() {
  return `<h3 style="color:#5B4B42;margin:16px 0 4px">Reason key</h3>` +
    `<ul style="margin:2px 0 10px;font-size:13px;color:#7c8472">` +
    REASON_KEY.map(([r, m]) => `<li><strong style="color:#3A2E26">${esc(r)}</strong> — ${esc(m)}</li>`).join("") +
    `</ul>`;
}

module.exports = { REASON_KEY, reasonKeyText, reasonKeyHtml };
