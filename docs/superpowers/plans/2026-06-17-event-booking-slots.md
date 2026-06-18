# Event Booking Slots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add live time-slot booking to `find-your-exact-tune`, keyed by (city, event date), with Airtable storage, email + SMS + `.ics` confirmations, and a Priority Event List for full/no-event cities.

**Architecture:** New Netlify Functions (`availability`, `book`) backed by small, pure, dependency-injected libs under `netlify/functions/lib/`. Event dates come from the existing event Google Sheet (read server-side). Bookings + Priority List live in Airtable. The funnel gains a booking step that reads live availability and posts to `book`.

**Tech Stack:** Node 18+ (global `fetch`), CommonJS, `node --test`, Netlify Functions, Airtable REST API, Resend (email, existing), Twilio (SMS, feature-flagged). No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-06-17-event-booking-slots-design.md`

---

## File structure

**New libs** (`netlify/functions/lib/`)
- `markets.js` — city → installer key (mirrors `MARKETS` in the HTML); `getMarket(city)`.
- `slots.js` — `SLOT_TIMES`, `CAPACITY`, `computeOpen`, `isValidSlot`, `formatSlot`.
- `events.js` — fetch + parse the event sheet CSV → city → `{dateISO,label,active,...}`.
- `airtable.js` — `cfg`, `listRecords`, `createRecord`.
- `ics.js` — `dtLocal`, `buildIcs`.
- `sms.js` — `normalizePhone`, `sendSms` (no-op unless Twilio env set).

**Modified libs**
- `resend.js` — add `attachments` passthrough.
- `templates.js` — add booking + priority email + SMS builders.

**New functions** (`netlify/functions/`)
- `availability.js` — `GET ?city=` → live slot availability.
- `book.js` — `POST` → reserve slot or add to Priority List + send confirmations.

**Modified frontend**
- `site/find-your-exact-tune.html` — booking step UI + JS.

**Tests** (`tests/`): one file per lib/function.

**Docs/config**: `.env.example`, `README.md` (env + Airtable schema), `docs/superpowers/specs/airtable-schema.md`.

Airtable field note: **Event Date is a single-line text field holding the ISO date** (`2026-07-12`) so formula matching is exact (avoids Airtable date-field formula pitfalls).

---

## Task 1: `lib/markets.js`

**Files:**
- Create: `netlify/functions/lib/markets.js`
- Test: `tests/markets.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/markets.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { MARKETS, getMarket } = require("../netlify/functions/lib/markets.js");

