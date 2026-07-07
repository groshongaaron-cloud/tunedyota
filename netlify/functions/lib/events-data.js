// Baked event schedule — the booking functions' fallback source when no Google
// Sheet (EVENTS_SHEET_ID) is configured. Keyed by lowercase city. A configured
// Google Sheet overrides any city here. A city value may be a SINGLE event object
// OR an ARRAY of events (multi-date cities) — lib/events.js normalizes both, and
// the booking funnel shows a city's soonest date first with "next date" stepping.
// Keep dates in sync with the `date:`/`event:` fields on MARKETS in
// site/find-your-exact-tune.html (those drive the event map — set each pin to the
// city's SOONEST upcoming event). Dates use ISO YYYY-MM-DD.
//
// Season: mid-March → 2nd week of November. Shoulder-season dates (Mar–Apr, Oct–Nov)
// are reserved for the five priority markets — Twin Cities, Omaha, Iowa
// (Des Moines/Cedar Rapids/Davenport), Madison, Milwaukee — which each run ~3x/year.
module.exports = {
  "cedar rapids": [
    { dateISO: "2026-06-27", label: "June 27, 2026", active: false, event: "Cedar Rapids, Iowa Summer 2026 OTT Event", details: "", address: "Iowa Off-Road and Suspension, 2109 N Towne Ln NE, Cedar Rapids, IA 52402" },
    { dateISO: "2026-11-07", label: "November 7, 2026", active: true, event: "Cedar Rapids, Iowa Fall 2026 OTT Event", details: "", address: "To Be Released" },
    { dateISO: "2027-06-05", label: "June 5, 2027", active: true, event: "Cedar Rapids, Iowa Summer 2027 OTT Event", details: "", address: "To Be Released" },
  ],
  "des moines": [
    { dateISO: "2026-06-28", label: "June 28, 2026", active: false, event: "Des Moines, Iowa Summer 2026 OTT Event", details: "", address: "Innovative AutoHous, 20 Northwest 54th Avenue, Des Moines, IA 50313" },
    { dateISO: "2026-10-10", label: "October 10, 2026", active: true, event: "Des Moines, Iowa Fall 2026 OTT Event", details: "", address: "To Be Released" },
    { dateISO: "2027-04-17", label: "April 17, 2027", active: true, event: "Des Moines, Iowa Spring 2027 OTT Event", details: "", address: "To Be Released" },
    { dateISO: "2027-10-02", label: "October 2, 2027", active: true, event: "Des Moines, Iowa Fall 2027 OTT Event", details: "", address: "To Be Released" },
  ],
  "omaha": [
    { dateISO: "2026-06-28", label: "June 28, 2026", active: false, event: "Omaha, Nebraska Summer 2026 OTT Event", details: "", address: "7337 L St., Omaha, NE 68127" },
    { dateISO: "2026-09-19", label: "September 19, 2026", active: true, event: "Omaha, Nebraska Fall 2026 OTT Event", details: "", address: "To Be Released" },
    { dateISO: "2026-10-31", label: "October 31, 2026", active: true, event: "Omaha, Nebraska Fall 2026 OTT Event", details: "", address: "To Be Released" },
    { dateISO: "2027-03-27", label: "March 27, 2027", active: true, event: "Omaha, Nebraska Spring 2027 OTT Event", details: "", address: "To Be Released" },
    { dateISO: "2027-06-26", label: "June 26, 2027", active: true, event: "Omaha, Nebraska Summer 2027 OTT Event", details: "", address: "To Be Released" },
    { dateISO: "2027-10-09", label: "October 9, 2027", active: true, event: "Omaha, Nebraska Fall 2027 OTT Event", details: "", address: "To Be Released" },
  ],
  "twin cities": [
    { dateISO: "2026-06-20", label: "June 20, 2026", active: false, event: "Zeus Off-Road Event", details: "", address: "620 Southcross Dr. W., Burnsville, MN" },
    { dateISO: "2026-08-29", label: "August 29, 2026", active: true, event: "Twin Cities, Minnesota Summer 2026 OTT Event", details: "", address: "620 Southcross Dr. W., Burnsville, MN" },
    { dateISO: "2026-11-14", label: "November 14, 2026", active: true, event: "Twin Cities, Minnesota Fall 2026 OTT Event", details: "", address: "To Be Released" },
    { dateISO: "2027-03-13", label: "March 13, 2027", active: true, event: "Twin Cities, Minnesota Spring 2027 OTT Event", details: "", address: "To Be Released" },
    { dateISO: "2027-06-19", label: "June 19, 2027", active: true, event: "Twin Cities, Minnesota Summer 2027 OTT Event", details: "", address: "To Be Released" },
    { dateISO: "2027-11-13", label: "November 13, 2027", active: true, event: "Twin Cities, Minnesota Fall 2027 OTT Event", details: "", address: "To Be Released" },
  ],
  "rapid city": [
    { dateISO: "2026-07-16", label: "July 16, 2026", active: true, event: "Rapid City, South Dakota Summer 2026 OTT Event", details: "", address: "To Be Released" },
    { dateISO: "2027-07-17", label: "July 17, 2027", active: true, event: "Rapid City, South Dakota Summer 2027 OTT Event", details: "", address: "To Be Released" },
  ],
  "fargo": [
    { dateISO: "2026-07-03", label: "July 3, 2026", active: false, event: "Fargo, North Dakota Summer 2026 OTT Event", details: "", address: "1666 1st Avenue N., Fargo, ND 58102" },
    { dateISO: "2027-05-22", label: "May 22, 2027", active: true, event: "Fargo, North Dakota Spring 2027 OTT Event", details: "", address: "To Be Released" },
  ],
  "madison": [
    { dateISO: "2026-08-01", label: "August 1, 2026", active: true, event: "Madison, Wisconsin Summer 2026 OTT Event", details: "", address: "430 Commerce Drive, Madison, WI 53719" },
    { dateISO: "2026-10-17", label: "October 17, 2026", active: true, event: "Madison, Wisconsin Fall 2026 OTT Event", details: "", address: "To Be Released" },
    { dateISO: "2027-04-03", label: "April 3, 2027", active: true, event: "Madison, Wisconsin Spring 2027 OTT Event", details: "", address: "To Be Released" },
    { dateISO: "2027-07-10", label: "July 10, 2027", active: true, event: "Madison, Wisconsin Summer 2027 OTT Event", details: "", address: "To Be Released" },
    { dateISO: "2027-10-23", label: "October 23, 2027", active: true, event: "Madison, Wisconsin Fall 2027 OTT Event", details: "", address: "To Be Released" },
  ],
  "duluth": [
    { dateISO: "2026-07-25", label: "July 25, 2026", active: true, event: "Duluth, Minnesota Summer 2026 OTT Event", details: "", address: "4165 Loberg Avenue, Hermantown, MN 55811" },
    { dateISO: "2027-07-24", label: "July 24, 2027", active: true, event: "Duluth, Minnesota Summer 2027 OTT Event", details: "", address: "To Be Released" },
  ],
  "green bay": [
    { dateISO: "2026-09-12", label: "September 12, 2026", active: true, event: "Green Bay, Wisconsin Fall 2026 OTT Event", details: "", address: "To Be Released" },
    { dateISO: "2027-05-01", label: "May 1, 2027", active: true, event: "Green Bay, Wisconsin Spring 2027 OTT Event", details: "", address: "To Be Released" },
    { dateISO: "2027-09-11", label: "September 11, 2027", active: true, event: "Green Bay, Wisconsin 1-Year Anniversary OTT Event", details: "", address: "To Be Released" },
  ],
  "sioux falls": [
    { dateISO: "2026-08-15", label: "August 15, 2026", active: true, event: "Sioux Falls, South Dakota Summer 2026 OTT Event", details: "", address: "To Be Released" },
    { dateISO: "2027-05-15", label: "May 15, 2027", active: true, event: "Sioux Falls, South Dakota Spring 2027 OTT Event", details: "", address: "To Be Released" },
    { dateISO: "2027-09-25", label: "September 25, 2027", active: true, event: "Sioux Falls, South Dakota Fall 2027 OTT Event", details: "", address: "To Be Released" },
  ],
  "milwaukee": [
    { dateISO: "2026-08-22", label: "August 22, 2026", active: true, event: "Milwaukee, Wisconsin Summer 2026 OTT Event", details: "", address: "1350 N Port Washington Rd, Grafton, WI 53024" },
    { dateISO: "2026-10-24", label: "October 24, 2026", active: true, event: "Milwaukee, Wisconsin Fall 2026 OTT Event", details: "", address: "To Be Released" },
    { dateISO: "2027-03-20", label: "March 20, 2027", active: true, event: "Milwaukee, Wisconsin Spring 2027 OTT Event", details: "", address: "To Be Released" },
    { dateISO: "2027-06-12", label: "June 12, 2027", active: true, event: "Milwaukee, Wisconsin Summer 2027 OTT Event", details: "", address: "To Be Released" },
    { dateISO: "2027-10-16", label: "October 16, 2027", active: true, event: "Milwaukee, Wisconsin Fall 2027 OTT Event", details: "", address: "To Be Released" },
  ],
  "rochester": [
    { dateISO: "2026-09-26", label: "September 26, 2026", active: true, event: "Rochester, Minnesota Fall 2026 OTT Event", details: "", address: "To Be Released" },
    { dateISO: "2027-08-07", label: "August 7, 2027", active: true, event: "Rochester, Minnesota Summer 2027 OTT Event", details: "", address: "To Be Released" },
  ],
  "mankato":     { dateISO: "2027-08-08", label: "August 8, 2027", active: true, event: "Mankato, Minnesota Summer 2027 OTT Event", details: "", address: "To Be Released" },
  "davenport":   { dateISO: "2027-06-06", label: "June 6, 2027", active: true, event: "Davenport, Iowa Summer 2027 OTT Event", details: "", address: "To Be Released" },
  "sioux city":  { dateISO: "2027-06-27", label: "June 27, 2027", active: true, event: "Sioux City, Iowa Summer 2027 OTT Event", details: "", address: "To Be Released" },
  "eau claire":  { dateISO: "2027-08-14", label: "August 14, 2027", active: true, event: "Eau Claire, Wisconsin Summer 2027 OTT Event", details: "", address: "To Be Released" },
};
