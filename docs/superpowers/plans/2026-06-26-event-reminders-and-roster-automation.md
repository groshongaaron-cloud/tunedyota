# Event Reminders & Roster Automation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an event-driven automation layer for Tuned Yota — monthly executive summary to the owner, time-based installer rosters and customer address notifications, a post-event auto-waitlist sweep, plus a booking Modifications field, a certificate calibration line, and the Green Bay event.

**Architecture:** One new hourly scheduled function (`event-reminders.js`) that acts only at 07:00 America/Chicago (DST-safe, once-daily, == 2 h before the 9 AM start). A pure planner (`lib/event-plan.js`) decides every action from `{events, bookings, priority, nowCentral}`; a thin executor sends emails and writes records. Small leaf modules (Central-time, roster render, customer template) are built and tested first, then composed by the planner/executor.

**Tech Stack:** Node CommonJS Netlify Functions, Airtable REST (`lib/airtable.js`), Resend (`lib/resend.js`), `node:test` + `node:assert`. No new dependencies (`Intl.DateTimeFormat` handles the timezone).

**Spec:** `docs/superpowers/specs/2026-06-26-event-reminders-and-roster-automation-design.md`

**Conventions in this repo:** pure builders return `{subject, html, text}`; functions take a `deps` object with injectable `fetchImpl/send/now/log`; flattened Airtable rows are plain field objects (`{ ...fields, id, createdTime }`); run all tests with `npm test`.

---

## Phase A — Per-event address plumbing

### Task A1: Surface an `address` column from the event sheet parser

**Files:**
- Modify: `netlify/functions/lib/events.js:28-51` (`parseEvents`)
- Test: `tests/events.test.js` (create if absent; otherwise append)

- [ ] **Step 1: Write the failing test**

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseEvents } = require("../netlify/functions/lib/events.js");

