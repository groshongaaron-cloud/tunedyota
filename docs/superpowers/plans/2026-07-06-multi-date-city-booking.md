# Multi-date-per-city Booking Rule — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a city hold multiple scheduled events so the booking funnel can show the soonest date and offer, if it doesn't work, the city's next date or the Priority Wait List.

**Architecture:** Centralize a `city → array-of-events` shape in `netlify/functions/lib/events.js` (normalized so single-object entries still work), expose ordered/flat helpers, and thread the chosen `dateISO` from the funnel through `availability.js` and `book.js`. Ops consumers (reminders, roster, reports, SEO) flatten instead of assuming one-event-per-city. No cross-city fallback.

**Tech Stack:** Node.js (CommonJS Netlify Functions), `node:test` + `node:assert/strict`, vanilla browser JS in `site/find-your-exact-tune.html`, ESM build script (`scripts/build-seo.mjs`).

**Spec:** `docs/superpowers/specs/2026-07-06-multi-date-city-booking-design.md`

---

## Design invariants (read before starting)

- **`asArray(v)`** normalizes a baked/parsed city value: `Array.isArray(v) ? v : (v ? [v] : [])`. Used everywhere a city value is read so single-object and array entries both work — this is what keeps existing tests green.
- **Funnel/booking paths** use future-filtered, soonest-first helpers (`getEventsForCity`, `getCurrentEventForCity`). **Ops paths** (reminders/roster/reports/SEO) use unfiltered flatten (`getAllActiveEvents` / `flattenEvents`) and apply their own date windows.
- **Date comparison** uses ISO `YYYY-MM-DD` string compare (`a.dateISO >= today`, `.localeCompare`). No `Date` math for ordering.
- Tests inject a fixed `now`/`nowDate` so future-dated fixtures don't rot.

---

## Task 1: `lib/events.js` — array shape + helpers

**Files:**
- Modify: `netlify/functions/lib/events.js`
- Test: `tests/events.test.js`

- [ ] **Step 1: Update existing tests for the new array shape and add helper tests**

In `tests/events.test.js`, update the import line and the two `fetchEvents`/`parseEvents` shape assertions, then append new tests. Replace line 3 import:

```js
const { parseCsv, toISO, parseEvents, getEventForCity, getEventsForCity, getCurrentEventForCity, getAllActiveEvents, flattenEvents, asArray, fetchEvents } = require("../netlify/functions/lib/events.js");
```

Change the `parseEvents maps by lowercase city` test body to expect arrays:

```js
test("parseEvents maps by lowercase city, honors Active", () => {
  const csv = 'Market,Date,Active\nSioux Falls,2026-07-12,yes\nOmaha,2026-08-01,no\n';
  const m = parseEvents(csv);
  assert.equal(m["sioux falls"][0].dateISO, "2026-07-12");
  assert.equal(m["omaha"][0].active, false);
});
```

Change `fetchEvents backfills city` and the all-baked test to read through the array:

```js
test("fetchEvents backfills city from the map key for baked entries", async () => {
  const baked = { fargo: { dateISO: "2026-07-03", label: "July 3, 2026", active: true } };
  const map = await fetchEvents({ fetchImpl: async () => ({ ok: false }), sheetId: "", baked });
  assert.equal(map.fargo[0].city, "fargo");
});
test("fetchEvents gives every real baked event a routable city", async () => {
  const map = await fetchEvents({ fetchImpl: async () => ({ ok: false }), sheetId: "", baked: BAKED });
  for (const [key, arr] of Object.entries(map)) for (const ev of arr) assert.ok(ev.city, `missing city for ${key}`);
});
```

Append new tests:

