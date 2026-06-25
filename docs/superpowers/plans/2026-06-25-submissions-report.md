# Submissions Reporting Bundle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A weekly automated digest (Slack summary + emailed full report + `contacts.csv`) that carves each event into a success section, rolls up into a month-to-date submissions total, tracks won/lost-by-whom-when, and exports contacts.

**Architecture:** Fetch (Airtable, paginated) → pure `report-metrics.buildReport()` → pure `report-render` (Slack text / email HTML / CSV) → deliver (`notifyOwner` + `sendEmail`). Pure core = fully unit-testable without network. Scheduled via `netlify.toml`.

**Tech Stack:** Node CommonJS, Netlify scheduled functions, Airtable REST, Resend, Slack webhook, `node:test`.

---

## File Structure

- `netlify/functions/lib/airtable.js` — add `listAllRecords()` (pagination).
- `netlify/functions/lib/report-metrics.js` *(new)* — pure `buildReport()`.
- `netlify/functions/lib/report-render.js` *(new)* — pure `renderSlack`/`renderEmailHtml`/`renderContactsCsv`.
- `netlify/functions/lib/report-sources.js` *(new)* — builds the `eventsList` (city/state/dateISO/label/installerKey) from `events-data.js` + `markets.js` + `routing.js`, and normalizes Airtable records to flat field objects.
- `netlify/functions/submissions-report.js` *(new, scheduled)* — wiring + delivery.
- `netlify.toml` — weekly schedule.
- Tests: `tests/airtable.test.js`, `tests/report-metrics.test.js` *(new)*, `tests/report-render.test.js` *(new)*, `tests/submissions-report.test.js` *(new)*.

**Branching:** `feat/submissions-report` off `master`. Commit the spec + this plan first.

---

### Task 0: Branch + docs

- [ ] **Step 1: Branch off master and commit the design docs**

```bash
git checkout master
git checkout -b feat/submissions-report
git add docs/superpowers/specs/2026-06-25-submissions-report-design.md docs/superpowers/plans/2026-06-25-submissions-report.md
git commit -m "docs: spec + plan for submissions reporting bundle"
```

---

### Task 1: Paginated Airtable list

**Files:** Modify `netlify/functions/lib/airtable.js`; Test `tests/airtable.test.js`.

- [ ] **Step 1: Write the failing test** (append to `tests/airtable.test.js`)

```js
test("listAllRecords follows offset across pages", async () => {
  const pages = [
    { records: [{ id: "a", fields: { Name: "A" } }], offset: "p2" },
    { records: [{ id: "b", fields: { Name: "B" } }] },
  ];
  let call = 0;
  const fetchImpl = async (url) => {
    const body = pages[call++];
    return { ok: true, json: async () => body };
  };
  const { listAllRecords } = require("../netlify/functions/lib/airtable.js");
  const recs = await listAllRecords({ fetchImpl, token: "t", baseId: "b", table: "Bookings" });
  assert.equal(recs.length, 2);
  assert.equal(recs[0].id, "a");
  assert.equal(recs[1].fields.Name, "B");
  assert.equal(call, 2);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/airtable.test.js`
Expected: FAIL — `listAllRecords is not a function`.

- [ ] **Step 3: Implement** — add before `module.exports` in `airtable.js`, and export it:

```js
async function listAllRecords({ fetchImpl = fetch, token, baseId, table, pageSize = 100 }) {
  const out = [];
  let offset;
  do {
    const params = new URLSearchParams({ pageSize: String(pageSize) });
    if (offset) params.set("offset", offset);
    const url = `${API}/${baseId}/${encodeURIComponent(table)}?${params.toString()}`;
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`airtable listAll ${res.status}`);
    const j = await res.json();
    out.push(...(j.records || []));
    offset = j.offset;
  } while (offset);
  return out;
}
```
and update exports:
```js
module.exports = { cfg, listRecords, createRecord, updateRecord, listAllRecords };
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/airtable.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/airtable.js tests/airtable.test.js
git commit -m "feat(airtable): listAllRecords with offset pagination"
```

---

### Task 2: Report sources (events list + record normalization)

**Files:** Create `netlify/functions/lib/report-sources.js`; Test in `tests/report-metrics.test.js` (shared file, first block).

- [ ] **Step 1: Write the failing test** (`tests/report-metrics.test.js`, top of file)

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { eventsList, flattenRecords } = require("../netlify/functions/lib/report-sources.js");