test("has 15 markets", () => { assert.equal(MARKETS.length, 15); });
test("getMarket is case-insensitive and trims", () => {
  assert.equal(getMarket("  sioux falls ").inst, "cody");
  assert.equal(getMarket("Green Bay").inst, "noah");
  assert.equal(getMarket("Twin Cities").inst, "aaron");
});
test("getMarket returns null for unknown/empty", () => {
  assert.equal(getMarket("Atlantis"), null);
  assert.equal(getMarket(""), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/markets.test.js`
Expected: FAIL (cannot find module `markets.js`).

- [ ] **Step 3: Write minimal implementation**

```js
// netlify/functions/lib/markets.js
// Server source of truth for event cities + installer key.
// Mirrors MARKETS in site/find-your-exact-tune.html — keep in sync.
const MARKETS = [
  { city: "Duluth", state: "MN", inst: "aaron" },
  { city: "Twin Cities", state: "MN", inst: "aaron" },
  { city: "Mankato", state: "MN", inst: "aaron" },
  { city: "Rochester", state: "MN", inst: "aaron" },
  { city: "Eau Claire", state: "WI", inst: "aaron" },
  { city: "Green Bay", state: "WI", inst: "noah" },
  { city: "Madison", state: "WI", inst: "aaron" },
  { city: "Milwaukee", state: "WI", inst: "noah" },
  { city: "Des Moines", state: "IA", inst: "aaron" },
  { city: "Cedar Rapids", state: "IA", inst: "aaron" },
  { city: "Davenport", state: "IA", inst: "aaron" },
  { city: "Fargo", state: "ND", inst: "aaron" },
  { city: "Rapid City", state: "SD", inst: "cody" },
  { city: "Sioux Falls", state: "SD", inst: "cody" },
  { city: "Omaha", state: "NE", inst: "cody" },
];
function getMarket(city) {
  const key = String(city == null ? "" : city).trim().toLowerCase();
  if (!key) return null;
  return MARKETS.find((m) => m.city.toLowerCase() === key) || null;
}
module.exports = { MARKETS, getMarket };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/markets.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/markets.js tests/markets.test.js
git commit -m "feat: markets lib (city -> installer) for booking"
```

---

## Task 2: `lib/slots.js`

**Files:**
- Create: `netlify/functions/lib/slots.js`
- Test: `tests/slots.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/slots.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { SLOT_TIMES, CAPACITY, computeOpen, isValidSlot, formatSlot } = require("../netlify/functions/lib/slots.js");

test("12 slots, 9:00 to 12:40", () => {
  assert.equal(CAPACITY, 12);
  assert.equal(SLOT_TIMES[0], "9:00");
  assert.equal(SLOT_TIMES[11], "12:40");
});
test("computeOpen removes taken", () => {
  const open = computeOpen(["9:00", "10:20"]);
  assert.equal(open.length, 10);
  assert.ok(!open.includes("9:00"));
});
test("isValidSlot", () => {
  assert.equal(isValidSlot("9:20"), true);
  assert.equal(isValidSlot("8:00"), false);
});
test("formatSlot to 12h am/pm", () => {
  assert.equal(formatSlot("9:00"), "9:00 AM");
  assert.equal(formatSlot("12:40"), "12:40 PM");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/slots.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```js
// netlify/functions/lib/slots.js
const SLOT_TIMES = ["9:00","9:20","9:40","10:00","10:20","10:40","11:00","11:20","11:40","12:00","12:20","12:40"];
const CAPACITY = SLOT_TIMES.length;
const SLOT_MINUTES = 20;
function computeOpen(takenSlots) {
  const taken = new Set((takenSlots || []).map((s) => String(s)));
  return SLOT_TIMES.filter((s) => !taken.has(s));
}
function isValidSlot(slot) { return SLOT_TIMES.includes(slot); }
function formatSlot(slot) {
  const [h, m] = String(slot).split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}
module.exports = { SLOT_TIMES, CAPACITY, SLOT_MINUTES, computeOpen, isValidSlot, formatSlot };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/slots.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/slots.js tests/slots.test.js
git commit -m "feat: slots lib (12 x 20min, 9-1)"
```

---

## Task 3: `lib/events.js`

**Files:**
- Create: `netlify/functions/lib/events.js`
- Test: `tests/events.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/events.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseCsv, toISO, parseEvents, getEventForCity } = require("../netlify/functions/lib/events.js");

test("parseCsv handles quoted commas", () => {
  const rows = parseCsv('Market,Date\n"Sioux Falls","Jul 12, 2026"\n');
  assert.deepEqual(rows[1], ["Sioux Falls", "Jul 12, 2026"]);
});
test("toISO normalizes", () => {
  assert.equal(toISO("2026-07-12"), "2026-07-12");
  assert.equal(toISO("Jul 12, 2026"), "2026-07-12");
  assert.equal(toISO("garbage"), null);
});
test("parseEvents maps by lowercase city, honors Active", () => {
  const csv = 'Market,Date,Active\nSioux Falls,2026-07-12,yes\nOmaha,2026-08-01,no\n';
  const m = parseEvents(csv);
  assert.equal(m["sioux falls"].dateISO, "2026-07-12");
  assert.equal(m["omaha"].active, false);
});
test("getEventForCity null when inactive/unparseable/missing", async () => {
  const fetchImpl = async () => ({ ok: true, text: async () =>
    'Market,Date,Active\nOmaha,2026-08-01,no\nFargo,nope,yes\n' });
  assert.equal(await getEventForCity("Omaha", { fetchImpl, sheetId: "x" }), null);
  assert.equal(await getEventForCity("Fargo", { fetchImpl, sheetId: "x" }), null);
  assert.equal(await getEventForCity("Duluth", { fetchImpl, sheetId: "x" }), null);
});
test("getEventForCity returns active dated event", async () => {
  const fetchImpl = async () => ({ ok: true, text: async () =>
    'Market,Date,Active,Details\nSioux Falls,2026-07-12,yes,At the shop\n' });
  const e = await getEventForCity("sioux falls", { fetchImpl, sheetId: "x" });
  assert.equal(e.dateISO, "2026-07-12");
  assert.equal(e.details, "At the shop");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/events.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```js
// netlify/functions/lib/events.js
// Reads the published event Google Sheet (gviz CSV) and maps city -> event.
function parseCsv(text) {
  const rows = []; let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function toISO(label) {
  const s = String(label == null ? "" : label).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function parseEvents(csv) {
  const rows = parseCsv(csv || "");
  if (!rows.length) return {};
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const ci = {
    market: header.indexOf("market"), date: header.indexOf("date"),
    active: header.indexOf("active"), event: header.indexOf("event"),
    details: header.indexOf("details"),
  };
  const out = {};
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]; if (!row || ci.market < 0) continue;
    const city = (row[ci.market] || "").trim(); if (!city) continue;
    const activeRaw = (ci.active >= 0 ? row[ci.active] || "" : "").trim().toLowerCase();
    out[city.toLowerCase()] = {
      city, label: (ci.date >= 0 ? row[ci.date] || "" : "").trim(),
      dateISO: toISO(ci.date >= 0 ? row[ci.date] : ""),
      active: !["no", "false", "0"].includes(activeRaw),
      event: ci.event >= 0 ? (row[ci.event] || "").trim() : "",
      details: ci.details >= 0 ? (row[ci.details] || "").trim() : "",
    };
  }
  return out;
}
async function fetchEvents({ fetchImpl, sheetId, log = console }) {
  if (!sheetId) return {};
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) { if (log.warn) log.warn("events fetch status", res.status); return {}; }
    return parseEvents(await res.text());
  } catch (e) { if (log.warn) log.warn("events fetch failed", e.message); return {}; }
}
async function getEventForCity(city, deps) {
  const map = await fetchEvents(deps);
  const e = map[String(city == null ? "" : city).trim().toLowerCase()];
  if (!e || !e.active || !e.dateISO) return null;
  return e;
}
module.exports = { parseCsv, toISO, parseEvents, fetchEvents, getEventForCity };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/events.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/events.js tests/events.test.js
git commit -m "feat: events lib (read event dates from Google Sheet)"
```

---

## Task 4: `lib/airtable.js`

**Files:**
- Create: `netlify/functions/lib/airtable.js`
- Test: `tests/airtable.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/airtable.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { cfg, listRecords, createRecord } = require("../netlify/functions/lib/airtable.js");

test("cfg reads env with defaults", () => {
  const c = cfg({ AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" });
  assert.equal(c.token, "t");
  assert.equal(c.bookings, "Bookings");
  assert.equal(c.priority, "Priority List");
});
test("listRecords builds url + parses records", async () => {
  let seen;
  const fetchImpl = async (url, opts) => { seen = { url, opts }; return { ok: true, json: async () => ({ records: [{ id: "1", fields: { Slot: "9:00" } }] }) }; };
  const recs = await listRecords({ fetchImpl, token: "t", baseId: "b", table: "Bookings", filterByFormula: "1=1", fields: ["Slot"] });
  assert.equal(recs[0].fields.Slot, "9:00");
  assert.ok(seen.url.includes("/b/Bookings"));
  assert.ok(seen.url.includes("filterByFormula"));
  assert.equal(seen.opts.headers.Authorization, "Bearer t");
});
test("createRecord posts fields, throws on non-ok", async () => {
  const ok = async (url, opts) => { const body = JSON.parse(opts.body); assert.equal(body.fields.Name, "Jane"); return { ok: true, json: async () => ({ id: "r1" }) }; };
  const r = await createRecord({ fetchImpl: ok, token: "t", baseId: "b", table: "Bookings", fields: { Name: "Jane" } });
  assert.equal(r.id, "r1");
  const bad = async () => ({ ok: false, status: 422, text: async () => "bad" });
  await assert.rejects(() => createRecord({ fetchImpl: bad, token: "t", baseId: "b", table: "Bookings", fields: {} }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/airtable.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```js
// netlify/functions/lib/airtable.js
const API = "https://api.airtable.com/v0";
function cfg(env = process.env) {
  return {
    token: env.AIRTABLE_TOKEN,
    baseId: env.AIRTABLE_BASE_ID,
    bookings: env.AIRTABLE_BOOKINGS_TABLE || "Bookings",
    priority: env.AIRTABLE_PRIORITY_TABLE || "Priority List",
  };
}
async function listRecords({ fetchImpl = fetch, token, baseId, table, filterByFormula, fields }) {
  const params = new URLSearchParams();
  if (filterByFormula) params.set("filterByFormula", filterByFormula);
  (fields || []).forEach((f) => params.append("fields[]", f));
  const url = `${API}/${baseId}/${encodeURIComponent(table)}?${params.toString()}`;
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`airtable list ${res.status}`);
  return (await res.json()).records || [];
}
async function createRecord({ fetchImpl = fetch, token, baseId, table, fields }) {
  const url = `${API}/${baseId}/${encodeURIComponent(table)}`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields, typecast: true }),
  });
  if (!res.ok) throw new Error(`airtable create ${res.status}: ${await res.text().catch(() => "")}`);
  return res.json();
}
module.exports = { cfg, listRecords, createRecord };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/airtable.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/airtable.js tests/airtable.test.js
git commit -m "feat: airtable REST client (list/create)"
```

---

## Task 5: `lib/ics.js`

**Files:**
- Create: `netlify/functions/lib/ics.js`
- Test: `tests/ics.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/ics.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { dtLocal, buildIcs } = require("../netlify/functions/lib/ics.js");

test("dtLocal builds floating local datetime + adds minutes", () => {
  assert.equal(dtLocal("2026-07-12", "9:20"), "20260712T092000");
  assert.equal(dtLocal("2026-07-12", "12:40", 20), "20260712T130000");
});
test("buildIcs contains VEVENT fields", () => {
  const s = buildIcs({ uid: "u1", dateISO: "2026-07-12", slot: "9:20", summary: "Tuned Yota — Sioux Falls", location: "Sioux Falls, SD", description: "x", stamp: "20260101T000000Z" });
  assert.ok(s.includes("BEGIN:VEVENT"));
  assert.ok(s.includes("DTSTART:20260712T092000"));
  assert.ok(s.includes("DTEND:20260712T094000"));
  assert.ok(s.includes("UID:u1"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ics.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```js
// netlify/functions/lib/ics.js
function pad(n) { return String(n).padStart(2, "0"); }
function dtLocal(dateISO, slot, addMin = 0) {
  const [Y, M, D] = dateISO.split("-").map(Number);
  let [h, m] = slot.split(":").map(Number);
  m += addMin; h += Math.floor(m / 60); m = ((m % 60) + 60) % 60;
  return `${Y}${pad(M)}${pad(D)}T${pad(h)}${pad(m)}00`;
}
function buildIcs({ uid, dateISO, slot, durationMin = 20, summary, location, description, stamp }) {
  const esc = (s) => String(s == null ? "" : s).replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Tuned Yota//Booking//EN", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${dtLocal(dateISO, slot)}`,
    `DTEND:${dtLocal(dateISO, slot, durationMin)}`,
    `SUMMARY:${esc(summary)}`,
    `LOCATION:${esc(location)}`,
    `DESCRIPTION:${esc(description)}`,
    "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n");
}
module.exports = { dtLocal, buildIcs };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ics.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/ics.js tests/ics.test.js
git commit -m "feat: ics calendar invite builder"
```

---

## Task 6: `lib/sms.js`

**Files:**
- Create: `netlify/functions/lib/sms.js`
- Test: `tests/sms.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/sms.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizePhone, sendSms } = require("../netlify/functions/lib/sms.js");

test("normalizePhone to E.164 US", () => {
  assert.equal(normalizePhone("(612) 406-7117"), "+16124067117");
  assert.equal(normalizePhone("16124067117"), "+16124067117");
  assert.equal(normalizePhone(""), null);
});
test("sendSms no-op when Twilio env unset", async () => {
  const r = await sendSms({ fetchImpl: async () => { throw new Error("should not call"); }, to: "+1612", body: "hi", env: {}, log: { warn() {} } });
  assert.equal(r.skipped, true);
});
test("sendSms posts to Twilio when configured", async () => {
  let seen;
  const fetchImpl = async (url, opts) => { seen = { url, opts }; return { ok: true, json: async () => ({ sid: "SM1" }) }; };
  const env = { TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "tok", TWILIO_FROM: "+1999" };
  const r = await sendSms({ fetchImpl, to: "+16124067117", body: "hi", env });
  assert.equal(r.sent, true);
  assert.ok(seen.url.includes("/Accounts/AC1/Messages.json"));
  assert.ok(seen.opts.body.includes("To=%2B16124067117"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/sms.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```js
// netlify/functions/lib/sms.js
function normalizePhone(raw) {
  const d = String(raw == null ? "" : raw).replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d[0] === "1") return `+${d}`;
  return `+${d}`;
}
function smsConfig(env = process.env) {
  return { sid: env.TWILIO_ACCOUNT_SID, token: env.TWILIO_AUTH_TOKEN, from: env.TWILIO_FROM };
}
async function sendSms({ fetchImpl = fetch, to, body, env = process.env, log = console }) {
  const { sid, token, from } = smsConfig(env);
  if (!sid || !token || !from) { if (log.warn) log.warn("SMS disabled (Twilio env unset)"); return { skipped: true }; }
  if (!to) return { skipped: true, reason: "no-to" };
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const res = await fetchImpl(url, { method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" }, body: params.toString() });
  if (!res.ok) throw new Error(`twilio ${res.status}`);
  return { sent: true };
}
module.exports = { normalizePhone, smsConfig, sendSms };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/sms.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/sms.js tests/sms.test.js
git commit -m "feat: sms lib (Twilio, feature-flagged)"
```

---

## Task 7: Extend `lib/resend.js` with attachments

**Files:**
- Modify: `netlify/functions/lib/resend.js`
- Test: `tests/resend.test.js` (add a case if file exists; else create)

- [ ] **Step 1: Write the failing test**

```js
// tests/resend.test.js  (add this test; keep existing ones if present)
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { sendEmail } = require("../netlify/functions/lib/resend.js");

test("sendEmail forwards attachments", async () => {
  let body;
  const fetchImpl = async (url, opts) => { body = JSON.parse(opts.body); return { ok: true, json: async () => ({ id: "e1" }) }; };
  await sendEmail({ fetchImpl, apiKey: "k", from: "a", to: "b", subject: "s", html: "h", text: "t", attachments: [{ filename: "x.ics", content: "Zm9v" }] });
  assert.equal(body.attachments[0].filename, "x.ics");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/resend.test.js`
Expected: FAIL (`body.attachments` is undefined).

- [ ] **Step 3: Write minimal implementation**

In `netlify/functions/lib/resend.js`, update the signature and body:

```js
async function sendEmail({
  fetchImpl = fetch, apiKey, from, to, cc, replyTo, subject, html, text, attachments,
}) {
  const body = { from, to: [].concat(to), subject, html, text };
  if (cc) body.cc = [].concat(cc);
  if (replyTo) body.reply_to = [].concat(replyTo);
  if (attachments && attachments.length) body.attachments = attachments;
  // ...rest unchanged (POST to https://api.resend.com/emails)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/resend.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/resend.js tests/resend.test.js
git commit -m "feat: resend sendEmail supports attachments (.ics)"
```

---

## Task 8: Extend `lib/templates.js` with booking + priority builders

**Files:**
- Modify: `netlify/functions/lib/templates.js`
- Test: `tests/templates.test.js` (add cases; keep existing)

- [ ] **Step 1: Write the failing test**

```js
// tests/templates.test.js (add)
const { test } = require("node:test");
const assert = require("node:assert/strict");
const t = require("../netlify/functions/lib/templates.js");

const d = { name: "Jane Doe", phone: "(612) 406-7117", email: "jane@x.com", vehicle: "2025+ Toyota Tacoma", goals: "Power" };
const inst = { key: "cody", name: "Cody Star", email: "cody@tunedyota.com", phone: "(605) 214-1335" };
const market = { city: "Sioux Falls", state: "SD" };
const event = { dateISO: "2026-07-12", label: "Jul 12, 2026" };

test("booking customer email names slot + date", () => {
  const m = t.buildBookingCustomerEmail({ ...d, slot: "9:20" }, inst, market, event);
  assert.ok(m.subject.toLowerCase().includes("booked"));
  assert.ok(m.text.includes("9:20"));
  assert.ok(m.text.includes("Sioux Falls"));
});
test("booking installer email lists details", () => {
  const m = t.buildBookingInstallerEmail({ ...d, slot: "9:20" }, inst, market, event);
  assert.ok(m.subject.includes("Sioux Falls"));
  assert.ok(m.text.includes("Jane Doe"));
  assert.ok(m.text.includes("9:20"));
});
test("priority emails reflect reason", () => {
  const full = t.buildPriorityCustomerEmail(d, inst, market, "full");
  assert.ok(full.text.toLowerCase().includes("priority"));
  const inE = t.buildPriorityInstallerEmail(d, inst, market, "no-event");
  assert.ok(inE.subject.toLowerCase().includes("priority"));
});
test("sms bodies are short and include key info", () => {
  const s = t.buildBookingSms({ ...d, slot: "9:20" }, inst, market, event);
  assert.ok(s.includes("Sioux Falls") && s.includes("9:20"));
  assert.ok(s.length <= 320);
  assert.ok(t.buildPrioritySms(d, market).toLowerCase().includes("priority"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/templates.test.js`
Expected: FAIL (builders undefined).

- [ ] **Step 3: Write minimal implementation**

Append to `netlify/functions/lib/templates.js` (reuse existing `esc`, `row`, `attribution`), and add the new names to `module.exports`:

```js
function buildBookingCustomerEmail(d, inst, market, event) {
  const first = (d.name || "there").split(" ")[0];
  const when = `${event.label || event.dateISO} at ${d.slot}`;
  const subject = `You're booked — Tuned Yota ${market.city} (${d.slot})`;
  const text =
    `Hi ${first},\n\nYou're booked for your ${d.vehicle || "vehicle"} tune.\n\n` +
    `City: ${market.city}, ${market.state}\nDate: ${event.label || event.dateISO}\nTime: ${d.slot}\nInstaller: ${inst.name} (${inst.phone})\n\n` +
    `A calendar invite is attached. Need to change it? Call or text ${inst.phone}.\n\n— Tuned Yota · Undeniable Performance\n`;
  const html =
    `<div style="font-family:Arial,sans-serif;color:#3A2E26;max-width:560px">` +
    `<h2 style="color:#5B4B42">You're booked, ${esc(first)}.</h2>` +
    `<p>Your <strong>${esc(d.vehicle || "vehicle")}</strong> tune is confirmed.</p>` +
    `<table style="border-collapse:collapse;font-size:14px">` +
    row("City", `${market.city}, ${market.state}`).html + row("Date", event.label || event.dateISO).html +
    row("Time", d.slot).html + row("Installer", `${inst.name} (${inst.phone})`).html +
    `</table>` +
    `<p style="margin-top:14px">A calendar invite is attached. Need to change it? Call or text <strong>${esc(inst.phone)}</strong>.</p>` +
    `<p style="color:#7c8472;font-weight:700;letter-spacing:.04em">— Tuned Yota · Undeniable Performance</p></div>`;
  return { subject, html, text };
}
function buildBookingInstallerEmail(d, inst, market, event) {
  const rows = [
    row("Name", d.name), row("Phone", d.phone), row("Email", d.email),
    row("City", `${market.city}, ${market.state}`), row("Date", event.label || event.dateISO),
    row("Time", d.slot), row("Vehicle", d.vehicle), row("Goals", d.goals), row("Attribution", attribution(d)),
  ];
  const subject = `New booking — ${market.city} ${event.label || event.dateISO} @ ${d.slot}`;
  const text = `New booking routed to ${inst.name}.\n\n` + rows.map((r) => r.text).join("") + `\nReply to reach the customer.\n`;
  const html = `<div style="font-family:Arial,sans-serif;color:#3A2E26;max-width:560px"><h2 style="color:#5B4B42;margin:0 0 4px">New booking</h2>` +
    `<p style="margin:0 0 16px;color:#7c8472">Routed to ${esc(inst.name)}.</p>` +
    `<table style="border-collapse:collapse;font-size:14px">${rows.map((r) => r.html).join("")}</table></div>`;
  return { subject, html, text };
}
function priorityWord(reason) { return reason === "full" ? "the event is currently full" : "no event is scheduled in your city yet"; }
function buildPriorityCustomerEmail(d, inst, market, reason) {
  const first = (d.name || "there").split(" ")[0];
  const subject = `You're on the Tuned Yota Priority Event List — ${market.city}`;
  const text = `Hi ${first},\n\nYou're on the Priority Event List for ${market.city} (${priorityWord(reason)}). ` +
    `You'll be first to know when a slot opens. Questions? Call or text ${inst.name} at ${inst.phone}.\n\n— Tuned Yota · Undeniable Performance\n`;
  const html = `<div style="font-family:Arial,sans-serif;color:#3A2E26;max-width:560px"><h2 style="color:#5B4B42">You're on the Priority Event List.</h2>` +
    `<p>Thanks, ${esc(first)} — ${esc(priorityWord(reason))} in <strong>${esc(market.city)}</strong>. You'll be first to know when a slot opens.</p>` +
    `<p>Questions? Call or text ${esc(inst.name)} at <strong>${esc(inst.phone)}</strong>.</p>` +
    `<p style="color:#7c8472;font-weight:700;letter-spacing:.04em">— Tuned Yota · Undeniable Performance</p></div>`;
  return { subject, html, text };
}
function buildPriorityInstallerEmail(d, inst, market, reason) {
  const rows = [row("Name", d.name), row("Phone", d.phone), row("Email", d.email), row("City", market.city), row("Vehicle", d.vehicle), row("Goals", d.goals), row("Reason", reason === "full" ? "Event full" : "No event scheduled"), row("Attribution", attribution(d))];
  const subject = `New Priority List signup — ${market.city}`;
  const text = `New Priority Event List signup routed to ${inst.name}.\n\n` + rows.map((r) => r.text).join("");
  const html = `<div style="font-family:Arial,sans-serif;color:#3A2E26;max-width:560px"><h2 style="color:#5B4B42;margin:0 0 4px">Priority List signup</h2>` +
    `<table style="border-collapse:collapse;font-size:14px">${rows.map((r) => r.html).join("")}</table></div>`;
  return { subject, html, text };
}
function buildBookingSms(d, inst, market, event) {
  return `Tuned Yota: you're booked in ${market.city} on ${event.label || event.dateISO} at ${d.slot}. Questions: ${inst.phone}`;
}
function buildPrioritySms(d, market) {
  return `Tuned Yota: you're on the Priority Event List for ${market.city}. We'll text you when a slot opens.`;
}
module.exports = {
  buildInstallerEmail, buildCustomerEmail,
  buildBookingCustomerEmail, buildBookingInstallerEmail,
  buildPriorityCustomerEmail, buildPriorityInstallerEmail,
  buildBookingSms, buildPrioritySms,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/templates.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/templates.js tests/templates.test.js
git commit -m "feat: booking + priority email/SMS templates"
```

---

## Task 9: `availability.js` function

**Files:**
- Create: `netlify/functions/availability.js`
- Test: `tests/availability.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/availability.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getAvailability } = require("../netlify/functions/availability.js");

function fakeFetch({ events, taken = [] }) {
  return async (url) => {
    if (url.includes("docs.google.com")) return { ok: true, text: async () => events };
    if (url.includes("api.airtable.com")) return { ok: true, json: async () => ({ records: taken.map((s) => ({ fields: { Slot: s } })) }) };
    throw new Error("unexpected url " + url);
  };
}
const env = { EVENTS_SHEET_ID: "x", AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };

test("unknown city", async () => {
  const r = await getAvailability("Atlantis", { fetchImpl: fakeFetch({ events: "" }), env });
  assert.equal(r.hasEvent, false);
  assert.equal(r.error, "unknown-city");
});
test("no event for known city", async () => {
  const r = await getAvailability("Omaha", { fetchImpl: fakeFetch({ events: "Market,Date,Active\nOmaha,nope,yes\n" }), env });
  assert.equal(r.hasEvent, false);
});
test("event with some taken slots", async () => {
  const events = "Market,Date,Active\nSioux Falls,2026-07-12,yes\n";
  const r = await getAvailability("Sioux Falls", { fetchImpl: fakeFetch({ events, taken: ["9:00", "9:20"] }), env });
  assert.equal(r.hasEvent, true);
  assert.equal(r.eventDateISO, "2026-07-12");
  assert.equal(r.openSlots.length, 10);
  assert.equal(r.full, false);
});
test("full event", async () => {
  const events = "Market,Date,Active\nSioux Falls,2026-07-12,yes\n";
  const all = ["9:00","9:20","9:40","10:00","10:20","10:40","11:00","11:20","11:40","12:00","12:20","12:40"];
  const r = await getAvailability("Sioux Falls", { fetchImpl: fakeFetch({ events, taken: all }), env });
  assert.equal(r.full, true);
  assert.equal(r.openSlots.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/availability.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```js
// netlify/functions/availability.js
const { getMarket } = require("./lib/markets.js");
const { getEventForCity } = require("./lib/events.js");
const { cfg, listRecords } = require("./lib/airtable.js");
const { SLOT_TIMES, CAPACITY, computeOpen, formatSlot } = require("./lib/slots.js");

async function getAvailability(city, deps) {
  const { fetchImpl = fetch, env = process.env, log = console } = deps;
  const market = getMarket(city);
  if (!market) return { city, hasEvent: false, error: "unknown-city" };
  const event = await getEventForCity(market.city, { fetchImpl, sheetId: env.EVENTS_SHEET_ID, log });
  if (!event) return { city: market.city, hasEvent: false };
  const c = cfg(env);
  const base = { city: market.city, hasEvent: true, eventDateISO: event.dateISO, eventLabel: event.label, details: event.details || "", capacity: CAPACITY };
  let taken = [];
  try {
    const formula = `AND({City}='${market.city}',{Event Date}='${event.dateISO}',{Status}!='Cancelled')`;
    const recs = await listRecords({ fetchImpl, token: c.token, baseId: c.baseId, table: c.bookings, filterByFormula: formula, fields: ["Slot"] });
    taken = recs.map((r) => r.fields.Slot).filter(Boolean);
  } catch (e) { if (log.error) log.error("availability list failed", e.message); return { ...base, error: "store-unavailable" }; }
  const openSlots = computeOpen(taken);
  return {
    ...base, openSlots,
    takenSlots: SLOT_TIMES.filter((s) => !openSlots.includes(s)),
    full: openSlots.length === 0,
    slotLabels: Object.fromEntries(SLOT_TIMES.map((s) => [s, formatSlot(s)])),
  };
}
async function handler(event) {
  const city = (event.queryStringParameters || {}).city || "";
  const out = await getAvailability(city, { fetchImpl: fetch, env: process.env });
  return { statusCode: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(out) };
}
module.exports = { handler, getAvailability };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/availability.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/availability.js tests/availability.test.js
git commit -m "feat: availability function (live open slots per city/date)"
```

---

## Task 10: `book.js` function

**Files:**
- Create: `netlify/functions/book.js`
- Test: `tests/book.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/book.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processBooking } = require("../netlify/functions/book.js");

function harness({ events, taken = [] }) {
  const created = [];
  const emails = [];
  const texts = [];
  const fetchImpl = async (url, opts) => {
    if (url.includes("docs.google.com")) return { ok: true, text: async () => events };
    if (url.includes("api.airtable.com")) {
      if (opts && opts.method === "POST") { const b = JSON.parse(opts.body); created.push({ url, fields: b.fields }); return { ok: true, json: async () => ({ id: "r1" }) }; }
      return { ok: true, json: async () => ({ records: taken.map((s) => ({ fields: { Slot: s } })) }) };
    }
    throw new Error("unexpected " + url);
  };
  const deps = {
    fetchImpl,
    env: { EVENTS_SHEET_ID: "x", AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", RESEND_API_KEY: "re" },
    send: async (a) => { emails.push(a); return { id: "e" }; },
    sms: async (a) => { texts.push(a); return { sent: true }; },
    now: () => "20260101T000000Z",
    log: { warn() {}, error() {} },
  };
  return { deps, created, emails, texts };
}
const base = { city: "Sioux Falls", name: "Jane", phone: "(612) 406-7117", email: "jane@x.com", vehicle: "Tacoma", goals: "Power" };
const EV = "Market,Date,Active\nSioux Falls,2026-07-12,yes\n";

test("honeypot ignored", async () => {
  const h = harness({ events: EV });
  const r = await processBooking({ ...base, slot: "9:00", bot_field: "x" }, h.deps);
  assert.equal(r.status, "ignored");
});
test("unknown city errors", async () => {
  const h = harness({ events: EV });
  assert.equal((await processBooking({ ...base, city: "Atlantis", slot: "9:00" }, h.deps)).status, "error");
});
test("missing contact errors", async () => {
  const h = harness({ events: EV });
  assert.equal((await processBooking({ city: "Sioux Falls", name: "Jane", slot: "9:00" }, h.deps)).status, "error");
});
test("no event -> priority (no-event)", async () => {
  const h = harness({ events: "Market,Date,Active\nSioux Falls,nope,yes\n" });
  const r = await processBooking({ ...base, slot: "9:00" }, h.deps);
  assert.equal(r.status, "priority");
  assert.equal(r.reason, "no-event");
  assert.ok(h.created[0].url.includes("Priority"));
});
test("taken slot -> conflict", async () => {
  const h = harness({ events: EV, taken: ["9:00"] });
  const r = await processBooking({ ...base, slot: "9:00" }, h.deps);
  assert.equal(r.status, "conflict");
  assert.ok(r.openSlots.length === 11);
});
test("full -> priority (full)", async () => {
  const all = ["9:00","9:20","9:40","10:00","10:20","10:40","11:00","11:20","11:40","12:00","12:20","12:40"];
  const h = harness({ events: EV, taken: all });
  const r = await processBooking({ ...base, slot: "9:00" }, h.deps);
  assert.equal(r.status, "priority");
  assert.equal(r.reason, "full");
});
test("happy path booked -> creates booking + sends email + sms", async () => {
  const h = harness({ events: EV });
  const r = await processBooking({ ...base, slot: "9:20" }, h.deps);
  assert.equal(r.status, "booked");
  assert.equal(r.slot, "9:20");
  assert.equal(h.created[0].fields.Slot, "9:20");
  assert.equal(h.created[0].fields.Installer, "cody");
  assert.ok(h.emails.length >= 2); // installer + customer
  assert.equal(h.texts.length, 1);
  assert.ok(h.emails.some((e) => e.attachments)); // .ics on customer email
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/book.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```js
// netlify/functions/book.js
const { getMarket } = require("./lib/markets.js");
const { keyToInstaller } = require("./lib/routing.js");
const { getEventForCity } = require("./lib/events.js");
const { cfg, listRecords, createRecord } = require("./lib/airtable.js");
const { isValidSlot, computeOpen } = require("./lib/slots.js");
const { sendEmail } = require("./lib/resend.js");
const { sendSms, normalizePhone } = require("./lib/sms.js");
const { buildIcs } = require("./lib/ics.js");
const tpl = require("./lib/templates.js");

const FROM = "Tuned Yota <info@tunedyota.com>";
const OWNER = "info@tunedyota.com";

async function processBooking(body, deps) {
  const { fetchImpl = fetch, env = process.env, send = sendEmail, sms = sendSms, now, log = console } = deps;
  const d = body || {};
  if (d.bot_field) return { status: "ignored" };
  const market = getMarket(d.city);
  if (!market) return { status: "error", error: "unknown-city" };
  if (!d.name || (!d.phone && !d.email)) return { status: "error", error: "missing-contact" };
  const inst = keyToInstaller(market.inst);
  const c = cfg(env);
  const event = await getEventForCity(market.city, { fetchImpl, sheetId: env.EVENTS_SHEET_ID, log });

  async function priority(reason) {
    try {
      await createRecord({ fetchImpl, token: c.token, baseId: c.baseId, table: c.priority, fields: {
        City: market.city, Name: d.name, Phone: d.phone || "", Email: d.email || "",
        Vehicle: d.vehicle || "", Goals: d.goals || "", Installer: inst.key,
        Reason: reason === "full" ? "Event full" : "No event scheduled",
        "Event Date": event ? event.dateISO : "",
      } });
    } catch (e) { if (log.error) log.error("priority create", e.message); return { status: "error", error: "store-unavailable" }; }
    try { const m = tpl.buildPriorityInstallerEmail(d, inst, market, reason); await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: inst.email, cc: inst.email === OWNER ? undefined : OWNER, replyTo: d.email || undefined, subject: m.subject, html: m.html, text: m.text }); } catch (e) { if (log.error) log.error("prio inst email", e.message); }
    if (d.email) { try { const m = tpl.buildPriorityCustomerEmail(d, inst, market, reason); await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: d.email, replyTo: OWNER, subject: m.subject, html: m.html, text: m.text }); } catch (e) { if (log.error) log.error("prio cust email", e.message); } }
    if (d.phone) { try { await sms({ fetchImpl, to: normalizePhone(d.phone), body: tpl.buildPrioritySms(d, market), env }); } catch (e) { if (log.error) log.error("prio sms", e.message); } }
    return { status: "priority", reason };
  }

  if (!event) return priority("no-event");

  let taken = [];
  try {
    const formula = `AND({City}='${market.city}',{Event Date}='${event.dateISO}',{Status}!='Cancelled')`;
    const recs = await listRecords({ fetchImpl, token: c.token, baseId: c.baseId, table: c.bookings, filterByFormula: formula, fields: ["Slot"] });
    taken = recs.map((r) => r.fields.Slot).filter(Boolean);
  } catch (e) { if (log.error) log.error("list", e.message); return { status: "error", error: "store-unavailable" }; }

  const open = computeOpen(taken);
  if (open.length === 0) return priority("full");
  if (!d.slot || !isValidSlot(d.slot) || !open.includes(d.slot)) return { status: "conflict", openSlots: open };

  try {
    await createRecord({ fetchImpl, token: c.token, baseId: c.baseId, table: c.bookings, fields: {
      City: market.city, "Event Date": event.dateISO, Slot: d.slot,
      Name: d.name, Phone: d.phone || "", Email: d.email || "",
      Vehicle: d.vehicle || "", Goals: d.goals || "", Installer: inst.key,
      Status: "Booked", Source: "find-your-exact-tune",
      "UTM Source": d.utm_source || "", "UTM Medium": d.utm_medium || "", "UTM Campaign": d.utm_campaign || "",
    } });
  } catch (e) { if (log.error) log.error("create", e.message); return { status: "error", error: "store-unavailable" }; }

  try { const m = tpl.buildBookingInstallerEmail(d, inst, market, event); await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: inst.email, cc: inst.email === OWNER ? undefined : OWNER, replyTo: d.email || undefined, subject: m.subject, html: m.html, text: m.text }); } catch (e) { if (log.error) log.error("inst email", e.message); }
  if (d.email) {
    try {
      const ics = buildIcs({ uid: `${event.dateISO}-${d.slot}-${now()}@tunedyota.com`, dateISO: event.dateISO, slot: d.slot, summary: `Tuned Yota — ${market.city} OTT Tune`, location: `${market.city}, ${market.state}`, description: `Your ${d.vehicle || "vehicle"} tune with ${inst.name}. Questions: ${inst.phone}`, stamp: now() });
      const m = tpl.buildBookingCustomerEmail(d, inst, market, event);
      await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: d.email, replyTo: OWNER, subject: m.subject, html: m.html, text: m.text, attachments: [{ filename: "tuned-yota-booking.ics", content: Buffer.from(ics).toString("base64") }] });
    } catch (e) { if (log.error) log.error("cust email", e.message); }
  }
  if (d.phone) { try { await sms({ fetchImpl, to: normalizePhone(d.phone), body: tpl.buildBookingSms(d, inst, market, event), env }); } catch (e) { if (log.error) log.error("sms", e.message); } }

  return { status: "booked", city: market.city, eventDateISO: event.dateISO, eventLabel: event.label, slot: d.slot };
}

function icsStamp() { return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"); }
async function handler(event) {
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  const out = await processBooking(body, { fetchImpl: fetch, env: process.env, now: icsStamp });
  const code = out.status === "error" ? 502 : out.status === "conflict" ? 409 : 200;
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, processBooking };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/book.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Run the full suite + commit**

Run: `npm test`
Expected: all test files PASS.

```bash
git add netlify/functions/book.js tests/book.test.js
git commit -m "feat: book function (reserve slot or priority list + confirmations)"
```

---

## Task 11: Frontend booking step in `find-your-exact-tune.html`

> The backend logic is unit-tested. The funnel UI is inline JS with no build/test
> harness, so this task is implemented as concrete snippets and **verified in a real
> browser** (Task 13). Integrate following the existing step/state patterns in the file.

**Files:**
- Modify: `site/find-your-exact-tune.html`

- [ ] **Step 1: Add CSS** (inside the page's first `<style>` block, near the other `.tf-*` rules)

```css
.tf-slotgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:8px 0 6px}
@media(max-width:480px){.tf-slotgrid{grid-template-columns:repeat(2,1fr)}}
.tf-slot{border:1.5px solid var(--line);background:var(--card);border-radius:12px;padding:13px 8px;font-weight:800;font-size:14.5px;color:var(--brown);cursor:pointer;text-align:center;box-shadow:var(--shadow-sm);transition:transform var(--dur-fast) var(--ease-out),border-color var(--dur-fast) ease}
.tf-slot:hover{border-color:var(--sage)}
.tf-slot:active{transform:scale(.97)}
.tf-slot.sel{background:var(--brown);color:#fff;border-color:var(--brown)}
.tf-slot[disabled]{opacity:.4;cursor:not-allowed;text-decoration:line-through}
.tf-slot-day{text-align:center;font-family:'Spectral',serif;font-weight:600;font-size:18px;color:var(--ink);margin:4px 0 10px}
.tf-prio{background:linear-gradient(135deg,rgba(153,160,142,.16),rgba(179,208,217,.16));border:1.5px solid var(--line);border-radius:var(--r);padding:18px 18px 6px;margin:6px 0}
```

- [ ] **Step 2: Add the Book step markup** after the market/installer selection block in the result step (so it appears once a market is chosen). Use the existing field styles:

```html
<div class="tf-book" id="tfBook" style="display:none;margin-top:18px">
  <div class="tf-eyebrow">Reserve your time</div>
  <div id="tfBookBody"><!-- filled by JS: slot grid OR priority form --></div>
  <div class="tf-field"><label>Your name</label><input id="bkName" type="text" autocomplete="name"></div>
  <div class="tf-row2">
    <div class="tf-field"><label>Phone</label><input id="bkPhone" type="tel" autocomplete="tel"></div>
    <div class="tf-field"><label>Email</label><input id="bkEmail" type="email" autocomplete="email"></div>
  </div>
  <input type="text" id="bkBot" name="bot_field" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
  <button class="btn primary" id="bkSubmit" style="width:100%;margin-top:6px" disabled>Confirm booking</button>
  <p class="tf-foot" id="bkMsg"></p>
</div>
```

- [ ] **Step 3: Add the booking JS** (inside the existing `<script>`, after `MARKETS`/selection logic). Wire `loadAvailability(city)` into the existing handler that fires when a market is selected, passing the selected `city`, `installer_key`, and the funnel's known `vehicle`/`goals`/UTM values.

```js
const BOOK = { city:null, slot:null, avail:null };
async function loadAvailability(city){
  BOOK.city = city; BOOK.slot = null;
  const book = document.getElementById('tfBook');
  const body = document.getElementById('tfBookBody');
  book.style.display = 'block';
  body.innerHTML = '<p class="tf-foot">Loading available times…</p>';
  try{
    const res = await fetch(`/.netlify/functions/availability?city=${encodeURIComponent(city)}`);
    const a = await res.json(); BOOK.avail = a;
    if(!a.hasEvent || a.error){ renderPriority(a.hasEvent ? 'full' : 'no-event', a); return; }
    if(a.full){ renderPriority('full', a); return; }
    renderSlots(a);
  }catch(e){ renderPriority('no-event', {}); }
  updateSubmit();
}
function renderSlots(a){
  const body = document.getElementById('tfBookBody');
  const day = a.eventLabel || a.eventDateISO;
  const btns = a.openSlots.map(s=>`<button type="button" class="tf-slot" data-slot="${s}">${a.slotLabels[s]||s}</button>`).join('');
  const takenBtns = (a.takenSlots||[]).map(s=>`<button type="button" class="tf-slot" disabled>${a.slotLabels[s]||s}</button>`).join('');
  body.innerHTML = `<div class="tf-slot-day">${a.city} · ${day}</div><div class="tf-slotgrid">${btns}${takenBtns}</div>`;
  body.querySelectorAll('.tf-slot:not([disabled])').forEach(b=>b.addEventListener('click',()=>{
    body.querySelectorAll('.tf-slot').forEach(x=>x.classList.remove('sel'));
    b.classList.add('sel'); BOOK.slot = b.dataset.slot; updateSubmit();
  }));
  document.getElementById('bkSubmit').textContent = 'Confirm booking';
}
function renderPriority(reason, a){
  BOOK.slot = null;
  const body = document.getElementById('tfBookBody');
  const line = reason==='full'
    ? `This event is currently full.`
    : `No event is scheduled in ${BOOK.city} yet.`;
  body.innerHTML = `<div class="tf-prio"><p style="margin:0 0 6px"><strong>${line}</strong> Join the Priority Event List and you'll be first to know when a slot opens.</p></div>`;
  document.getElementById('bkSubmit').textContent = 'Join the Priority Event List';
  BOOK.reason = reason;
}
function updateSubmit(){
  const name = document.getElementById('bkName').value.trim();
  const phone = document.getElementById('bkPhone').value.trim();
  const email = document.getElementById('bkEmail').value.trim();
  const needSlot = BOOK.avail && BOOK.avail.hasEvent && !BOOK.avail.full;
  const ok = name && (phone || email) && (!needSlot || BOOK.slot);
  document.getElementById('bkSubmit').disabled = !ok;
}
['bkName','bkPhone','bkEmail'].forEach(id=>document.getElementById(id).addEventListener('input',updateSubmit));
document.getElementById('bkSubmit').addEventListener('click', submitBooking);
async function submitBooking(){
  const btn = document.getElementById('bkSubmit'); const msg = document.getElementById('bkMsg');
  btn.disabled = true; msg.textContent = 'Submitting…';
  const payload = {
    city: BOOK.city, slot: BOOK.slot || undefined,
    name: document.getElementById('bkName').value.trim(),
    phone: document.getElementById('bkPhone').value.trim(),
    email: document.getElementById('bkEmail').value.trim(),
    bot_field: document.getElementById('bkBot').value,
    vehicle: window.TF_VEHICLE || '', goals: window.TF_GOALS || '',
    installer_key: window.TF_INSTALLER_KEY || '',
    utm_source: window.TF_UTM_SOURCE || '', utm_medium: window.TF_UTM_MEDIUM || '', utm_campaign: window.TF_UTM_CAMPAIGN || '',
  };
  try{
    const res = await fetch('/.netlify/functions/book', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    const r = await res.json();
    if(r.status==='booked'){ showBookingSuccess(`You're booked for ${r.eventLabel||r.eventDateISO} at ${r.slot}. Check your email for a calendar invite.`); if(window.fbq) fbq('track','Schedule'); }
    else if(r.status==='priority'){ showBookingSuccess(`You're on the Priority Event List for ${BOOK.city}. We'll reach out when a slot opens.`); if(window.fbq) fbq('track','Lead'); }
    else if(r.status==='conflict'){ msg.textContent = 'That time was just taken — pick another.'; BOOK.avail.openSlots = r.openSlots; renderSlots(BOOK.avail); btn.disabled=false; }
    else { msg.textContent = `Something went wrong. Please call or text ${'(612) 406-7117'}.`; btn.disabled=false; }
  }catch(e){ msg.textContent = 'Network error. Please call or text (612) 406-7117.'; btn.disabled=false; }
}
function showBookingSuccess(text){
  const s = document.querySelector('.tf-success'); const book = document.getElementById('tfBook');
  if(book) book.style.display='none';
  if(s){ const h = s.querySelector('h3'); if(h) h.nextElementSibling ? (h.nextElementSibling.textContent = text) : null; s.classList.add('show'); s.scrollIntoView({behavior:'smooth',block:'center'}); }
  else { alert(text); }
}
```

- [ ] **Step 4: Set the funnel context globals** where the funnel already computes vehicle/goals/installer/UTM (so `submitBooking` can read them). Example near where the existing lead form fields are populated:

```js
window.TF_VEHICLE = selectedVehicleLabel;     // existing variable holding e.g. "2025+ Toyota Tacoma"
window.TF_GOALS = selectedGoals.join(', ');    // existing goals selection
window.TF_INSTALLER_KEY = market.inst;         // from the selected market
window.TF_UTM_SOURCE = getParam('utm_source'); window.TF_UTM_MEDIUM = getParam('utm_medium'); window.TF_UTM_CAMPAIGN = getParam('utm_campaign');
```

- [ ] **Step 5: Commit** (verification happens in Task 13)

```bash
git add site/find-your-exact-tune.html
git commit -m "feat: booking step UI in tune finder (slots + priority)"
```

---

## Task 12: Env, schema docs, config

**Files:**
- Create: `.env.example`
- Create: `docs/superpowers/specs/airtable-schema.md`
- Modify: `README.md` (append a Booking section)

- [ ] **Step 1: Create `.env.example`**

```
# Existing
RESEND_API_KEY=
# Event dates (published Google Sheet ID — same sheet as the event map)
EVENTS_SHEET_ID=
# Airtable (bookings + priority list)
AIRTABLE_TOKEN=
AIRTABLE_BASE_ID=
AIRTABLE_BOOKINGS_TABLE=Bookings
AIRTABLE_PRIORITY_TABLE=Priority List
# Twilio SMS (optional — leave blank until A2P 10DLC is approved)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM=
```

- [ ] **Step 2: Create `docs/superpowers/specs/airtable-schema.md`** documenting the two tables (copy the field tables from the design spec; note **Event Date = single-line text holding ISO `YYYY-MM-DD`**, Slot = single select of the 12 times, Status single select default `Booked`, Reason single select `No event scheduled`/`Event full`).

- [ ] **Step 3: Append a "Booking" section to `README.md`** describing: the two functions, required env vars, the Airtable base setup, the `EVENTS_SHEET_ID` prerequisite, and that SMS is off until Twilio env is set.

- [ ] **Step 4: Commit**

```bash
git add .env.example docs/superpowers/specs/airtable-schema.md README.md
git commit -m "docs: booking env, Airtable schema, README"
```

---

## Task 13: Integration verification + deploy checklist

**Files:** none (verification)

- [ ] **Step 1: Full unit suite**

Run: `npm test`
Expected: all test files PASS.

- [ ] **Step 2: Local run with a test Airtable base + a sheet with one dated city**

Set the env vars in a local `.env`, then:
Run: `npx netlify dev`
Then in a browser go through the funnel to a dated city.
Expected: slot grid renders; booking a slot returns success; the slot disappears on reload; booking the rest then one more rolls to the Priority List; an unscheduled city shows the Priority List form.

- [ ] **Step 3: Browser screenshots (desktop + mobile)** of the slot grid and the priority form, using the same headless Edge approach used elsewhere in this repo. Confirm layout + on-brand styling.

- [ ] **Step 4: Verify Airtable records + emails** — a Bookings row and a Priority List row appear; confirmation email arrives with the `.ics` attachment; (SMS only if Twilio configured).

- [ ] **Step 5: Deploy checklist (commit nothing; this is operational)**
  - Set all env vars in Netlify (Site settings → Environment).
  - Set `EVENTS_SHEET_ID` and put at least one active, ISO-dated city in the event sheet.
  - Create the Airtable base per `airtable-schema.md`; add token + base id.
  - (Optional) Complete Twilio + A2P 10DLC, then add `TWILIO_*`.
  - Push to `master`; confirm the Netlify deploy is green; smoke-test one booking on production.

---

## Self-review notes
- **Spec coverage:** live booking (Tasks 9–11), city+date keying (events.js + availability/book), Airtable storage (airtable.js + book), email/SMS/.ics (Tasks 5–8, 10), Priority List for full + no-event (book.js), abuse honeypot + validation (book.js), error degradation (availability/book return `error`/`conflict`; frontend falls back), setup/env (Task 12) — all covered.
- **Field-name consistency:** `City`, `Event Date` (text ISO), `Slot`, `Name/Phone/Email`, `Vehicle/Goals`, `Installer`, `Status`, `Reason` used identically in `availability.js`, `book.js`, tests, and schema doc.
- **No placeholders:** every code step contains complete code; the only non-TDD task (11, frontend) ships complete snippets verified in Task 13.