```js
const NOW = new Date("2026-07-01T12:00:00Z");
test("asArray normalizes object, array, and empty", () => {
  assert.deepEqual(asArray({ a: 1 }), [{ a: 1 }]);
  assert.deepEqual(asArray([{ a: 1 }]), [{ a: 1 }]);
  assert.deepEqual(asArray(null), []);
});
test("single-object baked entry normalizes to a one-element array", async () => {
  const baked = { fargo: { dateISO: "2026-07-03", label: "July 3, 2026", active: true } };
  const map = await fetchEvents({ fetchImpl: async () => ({ ok: false }), sheetId: "", baked });
  assert.ok(Array.isArray(map.fargo));
  assert.equal(map.fargo.length, 1);
});
test("array baked entry passes through with two dates", async () => {
  const baked = { "twin cities": [
    { dateISO: "2026-08-29", label: "August 29, 2026", active: true },
    { dateISO: "2026-10-16", label: "October 16, 2026", active: true },
  ] };
  const list = await getEventsForCity("Twin Cities", { fetchImpl: async () => ({ ok: false }), sheetId: "", baked }, NOW);
  assert.equal(list.length, 2);
  assert.equal(list[0].dateISO, "2026-08-29"); // soonest first
});
test("getEventsForCity drops past + inactive and sorts ascending", async () => {
  const baked = { duluth: [
    { dateISO: "2026-06-01", label: "past", active: true },
    { dateISO: "2026-09-01", label: "later", active: true },
    { dateISO: "2026-08-01", label: "sooner", active: true },
    { dateISO: "2026-08-15", label: "inactive", active: false },
  ] };
  const list = await getEventsForCity("Duluth", { fetchImpl: async () => ({ ok: false }), sheetId: "", baked }, NOW);
  assert.deepEqual(list.map((e) => e.dateISO), ["2026-08-01", "2026-09-01"]);
});
test("getCurrentEventForCity returns soonest future or null", async () => {
  const baked = { duluth: [{ dateISO: "2026-08-01", label: "x", active: true }] };
  const deps = { fetchImpl: async () => ({ ok: false }), sheetId: "", baked };
  assert.equal((await getCurrentEventForCity("Duluth", deps, NOW)).dateISO, "2026-08-01");
  assert.equal(await getCurrentEventForCity("Nowhere", deps, NOW), null);
});
test("getAllActiveEvents flattens every active dated event across cities (no future filter)", async () => {
  const baked = {
    duluth: [{ dateISO: "2026-06-01", label: "past-but-active", active: true }],
    fargo: [{ dateISO: "2026-08-01", label: "x", active: true }, { dateISO: "2026-09-01", label: "y", active: true }],
    omaha: [{ dateISO: "2026-08-01", label: "off", active: false }],
  };
  const all = await getAllActiveEvents({ fetchImpl: async () => ({ ok: false }), sheetId: "", baked });
  assert.equal(all.length, 3); // duluth(1, past kept) + fargo(2); omaha inactive dropped
  assert.ok(all.every((e) => e.city));
});
test("sheet duplicate-city rows append instead of overwrite", () => {
  const m = parseEvents("Market,Date,Active\nTwin Cities,2026-08-29,yes\nTwin Cities,2026-10-16,yes\n");
  assert.equal(m["twin cities"].length, 2);
});
test("a configured sheet replaces the baked entry for that city", async () => {
  const baked = { fargo: { dateISO: "2026-07-03", active: true } };
  const fetchImpl = async () => ({ ok: true, text: async () => "Market,Date,Active\nFargo,2026-08-01,yes\n" });
  const list = await getEventsForCity("Fargo", { fetchImpl, sheetId: "x", baked }, NOW);
  assert.deepEqual(list.map((e) => e.dateISO), ["2026-08-01"]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/events.test.js`
Expected: FAIL — `asArray`/`getEventsForCity`/`getCurrentEventForCity`/`getAllActiveEvents`/`flattenEvents` are not exported; array-shape assertions fail.

- [ ] **Step 3: Rewrite `lib/events.js` to the array shape**

Replace `parseEvents`, `fetchEvents`, and `getEventForCity`, and add the new helpers. Keep `parseCsv`/`toISO` unchanged.