test("parseEvents reads an Address column", () => {
  const csv = "Market,Date,Active,Event,Details,Address\nGreen Bay,2026-09-12,yes,Fall OTT,,123 Dyno Rd, Green Bay WI\n";
  const map = parseEvents(csv);
  assert.equal(map["green bay"].address, "123 Dyno Rd, Green Bay WI");
});
test("parseEvents address defaults to empty when column absent", () => {
  const csv = "Market,Date,Active\nOmaha,2026-06-28,yes\n";
  assert.equal(parseEvents(csv)["omaha"].address, "");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/events.test.js`
Expected: FAIL — `address` is `undefined`.

- [ ] **Step 3: Implement**

In `parseEvents`, add `address` to the `ci` index map and the output object:

```js
  const ci = {
    market: header.indexOf("market"), date: header.indexOf("date"),
    active: header.indexOf("active"), event: header.indexOf("event"),
    details: header.indexOf("details"), address: header.indexOf("address"),
  };
```

and inside the row loop, add to the emitted object:

```js
      details: ci.details >= 0 ? (row[ci.details] || "").trim() : "",
      address: ci.address >= 0 ? (row[ci.address] || "").trim() : "",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/events.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/events.js tests/events.test.js
git commit -m "feat(events): parse per-event Address column"
```

### Task A2: Add `address` to every baked event

**Files:**
- Modify: `netlify/functions/lib/events-data.js`

- [ ] **Step 1: Add an `address` key to each entry** (empty string for now; owner fills per event). Example for two rows — apply to all eight:

```js
  "cedar rapids": { dateISO: "2026-06-27", label: "June 27, 2026", active: true, event: "Cedar Rapids, Iowa Summer 2026 OTT Event", details: "", address: "" },
  "des moines":   { dateISO: "2026-06-28", label: "June 28, 2026", active: true, event: "Des Moines, Iowa Summer 2026 OTT Event", details: "", address: "" },
```

- [ ] **Step 2: Verify nothing breaks**

Run: `npm test`
Expected: PASS (existing suites unaffected).

- [ ] **Step 3: Commit**

```bash
git add netlify/functions/lib/events-data.js
git commit -m "feat(events): add address field to baked events"
```

---

## Phase B — Central-time helper

### Task B1: `lib/central-time.js`

**Files:**
- Create: `netlify/functions/lib/central-time.js`
- Test: `tests/central-time.test.js`

- [ ] **Step 1: Write the failing test**

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { centralParts, daysBetweenISO } = require("../netlify/functions/lib/central-time.js");

test("centralParts returns Central wall-clock hour + date (CDT)", () => {
  // 2026-06-25 12:00 UTC == 07:00 CDT
  const p = centralParts(new Date("2026-06-25T12:00:00Z"));
  assert.equal(p.dateISO, "2026-06-25");
  assert.equal(p.hour, 7);
});
test("centralParts handles CST (winter, UTC-6)", () => {
  // 2026-01-15 13:00 UTC == 07:00 CST
  const p = centralParts(new Date("2026-01-15T13:00:00Z"));
  assert.equal(p.hour, 7);
});
test("daysBetweenISO counts whole calendar days", () => {
  assert.equal(daysBetweenISO("2026-06-25", "2026-07-25"), 30);
  assert.equal(daysBetweenISO("2026-06-29", "2026-06-28"), -1);
  assert.equal(daysBetweenISO("2026-06-28", "2026-06-28"), 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/central-time.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// netlify/functions/lib/central-time.js
// Central-time helpers. Uses Intl so DST (CDT/CST) is handled automatically.
function centralParts(date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  let hour = parseInt(p.hour, 10);
  if (hour === 24) hour = 0; // some platforms emit "24" for midnight
  return { dateISO: `${p.year}-${p.month}-${p.day}`, hour };
}
function daysBetweenISO(fromISO, toISO) {
  const u = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((u(toISO) - u(fromISO)) / 86400000);
}
module.exports = { centralParts, daysBetweenISO };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/central-time.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/central-time.js tests/central-time.test.js
git commit -m "feat(reminders): Central-time helper (DST-safe hour + day diff)"
```

---

## Phase C — Booking Modifications field

### Task C1: Persist `Modifications` in `book.js`

**Files:**
- Modify: `netlify/functions/book.js:46-64` (priority fields) and `:81-87` (booking fields)
- Test: `tests/book.test.js`

- [ ] **Step 1: Write the failing test** (append):

```js
test("booking persists Modifications from payload", async () => {
  const created = [];
  const deps = bookingDeps({ // use this file's existing helper; see note below
    createRecord: async ({ fields }) => { created.push(fields); return { id: "rec1" }; },
  });
  await processBooking({ city: "Omaha", slot: "9:00", name: "A", email: "a@x.com", vehicle: "2024+ Toyota Tacoma 2.4L-T I4", mods: "3in lift, 35s" }, deps);
  const booking = created.find((f) => f.Slot);
  assert.equal(booking.Modifications, "3in lift, 35s");
});
```

> Note: reuse the existing dependency-stub helper in `tests/book.test.js`. If the file builds deps inline per test, copy that exact stub shape and add the `createRecord` override above. Inspect the top of `tests/book.test.js` first and match its pattern.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/book.test.js`
Expected: FAIL — `Modifications` is `undefined`.

- [ ] **Step 3: Implement**

In the booking `createRecord` fields object (`book.js:81-87`) add:

```js
      Vehicle: d.vehicle || "", Goals: d.goals || "", Modifications: d.mods || "", Installer: inst.key,
```

In the `priority()` `pfields` object (`book.js:47-52`) add `Modifications: d.mods || ""`:

```js
      Vehicle: d.vehicle || "", Goals: d.goals || "", Modifications: d.mods || "", Installer: inst.key,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/book.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/book.js tests/book.test.js
git commit -m "feat(book): persist vehicle Modifications on bookings + priority"
```

### Task C2: Add the Modifications input to the booking form

**Files:**
- Modify: `site/find-your-exact-tune.html:432-433` (add field) and `:911-918` (payload)

- [ ] **Step 1: Add the input** after the `fVeh` field (line 432), before the `fMsg` field:

```html
      <div class="tf-field"><label for="fMods">Modifications</label><input id="fMods" type="text" placeholder="Lift, tires, exhaust, intake, supercharger…"></div>
```

- [ ] **Step 2: Send it in the booking payload** — in the `#fSubmit` handler (line ~909), capture it and add to `payload`:

```js
  const msg=$("#fMsg").value.trim();
  const mods=$("#fMods").value.trim();
```

```js
    name, phone, email, vehicle:$("#fVeh").value, mods,
```

- [ ] **Step 3: Manual check**

Run: `npm test` (no test covers static HTML; ensure suite still green).
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add site/find-your-exact-tune.html
git commit -m "feat(funnel): collect vehicle Modifications on the booking step"
```

> **Owner action (out of band):** add a `Modifications` text column to the Airtable **Bookings** and **Priority List** tables, or the writes are silently dropped.

---

## Phase D — Certificate OTT Calibration line

### Task D1: Render the calibration on the certificate

**Files:**
- Modify: `netlify/functions/lib/certificate.js:15-26`
- Test: `tests/certificate.test.js`

- [ ] **Step 1: Write the failing test** (append):

```js
test("certificate shows the OTT Calibration when provided", () => {
  const { html } = buildCertificate({ name: "Jane Driver", retailer: "Cody Star", vehicle: "2024+ Toyota Tacoma", calibration: "spicy", calibrationDate: "2026-06-28" });
  assert.ok(/OTT Calibration/.test(html));
  assert.ok(/spicy/.test(html));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/certificate.test.js`
Expected: FAIL — no calibration row.

- [ ] **Step 3: Implement**

Change the signature and add a non-editable row (the installer already typed the value into Airtable):

```js
function buildCertificate({ name, retailer, vehicle, calibration, calibrationDate }) {
  const subject = `Certificate of Authenticity — ${name || "Customer"}${vehicle ? ` · ${vehicle}` : ""}`;
  const rows = [
    fieldRow("Date Calibration Applied", calibrationDate || "", true),
    fieldRow("OTT Retailer", retailer || "", false),
    fieldRow("OTT Calibration", calibration || "", false),
    fieldRow("Customer Name", name || "", false),
    fieldRow("VIN", "", true),
    fieldRow("Vehicle Year", "", true),
    fieldRow("Vehicle Type", "", true),
    fieldRow("Engine Size", "", true),
    fieldRow("Mileage", "", true),
  ].join("");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/certificate.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/certificate.js tests/certificate.test.js
git commit -m "feat(certificate): render OTT Calibration line"
```

### Task D2: Pass the Airtable field into the certificate dispatcher

**Files:**
- Modify: `netlify/functions/certificate-dispatch.js:26`
- Test: `tests/certificate-dispatch.test.js`

- [ ] **Step 1: Write the failing test** — assert the dispatched attachment HTML contains the calibration. Match the existing stub shape in `tests/certificate-dispatch.test.js`; add a row whose fields include `"OTT Calibration": "SS"` and assert the captured `send` attachment (base64-decoded) contains `SS`. Example assertion body:

```js
  const html = Buffer.from(sent[0].attachments[0].content, "base64").toString("utf8");
  assert.ok(/OTT Calibration/.test(html) && /SS/.test(html));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/certificate-dispatch.test.js`
Expected: FAIL — calibration not passed through.

- [ ] **Step 3: Implement** — at `certificate-dispatch.js:26`:

```js
    const { subject, html } = buildCertificate({ name: f.Name, retailer: inst.name, vehicle: f.Vehicle, calibration: f["OTT Calibration"], calibrationDate: f["Calibration Date"] });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/certificate-dispatch.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/certificate-dispatch.js tests/certificate-dispatch.test.js
git commit -m "feat(certificate): pass OTT Calibration field into dispatch"
```

---

## Phase E — Roster renderer

### Task E1: `lib/roster-render.js`

**Files:**
- Create: `netlify/functions/lib/roster-render.js`
- Test: `tests/roster-render.test.js`

- [ ] **Step 1: Write the failing test**

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { renderRosterEmail } = require("../netlify/functions/lib/roster-render.js");

const event = { city: "Green Bay", state: "WI", label: "Sep 12, 2026", dateISO: "2026-09-12", address: "123 Dyno Rd" };
const bookings = [
  { Slot: "9:20", Name: "B Two", Vehicle: "2024+ Toyota Tacoma 2.4L-T I4", Phone: "p2", Email: "b@x.com", Modifications: "35s", Goals: "Towing confidence" },
  { Slot: "9:00", Name: "A One", Vehicle: "2021 Toyota 4Runner 4.0L V6", Phone: "p1", Email: "a@x.com", Modifications: "", Goals: "Sharper daily response" },
];
const waitlist = [{ Name: "W Lister", Phone: "p3", Email: "w@x.com", Reason: "Event full" }];

test("roster sorts by slot, basics-only columns, no goal blurbs", () => {
  const { subject, html, text } = renderRosterEmail(event, bookings, waitlist);
  assert.match(subject, /Green Bay/);
  // sorted: 9:00 before 9:20
  assert.ok(html.indexOf("A One") < html.indexOf("B Two"));
  // columns present
  ["Time", "Name", "Vehicle", "Phone", "Email", "Mods"].forEach((h) => assert.ok(html.includes(h)));
  // mods + vehicle present
  assert.ok(html.includes("35s") && html.includes("2024+ Toyota Tacoma 2.4L-T I4"));
  // goal blurbs excluded
  assert.ok(!/Towing confidence|Sharper daily response/.test(html));
  // waitlist section
  assert.ok(html.includes("W Lister") && /waitlist/i.test(html));
  // text fallback exists
  assert.ok(text.includes("A One"));
});
test("roster handles empty bookings + empty waitlist", () => {
  const { html } = renderRosterEmail(event, [], []);
  assert.ok(/no bookings/i.test(html));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/roster-render.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// netlify/functions/lib/roster-render.js
const { formatSlot } = require("./slots.js");
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function bySlot(a, b) { return String(a.Slot || "").localeCompare(String(b.Slot || ""), undefined, { numeric: true }); }

function renderRosterEmail(event, bookings, waitlist) {
  const evLabel = `${event.city}, ${event.state || ""} · ${event.label || event.dateISO}`;
  const subject = `Tuned Yota — ${event.city} Roster · ${event.label || event.dateISO}`;
  const sorted = (bookings || []).slice().sort(bySlot);

  const head = ["Time", "Name", "Vehicle", "Phone", "Email", "Mods"];
  const bodyRows = sorted.map((b) => [
    b.Slot ? formatSlot(b.Slot) : "", b.Name || "", b.Vehicle || "", b.Phone || "", b.Email || "", b.Modifications || "",
  ]);

  const th = head.map((h) => `<th style="text-align:left;padding:4px 12px 4px 0;color:#7c8472;border-bottom:1px solid #ccc">${h}</th>`).join("");
  const trs = bodyRows.length
    ? bodyRows.map((r) => `<tr>${r.map((c) => `<td style="padding:4px 12px 4px 0;color:#3A2E26">${esc(c)}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="6" style="padding:8px 0;color:#7c8472">No bookings yet.</td></tr>`;

  const wl = (waitlist || []).map((w) => `<li>${esc(w.Name || "")} — ${esc(w.Phone || w.Email || "")}${w.Reason ? ` (${esc(w.Reason)})` : ""}</li>`).join("");
  const wlHtml = `<h3 style="color:#5B4B42;margin:18px 0 4px">Priority waitlist</h3>` + (wl ? `<ul>${wl}</ul>` : `<p style="color:#7c8472">None.</p>`);

  const html =
    `<div style="font-family:Arial,sans-serif;color:#3A2E26;max-width:680px">` +
    `<h2 style="color:#5B4B42;margin:0 0 2px">${esc(evLabel)}</h2>` +
    `<p style="color:#7c8472;margin:0 0 12px">9:00 AM start${event.address ? ` · ${esc(event.address)}` : ""} · ${sorted.length} booked</p>` +
    `<table style="border-collapse:collapse;font-size:14px"><tr>${th}</tr>${trs}</table>` +
    wlHtml + `</div>`;

  const text =
    `${evLabel}\n9:00 AM start${event.address ? ` · ${event.address}` : ""}\n\n` +
    (bodyRows.length ? bodyRows.map((r) => r.join("  |  ")).join("\n") : "No bookings yet.") +
    `\n\nPriority waitlist:\n` + ((waitlist || []).map((w) => `- ${w.Name || ""} ${w.Phone || w.Email || ""}${w.Reason ? ` (${w.Reason})` : ""}`).join("\n") || "None.");

  return { subject, html, text };
}
module.exports = { renderRosterEmail };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/roster-render.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/roster-render.js tests/roster-render.test.js
git commit -m "feat(reminders): installer roster email renderer"
```

---

## Phase F — Customer event-reminder template

### Task F1: `buildEventReminderCustomerEmail`

**Files:**
- Modify: `netlify/functions/lib/templates.js` (add builder + export)
- Test: `tests/templates.test.js`

- [ ] **Step 1: Write the failing test** (append):

```js
const tplR = require("../netlify/functions/lib/templates.js");
test("event reminder names date, time, city, and address", () => {
  const booking = { Name: "Jane Doe", Email: "jane@x.com" };
  const event = { city: "Green Bay", state: "WI", label: "Sep 12, 2026", dateISO: "2026-09-12", address: "123 Dyno Rd, Green Bay WI" };
  const inst = { name: "Noah Kreis", phone: "(920) 860-7050" };
  const m = tplR.buildEventReminderCustomerEmail(booking, event, inst, 2);
  assert.match(m.subject, /Green Bay/);
  assert.ok(m.html.includes("123 Dyno Rd, Green Bay WI"));
  assert.ok(m.html.includes("9:00 AM") && m.html.includes("Sep 12, 2026"));
  assert.ok(m.text.includes("Jane"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/templates.test.js`
Expected: FAIL — builder undefined.

- [ ] **Step 3: Implement** — add before `module.exports` in `templates.js`:

```js
function buildEventReminderCustomerEmail(booking, event, inst, daysUntil) {
  const first = (booking.Name || "there").split(" ")[0];
  const when = `${event.label || event.dateISO} at 9:00 AM`;
  const where = `${event.city}, ${event.state || ""}`.trim().replace(/,\s*$/, "");
  const subject = `Tuned Yota — ${event.city} event ${daysUntil === 2 ? "in 2 days" : "coming up"}`;
  const addr = event.address ? `\nAddress: ${event.address}` : "";
  const text =
    `Hi ${first},\n\nYour Tuned Yota tuning event is ${daysUntil === 2 ? "in 2 days" : "coming up"}.\n\n` +
    `When: ${when}\nWhere: ${where}${addr}\n\n` +
    `Please save the address above so you know exactly where to go. ` +
    `Questions? Call or text ${inst.name} at ${inst.phone}.\n\n— Tuned Yota · Undeniable Performance\n`;
  const addrHtml = event.address
    ? `<tr><td style="padding:4px 12px 4px 0;color:#7c8472;font-weight:700">Address</td><td style="padding:4px 0;color:#3A2E26"><strong>${esc(event.address)}</strong></td></tr>`
    : "";
  const html =
    `<div style="font-family:Arial,sans-serif;color:#3A2E26;max-width:560px">` +
    `<h2 style="color:#5B4B42">See you soon, ${esc(first)}.</h2>` +
    `<p>Your tuning event is <strong>${daysUntil === 2 ? "in 2 days" : "coming up"}</strong>. Here are the details:</p>` +
    `<table style="border-collapse:collapse;font-size:14px">` +
    `<tr><td style="padding:4px 12px 4px 0;color:#7c8472;font-weight:700">When</td><td style="padding:4px 0;color:#3A2E26">${esc(when)}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#7c8472;font-weight:700">Where</td><td style="padding:4px 0;color:#3A2E26">${esc(where)}</td></tr>` +
    addrHtml + `</table>` +
    `<p style="margin-top:12px">Please save the address so you know exactly where to go. Questions? Call or text <strong>${esc(inst.phone)}</strong>.</p>` +
    `<p style="color:#7c8472;font-weight:700;letter-spacing:.04em">— Tuned Yota · Undeniable Performance</p></div>`;
  return { subject, html, text };
}
```

and add `buildEventReminderCustomerEmail` to `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/templates.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/templates.js tests/templates.test.js
git commit -m "feat(reminders): customer event-address reminder template"
```

---

## Phase G — The dispatch planner

### Task G1: `lib/event-plan.js`

**Files:**
- Create: `netlify/functions/lib/event-plan.js`
- Test: `tests/event-plan.test.js`

- [ ] **Step 1: Write the failing test**

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { planDispatch, SWEEP_REASON } = require("../netlify/functions/lib/event-plan.js");

const ev = { city: "Green Bay", state: "WI", dateISO: "2026-09-12", label: "Sep 12, 2026", active: true, address: "123 Dyno Rd" };
const bk = (over) => ({ City: "Green Bay", "Event Date": "2026-09-12", Slot: "9:00", Name: "A", Email: "a@x.com", Status: "Booked", ...over });

test("no actions unless it is 7 AM Central", () => {
  const at = (h) => planDispatch({ events: [ev], bookings: [bk()], priority: [], nowCentral: { dateISO: "2026-09-12", hour: h } });
  assert.equal(at(6).length, 0);
  assert.equal(at(8).length, 0);
  assert.ok(at(7).length > 0);
});
test("installer roster at 30/15/10/2/0 days", () => {
  for (const [date, du] of [["2026-08-13", 30], ["2026-08-28", 15], ["2026-09-02", 10], ["2026-09-10", 2], ["2026-09-12", 0]]) {
    const a = planDispatch({ events: [ev], bookings: [bk()], priority: [], nowCentral: { dateISO: date, hour: 7 } });
    const roster = a.find((x) => x.type === "installer-roster");
    assert.ok(roster, `roster expected at ${du}d`);
    assert.equal(roster.daysUntil, du);
  }
});
test("no roster on a non-offset day", () => {
  const a = planDispatch({ events: [ev], bookings: [bk()], priority: [], nowCentral: { dateISO: "2026-09-05", hour: 7 } });
  assert.ok(!a.some((x) => x.type === "installer-roster"));
});
test("customer notify at 10 and 2 days, skips cancelled + no-email", () => {
  const bookings = [bk(), bk({ Status: "Cancelled", Email: "c@x.com" }), bk({ Email: "" })];
  const a = planDispatch({ events: [ev], bookings, priority: [], nowCentral: { dateISO: "2026-09-10", hour: 7 } });
  const notes = a.filter((x) => x.type === "customer-notify");
  assert.equal(notes.length, 1);
  assert.equal(notes[0].booking.Email, "a@x.com");
});
test("post-event sweep at -1 for all non-completed, dedup against existing", () => {
  const bookings = [bk({ Status: "Booked", Email: "a@x.com" }), bk({ Status: "No-show", Email: "n@x.com" }), bk({ Status: "Cancelled", Email: "c@x.com" }), bk({ Status: "Completed", Email: "done@x.com" })];
  const priority = [{ City: "Green Bay", Email: "a@x.com", "Event Date": "2026-09-12", Reason: SWEEP_REASON }];
  const a = planDispatch({ events: [ev], bookings, priority, nowCentral: { dateISO: "2026-09-13", hour: 7 } });
  const swept = a.filter((x) => x.type === "waitlist-sweep").map((x) => x.booking.Email).sort();
  assert.deepEqual(swept, ["c@x.com", "n@x.com"]); // a@ already queued, done@ completed
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/event-plan.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// netlify/functions/lib/event-plan.js
// Pure planner: decides every reminder/sweep action from data + the current
// Central-time moment. No I/O. Acts only at 07:00 America/Chicago.
const { daysBetweenISO } = require("./central-time.js");

const SWEEP_REASON = "Rebook — not completed";
const INSTALLER_OFFSETS = [30, 15, 10, 2, 0];
const CUSTOMER_OFFSETS = [10, 2];
const norm = (s) => String(s == null ? "" : s).trim().toLowerCase();

function planDispatch({ events = [], bookings = [], priority = [], nowCentral }) {
  const actions = [];
  if (!nowCentral || nowCentral.hour !== 7) return actions;
  const today = nowCentral.dateISO;

  for (const ev of events) {
    if (!ev || !ev.active || !ev.dateISO) continue;
    const du = daysBetweenISO(today, ev.dateISO);
    const evBookings = bookings.filter((b) => norm(b.City) === norm(ev.city) && b["Event Date"] === ev.dateISO);

    if (INSTALLER_OFFSETS.includes(du)) {
      const evWaitlist = priority.filter((p) => norm(p.City) === norm(ev.city));
      actions.push({ type: "installer-roster", event: ev, daysUntil: du, bookings: evBookings, waitlist: evWaitlist });
    }

    if (CUSTOMER_OFFSETS.includes(du)) {
      for (const b of evBookings) {
        if (norm(b.Status) === "cancelled" || !b.Email) continue;
        actions.push({ type: "customer-notify", event: ev, daysUntil: du, booking: b });
      }
    }

    if (du === -1) {
      const queued = new Set(
        priority.filter((p) => p.Reason === SWEEP_REASON)
          .map((p) => `${norm(p.Email)}|${p["Event Date"] || ""}`)
      );
      for (const b of evBookings) {
        if (norm(b.Status) === "completed") continue;
        const key = `${norm(b.Email)}|${b["Event Date"] || ""}`;
        if (queued.has(key)) continue;
        actions.push({ type: "waitlist-sweep", event: ev, booking: b });
      }
    }
  }
  return actions;
}
module.exports = { planDispatch, SWEEP_REASON, INSTALLER_OFFSETS, CUSTOMER_OFFSETS };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/event-plan.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/event-plan.js tests/event-plan.test.js
git commit -m "feat(reminders): pure dispatch planner (offsets, gate, sweep, dedup)"
```

---

## Phase H — The scheduled executor

### Task H1: `event-reminders.js` (executor)

**Files:**
- Create: `netlify/functions/event-reminders.js`
- Test: `tests/event-reminders.test.js`

- [ ] **Step 1: Write the failing test**

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runReminders } = require("../netlify/functions/event-reminders.js");

function deps(over = {}) {
  const sends = [], creates = [];
  // Green Bay → noah (markets.js); event is 2 days out from `now`.
  const events = { "green bay": { city: "Green Bay", state: "WI", dateISO: "2026-09-12", label: "Sep 12, 2026", active: true, address: "123 Dyno Rd" } };
  const bookings = [{ id: "b1", fields: { City: "Green Bay", "Event Date": "2026-09-12", Slot: "9:00", Name: "A", Email: "a@x.com", Status: "Booked" } }];
  return {
    env: { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", RESEND_API_KEY: "re", SLACK_WEBHOOK_URL: "https://hooks.slack.test/x" },
    now: new Date("2026-09-10T12:00:00Z"), // 07:00 CDT, 2 days before
    loadEvents: async () => events,
    listAll: async ({ table }) => (table === "Bookings" ? bookings : []),
    create: async (a) => { creates.push(a); return { id: "p1" }; },
    send: async (a) => { sends.push(a); return { id: "e" }; },
    notify: async () => ({ ok: true }),
    log: { warn() {}, error() {} },
    _sends: sends, _creates: creates,
    ...over,
  };
}

test("2-day mark: installer roster to noah + customer notify", async () => {
  const d = deps();
  await runReminders(d);
  const toNoah = d._sends.find((s) => s.to === "noah@tunedyota.com");
  assert.ok(toNoah, "roster to installer");
  assert.match(toNoah.subject, /Roster/);
  const toCust = d._sends.find((s) => s.to === "a@x.com");
  assert.ok(toCust, "customer notify");
  assert.ok(toCust.html.includes("123 Dyno Rd"));
});
test("off-hour does nothing", async () => {
  const d = deps({ now: new Date("2026-09-10T20:00:00Z") }); // 15:00 CDT
  await runReminders(d);
  assert.equal(d._sends.length, 0);
});
test("post-event sweep creates a priority record", async () => {
  const bookings = [{ id: "b1", fields: { City: "Green Bay", "Event Date": "2026-09-12", Slot: "9:00", Name: "A", Email: "a@x.com", Status: "Booked" } }];
  const d = deps({ now: new Date("2026-09-13T12:00:00Z"), listAll: async ({ table }) => (table === "Bookings" ? bookings : []) });
  await runReminders(d);
  assert.equal(d._creates.length, 1);
  assert.equal(d._creates[0].fields.Reason, "Rebook — not completed");
  assert.equal(d._creates[0].fields.City, "Green Bay");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/event-reminders.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// netlify/functions/event-reminders.js
// Hourly scheduled function. Acts only at 07:00 America/Chicago (2 h before the
// 9 AM event start). Sends installer rosters (30/15/10/2/0d), customer address
// notifications (10/2d), and runs the post-event waitlist sweep (-1d).
const EVENTS = require("./lib/events-data.js");
const { fetchEvents } = require("./lib/events.js");
const { cfg, listAllRecords, createRecord } = require("./lib/airtable.js");
const { getMarket } = require("./lib/markets.js");
const { keyToInstaller } = require("./lib/routing.js");
const { sendEmail } = require("./lib/resend.js");
const { notifyOwner } = require("./lib/alert.js");
const { centralParts } = require("./lib/central-time.js");
const { planDispatch, SWEEP_REASON } = require("./lib/event-plan.js");
const { renderRosterEmail } = require("./lib/roster-render.js");
const tpl = require("./lib/templates.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";

function flatten(records) { return (records || []).map((r) => ({ ...r.fields, id: r.id })); }

async function runReminders(deps) {
  const { env = process.env, now = new Date(), fetchImpl = fetch,
          loadEvents = (a) => fetchEvents(a),
          listAll = (a) => listAllRecords({ fetchImpl, ...a }),
          create = (a) => createRecord({ fetchImpl, ...a }),
          send = sendEmail, notify = notifyOwner, log = console } = deps;
  const nowCentral = centralParts(now);
  if (nowCentral.hour !== 7) return { ok: true, skipped: "off-hour" };

  const c = cfg(env);
  const eventMap = await loadEvents({ fetchImpl, sheetId: env.EVENTS_SHEET_ID, baked: EVENTS, log });
  const events = Object.values(eventMap);
  const [bRecs, pRecs] = await Promise.all([
    listAll({ token: c.token, baseId: c.baseId, table: c.bookings }),
    listAll({ token: c.token, baseId: c.baseId, table: c.priority }),
  ]);
  const bookings = flatten(bRecs);
  const priority = flatten(pRecs);

  const actions = planDispatch({ events, bookings, priority, nowCentral });
  const failures = [];

  for (const act of actions) {
    const market = getMarket(act.event.city);
    const inst = keyToInstaller(market && market.inst);
    try {
      if (act.type === "installer-roster") {
        const m = renderRosterEmail(act.event, act.bookings, act.waitlist);
        await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: inst.email, replyTo: OWNER,
          subject: `${m.subject} (${act.daysUntil === 0 ? "morning-of" : act.daysUntil + "-day"})`, html: m.html, text: m.text });
      } else if (act.type === "customer-notify") {
        const m = tpl.buildEventReminderCustomerEmail(act.booking, act.event, inst, act.daysUntil);
        await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: act.booking.Email, replyTo: OWNER,
          subject: m.subject, html: m.html, text: m.text });
      } else if (act.type === "waitlist-sweep") {
        const b = act.booking;
        await create({ token: c.token, baseId: c.baseId, table: c.priority, fields: {
          City: act.event.city, Name: b.Name || "", Phone: b.Phone || "", Email: b.Email || "",
          Vehicle: b.Vehicle || "", Modifications: b.Modifications || "", Installer: inst.key,
          Reason: SWEEP_REASON, "Event Date": b["Event Date"] || act.event.dateISO,
        } });
      }
    } catch (e) {
      failures.push(`${act.type}:${act.event.city}:${e.message}`);
      if (log.error) log.error("reminder action", act.type, e.message);
    }
  }

  if (failures.length) {
    try { await notify({ fetchImpl, webhookUrl: env.SLACK_WEBHOOK_URL, text: `⚠️ event-reminders had ${failures.length} failure(s): ${failures.join(" · ")}`, log }); }
    catch (e) { if (log.error) log.error("reminder notify", e.message); }
  }
  return { ok: true, actions: actions.length, failures: failures.length };
}

async function handler() { const r = await runReminders({}); return { statusCode: 200, body: JSON.stringify(r) }; }
module.exports = { handler, runReminders };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/event-reminders.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/event-reminders.js tests/event-reminders.test.js
git commit -m "feat(reminders): scheduled executor for rosters, notifications, sweep"
```

### Task H2: Register the hourly cron

**Files:**
- Modify: `netlify.toml`

- [ ] **Step 1: Add the schedule block** after the `email-health` block:

```toml
# Hourly; acts only at 07:00 America/Chicago (netlify/functions/event-reminders.js).
[functions."event-reminders"]
  schedule = "0 * * * *"
```

- [ ] **Step 2: Commit**

```bash
git add netlify.toml
git commit -m "chore(reminders): schedule event-reminders hourly (gated to 7 AM Central)"
```

---

## Phase I — Monthly executive summary (replaces weekly region reports)

### Task I1: Revert region fan-out; rename to Monthly Executive Summary

**Files:**
- Modify: `netlify/functions/submissions-report.js`
- Modify: `tests/submissions-report.test.js`

- [ ] **Step 1: Update the tests first** — replace the two region-report tests added in `46515ca` with a single-send expectation. The "delivers …" test should assert exactly one send to `info@tunedyota.com`:

```js
test("delivers Slack summary + single owner digest with contacts.csv", async () => {
  const d = deps();
  await runReport(d);
  assert.equal(d._notifies.length, 1);
  assert.equal(d._sends.length, 1);
  assert.equal(d._sends[0].to, "info@tunedyota.com");
  assert.match(d._sends[0].subject, /Executive Summary/);
  assert.equal(d._sends[0].attachments[0].filename, "contacts.csv");
});
```

Delete the `"sends a region booking report…"` test added in `46515ca`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/submissions-report.test.js`
Expected: FAIL — currently sends region reports + subject is "Submissions Digest".

- [ ] **Step 3: Implement** — in `submissions-report.js`:
  1. Remove the `require` of `markets.js` and `routing.js` added in `46515ca`.
  2. Delete the entire per-installer loop (the `for (const inst of Object.values(INSTALLERS))` block) and the `regionFailures` handling.
  3. Change the master subject to `Tuned Yota — Monthly Executive Summary (${report.generatedFor.monthLabel})`.
  4. `return { ok: true, emailFailed };`

The post-funnel section should read exactly:

```js
  const csv = renderContactsCsv(report);
  let emailFailed = false;
  try {
    await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: env.REPORT_TO || "info@tunedyota.com",
      subject: `Tuned Yota — Monthly Executive Summary (${report.generatedFor.monthLabel})`,
      html: renderEmailHtml(report),
      attachments: [{ filename: "contacts.csv", content: Buffer.from(csv).toString("base64") }] });
  } catch (e) { emailFailed = true; if (log.error) log.error("report email", e.message); }

  report.contactsEmailFailed = emailFailed;
  let slack = renderSlack(report);
  if (emailFailed) slack += `\n(full report email failed — domain pending verification)`;
  try { await notify({ fetchImpl, webhookUrl: env.SLACK_WEBHOOK_URL, text: slack, log }); }
  catch (e) { if (log.error) log.error("report slack", e.message); }
  return { ok: true, emailFailed };
```

(Keep the `bookings`/`priority`/`events` locals and the funnel block as-is.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/submissions-report.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/submissions-report.js tests/submissions-report.test.js
git commit -m "refactor(reports): owner-only Monthly Executive Summary (drop region fan-out)"
```

### Task I2: Switch the digest cron to monthly

**Files:**
- Modify: `netlify.toml:9-11`

- [ ] **Step 1: Change the schedule**

```toml
# Monthly executive summary on the 1st (netlify/functions/submissions-report.js).
[functions."submissions-report"]
  schedule = "0 13 1 * *"
```

- [ ] **Step 2: Commit**

```bash
git add netlify.toml
git commit -m "chore(reports): run executive summary monthly (1st, 13:00 UTC)"
```

---

## Phase J — Add the Green Bay event

### Task J1: Schedule Green Bay (Noah / WI)

- [ ] **Step 1:** Invoke the **schedule-event** skill and follow it to add **Green Bay, WI** for **Noah** with the owner-provided **date** and **venue address**. The skill covers the multi-file sync (`events-data.js`, client `MARKETS` in `find-your-exact-tune.html`, SEO regen). `markets.js` already maps Green Bay → `noah`, so no routing change is needed.

- [ ] **Step 2:** Set the new event's `address` field (Task A1/A2 added support) to the venue address.

- [ ] **Step 3:** Run `npm run build:seo` then `npm test`; expected PASS.

- [ ] **Step 4: Commit** per the schedule-event skill's guidance.

> **Owner action:** provide the Green Bay **date** + **venue address** before this task.

---

## Phase K — Ship

### Task K1: Final verification + deploy

- [ ] **Step 1:** `npm run build:seo` (idempotent) then `npm test` — full suite green.
- [ ] **Step 2:** Confirm Airtable owner actions are done: `Modifications` column on **Bookings** + **Priority List**; `OTT Calibration` already present.
- [ ] **Step 3:** Use the **ship** skill (regenerate → test → push `master` → confirm Netlify `ready` → verify live). The scheduled functions (`event-reminders`, `submissions-report`) are backend — verify by checking the Netlify Functions list shows them scheduled; they can't be curl-verified.

---

## Self-Review (completed by plan author)

- **Spec coverage:** Piece 1 → I1/I2. Piece 2 → E1+G1+H1. Piece 3 → G1+H1 (sweep). Piece 4 → F1+H1. Piece 5 → C1/C2 + E1. Piece 6 → D1/D2. Piece 7 → J1. Address prereq → A1/A2. Central gate → B1. All covered.
- **Type consistency:** `planDispatch` returns `{type, event, daysUntil?, bookings?, waitlist?, booking?}`; the executor switches on the same `type` strings (`installer-roster`/`customer-notify`/`waitlist-sweep`) and `SWEEP_REASON` is shared from `event-plan.js`. `renderRosterEmail(event, bookings, waitlist)` and `buildEventReminderCustomerEmail(booking, event, inst, daysUntil)` signatures match their call sites in H1. `centralParts`/`daysBetweenISO` names match across B1/G1/H1.
- **Placeholder scan:** no TBDs; the only owner-supplied values (Green Bay date/address, Airtable columns) are called out as explicit out-of-band owner actions, not code placeholders.
