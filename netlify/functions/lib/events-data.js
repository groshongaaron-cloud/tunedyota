// Baked event schedule — the booking functions' fallback source when no Google
// Sheet (EVENTS_SHEET_ID) is configured. Keyed by lowercase city. A configured
// Google Sheet overrides any city here. Keep the dates in sync with the
// `date:`/`event:` fields on MARKETS in site/find-your-exact-tune.html
// (those drive the event map). Dates use ISO YYYY-MM-DD.
module.exports = {
  "cedar rapids": { dateISO: "2026-06-27", label: "June 27, 2026", active: true, event: "", details: "" },
  "des moines":   { dateISO: "2026-06-28", label: "June 28, 2026", active: true, event: "", details: "" },
  "omaha":        { dateISO: "2026-06-28", label: "June 28, 2026", active: true, event: "", details: "" },
  "twin cities":  { dateISO: "2026-06-20", label: "June 20, 2026", active: true, event: "Zeus Off-Road Event", details: "" },
  "rapid city":   { dateISO: "2026-07-16", label: "July 16, 2026", active: true, event: "", details: "" },
  "fargo":        { dateISO: "2026-07-03", label: "July 3, 2026",  active: true, event: "", details: "" },
  "madison":      { dateISO: "2026-07-18", label: "July 18, 2026", active: true, event: "", details: "" },
  "duluth":       { dateISO: "2026-07-25", label: "July 25, 2026", active: true, event: "", details: "" },
};