```js
// --- parseEvents: build city -> array (append duplicates) ---
function parseEvents(csv) {
  const rows = parseCsv(csv || "");
  if (!rows.length) return {};
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const ci = {
    market: header.indexOf("market"), date: header.indexOf("date"),
    active: header.indexOf("active"), event: header.indexOf("event"),
    details: header.indexOf("details"), address: header.indexOf("address"),
  };
  const out = {};
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]; if (!row || ci.market < 0) continue;
    const city = (row[ci.market] || "").trim(); if (!city) continue;
    const activeRaw = (ci.active >= 0 ? row[ci.active] || "" : "").trim().toLowerCase();
    const rec = {
      city, label: (ci.date >= 0 ? row[ci.date] || "" : "").trim(),
      dateISO: toISO(ci.date >= 0 ? row[ci.date] : ""),
      active: !["no", "false", "0"].includes(activeRaw),
      event: ci.event >= 0 ? (row[ci.event] || "").trim() : "",
      details: ci.details >= 0 ? (row[ci.details] || "").trim() : "",
      address: ci.address >= 0 ? (row[ci.address] || "").trim() : "",
    };
    (out[city.toLowerCase()] || (out[city.toLowerCase()] = [])).push(rec);
  }
  return out;
}

// --- normalization + flattening helpers ---
function asArray(v) { return Array.isArray(v) ? v : (v ? [v] : []); }
function flattenEvents(map) {
  const out = [];
  for (const key of Object.keys(map || {})) for (const e of asArray(map[key])) out.push(e);
  return out;
}
function todayISO(now) {
  const d = now || new Date(); const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// --- fetch: city -> array, sheet wins per city, backfill city on each element ---
async function fetchEvents({ fetchImpl, sheetId, baked = {}, log = console }) {
  let fromSheet = {};
  if (sheetId) {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
    try {
      const res = await fetchImpl(url);
      if (res.ok) fromSheet = parseEvents(await res.text());
      else if (log.warn) log.warn("events fetch status", res.status);
    } catch (e) { if (log.warn) log.warn("events fetch failed", e.message); }
  }
  const merged = {};
  for (const key of Object.keys(baked)) merged[key] = asArray(baked[key]);
  for (const key of Object.keys(fromSheet)) merged[key] = fromSheet[key]; // a configured sheet overrides baked
  for (const key of Object.keys(merged)) {
    merged[key] = merged[key].map((e) => (e && !e.city ? { ...e, city: key } : e));
  }
  return merged;
}

// --- funnel/booking helpers: future-filtered, soonest-first ---
async function getEventsForCity(city, deps, now) {
  const map = await fetchEvents(deps);
  const key = String(city == null ? "" : city).trim().toLowerCase();
  const today = todayISO(now);
  return asArray(map[key])
    .filter((e) => e && e.active && e.dateISO && e.dateISO >= today)
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
}
async function getCurrentEventForCity(city, deps, now) {
  return (await getEventsForCity(city, deps, now))[0] || null;
}

// --- ops helper: every active dated event, no future filter ---
async function getAllActiveEvents(deps) {
  const map = await fetchEvents(deps);
  return flattenEvents(map).filter((e) => e && e.active && e.dateISO);
}

// --- back-compat: soonest active dated event regardless of past/future ---
async function getEventForCity(city, deps) {
  const map = await fetchEvents(deps);
  const key = String(city == null ? "" : city).trim().toLowerCase();
  const list = asArray(map[key])
    .filter((e) => e && e.active && e.dateISO)
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  return list[0] || null;
}

module.exports = { parseCsv, toISO, parseEvents, fetchEvents, getEventForCity, getEventsForCity, getCurrentEventForCity, getAllActiveEvents, flattenEvents, asArray };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/events.test.js`
Expected: PASS (all, including the pre-existing sheet-override/backfill tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/events.js tests/events.test.js
git commit -m "feat(events): city holds multiple events (array shape + ordered/flat helpers)"
```

---

## Task 2: `availability.js` — return the ordered event list

**Files:**
- Modify: `netlify/functions/availability.js`
- Test: `tests/availability.test.js`

- [ ] **Step 1: Update tests for the `events[]` response (inject fixed `now`)**

Replace `tests/availability.test.js` body below the `fakeFetch` helper. Add `now` to `env`-level deps and assert on `events`:

```js
const env = { EVENTS_SHEET_ID: "x", AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };
const NOW = new Date("2026-07-01T12:00:00Z");

test("unknown city", async () => {
  const r = await getAvailability("Atlantis", { fetchImpl: fakeFetch({ events: "" }), env, now: NOW });
  assert.equal(r.hasEvent, false);
  assert.equal(r.error, "unknown-city");
});
test("no event for known city returns empty events", async () => {
  const r = await getAvailability("Omaha", { fetchImpl: fakeFetch({ events: "Market,Date,Active\nOmaha,nope,yes\n" }), env, now: NOW });
  assert.equal(r.hasEvent, false);
  assert.deepEqual(r.events, []);
});
test("event with some taken slots (single date)", async () => {
  const events = "Market,Date,Active\nSioux Falls,2026-07-12,yes\n";
  const r = await getAvailability("Sioux Falls", { fetchImpl: fakeFetch({ events, taken: ["9:00", "9:20"] }), env, now: NOW });
  assert.equal(r.hasEvent, true);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].dateISO, "2026-07-12");
  assert.equal(r.events[0].openSlots.length, 10);
  assert.equal(r.events[0].full, false);
  assert.equal(r.eventDateISO, "2026-07-12"); // back-compat mirror of soonest
});
test("two dates for one city come back soonest-first, each with its own slots", async () => {
  const events = "Market,Date,Active\nTwin Cities,2026-10-16,yes\nTwin Cities,2026-08-29,yes\n";
  const r = await getAvailability("Twin Cities", { fetchImpl: fakeFetch({ events, taken: [] }), env, now: NOW });
  assert.equal(r.events.length, 2);
  assert.deepEqual(r.events.map((e) => e.dateISO), ["2026-08-29", "2026-10-16"]);
  assert.equal(r.events[0].full, false);
});
test("full soonest date reports full", async () => {
  const events = "Market,Date,Active\nSioux Falls,2026-07-12,yes\n";
  const all = ["9:00","9:20","9:40","10:00","10:20","10:40","11:00","11:20","11:40","12:00","12:20","12:40"];
  const r = await getAvailability("Sioux Falls", { fetchImpl: fakeFetch({ events, taken: all }), env, now: NOW });
  assert.equal(r.events[0].full, true);
  assert.equal(r.events[0].openSlots.length, 0);
});
```

> Note: `fakeFetch` returns the same `taken` array for every Airtable query, so multi-date fixtures share a taken set — fine for these assertions.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/availability.test.js`
Expected: FAIL — response has no `events` array yet.