test("eventsList joins events-data with state + installer", () => {
  const list = eventsList();
  const tc = list.find((e) => e.city === "Twin Cities");
  assert.ok(tc, "Twin Cities present");
  assert.equal(tc.dateISO, "2026-06-20");
  assert.ok(tc.state && tc.installerKey, "has state + installerKey");
});
test("flattenRecords lifts fields + createdTime", () => {
  const flat = flattenRecords([{ id: "r1", createdTime: "2026-06-20T00:00:00Z", fields: { Name: "Jane", City: "Omaha" } }]);
  assert.equal(flat[0].Name, "Jane");
  assert.equal(flat[0].createdTime, "2026-06-20T00:00:00Z");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/report-metrics.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (`netlify/functions/lib/report-sources.js`)

```js
const EVENTS = require("./events-data.js");
const { MARKETS } = require("./markets.js");

// title-case the lowercase event keys ("twin cities" -> "Twin Cities")
function titleCase(s) { return s.replace(/\b\w/g, (c) => c.toUpperCase()); }

// city (lowercase) -> { state, inst } from MARKETS
function marketIndex() {
  const ix = {};
  for (const m of MARKETS) ix[m.city.toLowerCase()] = { state: m.state, inst: m.inst };
  return ix;
}

function eventsList() {
  const ix = marketIndex();
  return Object.entries(EVENTS).map(([key, ev]) => {
    const m = ix[key] || {};
    return { city: titleCase(key), state: m.state || "", dateISO: ev.dateISO, label: ev.label, installerKey: m.inst || "", active: ev.active !== false };
  });
}

function flattenRecords(records) {
  return (records || []).map((r) => ({ ...r.fields, id: r.id, createdTime: r.createdTime }));
}

module.exports = { eventsList, flattenRecords };
```

- [ ] **Step 4: Run to verify pass** (these two tests)

Run: `node --test tests/report-metrics.test.js`
Expected: the two new tests PASS (others not yet written).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/report-sources.js tests/report-metrics.test.js
git commit -m "feat(report): event list + record normalization helpers"
```

---

### Task 3: Metrics core (`buildReport`)

**Files:** Create `netlify/functions/lib/report-metrics.js`; Test append to `tests/report-metrics.test.js`.

- [ ] **Step 1: Write the failing tests** (append to `tests/report-metrics.test.js`)

```js
const { buildReport } = require("../netlify/functions/lib/report-metrics.js");

const EVTS = [
  { city: "Omaha", state: "NE", dateISO: "2026-06-28", label: "June 28, 2026", installerKey: "noah" },
  { city: "Fargo", state: "ND", dateISO: "2026-07-03", label: "July 3, 2026", installerKey: "cody" },
];
// now = 2026-06-25; Omaha is in 3 days, Fargo in 8.
const NOW = new Date("2026-06-25T12:00:00Z");
function bk(o) { return { City: "Omaha", "Event Date": "2026-06-28", Slot: "9:00", Name: "A", Phone: "1", Email: "a@x.com", Vehicle: "Tacoma", Installer: "noah", Status: "Booked", Source: "find-your-exact-tune", createdTime: "2026-06-24T00:00:00Z", ...o }; }

test("rollup totals + per-event fill + pace", () => {
  const bookings = [bk({}), bk({ Slot: "9:20", Email: "b@x.com" }), bk({ Slot: "9:40", Email: "c@x.com", Status: "Completed", "Calibration Date": "2026-06-28" })];
  const r = buildReport({ bookings, priority: [], leads: [], events: EVTS, capacity: 12, now: NOW });
  const omaha = r.events.find((e) => e.city === "Omaha");
  assert.equal(omaha.booked, 3);          // none cancelled
  assert.equal(omaha.open, 9);
  assert.equal(omaha.fillPct, 25);
  assert.equal(omaha.pace, "slow");       // 3 days out, <50%
  assert.equal(r.rollup.bookings, 3);
  assert.equal(r.rollup.won, 1);          // one Completed
});
test("cancelled slot frees capacity; won/lost/conversion", () => {
  const bookings = [bk({ Status: "Cancelled" }), bk({ Slot: "9:20", Status: "Completed", "Calibration Date": "2026-06-28" }), bk({ Slot: "9:40", Status: "No-show" })];
  const r = buildReport({ bookings, priority: [], leads: [], events: EVTS, capacity: 12, now: NOW });
  const omaha = r.events.find((e) => e.city === "Omaha");
  assert.equal(omaha.booked, 2);          // cancelled not counted
  assert.equal(r.rollup.won, 1);
  assert.equal(r.rollup.lost, 2);         // cancelled + no-show
  assert.equal(r.rollup.conversionPct, 33); // 1/(1+2)
});
test("latent demand from no-event priority; closed roster", () => {
  const priority = [{ City: "Boise", Name: "Z", Reason: "No event scheduled", Installer: "aaron", createdTime: "2026-06-24T00:00:00Z" }];
  const bookings = [bk({ Status: "Completed", "Calibration Date": "2026-06-20", Name: "Closed Carl", Installer: "noah" })];
  const r = buildReport({ bookings, priority, leads: [], events: EVTS, capacity: 12, now: NOW });
  assert.equal(r.latentDemand[0].city, "Boise");
  assert.equal(r.closedRoster[0].name, "Closed Carl");
  assert.equal(r.closedRoster[0].installer, "noah");
  assert.equal(r.closedRoster[0].calibrationDate, "2026-06-20");
});
test("contacts deduped by email then phone, newest wins", () => {
  const bookings = [
    bk({ Email: "dup@x.com", Name: "Old", createdTime: "2026-06-01T00:00:00Z" }),
    bk({ Email: "dup@x.com", Name: "New", createdTime: "2026-06-24T00:00:00Z" }),
  ];
  const r = buildReport({ bookings, priority: [], leads: [], events: EVTS, capacity: 12, now: NOW });
  const dups = r.contacts.filter((c) => c.email === "dup@x.com");
  assert.equal(dups.length, 1);
  assert.equal(dups[0].name, "New");
});
test("prior-month close emitted only early in month", () => {
  const early = buildReport({ bookings: [], priority: [], leads: [], events: EVTS, capacity: 12, now: new Date("2026-07-03T12:00:00Z") });
  assert.ok(early.priorMonthClose, "emitted on day 3");
  const mid = buildReport({ bookings: [], priority: [], leads: [], events: EVTS, capacity: 12, now: new Date("2026-07-20T12:00:00Z") });
  assert.equal(mid.priorMonthClose, null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/report-metrics.test.js`
Expected: FAIL — `buildReport` not found.

- [ ] **Step 3: Implement** (`netlify/functions/lib/report-metrics.js`)

```js
// Pure metrics. Inputs are flat field objects (each carries createdTime).
const ACTIVE = (b) => String(b.Status || "Booked") !== "Cancelled";
const DAY = 86400000;

function dnum(iso) { return iso ? new Date(iso).getTime() : NaN; }
function daysBetween(a, b) { return Math.round((b - a) / DAY); }
function monthKey(d) { return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; }
function inRange(iso, lo, hi) { const t = dnum(iso); return t >= lo && t < hi; }
function tally(arr, keyFn) {
  const m = new Map();
  for (const x of arr) { const k = keyFn(x); if (!k) continue; m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}
function topKey(arr, keyFn) { const t = tally(arr, keyFn); return t.length ? t[0].name : ""; }

function contactRow(x, outcome) {
  return {
    createdDate: (x.createdTime || "").slice(0, 10),
    name: x.Name || "", phone: x.Phone || "", email: x.Email || "",
    city: x.City || x.market || "", state: x.State || "",
    vehicle: x.Vehicle || "", goals: x.Goals || "",
    source: x.Source || x.source || "", utmSource: x["UTM Source"] || "",
    utmMedium: x["UTM Medium"] || "", utmCampaign: x["UTM Campaign"] || "",
    installer: x.Installer || "", outcome, calibrationDate: x["Calibration Date"] || "",
  };
}
function outcomeOf(b) { const s = String(b.Status || "Booked"); return s === "Completed" ? "Won" : (s === "No-show" || s === "Cancelled") ? "Lost" : "Open"; }

function buildReport({ bookings = [], priority = [], leads = [], events = [], capacity = 12, now }) {
  const nowT = now.getTime();
  const mk = monthKey(now);
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const lastMonthStart = lastMonth.getTime();
  const lastMonthSameDay = Date.UTC(lastMonth.getUTCFullYear(), lastMonth.getUTCMonth(), now.getUTCDate() + 1);

  const all = [...bookings, ...priority, ...leads];
  const mtd = (x) => dnum(x.createdTime) >= monthStart;
  const submissionsMTD = all.filter(mtd);
  const bookingsMTD = bookings.filter(mtd);

  // deltas
  const last7 = all.filter((x) => inRange(x.createdTime, nowT - 7 * DAY, nowT)).length;
  const prev7 = all.filter((x) => inRange(x.createdTime, nowT - 14 * DAY, nowT - 7 * DAY)).length;
  const lastMonthToDate = all.filter((x) => inRange(x.createdTime, lastMonthStart, lastMonthSameDay)).length;

  // won/lost/open (MTD bookings)
  const won = bookingsMTD.filter((b) => outcomeOf(b) === "Won").length;
  const lost = bookingsMTD.filter((b) => outcomeOf(b) === "Lost").length;
  const open = bookingsMTD.filter((b) => outcomeOf(b) === "Open").length;
  const conversionPct = (won + lost) ? Math.round((won / (won + lost)) * 100) : 0;
  const calDays = bookings.filter((b) => b.Status === "Completed" && b["Calibration Date"])
    .map((b) => daysBetween(dnum(b.createdTime), dnum(b["Calibration Date"]))).filter((n) => !isNaN(n));
  const avgDaysToCalibration = calDays.length ? Math.round(calDays.reduce((a, b) => a + b, 0) / calDays.length) : null;

  // per-event
  const startToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const eventRows = events.map((ev) => {
    const evT = dnum(ev.dateISO);
    const past = evT < startToday;
    const evBookings = bookings.filter((b) => b.City === ev.city && b["Event Date"] === ev.dateISO);
    const live = evBookings.filter(ACTIVE);
    const booked = live.length;
    const openSlots = Math.max(0, capacity - booked);
    const fillPct = Math.round((booked / capacity) * 100);
    const daysUntil = daysBetween(startToday, evT);
    const pace = past ? "past" : openSlots === 0 ? "full" : (daysUntil <= 7 && fillPct < 50) ? "slow" : "on-track";
    const newThisWeek = evBookings.filter((b) => inRange(b.createdTime, nowT - 7 * DAY, nowT)).length;
    const wl = priority.filter((p) => p.City === ev.city && p.Reason === "Event full").length;
    const sb = { completed: 0, noshow: 0, cancelled: 0, booked: 0 };
    for (const b of evBookings) { const s = String(b.Status || "Booked"); if (s === "Completed") sb.completed++; else if (s === "No-show") sb.noshow++; else if (s === "Cancelled") sb.cancelled++; else sb.booked++; }
    return {
      city: ev.city, state: ev.state, dateISO: ev.dateISO, label: ev.label, installer: ev.installerKey,
      daysUntil, past, capacity, booked, open: openSlots, fillPct, newThisWeek, pace,
      waitlist: wl, statusBreakdown: sb, vehicles: tally(evBookings, (b) => b.Vehicle),
      topSource: topKey(evBookings, (b) => b["UTM Source"]),
      calibrationDates: evBookings.filter((b) => b["Calibration Date"]).map((b) => b["Calibration Date"]),
    };
  }).filter((e) => !e.past || monthKey(new Date(e.dateISO)) === mk); // upcoming OR completed-this-month

  // closed roster (Completed with Calibration Date this month)
  const closedRoster = bookings
    .filter((b) => b.Status === "Completed" && b["Calibration Date"] && monthKey(new Date(b["Calibration Date"])) === mk)
    .map((b) => ({ name: b.Name || "", installer: b.Installer || "", calibrationDate: b["Calibration Date"], vehicle: b.Vehicle || "" }));

  // contacts (dedup by email then phone, newest wins)
  const rows = [
    ...bookings.map((b) => contactRow(b, outcomeOf(b))),
    ...priority.map((p) => contactRow(p, "Open")),
    ...leads.map((l) => contactRow(l, "Open")),
  ].sort((a, b) => (b.createdDate || "").localeCompare(a.createdDate || ""));
  const seen = new Set(); const contacts = [];
  for (const r of rows) { const key = (r.email || r.phone || "").toLowerCase(); if (!key) { contacts.push(r); continue; } if (seen.has(key)) continue; seen.add(key); contacts.push(r); }

  // latent demand
  const latentDemand = tally(priority.filter((p) => p.Reason === "No event scheduled"), (p) => p.City)
    .map((x) => ({ city: x.name, count: x.count }));

  // action items
  const actionItems = [];
  for (const e of eventRows) {
    if (e.pace === "slow") actionItems.push(`Slow fill: ${e.city} ${e.label} — ${e.fillPct}% booked, ${e.open} open, ${e.daysUntil}d out.`);
    if (e.pace === "full" && e.waitlist > 0) actionItems.push(`${e.city} ${e.label} FULL with ${e.waitlist} on the waitlist — consider more capacity.`);
  }
  for (const c of latentDemand) actionItems.push(`Latent demand: ${c.count} waiting in ${c.city} (no event scheduled) — candidate market to book.`);
  const failedEmail = bookings.filter((b) => b["Email Status"] === "FAILED").length;
  if (failedEmail) actionItems.push(`${failedEmail} booking(s) flagged Email Status=FAILED — reach those customers manually.`);
  const completedNoDate = bookings.filter((b) => b.Status === "Completed" && !b["Calibration Date"]).length;
  if (completedNoDate) actionItems.push(`${completedNoDate} Completed booking(s) missing Calibration Date — fill in for accurate closed-loop.`);

  const priorMonthClose = now.getUTCDate() <= 7 ? (() => {
    const pmk = monthKey(lastMonth);
    const pm = bookings.filter((b) => monthKey(new Date(b.createdTime)) === pmk);
    return { monthLabel: pmk, total: all.filter((x) => monthKey(new Date(x.createdTime)) === pmk).length,
      won: pm.filter((b) => outcomeOf(b) === "Won").length, lost: pm.filter((b) => outcomeOf(b) === "Lost").length };
  })() : null;

  const slotsFilled = eventRows.reduce((a, e) => a + e.booked, 0);

  return {
    generatedFor: { now: now.toISOString(), monthLabel: mk },
    rollup: {
      mtdTotal: submissionsMTD.length, bookings: bookingsMTD.length,
      priority: priority.filter(mtd).length, leads: leads.filter(mtd).length,
      deltaVsPriorWeek: last7 - prev7, deltaVsLastMonth: submissionsMTD.length - lastMonthToDate,
      slotsFilled, totalCapacity: eventRows.length * capacity,
      won, lost, open, conversionPct, avgDaysToCalibration,
    },
    priorMonthClose,
    events: eventRows,
    byMarket: tally(bookings, (b) => b.City),
    byInstaller: tally(bookings, (b) => b.Installer),
    byVehicle: tally(bookings, (b) => b.Vehicle),
    attribution: { source: tally(bookings, (b) => b["UTM Source"]), medium: tally(bookings, (b) => b["UTM Medium"]), campaign: tally(bookings, (b) => b["UTM Campaign"]) },
    latentDemand, closedRoster, actionItems, contacts,
  };
}

module.exports = { buildReport, outcomeOf };
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/report-metrics.test.js`
Expected: PASS (all blocks).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/report-metrics.js tests/report-metrics.test.js
git commit -m "feat(report): pure buildReport metrics (rollup, events, closed-loop, contacts)"
```

---

### Task 4: Renderers (Slack / email HTML / CSV)

**Files:** Create `netlify/functions/lib/report-render.js`; Test `tests/report-render.test.js`.

- [ ] **Step 1: Write the failing test** (`tests/report-render.test.js`)

```js
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
  assert.match(lines[1], /"Jane, Jr."/); // comma-containing field quoted
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/report-render.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (`netlify/functions/lib/report-render.js`)

```js
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function bar(pct) { const n = Math.round(pct / 100 * 12); return "▓".repeat(n) + "░".repeat(12 - n); }
function sign(n) { return (n > 0 ? "+" : "") + n; }

function renderSlack(r) {
  const ro = r.rollup;
  const lines = [];
  lines.push(`*Tuned Yota — Submissions Digest* (${r.generatedFor.monthLabel}, week of ${r.generatedFor.now.slice(0, 10)})`);
  lines.push(`MTD submissions: *${ro.mtdTotal}* (Δwk ${sign(ro.deltaVsPriorWeek)}, Δmo ${sign(ro.deltaVsLastMonth)}) · Slots ${ro.slotsFilled}/${ro.totalCapacity} · Won ${ro.won} / Lost ${ro.lost} / Open ${ro.open} (${ro.conversionPct}% conv)`);
  for (const e of r.events) {
    lines.push(`• ${e.city} ${e.label} [${bar(e.fillPct)}] ${e.booked}/${e.capacity} (${e.fillPct}%) ${e.past ? "past" : e.daysUntil + "d"} ${e.pace.toUpperCase()}${e.waitlist ? ` · wl ${e.waitlist}` : ""}${e.newThisWeek ? ` · +${e.newThisWeek} wk` : ""}`);
  }
  if (r.actionItems.length) { lines.push("*Action items:*"); for (const a of r.actionItems.slice(0, 5)) lines.push(`  – ${a}`); }
  lines.push(`Contacts on file: ${r.contacts.length}${r.contactsEmailFailed ? " (CSV email failed — domain pending)" : " (full report + contacts.csv emailed)"}`);
  return lines.join("\n");
}

function table(rows) { return `<table style="border-collapse:collapse;font-size:14px;margin:6px 0">${rows.map((r) => `<tr>${r.map((c) => `<td style="padding:3px 12px 3px 0">${c}</td>`).join("")}</tr>`).join("")}</table>`; }
function h2(t) { return `<h2 style="font-family:Arial;color:#5B4B42;margin:18px 0 4px">${t}</h2>`; }

function renderEmailHtml(r) {
  const ro = r.rollup;
  let html = `<div style="font-family:Arial,sans-serif;color:#3A2E26;max-width:680px">`;
  html += `<h1 style="color:#3A2E26">Tuned Yota — Submissions Digest</h1>`;
  html += `<p style="color:#7c8472">${esc(r.generatedFor.monthLabel)} · week of ${esc(r.generatedFor.now.slice(0, 10))}</p>`;
  html += h2("Month-to-date");
  html += table([
    ["Submissions", `${ro.mtdTotal} (Δwk ${sign(ro.deltaVsPriorWeek)}, Δmo ${sign(ro.deltaVsLastMonth)})`],
    ["Slots filled", `${ro.slotsFilled} / ${ro.totalCapacity}`],
    ["Won / Lost / Open", `${ro.won} / ${ro.lost} / ${ro.open} (${ro.conversionPct}% conversion)`],
    ["Avg days to calibration", ro.avgDaysToCalibration == null ? "—" : String(ro.avgDaysToCalibration)],
  ]);
  if (r.priorMonthClose) html += `<p><strong>${esc(r.priorMonthClose.monthLabel)} final:</strong> ${r.priorMonthClose.total} submissions · Won ${r.priorMonthClose.won} / Lost ${r.priorMonthClose.lost}</p>`;
  html += h2("Events");
  for (const e of r.events) {
    html += `<div style="border:1px solid #eee;border-radius:8px;padding:8px 12px;margin:8px 0">`;
    html += `<strong>${esc(e.city)}, ${esc(e.state)} · ${esc(e.label)} · ${esc(e.installer)}</strong> — ${e.past ? "past" : e.daysUntil + " days"} · <strong>${e.pace}</strong><br>`;
    html += `Fill ${e.booked}/${e.capacity} (${e.fillPct}%) · ${e.open} open · +${e.newThisWeek} this week · waitlist ${e.waitlist}<br>`;
    html += `Post-event: Completed ${e.statusBreakdown.completed} · No-show ${e.statusBreakdown.noshow} · Cancelled ${e.statusBreakdown.cancelled}<br>`;
    html += `Vehicles: ${esc(e.vehicles.map((v) => `${v.count} ${v.name}`).join(" · ") || "—")} · Top source: ${esc(e.topSource || "—")}`;
    html += `</div>`;
  }
  html += h2("Closed this period");
  html += r.closedRoster.length ? table(r.closedRoster.map((c) => [esc(c.name), esc(c.installer), esc(c.calibrationDate), esc(c.vehicle)])) : "<p>—</p>";
  html += h2("By market / installer / vehicle");
  html += table([
    ["Markets", esc(r.byMarket.map((x) => `${x.name} (${x.count})`).join(" · "))],
    ["Installers", esc(r.byInstaller.map((x) => `${x.name} (${x.count})`).join(" · "))],
    ["Vehicles", esc(r.byVehicle.map((x) => `${x.name} (${x.count})`).join(" · "))],
  ]);
  html += h2("Latent demand");
  html += r.latentDemand.length ? table(r.latentDemand.map((x) => [esc(x.city), `${x.count} waiting`])) : "<p>—</p>";
  html += h2("Action items");
  html += r.actionItems.length ? `<ul>${r.actionItems.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : "<p>None 🎉</p>";
  html += `<p style="color:#7c8472;margin-top:18px">Contacts attached: contacts.csv (${r.contacts.length} rows).</p>`;
  html += `</div>`;
  return html;
}

function csvCell(v) { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function renderContactsCsv(r) {
  const head = ["Created Date", "Name", "Phone", "Email", "City", "State", "Vehicle", "Goals", "Source", "UTM Source", "UTM Medium", "UTM Campaign", "Installer", "Outcome", "Calibration Date"];
  const lines = [head.join(",")];
  for (const c of r.contacts) {
    lines.push([c.createdDate, c.name, c.phone, c.email, c.city, c.state, c.vehicle, c.goals, c.source, c.utmSource, c.utmMedium, c.utmCampaign, c.installer, c.outcome, c.calibrationDate].map(csvCell).join(","));
  }
  return lines.join("\n") + "\n";
}

module.exports = { renderSlack, renderEmailHtml, renderContactsCsv };
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/report-render.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/report-render.js tests/report-render.test.js
git commit -m "feat(report): Slack/email-HTML/CSV renderers"
```

---

### Task 5: Scheduled function + delivery

**Files:** Create `netlify/functions/submissions-report.js`; Modify `netlify.toml`; Test `tests/submissions-report.test.js`.

- [ ] **Step 1: Write the failing test** (`tests/submissions-report.test.js`)

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runReport } = require("../netlify/functions/submissions-report.js");

function deps(overrides = {}) {
  const notifies = [], sends = [];
  const bookings = { records: [{ id: "b1", createdTime: "2026-06-24T00:00:00Z", fields: { City: "Omaha", "Event Date": "2026-06-28", Slot: "9:00", Name: "A", Email: "a@x.com", Installer: "noah", Status: "Booked", Vehicle: "Tacoma" } }] };
  const priority = { records: [] };
  return {
    env: { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", SLACK_WEBHOOK_URL: "https://hooks.slack.test/x", RESEND_API_KEY: "re", REPORT_TO: "info@tunedyota.com" },
    now: new Date("2026-06-25T12:00:00Z"),
    listAll: async ({ table }) => (table === "Bookings" ? bookings.records : priority.records),
    notify: async (a) => { notifies.push(a); return { ok: true }; },
    send: async (a) => { sends.push(a); return { id: "e" }; },
    log: { warn() {}, error() {} },
    _notifies: notifies, _sends: sends,
    ...overrides,
  };
}

test("delivers Slack summary + email with contacts.csv attachment", async () => {
  const d = deps();
  await runReport(d);
  assert.equal(d._notifies.length, 1);
  assert.match(d._notifies[0].text, /Submissions Digest/);
  assert.equal(d._sends.length, 1);
  const att = d._sends[0].attachments[0];
  assert.equal(att.filename, "contacts.csv");
  assert.ok(att.content && att.content.length > 0); // base64
});
test("email failure appends a Slack note and does not throw", async () => {
  const d = deps({ send: async () => { throw new Error("Resend 403"); } });
  await runReport(d);
  assert.equal(d._notifies.length, 1);
  assert.match(d._notifies[0].text, /email failed/i);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/submissions-report.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (`netlify/functions/submissions-report.js`)

```js
const { cfg, listAllRecords } = require("./lib/airtable.js");
const { sendEmail } = require("./lib/resend.js");
const { notifyOwner } = require("./lib/alert.js");
const { eventsList, flattenRecords } = require("./lib/report-sources.js");
const { buildReport } = require("./lib/report-metrics.js");
const { renderSlack, renderEmailHtml, renderContactsCsv } = require("./lib/report-render.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";

async function runReport(deps) {
  const { env = process.env, now = new Date(), fetchImpl = fetch,
          listAll = (a) => listAllRecords({ fetchImpl, ...a }),
          notify = notifyOwner, send = sendEmail, log = console } = deps;
  const c = cfg(env);
  const [bRecs, pRecs] = await Promise.all([
    listAll({ token: c.token, baseId: c.baseId, table: c.bookings }),
    listAll({ token: c.token, baseId: c.baseId, table: c.priority }),
  ]);
  const report = buildReport({
    bookings: flattenRecords(bRecs), priority: flattenRecords(pRecs), leads: [],
    events: eventsList(), capacity: 12, now,
  });

  const csv = renderContactsCsv(report);
  let emailFailed = false;
  try {
    await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: env.REPORT_TO || "info@tunedyota.com",
      subject: `Tuned Yota — Submissions Digest (${report.generatedFor.monthLabel})`,
      html: renderEmailHtml(report),
      attachments: [{ filename: "contacts.csv", content: Buffer.from(csv).toString("base64") }] });
  } catch (e) { emailFailed = true; if (log.error) log.error("report email", e.message); }

  report.contactsEmailFailed = emailFailed;
  let slack = renderSlack(report);
  if (emailFailed) slack += `\n(full report email failed — domain pending verification)`;
  try { await notify({ fetchImpl, webhookUrl: env.SLACK_WEBHOOK_URL, text: slack, log }); }
  catch (e) { if (log.error) log.error("report slack", e.message); }
  return { ok: true, emailFailed };
}

async function handler() { const r = await runReport({}); return { statusCode: 200, body: JSON.stringify(r) }; }
module.exports = { handler, runReport };
```

Note: `renderSlack` reads `report.contactsEmailFailed`; set it before rendering. Adjust order — set `report.contactsEmailFailed = emailFailed;` BEFORE `renderSlack(report)` (as written above the slack render uses it; the extra appended line is belt-and-suspenders). Keep both: the flag drives the contacts line, the appended line is explicit.

- [ ] **Step 4: Schedule it** — append to `netlify.toml`:

```toml
# Weekly submissions digest (netlify/functions/submissions-report.js).
[functions."submissions-report"]
  schedule = "0 13 * * 1"
```

- [ ] **Step 5: Run to verify pass**

Run: `node --test tests/submissions-report.test.js`
Expected: PASS (2).

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/submissions-report.js netlify.toml tests/submissions-report.test.js
git commit -m "feat(report): weekly scheduled submissions digest (Slack + emailed CSV)"
```

---

### Task 6: Full verification + ship checkpoint

- [ ] **Step 1: Full suite** — Run: `npm test` — Expected: all pass.
- [ ] **Step 2: Local smoke of the real fetch path** (optional, reads live Airtable):

```bash
node -e "const{runReport}=require('./netlify/functions/submissions-report.js');const{execSync}=require('child_process');const tok=JSON.parse(execSync('npx netlify env:get AIRTABLE_TOKEN --json').toString()).AIRTABLE_TOKEN;const base=JSON.parse(execSync('npx netlify env:get AIRTABLE_BASE_ID --json').toString()).AIRTABLE_BASE_ID;runReport({env:{AIRTABLE_TOKEN:tok,AIRTABLE_BASE_ID:base},now:new Date(),notify:async(a)=>console.log('--- SLACK ---\n'+a.text),send:async()=>{throw new Error('skip email in smoke')},log:console}).then(r=>console.log('\n=>',r))"
```
Expected: prints a real Slack-format digest from live Bookings/Priority (email intentionally skipped).

- [ ] **Step 3: STOP — ship checkpoint.** Do NOT push. Report to owner: confirm `SLACK_WEBHOOK_URL` set, `Calibration Date` column added to `Bookings`; then merge `feat/submissions-report` → `master` + push (per `ship` skill). Slack digest works immediately; emailed CSV activates once Resend domain verifies.

---

## Self-Review

**Spec coverage:** weekly scheduled fn (Task 5 + netlify.toml) ✓; per-event success sections (Task 3 eventRows, Task 4 render) ✓; MTD rollup + deltas + prior-month close (Task 3) ✓; closed-loop won/lost/by-whom/when via Status+Installer+Calibration Date (Task 3 outcomeOf/closedRoster) ✓; contacts CSV dedup + escaping + attachment (Tasks 3/4/5) ✓; cross-cutting + latent demand + action items incl. Email Status=FAILED (Task 3) ✓; Slack-now / email-on-DNS with failure note (Task 5) ✓; paginated fetch (Task 1) ✓; Calibration Date prerequisite (checkpoint Task 6) ✓.

**Placeholder scan:** none — full code in every step.

**Type/name consistency:** `buildReport`, `eventsList`, `flattenRecords`, `listAllRecords`, `renderSlack/renderEmailHtml/renderContactsCsv`, `runReport`, report fields (`rollup`, `events`, `closedRoster`, `latentDemand`, `contacts`, `contactsEmailFailed`) consistent across Tasks 3–5 and tests. `outcomeOf` defined+exported in Task 3, used internally. Attachment shape `{filename,content}` matches `resend.js`/book.js usage.
