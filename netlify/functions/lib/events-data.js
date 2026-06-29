// Baked event schedule — the booking functions' fallback source when no Google
// Sheet (EVENTS_SHEET_ID) is configured. Keyed by lowercase city. A configured
// Google Sheet overrides any city here. Keep the dates in sync with the
// `date:`/`event:` fields on MARKETS in site/find-your-exact-tune.html
// (those drive the event map). Dates use ISO YYYY-MM-DD.
module.exports = {
  "cedar rapids": { dateISO: "2026-06-27", label: "June 27, 2026", active: true, event: "Cedar Rapids, Iowa Summer 2026 OTT Event", details: "", address: "Iowa Off-Road and Suspension, 2109 N Towne Ln NE, Cedar Rapids, IA 52402" },
  "des moines":   { dateISO: "2026-06-28", label: "June 28, 2026", active: true, event: "Des Moines, Iowa Summer 2026 OTT Event", details: "", address: "Innovative AutoHous, 20 Northwest 54th Avenue, Des Moines, IA 50313" },
  "omaha":        { dateISO: "2026-06-28", label: "June 28, 2026", active: true, event: "Omaha, Nebraska Summer 2026 OTT Event", details: "", address: "To Be Released" },
  "twin cities":  { dateISO: "2026-06-20", label: "June 20, 2026", active: true, event: "Zeus Off-Road Event", details: "", address: "620 Southcross Dr. W., Burnsville, MN" },
  "rapid city":   { dateISO: "2026-07-16", label: "July 16, 2026", active: true, event: "Rapid City, South Dakota Summer 2026 OTT Event", details: "", address: "To Be Released" },
  "fargo":        { dateISO: "2026-07-03", label: "July 3, 2026",  active: true, event: "Fargo, North Dakota Summer 2026 OTT Event", details: "", address: "To Be Released" },
  "madison":      { dateISO: "2026-08-01", label: "August 1, 2026", active: true, event: "Madison, Wisconsin Summer 2026 OTT Event", details: "", address: "To Be Released" },
  "duluth":       { dateISO: "2026-07-25", label: "July 25, 2026", active: true, event: "Duluth, Minnesota Summer 2026 OTT Event", details: "", address: "To Be Released" },
  "green bay":    { dateISO: "2026-09-12", label: "September 12, 2026", active: true, event: "Green Bay, Wisconsin Fall 2026 OTT Event", details: "", address: "To Be Released" },
};