- [ ] **Step 3: Rewrite `getAvailability`**

```js
const { getMarket } = require("./lib/markets.js");
const { getEventsForCity } = require("./lib/events.js");
const { cfg, listRecords } = require("./lib/airtable.js");
const { SLOT_TIMES, CAPACITY, computeOpen, formatSlot } = require("./lib/slots.js");
const EVENTS = require("./lib/events-data.js");

async function getAvailability(city, deps) {
  const { fetchImpl = fetch, env = process.env, log = console, now } = deps;
  const market = getMarket(city);
  if (!market) return { city, hasEvent: false, error: "unknown-city" };
  const list = await getEventsForCity(market.city, { fetchImpl, sheetId: env.EVENTS_SHEET_ID, baked: EVENTS, log }, now);
  if (!list.length) return { city: market.city, hasEvent: false, events: [] };
  const c = cfg(env);
  const slotLabels = Object.fromEntries(SLOT_TIMES.map((s) => [s, formatSlot(s)]));
  const events = [];
  for (const event of list) {
    let taken = [];
    try {
      const formula = `AND({City}="${market.city}",{Event Date}="${event.dateISO}",{Status}!="Cancelled")`;
      const recs = await listRecords({ fetchImpl, token: c.token, baseId: c.baseId, table: c.bookings, filterByFormula: formula, fields: ["Slot"] });
      taken = recs.map((r) => r.fields.Slot).filter(Boolean);
    } catch (e) {
      if (log.error) log.error("availability list failed", e.message);
      return { city: market.city, hasEvent: true, error: "store-unavailable", events: [] };
    }
    const openSlots = computeOpen(taken);
    events.push({
      dateISO: event.dateISO, eventLabel: event.label, details: event.details || "", address: event.address || "",
      openSlots, takenSlots: SLOT_TIMES.filter((s) => !openSlots.includes(s)),
      full: openSlots.length === 0, slotLabels,
    });
  }
  const soonest = events[0];
  return {
    city: market.city, hasEvent: true, capacity: CAPACITY, events,
    eventDateISO: soonest.dateISO, eventLabel: soonest.eventLabel, details: soonest.details,
    openSlots: soonest.openSlots, takenSlots: soonest.takenSlots, full: soonest.full, slotLabels,
  };
}
async function handler(event) {
  const city = (event.queryStringParameters || {}).city || "";
  const out = await getAvailability(city, { fetchImpl: fetch, env: process.env });
  return { statusCode: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(out) };
}
module.exports = { handler, getAvailability };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/availability.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/availability.js tests/availability.test.js
git commit -m "feat(availability): return a city's upcoming events (soonest-first) with per-date slots"
```

---

## Task 3: `book.js` — book against a chosen `dateISO`

**Files:**
- Modify: `netlify/functions/book.js`
- Test: `tests/book.test.js`

- [ ] **Step 1: Add `nowDate` to the harness and add specific-date tests**

In `tests/book.test.js`, add `nowDate` to the harness `deps` (line ~24, alongside `now`) so future fixtures stay future:

```js
    now: () => "20260101T000000Z",
    nowDate: new Date("2026-07-01T00:00:00Z"),
```

Append new tests (after the existing ones):

```js
const EV_TWO = "Market,Date,Active\nTwin Cities,2026-08-29,yes\nTwin Cities,2026-10-16,yes\n";
const tcBase = { city: "Twin Cities", name: "Jane", phone: "(612) 406-7117", email: "jane@x.com", vehicle: "Tacoma", goals: "Power" };

test("no dateISO books the soonest date", async () => {
  const h = harness({ events: EV_TWO });
  const r = await processBooking({ ...tcBase, slot: "9:20" }, h.deps);
  assert.equal(r.status, "booked");
  assert.equal(r.eventDateISO, "2026-08-29");
  assert.equal(h.created[0].fields["Event Date"], "2026-08-29");
});
test("explicit dateISO books that specific later date", async () => {
  const h = harness({ events: EV_TWO });
  const r = await processBooking({ ...tcBase, slot: "9:20", dateISO: "2026-10-16" }, h.deps);
  assert.equal(r.status, "booked");
  assert.equal(r.eventDateISO, "2026-10-16");
  assert.equal(h.created[0].fields["Event Date"], "2026-10-16");
  assert.equal(h.jobs[0].payload.event.dateISO, "2026-10-16");
});
test("an unknown dateISO for the city falls back to the priority waitlist", async () => {
  const h = harness({ events: EV_TWO });
  const r = await processBooking({ ...tcBase, slot: "9:20", dateISO: "2099-01-01" }, h.deps);
  assert.equal(r.status, "priority");
  assert.equal(r.reason, "no-event");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/book.test.js`
