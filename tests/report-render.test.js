const { test } = require("node:test");
const assert = require("node:assert/strict");
const { renderSlack, renderEmailHtml, renderContactsCsv } = require("../netlify/functions/lib/report-render.js");

const report = {
  generatedFor: { now: "2026-06-25T12:00:00Z", monthLabel: "2026-06" },
  rollup: { mtdTotal: 5, bookings: 4, priority: 1, leads: 0, deltaVsPriorWeek: 2, deltaVsLastMonth: 3, slotsFilled: 4, totalCapacity: 24, won: 1, lost: 1, open: 2, conversionPct: 50, avgDaysToCalibration: 6 },
  priorMonthClose: null,
  events: [{ city: "Omaha", state: "NE", dateISO: "2026-06-28", label: "June 28, 2026", installer: "noah", daysUntil: 3, past: false, capacity: 12, booked: 3, open: 9, fillPct: 25, newThisWeek: 1, pace: "slow", waitlist: 0, statusBreakdown: { completed: 1, noshow: 0, cancelled: 0, booked: 2 }, vehicles: [{ name: "Tacoma", count: 3 }], topSource: "ig", calibrationDates: ["2026-06-28"] }],
  byMarket: [{ name: "Omaha", count: 4 }], byInstaller: [{ name: "noah", count: 4 }], byVehicle: [{ name: "Tacoma", count: 4 }],
  attribution: { source: [{ name: "ig", count: 2 }], medium: [], campaign: [] },
  latentDemand: [{ city: "Boise", count: 1 }],
  closedRoster: [{ name: "Carl", installer: "noah", calibrationDate: "2026-06-20", vehicle: "Tacoma" }],
  actionItems: ["Slow fill: Omaha June 28, 2026 — 25% booked, 9 open, 3d out."],
  contacts: [{ createdDate: "2026-06-24", name: "Jane, Jr.", phone: "1", email: "a@x.com", city: "Omaha", state: "NE", vehicle: "Tacoma", goals: "Power", source: "find-your-exact-tune", utmSource: "ig", utmMedium: "", utmCampaign: "", installer: "noah", outcome: "Won", calibrationDate: "2026-06-28" }],
};

test("slack summary carries headline, event bar, action item", () => {
  const s = renderSlack(report);
  assert.match(s, /Submissions/);
  assert.match(s, /Omaha/);
  assert.match(s, /25%/);
  assert.match(s, /Slow fill/);
});
test("email html has each section heading", () => {
  const h = renderEmailHtml(report);
  for (const needle of ["Month-to-date", "Events", "Closed this", "Latent demand", "Action items", "Boise", "Carl"]) {
    assert.ok(h.includes(needle), `missing: ${needle}`);
  }
});
test("contacts csv has header, dedup row, and escapes commas", () => {
  const csv = renderContactsCsv(report);
  const lines = csv.trim().split("\n");
  assert.match(lines[0], /^Created Date,Name,Phone,Email,City,State,Vehicle,Goals,Source,UTM Source,UTM Medium,UTM Campaign,Installer,Outcome,Calibration Date$/);
  assert.equal(lines.length, 2);
  assert.match(lines[1], /"Jane, Jr."/);
});

const funnelReport = {
  ...report,
  funnel: { totalSessions: 4, steps: [
    { step: 0, name: "make", sessions: 4, dropPct: 0, overallPct: 100 },
    { step: 1, name: "model", sessions: 3, dropPct: 25, overallPct: 75 },
    { step: 2, name: "config", sessions: 1, dropPct: 67, overallPct: 25 },
    { step: 3, name: "goals", sessions: 1, dropPct: 0, overallPct: 25 },
    { step: 4, name: "result", sessions: 1, dropPct: 0, overallPct: 25 },
    { step: 5, name: "book", sessions: 1, dropPct: 0, overallPct: 25 },
    { step: 6, name: "outcome", sessions: 1, dropPct: 0, overallPct: 25 },
  ] },
};

test("renders funnel section in email + slack when present, biggest drop called out", () => {
  const h = renderEmailHtml(funnelReport);
  assert.ok(h.includes("Funnel (month-to-date)"), "email funnel heading");
  assert.ok(h.includes("Config") && h.includes("67%"), "email shows a drop");
  const s = renderSlack(funnelReport);
  assert.match(s, /Funnel \(MTD\): Make 4 → Model 3/);
  assert.match(s, /biggest drop Config −67%/);
});
test("omits funnel section when absent", () => {
  assert.ok(!renderEmailHtml(report).includes("Funnel (month-to-date)"));
  assert.ok(!/Funnel \(MTD\)/.test(renderSlack(report)));
});
