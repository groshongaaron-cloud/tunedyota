# Event Ops Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a day-of customer notice, a post-event rebook report (T+1 + weekly, grouped by location + installer), and a secret-gated mobile staff intake form (multi-channel + walk-ins).

**Architecture:** Three additive features reusing existing libs. Feature 1 extends the reminder offsets + customer email template. Feature 2 adds a pure renderer plus two send paths (a hook in `event-reminders.js` and a new weekly scheduled function). Feature 3 adds a secret-gated `intake.js` function (reusing `book.js`'s libs) and a static `site/intake.html` page.

**Tech Stack:** Node CommonJS Netlify functions, `node --test` runner (CJS tests, `fetchImpl`/`send` dependency injection so tests never hit the network), Resend for email, Airtable via `lib/airtable.js`.

**Conventions:**
- Tests: `const { test } = require("node:test")` + `require("node:assert/strict")`; inject `fetchImpl`, `send`, `env`, `now`.
- Every commit message ends with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Reminder/report emails come from `Tuned Yota <events@send.tunedyota.events>`, reply-to `info@tunedyota.com`.

**File structure:**
- Modify `netlify/functions/lib/event-plan.js` — add T‑0 to `CUSTOMER_OFFSETS`.
- Modify `netlify/functions/lib/templates.js` — day-of variant of `buildEventReminderCustomerEmail`.
- Create `netlify/functions/lib/rebook-render.js` — pure `renderRebookReport`.
- Create `netlify/functions/rebook-report.js` — weekly scheduled function.
- Modify `netlify/functions/event-reminders.js` — T+1 rebook report hook.
- Modify `netlify.toml` — register `rebook-report` schedule.
- Create `netlify/functions/intake.js` — secret-gated intake (book + lead).
- Create `site/intake.html` — mobile staff intake page.
- Tests: `tests/event-plan.test.js` (extend), `tests/templates.test.js` (extend), `tests/rebook-render.test.js` (new), `tests/rebook-report.test.js` (new), `tests/event-reminders.test.js` (extend), `tests/intake.test.js` (new).

---

### Task 1: Day-of offset in the planner

**Files:**
- Modify: `netlify/functions/lib/event-plan.js:8`
- Test: `tests/event-plan.test.js`

- [ ] **Step 1: Add the failing test** — append to `tests/event-plan.test.js`:

```js
test("a T-0 (event morning) event produces a customer-notify per booked emailed row", () => {
  const { planDispatch } = require("../netlify/functions/lib/event-plan.js");
  const nowCentral = { hour: 7, dateISO: "2026-09-12" };
  const events = [{ active: true, city: "Green Bay", dateISO: "2026-09-12" }];
  const bookings = [
    { City: "Green Bay", "Event Date": "2026-09-12", Email: "a@x.com", Status: "Booked" },
    { City: "Green Bay", "Event Date": "2026-09-12", Email: "", Status: "Booked" },       // no email → skipped
    { City: "Green Bay", "Event Date": "2026-09-12", Email: "c@x.com", Status: "Cancelled" }, // cancelled → skipped
  ];
  const actions = planDispatch({ events, bookings, priority: [], nowCentral });
  const custs = actions.filter((a) => a.type === "customer-notify" && a.daysUntil === 0);
  assert.equal(custs.length, 1);
  assert.equal(custs[0].booking.Email, "a@x.com");
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `node --test tests/event-plan.test.js`
Expected: FAIL — no `daysUntil === 0` customer-notify (offset 0 not in `CUSTOMER_OFFSETS`).

- [ ] **Step 3: Add 0 to the customer offsets** — in `netlify/functions/lib/event-plan.js` change line 8:

```js
const CUSTOMER_OFFSETS = [10, 2, 0];
```

- [ ] **Step 4: Run it, expect PASS**

Run: `node --test tests/event-plan.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/event-plan.js tests/event-plan.test.js
git commit -m "feat(events): day-of (T-0) customer reminder offset"
```

---

### Task 2: Day-of copy in the customer email

**Files:**
- Modify: `netlify/functions/lib/templates.js:133-158`
- Test: `tests/templates.test.js`

- [ ] **Step 1: Add the failing test** — append to `tests/templates.test.js`:

```js
test("day-of (daysUntil 0) customer email says today and names the slot", () => {
  const tpl = require("../netlify/functions/lib/templates.js");
  const booking = { Name: "Jane Doe", Slot: "9:40" };
  const event = { city: "Green Bay", state: "WI", label: "Sep 12, 2026", dateISO: "2026-09-12", address: "123 Main St" };
  const inst = { name: "Noah Kreis", phone: "(920) 860-7050" };
  const m = tpl.buildEventReminderCustomerEmail(booking, event, inst, 0);
  assert.match(m.subject, /today/i);
  assert.match(m.text, /today/i);
  assert.match(m.text, /9:40/);          // slot present
  assert.match(m.text, /123 Main St/);   // address present
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `node --test tests/templates.test.js`
Expected: FAIL — current subject/body only handle `daysUntil === 2` vs "coming up"; no "today".

- [ ] **Step 3: Implement the day-of variant** — in `netlify/functions/lib/templates.js`, replace the `subject` line and the two "in 2 days / coming up" phrases in `buildEventReminderCustomerEmail` (lines 137, 140, 150) so a `daysUntil === 0` case reads "today". Replace the function body's phrasing helpers by adding this near the top of the function (after line 134) and using `phrase`/`subjWhen`:

```js
  const phrase = daysUntil === 0 ? "today" : daysUntil === 2 ? "in 2 days" : "coming up";
  const subjWhen = daysUntil === 0 ? "is today" : daysUntil === 2 ? "in 2 days" : "coming up";
```

Then change:
- line 137 `const subject = \`Tuned Yota — ${event.city} event ${daysUntil === 2 ? "in 2 days" : "coming up"}\`;`
  → `const subject = \`Tuned Yota — your ${event.city} tune ${subjWhen}\`;`
- line 140 `...event is ${daysUntil === 2 ? "in 2 days" : "coming up"}.\n\n...`
  → `...event is ${phrase}.\n\n...`
- line 150 `...is <strong>${daysUntil === 2 ? "in 2 days" : "coming up"}</strong>...`
  → `...is <strong>${phrase}</strong>...`

(The `when` line already includes `formatSlot(booking.Slot)`, so the slot is present in body.)

- [ ] **Step 4: Run it, expect PASS** — and confirm no regression on the existing 2-day test.

Run: `node --test tests/templates.test.js`
Expected: PASS (new + existing).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/templates.js tests/templates.test.js
git commit -m "feat(events): day-of copy for the customer reminder email"
```

---

### Task 3: Rebook report renderer (pure)

**Files:**
- Create: `netlify/functions/lib/rebook-render.js`
- Test: `tests/rebook-render.test.js`

- [ ] **Step 1: Write the failing test** — `tests/rebook-render.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { renderRebookReport } = require("../netlify/functions/lib/rebook-render.js");

const ROWS = [
  { Name: "A One", Phone: "111", Vehicle: "Tundra", City: "Omaha", Reason: "Rebook — not completed", "Event Date": "2026-07-03", Installer: "cody" },
  { Name: "B Two", Email: "b@x.com", Vehicle: "Tacoma", City: "Omaha", Reason: "Event full", "Event Date": "2026-07-03", Installer: "cody" },
  { Name: "C Three", Phone: "333", Vehicle: "4Runner", City: "Madison", Reason: "Rebook — not completed", "Event Date": "2026-07-03", Installer: "aaron" },
];

test("renders all, grouped by city and by installer, with counts", () => {
  const m = renderRebookReport(ROWS, { title: "Weekly rebook backlog" });
  assert.match(m.subject, /Weekly rebook backlog \(3\)/);
  assert.match(m.text, /A One/); assert.match(m.text, /C Three/);
  assert.match(m.text, /Omaha \(2\)/);        // by location
  assert.match(m.text, /Madison \(1\)/);
  assert.match(m.text, /Cody Star \(2\)/);    // by installer (display name)
  assert.match(m.text, /Aaron Groshong \(1\)/);
});

test("empty input says none outstanding", () => {
  const m = renderRebookReport([], { title: "Weekly rebook backlog" });
  assert.match(m.subject, /\(0\)/);
  assert.match(m.text, /None outstanding/i);
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `node --test tests/rebook-render.test.js`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement** — `netlify/functions/lib/rebook-render.js`:

```js
// netlify/functions/lib/rebook-render.js
const { keyToInstaller } = require("./routing.js");
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function line(r) {
  return `${r.Name || ""} — ${r.Phone || r.Email || ""} · ${r.Vehicle || "—"} · ${r.City || "—"} · ${r.Reason || ""}${r["Event Date"] ? ` · ${r["Event Date"]}` : ""}`;
}
function groupBy(records, keyFn) {
  const m = new Map();
  for (const r of records) { const k = keyFn(r) || "—"; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  return m;
}
function renderRebookReport(records, opts = {}) {
  const title = opts.title || "Rebook backlog";
  const rows = records || [];
  const subject = `Tuned Yota — ${title} (${rows.length})`;
  if (!rows.length) {
    return {
      subject,
      text: `${title}\n\nNone outstanding.`,
      html: `<div style="font-family:Arial,sans-serif;color:#3A2E26"><h2 style="color:#5B4B42">${esc(title)}</h2><p>None outstanding.</p></div>`,
    };
  }
  const byCity = groupBy(rows, (r) => r.City);
  const byInst = groupBy(rows, (r) => keyToInstaller(r.Installer).name);
  const textSection = (label, map) => `${label}\n` +
    [...map.entries()].map(([k, list]) => `  ${k} (${list.length}):\n` + list.map((r) => `    - ${line(r)}`).join("\n")).join("\n") + "\n";
  const text = `${title} — ${rows.length} outstanding\n\nALL:\n` + rows.map((r) => `- ${line(r)}`).join("\n") +
    `\n\n` + textSection("BY LOCATION:", byCity) + `\n` + textSection("BY INSTALLER:", byInst);
  const htmlList = (list) => `<ul style="margin:2px 0 10px">` + list.map((r) => `<li style="color:#3A2E26">${esc(line(r))}</li>`).join("") + `</ul>`;
  const htmlSection = (label, map) => `<h3 style="color:#5B4B42;margin:14px 0 4px">${label}</h3>` +
    [...map.entries()].map(([k, list]) => `<p style="margin:6px 0 0;color:#7c8472;font-weight:700">${esc(k)} (${list.length})</p>${htmlList(list)}`).join("");
  const html = `<div style="font-family:Arial,sans-serif;color:#3A2E26;max-width:680px">` +
    `<h2 style="color:#5B4B42;margin:0 0 6px">${esc(title)} — ${rows.length} outstanding</h2>` +
    `<h3 style="color:#5B4B42;margin:14px 0 4px">All</h3>${htmlList(rows)}` +
    htmlSection("By location", byCity) + htmlSection("By installer", byInst) + `</div>`;
  return { subject, html, text };
}
module.exports = { renderRebookReport };
```

- [ ] **Step 4: Run it, expect PASS**

Run: `node --test tests/rebook-render.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/rebook-render.js tests/rebook-render.test.js
git commit -m "feat(events): rebook report renderer (all + by location + by installer)"
```

---

### Task 4: Weekly rebook-report scheduled function

**Files:**
- Create: `netlify/functions/rebook-report.js`
- Modify: `netlify.toml`
- Test: `tests/rebook-report.test.js`

- [ ] **Step 1: Write the failing test** — `tests/rebook-report.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runRebookReport } = require("../netlify/functions/rebook-report.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", RESEND_API_KEY: "k" };

test("lists outstanding priority rows and emails the owner", async () => {
  let sent = null;
  const listAll = async () => [
    { fields: { Name: "A", City: "Omaha", Installer: "cody", Reason: "Event full", Notified: false } },
    { fields: { Name: "B", City: "Omaha", Installer: "cody", Reason: "Rebook — not completed", Notified: true } }, // notified → excluded
  ];
  const send = async (m) => { sent = m; return { ok: true }; };
  const r = await runRebookReport({ env, listAll, send });
  assert.equal(r.outstanding, 1);
  assert.equal(sent.to, "info@tunedyota.com");
  assert.match(sent.subject, /Weekly rebook backlog \(1\)/);
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `node --test tests/rebook-report.test.js`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement** — `netlify/functions/rebook-report.js`:

```js
// netlify/functions/rebook-report.js
// Weekly scheduled function (Mondays). Emails info@ the full outstanding rebook/
// waitlist backlog, grouped by location + installer.
const { cfg, listAllRecords } = require("./lib/airtable.js");
const { sendEmail } = require("./lib/resend.js");
const { renderRebookReport } = require("./lib/rebook-render.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";
function flatten(records) { return (records || []).map((r) => ({ ...r.fields, id: r.id })); }

async function runRebookReport(deps) {
  const { env = process.env, fetchImpl = fetch,
          listAll = (a) => listAllRecords({ fetchImpl, ...a }),
          send = sendEmail, log = console } = deps;
  const c = cfg(env);
  const recs = flatten(await listAll({ token: c.token, baseId: c.baseId, table: c.priority }));
  const outstanding = recs.filter((r) => !r.Notified);
  const m = renderRebookReport(outstanding, { title: "Weekly rebook backlog" });
  await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: OWNER, replyTo: OWNER,
    subject: m.subject, html: m.html, text: m.text });
  if (log.info) log.info("rebook-report sent", outstanding.length);
  return { ok: true, outstanding: outstanding.length };
}
async function handler() { const r = await runRebookReport({}); return { statusCode: 200, body: JSON.stringify(r) }; }
module.exports = { handler, runRebookReport };
```

- [ ] **Step 4: Register the schedule** — in `netlify.toml`, after the `submissions-report` block, add:

```toml
# Weekly rebook/waitlist backlog on Mondays (netlify/functions/rebook-report.js).
[functions."rebook-report"]
  schedule = "0 13 * * 1"
```

- [ ] **Step 5: Run it, expect PASS**

Run: `node --test tests/rebook-report.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/rebook-report.js netlify.toml tests/rebook-report.test.js
git commit -m "feat(events): weekly rebook backlog report (Mondays)"
```

---

### Task 5: T+1 rebook report hook in event-reminders

**Files:**
- Modify: `netlify/functions/event-reminders.js`
- Test: `tests/event-reminders.test.js`

- [ ] **Step 1: Write the failing test** — append to `tests/event-reminders.test.js` (mirror the existing setup in that file for `runReminders` deps; this test asserts a post-event report is sent when a sweep happens):

```js
test("sends a post-event rebook report to the owner when a sweep occurs", async () => {
  const { runReminders } = require("../netlify/functions/event-reminders.js");
  const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", RESEND_API_KEY: "k" };
  // Event was yesterday (du === -1 relative to today) → sweep path.
  const today = "2026-07-04";
  const eventMap = { omaha: { active: true, city: "Omaha", dateISO: "2026-07-03", label: "Jul 3, 2026" } };
  const bookings = [{ City: "Omaha", "Event Date": "2026-07-03", Name: "Walk In", Email: "w@x.com", Status: "Booked" }];
  const sent = [];
  const r = await runReminders({
    env,
    now: new Date("2026-07-04T12:00:00Z"),
    loadEvents: async () => eventMap,
    listAll: async ({ table }) => (table === env.AIRTABLE_BOOKINGS_TABLE || /book/i.test(table || "Bookings")
      ? bookings.map((f) => ({ fields: f })) : []),
    create: async () => ({ id: "rec1" }),
    send: async (m) => { sent.push(m); return { ok: true }; },
    notify: async () => ({ ok: true }),
    // force the 07:00 gate:
    // (runReminders reads nowCentral from `now`; the test date maps to 7am Central — see central-time)
  });
  const report = sent.find((m) => /Post-event rebook/.test(m.subject || ""));
  assert.ok(report, "expected a post-event rebook report email");
  assert.equal(report.to, "info@tunedyota.com");
});
```

> Note for the implementer: match the exact `runReminders` deps shape already used by the other tests in this file (esp. how `now`/central-time yields `hour === 7`, and how `listAll` distinguishes the bookings vs priority tables). Adjust the mock table check to whatever the existing tests use. The behavioral assertion (a "Post-event rebook" email to info@) is the contract.

- [ ] **Step 2: Run it, expect FAIL**

Run: `node --test tests/event-reminders.test.js`
Expected: FAIL — no post-event report is sent.

- [ ] **Step 3: Implement the hook** — in `netlify/functions/event-reminders.js`:

Add the import near the other lib requires (after line 14):

```js
const { renderRebookReport } = require("./lib/roster-render.js") && require("./lib/rebook-render.js");
```

(Use a clean separate require line instead: `const { renderRebookReport } = require("./lib/rebook-render.js");`)

Then, after the `if (failures.length) { ... }` block and before `return { ok: true, ... }`, add:

```js
  const swept = actions.filter((a) => a.type === "waitlist-sweep");
  if (swept.length) {
    const rows = swept.map((a) => {
      const mk = getMarket(a.event.city);
      return {
        Name: a.booking.Name, Phone: a.booking.Phone, Email: a.booking.Email, Vehicle: a.booking.Vehicle,
        City: a.event.city, Reason: SWEEP_REASON, "Event Date": a.event.dateISO,
        Installer: mk ? keyToInstaller(mk.inst).key : "aaron",
      };
    });
    try {
      const m = renderRebookReport(rows, { title: `Post-event rebook — ${nowCentral.dateISO}` });
      await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: OWNER, replyTo: OWNER,
        subject: m.subject, html: m.html, text: m.text });
    } catch (e) { if (log.error) log.error("rebook report", e.message); }
  }
```

(`getMarket`, `keyToInstaller`, `SWEEP_REASON`, `send`, `FROM`, `OWNER`, `nowCentral`, `fetchImpl`, `env`, `log` are all already in scope in this function.)

- [ ] **Step 4: Run it, expect PASS**

Run: `node --test tests/event-reminders.test.js`
Expected: PASS (new + existing).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/event-reminders.js tests/event-reminders.test.js
git commit -m "feat(events): post-event (T+1) rebook report to owner"
```

---

### Task 6: Intake function (secret-gated book + lead)

**Files:**
- Create: `netlify/functions/intake.js`
- Test: `tests/intake.test.js`

- [ ] **Step 1: Write the failing test** — `tests/intake.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processIntake, authed } = require("../netlify/functions/intake.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", INTAKE_SECRET: "s3cret" };

test("authed: true only on exact secret match", () => {
  assert.equal(authed({ "x-intake-secret": "s3cret" }, env), true);
  assert.equal(authed({ "x-intake-secret": "nope" }, env), false);
  assert.equal(authed({}, env), false);
  assert.equal(authed({ "x-intake-secret": "s3cret" }, {}), false); // no secret configured → fail closed
});

test("lead mode creates a routed priority row with the channel source", async () => {
  let created = null;
  const create = async (a) => { created = a; return { id: "rec1" }; };
  const out = await processIntake(
    { mode: "lead", city: "Omaha", name: "Jane", phone: "111", vehicle: "Tundra", channel: "instagram" },
    { env, create, fetchImpl: async () => ({ ok: true, json: async () => ({ records: [] }) }) }
  );
  assert.equal(out.status, "lead");
  assert.equal(created.fields.City, "Omaha");
  assert.equal(created.fields.Installer, "cody");           // Omaha routes to cody
  assert.equal(created.fields.Source, "intake:instagram");
  assert.equal(created.fields.Reason, "No event scheduled");
});

test("book mode returns conflict with open slots when the slot is taken", async () => {
  const out = await processIntake(
    { mode: "book", city: "Omaha", name: "Jane", phone: "111", slot: "9:00" },
    {
      env,
      loadEvent: async () => ({ city: "Omaha", dateISO: "2026-07-03", label: "Jul 3" }),
      list: async () => ["9:00"],       // 9:00 already taken
      create: async () => ({ id: "x" }),
    }
  );
  assert.equal(out.status, "conflict");
  assert.ok(Array.isArray(out.openSlots) && !out.openSlots.includes("9:00"));
});

test("book mode books an open slot", async () => {
  let created = null;
  const out = await processIntake(
    { mode: "book", city: "Omaha", name: "Jane", phone: "111", slot: "9:20", channel: "walk-in" },
    {
      env,
      loadEvent: async () => ({ city: "Omaha", dateISO: "2026-07-03", label: "Jul 3" }),
      list: async () => ["9:00"],
      create: async (a) => { created = a; return { id: "b1" }; },
    }
  );
  assert.equal(out.status, "booked");
  assert.equal(out.slot, "9:20");
  assert.equal(created.fields.Status, "Booked");
  assert.equal(created.fields.Source, "intake:walk-in");
  assert.equal(created.fields.Installer, "cody");
});

test("unknown city errors", async () => {
  const out = await processIntake({ mode: "lead", city: "Nowhere", name: "X", phone: "1" }, { env, create: async () => ({}) });
  assert.equal(out.status, "error");
  assert.equal(out.error, "unknown-city");
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `node --test tests/intake.test.js`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement** — `netlify/functions/intake.js`:

```js
// netlify/functions/intake.js
// Secret-gated staff intake: create a booking ("book") or a priority lead ("lead")
// from any channel (text/phone/email/facebook/instagram/walk-in/other). Reuses the
// same libs as book.js. Sends NO customer email (walk-ins are present; future-dated
// bookings still get the normal reminders).
const { getMarket } = require("./lib/markets.js");
const { keyToInstaller } = require("./lib/routing.js");
const { getEventForCity } = require("./lib/events.js");
const EVENTS = require("./lib/events-data.js");
const { cfg, listRecords, createRecord, createTolerant } = require("./lib/airtable.js");
const { isValidSlot, computeOpen } = require("./lib/slots.js");

function authed(headers, env) {
  const secret = env && env.INTAKE_SECRET;
  if (!secret) return false; // fail closed when unconfigured
  const got = (headers["x-intake-secret"] || headers["X-Intake-Secret"] || "").toString();
  return got === secret;
}

async function processIntake(body, deps) {
  const { fetchImpl = fetch, env = process.env, log = console,
          create = (a) => createRecord({ fetchImpl, ...a }),
          list = async ({ token, baseId, table, city, dateISO }) => {
            const formula = `AND({City}="${city}",{Event Date}="${dateISO}",{Status}!="Cancelled")`;
            const recs = await listRecords({ fetchImpl, token, baseId, table, filterByFormula: formula, fields: ["Slot"] });
            return recs.map((r) => r.fields.Slot).filter(Boolean);
          },
          loadEvent = (city) => getEventForCity(city, { fetchImpl, sheetId: env.EVENTS_SHEET_ID, baked: EVENTS, log }) } = deps;

  const d = body || {};
  const channel = String(d.channel || "other").toLowerCase();
  const source = `intake:${channel}`;
  const market = getMarket(d.city);
  if (!market) return { status: "error", error: "unknown-city" };
  if (!d.name || (!d.phone && !d.email)) return { status: "error", error: "missing-contact" };
  const inst = keyToInstaller(market.inst);
  const c = cfg(env);

  if (d.mode === "lead") {
    const fields = {
      City: market.city, Name: d.name, Phone: d.phone || "", Email: d.email || "",
      Vehicle: d.vehicle || "", Goals: d.goals || "", Modifications: d.mods || "",
      Installer: inst.key, Reason: "No event scheduled", Source: source,
    };
    try {
      const rec = await createTolerant(create, { token: c.token, baseId: c.baseId, table: c.priority, fields }, ["Modifications", "Source"]);
      return { status: "lead", recordId: rec && rec.id, installer: inst.key };
    } catch (e) { if (log.error) log.error("intake lead", e.message); return { status: "error", error: "store-unavailable" }; }
  }

  // book mode
  const event = await loadEvent(market.city);
  if (!event) return { status: "error", error: "no-event" };
  let taken = [];
  try {
    taken = await list({ token: c.token, baseId: c.baseId, table: c.bookings, city: market.city, dateISO: event.dateISO });
  } catch (e) { if (log.error) log.error("intake list", e.message); return { status: "error", error: "store-unavailable" }; }
  const open = computeOpen(taken);
  if (!d.slot || !isValidSlot(d.slot) || !open.includes(d.slot)) return { status: "conflict", openSlots: open };
  try {
    const rec = await createTolerant(create, { token: c.token, baseId: c.baseId, table: c.bookings, fields: {
      City: market.city, "Event Date": event.dateISO, Slot: d.slot,
      Name: d.name, Phone: d.phone || "", Email: d.email || "",
      Vehicle: d.vehicle || "", Goals: d.goals || "", Modifications: d.mods || "",
      Installer: inst.key, Status: "Booked", Source: source,
    } }, ["Modifications"]);
    return { status: "booked", city: market.city, eventDateISO: event.dateISO, eventLabel: event.label, slot: d.slot, installer: inst.key, recordId: rec && rec.id };
  } catch (e) { if (log.error) log.error("intake create", e.message); return { status: "error", error: "store-unavailable" }; }
}

async function handler(event) {
  if (!authed(event.headers || {}, process.env)) return { statusCode: 401, body: "unauthorized" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  const out = await processIntake(body, { fetchImpl: fetch, env: process.env });
  const code = out.status === "error" ? 502 : out.status === "conflict" ? 409 : 200;
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, processIntake, authed };
```

> Implementer note: confirm `createTolerant`'s signature is `(createFn, args, optionalFields)` (as used in `book.js`) and that `cfg(env)` exposes `.token/.baseId/.bookings/.priority`. The test injects `create` and `list`/`loadEvent` so it never hits the network; the default `list`/`create` wire the real Airtable libs for production.

- [ ] **Step 4: Run it, expect PASS**

Run: `node --test tests/intake.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/intake.js tests/intake.test.js
git commit -m "feat(intake): secret-gated staff intake function (book + lead)"
```

---

### Task 7: Intake page (mobile, passcode-gated)

**Files:**
- Create: `site/intake.html`

Not registered in `HEAD_PAGES`/sitemap — it is a private staff tool.

- [ ] **Step 1: Create `site/intake.html`** with this content:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Tuned Yota — Staff Intake</title>
<style>
  :root { --ink:#3A2E26; --accent:#5B4B42; --line:#d8d2ca; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Arial, sans-serif; color: var(--ink); margin: 0; background:#faf8f5; }
  main { max-width: 520px; margin: 0 auto; padding: 18px 16px 60px; }
  h1 { font-size: 20px; color: var(--accent); margin: 8px 0 16px; }
  label { display:block; font-weight:700; font-size:13px; margin:12px 0 4px; color:#7c8472; }
  input, select, textarea { width:100%; padding:12px; font-size:16px; border:1px solid var(--line); border-radius:8px; background:#fff; }
  textarea { min-height:64px; }
  .row { display:flex; gap:10px; } .row > * { flex:1; }
  .modes { display:flex; gap:8px; margin:8px 0 4px; }
  .modes button { flex:1; padding:12px; border:1px solid var(--line); background:#fff; border-radius:8px; font-weight:700; }
  .modes button[aria-pressed="true"] { background:var(--accent); color:#fff; border-color:var(--accent); }
  .submit { margin-top:18px; width:100%; padding:14px; font-size:16px; font-weight:700; color:#fff; background:var(--accent); border:0; border-radius:10px; }
  .msg { margin-top:14px; padding:12px; border-radius:8px; font-size:14px; }
  .ok { background:#e7f2e2; color:#2f5d2a; } .err { background:#f6e2e2; color:#8a2a2a; }
  .hidden { display:none; }
  .slots button { margin:4px 4px 0 0; padding:8px 10px; border:1px solid var(--line); background:#fff; border-radius:6px; }
</style>
</head>
<body>
<main>
  <h1>Tuned Yota — Staff Intake</h1>

  <div id="gate">
    <label for="pass">Passcode</label>
    <input id="pass" type="password" autocomplete="off" placeholder="Enter staff passcode">
    <button class="submit" id="unlock">Unlock</button>
  </div>

  <form id="form" class="hidden">
    <div class="modes">
      <button type="button" id="mBook" aria-pressed="true">Book into event</button>
      <button type="button" id="mLead" aria-pressed="false">Add as lead</button>
    </div>

    <label for="channel">Source channel</label>
    <select id="channel">
      <option>Walk-in</option><option>Text</option><option>Phone</option><option>Email</option>
      <option>Facebook</option><option>Instagram</option><option>Other</option>
    </select>

    <label for="city">City</label>
    <select id="city"></select>

    <div id="bookFields">
      <label for="slot">Slot</label>
      <select id="slot">
        <option value="">— pick a time —</option>
        <option>9:00</option><option>9:20</option><option>9:40</option><option>10:00</option>
        <option>10:20</option><option>10:40</option><option>11:00</option><option>11:20</option>
        <option>11:40</option><option>12:00</option><option>12:20</option><option>12:40</option>
      </select>
    </div>

    <div class="row"><div><label for="name">Name</label><input id="name"></div></div>
    <div class="row">
      <div><label for="phone">Phone</label><input id="phone" inputmode="tel"></div>
      <div><label for="email">Email</label><input id="email" inputmode="email"></div>
    </div>
    <label for="vehicle">Vehicle</label><input id="vehicle" placeholder="e.g. 2022 Tundra">
    <label for="mods">Modifications</label><input id="mods" placeholder="lift, tires, exhaust…">
    <label for="goals">Goals / notes</label><textarea id="goals"></textarea>

    <button class="submit" id="go" type="submit">Save intake</button>
    <div id="msg"></div>
  </form>
</main>
<script>
  // Cities mirror the tune-finder markets. Keep in sync with markets.js if cities change.
  var CITIES = ["Twin Cities","Cedar Rapids","Des Moines","Omaha","Fargo","Rapid City","Duluth","Madison","Green Bay","Sioux Falls","Eau Claire"];
  var citySel = document.getElementById('city');
  CITIES.forEach(function(c){ var o=document.createElement('option'); o.textContent=c; citySel.appendChild(o); });

  var mode = 'book';
  function setMode(m){ mode=m;
    document.getElementById('mBook').setAttribute('aria-pressed', m==='book');
    document.getElementById('mLead').setAttribute('aria-pressed', m==='lead');
    document.getElementById('bookFields').classList.toggle('hidden', m!=='book');
  }
  document.getElementById('mBook').onclick=function(){setMode('book');};
  document.getElementById('mLead').onclick=function(){setMode('lead');};

  function secret(){ return localStorage.getItem('ty_intake_secret') || ''; }
  document.getElementById('unlock').onclick=function(){
    var v=document.getElementById('pass').value.trim();
    if(!v) return;
    localStorage.setItem('ty_intake_secret', v);
    document.getElementById('gate').classList.add('hidden');
    document.getElementById('form').classList.remove('hidden');
  };
  if(secret()){ document.getElementById('gate').classList.add('hidden'); document.getElementById('form').classList.remove('hidden'); }

  function val(id){ return (document.getElementById(id).value||'').trim(); }
  function show(cls, text){ var m=document.getElementById('msg'); m.className='msg '+cls; m.textContent=text; }

  document.getElementById('form').addEventListener('submit', async function(e){
    e.preventDefault();
    if(!val('name') || (!val('phone') && !val('email'))){ show('err','Name and a phone or email are required.'); return; }
    var payload={ mode:mode, channel:val('channel').toLowerCase(), city:val('city'),
      name:val('name'), phone:val('phone'), email:val('email'), vehicle:val('vehicle'),
      mods:val('mods'), goals:val('goals'), slot: mode==='book'? val('slot') : '' };
    show('', 'Saving…');
    try {
      var res = await fetch('/.netlify/functions/intake', { method:'POST',
        headers:{'Content-Type':'application/json','x-intake-secret':secret()}, body: JSON.stringify(payload) });
      if(res.status===401){ show('err','Passcode rejected. Re-enter it.'); localStorage.removeItem('ty_intake_secret'); location.reload(); return; }
      var out = await res.json();
      if(out.status==='booked'){ show('ok','Booked '+out.slot+' at '+out.city+' → '+out.installer+'.'); resetSoft(); }
      else if(out.status==='lead'){ show('ok','Lead saved for '+val('city')+' → '+out.installer+'.'); resetSoft(); }
      else if(out.status==='conflict'){ show('err','That slot is taken. Open: '+(out.openSlots||[]).join(', ')); }
      else { show('err','Could not save: '+(out.error||'unknown')); }
    } catch(err){ show('err','Network error — try again.'); }
  });
  function resetSoft(){ ['name','phone','email','vehicle','mods','goals'].forEach(function(id){ document.getElementById(id).value=''; }); document.getElementById('slot').value=''; }
</script>
</body>
</html>
```

- [ ] **Step 2: Verify it loads (static)**

Run: `node -e "const fs=require('fs');const h=fs.readFileSync('site/intake.html','utf8');if(!/x-intake-secret/.test(h)||!/functions\/intake/.test(h))throw new Error('intake.html missing wiring');console.log('intake.html OK')"`
Expected: `intake.html OK`

- [ ] **Step 3: Confirm it is NOT in the sitemap set** — verify `intake` is not listed in `HEAD_PAGES`:

Run: `node -e "const S=require('./scripts/lib/seo-data.mjs');" 2>/dev/null; grep -c "intake" scripts/lib/seo-data.mjs || true`
Expected: `0` (intake.html is intentionally unregistered). If it prints a non-zero count, remove the intake entry — the page must stay out of the sitemap.

- [ ] **Step 4: Commit**

```bash
git add site/intake.html
git commit -m "feat(intake): mobile staff intake page (passcode-gated)"
```

---

### Task 8: Full suite + build check

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: all pass, including the new `rebook-render`, `rebook-report`, `intake` files and the extended `event-plan`, `templates`, `event-reminders`.

- [ ] **Step 2: SEO build still clean**

Run: `npm run build:seo`
Expected: "seo build complete"; `git status` shows no unexpected changes beyond regenerated brand images/sitemap date (revert `site/sitemap.xml` if it only bumped the date, per the ship skill).

---

### Task 9: Ship + set the intake secret

- [ ] **Step 1: Set the secret** (Claude runs this; value is a strong random string):

Run: `netlify env:set INTAKE_SECRET "<generate a 24+ char random string>"`
Expected: env var set for production.

- [ ] **Step 2: Deploy** — push master (per the ship skill):

```bash
git push origin master
```

- [ ] **Step 3: Confirm Netlify `ready`** for the new commit, then smoke-test:
- `curl -s -o /dev/null -w "%{http_code}\n" https://tunedyota.com/intake.html` → `200`
- `curl -s -X POST https://tunedyota.com/.netlify/functions/intake -d '{}' -w "\n%{http_code}\n"` → `401` (secret gate works)

- [ ] **Step 4:** Give the owner the intake URL + passcode (passcode = the `INTAKE_SECRET` value) out-of-band, and confirm one live test entry.

---

## Self-review notes

- **Spec coverage:** F1 day-of notice (T1 planner + T2 copy); F2 renderer (T3), weekly send (T4), T+1 send (T5); F3 function (T6) + page (T7); ship + secret (T9); regression (T8). All spec sections mapped.
- **Type/name consistency:** `renderRebookReport(records, {title})` used identically in T3/T4/T5. `processIntake`/`authed` signatures match between T6 impl and test. `Source: "intake:<channel>"`, `Reason: "No event scheduled"`, `Status: "Booked"` consistent with the Airtable schema. `keyToInstaller(key).name` used for installer grouping (matches routing.js).
- **Placeholders:** none — every code step has full code; the one implementer note (T5) is about matching the existing test harness shape, with the behavioral contract stated explicitly.
- **Risk flagged:** T5's test must mirror the existing `event-reminders.test.js` deps/central-time setup; the implementer adapts the mock wiring but the asserted contract (a "Post-event rebook" email to info@) is fixed.