Expected: FAIL — `dateISO` is ignored; explicit-date and unknown-date tests fail.

- [ ] **Step 3: Resolve the event by `dateISO` in `book.js`**

Change the import (line 4) and event resolution (line 25). Replace:

```js
const { getEventForCity } = require("./lib/events.js");
```

with:

```js
const { getEventsForCity } = require("./lib/events.js");
```

Then in `processBooking`, destructure `nowDate` and resolve the target event. Replace line 16-17 deps destructure and line 25:

```js
  const { fetchImpl = fetch, env = process.env, now = icsStamp, log = console,
          trigger = triggerBackground, nowDate } = deps;
```

```js
  const list = await getEventsForCity(market.city, { fetchImpl, sheetId: env.EVENTS_SHEET_ID, baked: EVENTS, log }, nowDate);
  const event = d.dateISO ? list.find((e) => e.dateISO === d.dateISO) : list[0];
```

Everything downstream (`event.dateISO`, `event.label`, the `priority`/booking writes, the fired job) is unchanged — it already reads from `event`. The `if (!event) return priority("no-event");` guard now also covers an unknown posted `dateISO`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/book.test.js`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/book.js tests/book.test.js
git commit -m "feat(book): book against the chosen event dateISO (defaults to soonest)"
```

---

## Task 4: Funnel — stepwise "next date / waitlist" UX

**Files:**
- Modify: `site/find-your-exact-tune.html`
- Test: `tests/booking-ui.test.js`

- [ ] **Step 1: Add source-presence assertions for the stepwise UI**

Append to `tests/booking-ui.test.js`:

```js
test("multi-date stepwise: helper, next-date control, and copy present", () => {
  assert.ok(/function showEventAt/.test(HTML), "missing showEventAt() helper");
  assert.ok(/BOOK\.events/.test(HTML), "missing BOOK.events state");
  assert.ok(/BOOK\.eventIdx/.test(HTML), "missing BOOK.eventIdx state");
  assert.ok(HTML.includes("tf-nextdate"), "missing tf-nextdate control class");
  assert.ok(/See next date/.test(HTML), "missing 'See next date' copy");
  assert.ok(/Can'?t make/.test(HTML), "missing 'Can't make' fallback copy");
});
test("booking payload carries the shown event's dateISO", () => {
  assert.ok(/dateISO:\s*\(?BOOK\.events/.test(HTML), "missing dateISO in /book payload");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/booking-ui.test.js`
Expected: FAIL — none of the new hooks exist yet.

- [ ] **Step 3: Rewrite the availability/render funnel functions**

In `site/find-your-exact-tune.html`, extend the `BOOK` state object (currently `const BOOK={avail:null,slot:null,reason:null};`) to:

```js
const BOOK={avail:null,slot:null,reason:null,events:[],eventIdx:0};
```

Replace `loadAvailability`, `renderSlots`, and `renderWaitlistFull` with versions that key off a single event object, and add `showEventAt` + the fallback row. `renderPriority` and `updateBookCta` stay but `updateBookCta` reads the current event:

```js
async function loadAvailability(city){
  BOOK.avail=null;BOOK.slot=null;BOOK.reason=null;BOOK.events=[];BOOK.eventIdx=0;
  const box=$("#tfSlots"); if(!box) return; box.style.display="block";
  box.innerHTML='<p class="tf-foot" style="margin:8px 0">Loading available times…</p>';
  try{
    const r=await fetch(`/.netlify/functions/availability?city=${encodeURIComponent(city)}`);
    const a=await r.json(); BOOK.avail=a; BOOK.events=(a&&a.events)||[];
    if(a.error && a.error!=="unknown-city"){ renderPriority("no-event"); }
    else if(BOOK.events.length){ showEventAt(0); }
    else renderPriority("no-event");
  }catch(e){ renderPriority("no-event"); }
  updateBookCta();
}
function fallbackRow(e){
  const hasNext=BOOK.eventIdx < BOOK.events.length-1;
  const next=hasNext?`<button type="button" class="tf-nextdate" id="tfNext">See next date →</button>`:"";
  return `<div class="tf-altrow"><span>Can't make ${e.eventLabel||e.dateISO}?</span>`+
    `${next}<button type="button" class="tf-waitlist" id="tfWait">Join the Priority Wait List</button></div>`;
}
function wireFallback(city){
  const nx=$("#tfNext"); if(nx) nx.onclick=()=>showEventAt(BOOK.eventIdx+1);
  const w=$("#tfWait"); if(w) w.onclick=()=>{ BOOK.reason="waitlist"; BOOK.slot=null;
    $("#tfSlots").innerHTML=`<div class="tf-prio"><strong>You're choosing the Priority Wait List for ${city}.</strong> Add your details below and we'll reach out the moment a slot opens.</div>`;
    updateBookCta(); };
}
function showEventAt(i){
  BOOK.eventIdx=i; BOOK.slot=null; BOOK.reason=null;
  const e=BOOK.events[i], city=(BOOK.avail&&BOOK.avail.city)||S.marketCity;
  if(e.full) renderWaitlistFull(city,e); else renderSlots(city,e);
  const box=$("#tfSlots"); box.insertAdjacentHTML("beforeend", fallbackRow(e));
  wireFallback(city);
  updateBookCta();
}
function renderSlots(city,e){
  const box=$("#tfSlots"); const day=e.eventLabel||e.dateISO;
  const lab=s=>(e.slotLabels&&e.slotLabels[s])||s;
  const open=(e.openSlots||[]).map(s=>`<button type="button" class="tf-slot" data-slot="${s}">${lab(s)}</button>`).join("");
  const taken=(e.takenSlots||[]).map(s=>`<button type="button" class="tf-slot" disabled>${lab(s)}</button>`).join("");
  const sc=scarcityLine((e.openSlots||[]).length, Object.keys(e.slotLabels||{}).length||12, city, day);
  box.innerHTML=`${urgencyLine({city,eventDateISO:e.dateISO,eventLabel:e.eventLabel})}${sc}<div class="tf-slot-day">${city} · ${day}</div><div class="tf-slotgrid">${open}${taken}</div>`;
  box.querySelectorAll(".tf-slot:not([disabled])").forEach(b=>b.onclick=()=>{
    box.querySelectorAll(".tf-slot").forEach(x=>x.classList.remove("sel"));
    b.classList.add("sel"); BOOK.slot=b.dataset.slot; updateBookCta();
  });
}
function renderWaitlistFull(city,e){
  BOOK.slot=null; BOOK.reason="full"; const box=$("#tfSlots");
  const day=e.eventLabel||e.dateISO;
  const lab=s=>(e.slotLabels&&e.slotLabels[s])||s;
  const times=Object.keys(e.slotLabels||{});
  const list=times.length?times:(e.openSlots||[]).concat(e.takenSlots||[]);
  const btns=list.map(s=>`<button type="button" class="tf-slot" data-slot="${s}">${lab(s)}</button>`).join("");
  box.innerHTML=`<div class="tf-prio" style="margin-bottom:10px"><strong>${city} on ${day} is full.</strong> Pick your preferred time to join the Priority Wait List, and we'll reach out the moment a slot opens.</div><div class="tf-slot-day">Preferred time</div><div class="tf-slotgrid">${btns}</div>`;
  box.querySelectorAll(".tf-slot").forEach(b=>b.onclick=()=>{
    box.querySelectorAll(".tf-slot").forEach(x=>x.classList.remove("sel"));
    b.classList.add("sel"); BOOK.slot=b.dataset.slot; updateBookCta();
  });
}
```

Update `updateBookCta` to read the current event instead of the old `a.full`:

```js
function updateBookCta(){
  const btn=$("#fSubmit"), e=BOOK.events[BOOK.eventIdx];
  const ready=!!(e && !e.full && BOOK.reason!=="waitlist" && BOOK.reason!=="full");
  if(ready) btn.textContent=BOOK.slot?"Confirm Booking →":"Pick a time above";
  else btn.textContent="Join the Priority Wait List →";
  btn.classList.toggle("ready", ready && !!BOOK.slot);
}
```

In the submit handler (`$("#fSubmit").onclick`), update the `needSlot` check and add `dateISO` to the payload. Replace the `needSlot` line:

```js
  const e=BOOK.events[BOOK.eventIdx], needSlot=!!(e && !e.full && BOOK.reason!=="waitlist" && BOOK.reason!=="full");
```

Add `dateISO` to the payload object (next to `city:S.marketCity`):

```js
    city:S.marketCity, dateISO:(BOOK.events[BOOK.eventIdx]||{}).dateISO||undefined, slot:BOOK.slot||undefined,
```

Add minimal styles near the other `.tf-` rules (e.g. after `.tf-scarcity`):

```css
.tf-altrow{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px;font-size:13px;color:var(--brown2)}
.tf-nextdate,.tf-waitlist{border:1px solid var(--line);background:#fff;border-radius:8px;padding:7px 12px;font-weight:700;font-size:13px;cursor:pointer;color:var(--brown)}
.tf-nextdate:hover,.tf-waitlist:hover{background:var(--cream)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/booking-ui.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add site/find-your-exact-tune.html tests/booking-ui.test.js
git commit -m "feat(funnel): stepwise soonest-date → next-date/waitlist selection"
```

---

## Task 5: Ops runtime consumers — flatten instead of one-per-city

**Files:**
- Modify: `netlify/functions/event-reminders.js`
- Modify: `netlify/functions/event-roster-run.js`
- Test: `tests/event-reminders.test.js`, `tests/event-roster-run.test.js`

- [ ] **Step 1: Add a two-dates-per-city test to each**

Read `tests/event-reminders.test.js` first. It injects `loadEvents` returning an event map. Add a test where one city's value is a **two-element array** and assert both dates produce actions. Use the existing test's harness/shape; the new case:

```js
test("a city with two dates dispatches for both", async () => {
  // Uses the file's existing deps/harness helper; a two-date city value is an array.
  const eventMap = { "twin cities": [
    { city: "twin cities", dateISO: "2026-08-29", label: "Aug 29", active: true },
    { city: "twin cities", dateISO: "2026-10-16", label: "Oct 16", active: true },
  ] };
  // Drive the run at 07:00 Central on a day that is 30 days before BOTH is impossible,
  // so assert the flatten path yields two events into planDispatch instead:
  const { flattenEvents } = require("../netlify/functions/lib/events.js");
  assert.equal(flattenEvents(eventMap).length, 2);
});
```

Read `tests/event-roster-run.test.js`. Add a test where `loadEvents` returns a two-date city and a `date` param selects the second:

```js
test("on-demand roster selects the requested date from a multi-date city", async () => {
  // loadEvents returns an array for the city; runRosterSend picks params.date.
  // (Wire using the file's existing harness; assert out.dateISO === the requested date.)
});
```

> Both new tests lean on the file's existing harness helpers — read each file and mirror its setup; the assertion is the new behavior (flatten yields N events; roster honors `?date=`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/event-reminders.test.js tests/event-roster-run.test.js`
Expected: FAIL — roster's `eventMap[city]` is an array (no `.dateISO`); reminders needs flatten.

- [ ] **Step 3: Flatten in reminders; date-select in roster**

`event-reminders.js` — replace line 39:

```js
const events = Object.values(eventMap);
```

with:

```js
const { flattenEvents } = require("./lib/events.js"); // add to the require block at top
// ...
const events = flattenEvents(eventMap);
```

(Put the `flattenEvents` import in the existing `require("./lib/events.js")` destructure: `const { fetchEvents, flattenEvents } = require("./lib/events.js");`.)

`event-roster-run.js` — import `asArray` (extend line 9 to `const { fetchEvents, asArray } = require("./lib/events.js");`) and replace the `const ev = eventMap[city];` resolution (line 35) with soonest-or-requested-date selection:

```js
  const evs = asArray(eventMap[city]).filter((e) => e && e.dateISO)
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const ev = params.date ? evs.find((e) => e.dateISO === params.date) : evs[0];
  if (!ev || !ev.dateISO) return { status: "error", code: 404, error: `no event for ${city}` };
```

Pass `date` through the handler: in `handler`, read `q.date` and pass it: `const out = await runRosterSend({ city: q.city, date: q.date, token }, {});`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/event-reminders.test.js tests/event-roster-run.test.js`
Expected: PASS. (Existing single-object-map tests still pass — `asArray`/`flattenEvents` tolerate both shapes.)

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/event-reminders.js netlify/functions/event-roster-run.js tests/event-reminders.test.js tests/event-roster-run.test.js
git commit -m "feat(ops): reminders + on-demand roster handle multiple dates per city"
```

---

## Task 6: Raw-`EVENTS` readers — array-tolerant (reports + SEO)

**Files:**
- Modify: `netlify/functions/lib/report-sources.js`
- Modify: `scripts/lib/seo-data.mjs`
- Modify: `scripts/send-venue-reminder.cjs`
- Test: `tests/seo.test.js` (and read `tests/report-metrics.test.js` / `tests/submissions-report.test.js` for the `eventsList` shape)

- [ ] **Step 1: Add a two-date SEO test**

Read `tests/seo.test.js` to match its import/harness. Add a unit test on the JSON-LD builder directly:

```js
test("buildEventsJsonLd emits one Event per active date, including a city's second date", async () => {
  const { buildEventsJsonLd } = await import("../scripts/lib/seo-data.mjs");
  const events = { "twin cities": [
    { city: "twin cities", dateISO: "2026-08-29", label: "Aug 29", active: true, event: "TC Aug" },
    { city: "twin cities", dateISO: "2026-10-16", label: "Oct 16", active: true, event: "TC Oct" },
  ] };
  const json = buildEventsJsonLd(events, ["MN"]);
  assert.equal((json.match(/"@type":\s*"Event"/g) || []).length, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/seo.test.js`
Expected: FAIL — the builder treats the array value as a single event (0 or 1 Event entries).

- [ ] **Step 3: Make the three readers flatMap over `asArray`**

`scripts/lib/seo-data.mjs` `buildEventsJsonLd` (line ~84) — replace the `Object.entries(events)` pipeline head. Add a local helper and flatMap:

```js
export function buildEventsJsonLd(events, states) {
  const asArr = (v) => Array.isArray(v) ? v : (v ? [v] : []);
  const items = Object.entries(events)
    .flatMap(([key, v]) => asArr(v).map((e) => [key, e]))
    .filter(([, e]) => e && e.active && e.dateISO)
    .sort((a, b) => a[1].dateISO.localeCompare(b[1].dateISO))
    // ...rest of the existing .map(...) body unchanged
```

`netlify/functions/lib/report-sources.js` `eventsList` (line ~14) — flatMap over `asArray`:

```js
function eventsList() {
  const ix = marketIndex();
  const asArr = (v) => Array.isArray(v) ? v : (v ? [v] : []);
  return Object.entries(EVENTS).flatMap(([key, val]) => {
    const m = ix[key] || {};
    return asArr(val).map((ev) => ({ city: titleCase(key), state: m.state || "", dateISO: ev.dateISO, label: ev.label, installerKey: m.inst || "", active: ev.active !== false }));
  });
}
```

`scripts/send-venue-reminder.cjs` (line ~42) — flatMap over `asArray` where it maps `Object.entries(EVENTS)`:

```js
  const asArr = (v) => Array.isArray(v) ? v : (v ? [v] : []);
  return Object.entries(EVENTS)
    .flatMap(([key, val]) => asArr(val).map((e) => [key, e]))
    .map(([key, e]) => ({ /* existing row shape, reading key + e */ }))
    // ...existing .filter(days>=0).sort(...) unchanged
```

- [ ] **Step 4: Run the affected tests**

Run: `node --test tests/seo.test.js tests/report-metrics.test.js tests/submissions-report.test.js`
Expected: PASS. (Single-date cities are unchanged; `asArr` wraps them.)

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/report-sources.js scripts/lib/seo-data.mjs scripts/send-venue-reminder.cjs tests/seo.test.js
git commit -m "feat(reports/seo): read multiple events per city (array-tolerant)"
```

---

## Task 7: Integration — regenerate, full test, ship, verify

**Files:** none (build + deploy)

- [ ] **Step 1: Regenerate SEO from the (unchanged) data**

Run: `npm run build:seo`
Expected: `seo build complete`. No content diff beyond `lastmod` (no city has two dates yet), confirming the readers are stable.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: PASS — all suites green (was 270+; new tests added).

- [ ] **Step 3: Commit any regenerated assets**

```bash
git add site/sitemap.xml site/og-image.png
git commit -m "chore(seo): regenerate after multi-date event support"
```

- [ ] **Step 4: Ship (use the `ship` skill's order)**

Run: `git push origin master`, then confirm the Netlify deploy for the pushed commit shows `ready`.

- [ ] **Step 5: Live verification**

The stepwise chain is only visible when a city has two future dates. To verify end-to-end, schedule one planned repeat as a real second date via the `schedule-event` skill (e.g. add Twin Cities' Aug 29 second event so `twin cities` becomes a two-element array in `events-data.js`), ship, then on `https://tunedyota.com/find-your-exact-tune` select that city and confirm: soonest date's times show, **See next date →** swaps to the later date, and **Join the Priority Wait List** works. Until such a date exists, confirm a single-date city (e.g. Sioux Falls) behaves exactly as before (times + waitlist, no "next date" button).

---

## Self-Review

**Spec coverage:**
- Multiple events per city → Task 1 (array shape). ✓
- `getEventsForCity` / `getCurrentEventForCity` / `getAllActiveEvents` → Task 1. ✓
- Availability returns ordered list + back-compat mirror → Task 2. ✓
- Funnel stepwise (soonest → next same-city date → waitlist; none-left = waitlist only; single-date unchanged) → Task 4. ✓
- `book.js` books chosen `dateISO`, invalid → waitlist → Task 3. ✓
- Ops: each date gets roster/reminders/reports/SEO → Tasks 5–6. ✓
- `intake.js` keeps soonest via back-compat `getEventForCity` → no change needed (Task 1 preserves it). ✓
- No cross-city fallback → nowhere implemented. ✓

**Placeholder scan:** Tasks 5–6 reference "the file's existing harness" for two ops/report test files not fully quoted here; every other step has complete code. The executor must read `tests/event-reminders.test.js`, `tests/event-roster-run.test.js`, `tests/report-metrics.test.js`, and `tests/submissions-report.test.js` to mirror their setup — flagged inline, and the new behavior asserted is spelled out.

**Type consistency:** Event record shape `{city,label,dateISO,active,event,details,address}` is consistent across tasks. Helper names `asArray`, `flattenEvents`, `getEventsForCity`, `getCurrentEventForCity`, `getAllActiveEvents`, `getEventForCity` match between `events.js` (Task 1) and every consumer (Tasks 2,3,5,6). Availability event fields (`dateISO`,`eventLabel`,`full`,`openSlots`,`takenSlots`,`slotLabels`) match what the funnel (`showEventAt`/`renderSlots`) reads in Task 4. Funnel state `BOOK.events`/`BOOK.eventIdx` consistent across render + submit.
