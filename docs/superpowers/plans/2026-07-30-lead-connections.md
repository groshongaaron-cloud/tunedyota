# Lead Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link leads to existing bookings (real Airtable linked-record field), auto-suggest matches by phone/email, add a stale-lead bucket, render waitlist context, and put Call/Text-via-TY buttons on booking cards.

**Architecture:** All new server logic is pure functions in `netlify/functions/lib/leads.js` (deps-injected, unit-tested with node:test), wired into the existing `leads-list.js` / `lead-update.js` endpoints. Console changes live in `site/installer.html` following its existing card/state patterns. Schema work (linked field + backfill) is scripts under `scripts/airtable/`, run once at rollout.

**Tech Stack:** Node CommonJS Netlify functions, Airtable REST + meta API, node:test + assert/strict, vanilla-JS single-file console.

**Spec:** `docs/superpowers/specs/2026-07-30-lead-connections-design.md`

---

## File map

| File | Change |
|---|---|
| `netlify/functions/lib/leads.js` | Add `STALE_AFTER_DAYS`, `linkedBookingId`, `toBookingSummary`, `bookingMatchesForLead`, `clientForLead`, `staleLeads`, `buildLinkPatch`, `buildUnlinkPatch`; extend `toLeadView` |
| `netlify/functions/leads-list.js` | Load Bookings + Clients fail-open; attach `matches`/`booking`/`client`/`staleDays`; `stale` count in summary |
| `netlify/functions/lead-update.js` | New `link` / `unlink` actions; `convert` also writes `Booking` linked field |
| `site/installer.html` | Lead card: waitlist badge, suggestion strip, link picker, linked line + unlink, client line; `leadUpdate` link jump; Stale/Waitlist chips; shared `openTyThread`; booking-card Call/Text |
| `scripts/airtable/ensure-field.mjs` | Accept options JSON (with `@TableName` → linkedTableId resolution) |
| `scripts/airtable/rename-field.mjs` | Create (rename the auto-created mirror field) |
| `scripts/airtable/backfill-booking-links.mjs` | Create (legacy text id → linked field, `--dry-run`) |
| `tests/lead-connections.test.js` | Create — lib helper tests |
| `tests/lead-update-link.test.js` | Create — link/unlink/convert endpoint tests |
| `tests/leads-list-connections.test.js` | Create — enrichment + fail-open tests |

Run all tests with: `npm test` (from repo root `C:\Users\grosh\Documents\tunedyota`). Run one file: `node --test tests/lead-connections.test.js`.

---

### Task 1: `toLeadView` linked-field + waitlist fields

**Files:**
- Modify: `netlify/functions/lib/leads.js:31-50` (toLeadView), exports at `:212`
- Test: `tests/lead-connections.test.js` (create)

- [ ] **Step 1: Write the failing tests**

Create `tests/lead-connections.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  toLeadView,
} = require("../netlify/functions/lib/leads.js");

test("toLeadView prefers the Booking linked field over legacy Converted Booking", () => {
  const l = toLeadView({ id: "rec1", fields: { Name: "Eli", Booking: ["recBK9"], "Converted Booking": "recOLD" } });
  assert.equal(l.bookingId, "recBK9");
});

test("toLeadView falls back to Converted Booking text until backfill runs", () => {
  const l = toLeadView({ id: "rec1", fields: { Name: "Eli", "Converted Booking": "recOLD" } });
  assert.equal(l.bookingId, "recOLD");
});

test("toLeadView exposes waitlist fields", () => {
  const l = toLeadView({ id: "rec1", fields: { Name: "W", Reason: "Event full", "Event Date": "2026-07-26", "Requested Slot": "10:20", Notified: true } });
  assert.equal(l.reason, "Event full");
  assert.equal(l.eventDate, "2026-07-26");
  assert.equal(l.requestedSlot, "10:20");
  assert.equal(l.notified, true);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/lead-connections.test.js`
Expected: FAIL — `l.bookingId` is `undefined` (first two), `eventDate`/`requestedSlot`/`notified` undefined (third). `reason` already passes inside the third test's other asserts; the test still fails on `eventDate`.

- [ ] **Step 3: Implement**

In `netlify/functions/lib/leads.js`, add above `toLeadView`:

```js
// A lead's linked booking id: the real linked-record field first (array of rec
// ids), else the legacy Converted Booking text id until backfill retires it.
function linkedBookingId(f) {
  if (Array.isArray(f.Booking) && f.Booking.length) return String(f.Booking[0] || "");
  return String(f["Converted Booking"] || "");
}
```

In `toLeadView`, replace the line `convertedBooking: f["Converted Booking"] || "",` with:

```js
    convertedBooking: f["Converted Booking"] || "",
    bookingId: linkedBookingId(f),
    eventDate: String(f["Event Date"] || "").slice(0, 10),
    requestedSlot: f["Requested Slot"] || "",
    notified: !!f.Notified,
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/lead-connections.test.js` → PASS. Then `npm test` → all green (toLeadView gained keys; nothing removed).

- [ ] **Step 5: Commit**

```bash
git add tests/lead-connections.test.js netlify/functions/lib/leads.js
git commit -m "feat(leads): expose linked booking id + waitlist fields in toLeadView"
```

---

### Task 2: `toBookingSummary` + `bookingMatchesForLead`

**Files:**
- Modify: `netlify/functions/lib/leads.js` (new functions + exports)
- Test: `tests/lead-connections.test.js`

- [ ] **Step 1: Write the failing tests** (append to `tests/lead-connections.test.js`; extend the require)

```js
const {
  toLeadView, toBookingSummary, bookingMatchesForLead,
} = require("../netlify/functions/lib/leads.js");

const bk = (id, f) => toBookingSummary({ id, fields: f });

test("toBookingSummary flattens a Bookings record", () => {
  const b = bk("recB1", { Name: "Eli Soetenga", Phone: "6194176865", Email: "e@x.com", City: "Madison",
    "Event Date": "2026-08-01", Slot: "10:20", Status: "Booked", Installer: ["aaron"], Vehicle: "Tacoma" });
  assert.deepEqual(b, { id: "recB1", name: "Eli Soetenga", phone: "6194176865", email: "e@x.com",
    city: "Madison", dateISO: "2026-08-01", slot: "10:20", scheduledTime: "", status: "Booked",
    installer: "aaron", vehicle: "Tacoma" });
});

test("bookingMatchesForLead matches +1-format phone against bare 10 digits", () => {
  const lead = { phone: "+16194176865", email: "", bookingId: "" };
  const hits = bookingMatchesForLead(lead, [bk("recB1", { Phone: "6194176865", Status: "Booked" })], "2026-07-30");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, "recB1");
});

test("bookingMatchesForLead matches email case-insensitively", () => {
  const lead = { phone: "", email: "Eli@X.com", bookingId: "" };
  const hits = bookingMatchesForLead(lead, [bk("recB1", { Email: "eli@x.com", Status: "Booked" })], "2026-07-30");
  assert.equal(hits.length, 1);
});

test("bookingMatchesForLead excludes Cancelled and returns nothing for contactless or linked leads", () => {
  const rows = [bk("recB1", { Phone: "6194176865", Status: "Cancelled" })];
  assert.equal(bookingMatchesForLead({ phone: "6194176865", email: "", bookingId: "" }, rows, "2026-07-30").length, 0);
  assert.equal(bookingMatchesForLead({ phone: "", email: "", bookingId: "" }, rows, "2026-07-30").length, 0);
  assert.equal(bookingMatchesForLead({ phone: "6194176865", email: "", bookingId: "recX" }, rows, "2026-07-30").length, 0);
});

test("bookingMatchesForLead sorts upcoming-soonest first, then most recent past", () => {
  const rows = [
    bk("past2", { Phone: "6194176865", Status: "Completed", "Event Date": "2026-06-01" }),
    bk("up2",   { Phone: "6194176865", Status: "Booked", "Event Date": "2026-08-15" }),
    bk("past1", { Phone: "6194176865", Status: "Completed", "Event Date": "2026-07-01" }),
    bk("up1",   { Phone: "6194176865", Status: "Booked", "Event Date": "2026-08-01" }),
  ];
  const ids = bookingMatchesForLead({ phone: "6194176865", email: "", bookingId: "" }, rows, "2026-07-30").map((b) => b.id);
  assert.deepEqual(ids, ["up1", "up2", "past1", "past2"]);
});
```

- [ ] **Step 2: Run to verify failure** — `node --test tests/lead-connections.test.js` → FAIL: `toBookingSummary is not a function`.

- [ ] **Step 3: Implement** (in `lib/leads.js`, after `toLeadView`; `normalizeInstallerKey` is already required at the top from `./routing.js`)

```js
// Compact view of a Bookings record for match suggestions + linked display.
function toBookingSummary(rec) {
  const f = (rec && rec.fields) || {};
  return {
    id: rec && rec.id,
    name: f.Name || "", phone: f.Phone || "", email: f.Email || "",
    city: f.City || "", dateISO: String(f["Event Date"] || "").slice(0, 10),
    slot: f.Slot || "", scheduledTime: f["Scheduled Time"] || "",
    status: f.Status || "Booked",
    installer: normalizeInstallerKey(f.Installer),
    vehicle: f.Vehicle || "",
  };
}

// "Looks booked already" suggestions: non-Cancelled bookings sharing a contact
// point with an unlinked lead. Completed bookings match too — a repeat customer
// texting in is exactly what this should catch. Upcoming soonest first, then
// most recent past.
function bookingMatchesForLead(lead, summaries, todayISO) {
  if (lead.bookingId) return [];
  const pKey = normalizePhone(lead.phone), eKey = normalizeEmail(lead.email);
  if (!pKey && !eKey) return [];
  const hits = (summaries || []).filter((b) => {
    if (b.status === "Cancelled") return false;
    return (pKey && normalizePhone(b.phone) === pKey) || (eKey && normalizeEmail(b.email) === eKey);
  });
  const bucket = (b) => (b.dateISO && b.dateISO >= todayISO ? 0 : 1);
  hits.sort((a, b) => bucket(a) - bucket(b) ||
    (bucket(a) === 0 ? String(a.dateISO).localeCompare(String(b.dateISO))
                     : String(b.dateISO).localeCompare(String(a.dateISO))));
  return hits;
}
```

Add `toBookingSummary, bookingMatchesForLead,` to `module.exports`.

- [ ] **Step 4: Run to verify pass** — file green, then `npm test` green.

- [ ] **Step 5: Commit** — `git commit -m "feat(leads): booking summaries + phone/email match suggestions"`

---

### Task 3: `clientForLead`

**Files:** same as Task 2.

- [ ] **Step 1: Failing tests** (append; add `clientForLead` to the require)

```js
test("clientForLead matches by lead email, parses garage", () => {
  const clients = [{ id: "c1", fields: { Email: "eli@x.com", Vehicles: '[{"year":"2019","make":"Toyota","model":"Tacoma"}]' } }];
  const c = clientForLead({ email: "Eli@X.com" }, null, clients);
  assert.equal(c.email, "eli@x.com");
  assert.equal(c.vehicles[0].model, "Tacoma");
});

test("clientForLead falls back to the linked booking's email (SMS leads carry none)", () => {
  const clients = [{ id: "c1", fields: { Email: "eli@x.com", Vehicles: "[]" } }];
  const c = clientForLead({ email: "" }, { email: "eli@x.com" }, clients);
  assert.equal(c.email, "eli@x.com");
});

test("clientForLead survives bad Vehicles JSON and returns null on no match", () => {
  const clients = [{ id: "c1", fields: { Email: "eli@x.com", Vehicles: "{not json" } }];
  assert.deepEqual(clientForLead({ email: "eli@x.com" }, null, clients).vehicles, []);
  assert.equal(clientForLead({ email: "nobody@x.com" }, null, clients), null);
  assert.equal(clientForLead({ email: "" }, null, clients), null);
});
```

- [ ] **Step 2: Verify failure** — `clientForLead is not a function`.

- [ ] **Step 3: Implement**

```js
// The client-portal account behind a lead, if any — matched by the lead's email
// or, once linked, the booking's email (SMS leads often carry no email).
function clientForLead(lead, linkedBooking, clientRecords) {
  const eKey = normalizeEmail(lead.email) || normalizeEmail(linkedBooking && linkedBooking.email);
  if (!eKey) return null;
  const rec = (clientRecords || []).find((r) => normalizeEmail((r.fields || {}).Email) === eKey);
  if (!rec) return null;
  let vehicles = [];
  try {
    const parsed = JSON.parse((rec.fields || {}).Vehicles || "[]");
    if (Array.isArray(parsed)) vehicles = parsed;
  } catch { /* bad JSON → empty garage, never a crash */ }
  return { email: eKey, vehicles };
}
```

Export it.

- [ ] **Step 4: Verify pass**, **Step 5: Commit** — `git commit -m "feat(leads): client-portal account match for leads"`

---

### Task 4: `staleLeads`

**Files:** same.

- [ ] **Step 1: Failing tests** (append; require `staleLeads, STALE_AFTER_DAYS`)

```js
test("staleLeads: 30d quiet active lead is stale; 29d is not", () => {
  const mk = (lastContact) => ({ id: "L", stage: "New", nextFollowup: "", lastContact, createdTime: "" });
  assert.equal(staleLeads([mk("2026-06-30")], "2026-07-30").length, 1);
  assert.equal(staleLeads([mk("2026-07-01")], "2026-07-30").length, 0);
});

test("staleLeads: any follow-up (future OR overdue) excludes — those are worked/due, not lost", () => {
  const base = { id: "L", stage: "New", lastContact: "2026-05-01", createdTime: "" };
  assert.equal(staleLeads([{ ...base, nextFollowup: "2026-08-05" }], "2026-07-30").length, 0);
  assert.equal(staleLeads([{ ...base, nextFollowup: "2026-06-01" }], "2026-07-30").length, 0);
});

test("staleLeads: non-active stages excluded; createdTime is the no-contact fallback; oldest first with staleDays", () => {
  const rows = [
    { id: "booked", stage: "Booked", nextFollowup: "", lastContact: "2026-01-01", createdTime: "" },
    { id: "young",  stage: "New", nextFollowup: "", lastContact: "", createdTime: "2026-06-01T10:00:00.000Z" },
    { id: "older",  stage: "New", nextFollowup: "", lastContact: "2026-05-01", createdTime: "" },
  ];
  const out = staleLeads(rows, "2026-07-30");
  assert.deepEqual(out.map((l) => l.id), ["older", "young"]);
  assert.equal(out[0].staleDays, 90);
  assert.equal(out[1].staleDays, 59);
});
```

- [ ] **Step 2: Verify failure**.

- [ ] **Step 3: Implement**

```js
const STALE_AFTER_DAYS = 30;

// The fell-through-the-cracks bucket: active stage, nothing scheduled (a future
// follow-up is being worked; an overdue one already shows in the due queue),
// and no touch for STALE_AFTER_DAYS. Single source of truth — the console and
// any future notification routine must both call this. Oldest-quiet first.
function staleLeads(leads, todayISO) {
  const today = new Date(todayISO + "T00:00:00Z").getTime();
  const out = [];
  for (const l of leads) {
    if (!ACTIVE_STAGES.includes(l.stage || "New")) continue;
    if (l.nextFollowup) continue;
    const lastISO = l.lastContact || String(l.createdTime || "").slice(0, 10);
    if (!lastISO) continue;
    const t = new Date(lastISO + "T00:00:00Z").getTime();
    if (isNaN(t)) continue;
    const days = Math.floor((today - t) / 86400000);
    if (days < STALE_AFTER_DAYS) continue;
    out.push({ ...l, staleDays: days });
  }
  out.sort((a, b) => b.staleDays - a.staleDays);
  return out;
}
```

Export `staleLeads, STALE_AFTER_DAYS`.

- [ ] **Step 4: Verify pass**, **Step 5: Commit** — `git commit -m "feat(leads): stale-lead bucket (30d quiet, nothing scheduled)"`

---

### Task 5: link/unlink patch builders

**Files:** same.

- [ ] **Step 1: Failing tests** (append; require `buildLinkPatch, buildUnlinkPatch`)

```js
test("buildLinkPatch links, books, and logs — mirror of what convert writes", () => {
  const lead = { activity: "old line" };
  const booking = { id: "recB1", city: "Madison", dateISO: "2026-08-01", scheduledTime: "", slot: "10:20" };
  const p = buildLinkPatch(lead, booking, new Date("2026-07-30T12:00:00Z"));
  assert.deepEqual(p.Booking, ["recB1"]);
  assert.equal(p["Converted Booking"], "recB1");
  assert.equal(p.Stage, "Booked");
  assert.match(p["Activity Log"], /^old line\n2026-07-30 12:00 — linked → existing booking recB1 \(Madison 2026-08-01 10:20\)$/);
});

test("buildUnlinkPatch clears both link fields and logs, leaves Stage alone", () => {
  const p = buildUnlinkPatch({ activity: "" }, new Date("2026-07-30T12:00:00Z"));
  assert.deepEqual(p.Booking, []);
  assert.equal(p["Converted Booking"], "");
  assert.equal(p.Stage, undefined);
  assert.match(p["Activity Log"], /unlinked from booking/);
});
```

- [ ] **Step 2: Verify failure**.

- [ ] **Step 3: Implement**

```js
// Field patch for linking a lead to an EXISTING booking — same end-state as
// convert (Stage Booked + link + audit line), minus creating the record.
function buildLinkPatch(lead, booking, now = new Date()) {
  const when = [booking.city, booking.dateISO, booking.scheduledTime || booking.slot].filter(Boolean).join(" ");
  return {
    Booking: [booking.id],
    "Converted Booking": booking.id,
    Stage: "Booked",
    "Activity Log": appendActivity(lead.activity, logLine(now, `linked → existing booking ${booking.id} (${when})`)),
  };
}

// Mislink recovery. Clears both link fields; Stage is left for the installer to
// correct with the existing stage buttons (the unlink reason decides the stage).
function buildUnlinkPatch(lead, now = new Date()) {
  return {
    Booking: [],
    "Converted Booking": "",
    "Activity Log": appendActivity(lead.activity, logLine(now, "unlinked from booking")),
  };
}
```

Export both.

- [ ] **Step 4: Verify pass**, **Step 5: Commit** — `git commit -m "feat(leads): link/unlink field patch builders"`

---

### Task 6: `lead-update.js` — `link` and `unlink` actions

**Files:**
- Modify: `netlify/functions/lead-update.js` (new action branches after the `convert` block at `:77`; extend the require from `./lib/leads.js`)
- Test: `tests/lead-update-link.test.js` (create)

- [ ] **Step 1: Failing tests**

Create `tests/lead-update-link.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/lead-update.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b",
  INSTALLER_TOKENS: '{"noah":"ntok","aaron":"atok"}', INSTALLER_ADMINS: "aaron" };
const ev = (token, body) => ({ headers: { "x-installer-token": token }, body: JSON.stringify(body) });
const leadRec = (installer) => ({ id: "recL1", fields: { Name: "Eli", Installer: installer, "Activity Log": "old" } });
const bookRec = { id: "recB1", fields: { Name: "Eli Soetenga", City: "Madison", "Event Date": "2026-08-01",
  Slot: "10:20", Status: "Booked", Installer: ["aaron"], Phone: "6194176865" } };

function ctxWith(over = {}) {
  const writes = [];
  return { writes, ctx: { env, now: new Date("2026-07-30T12:00:00Z"),
    getImpl: over.getImpl || (async (a) => (a.table === "Bookings" ? bookRec : leadRec("noah"))),
    updateImpl: async (a) => { writes.push(a); return { id: a.id, fields: a.fields }; }, ...over } };
}

test("link: patches the lead and returns the booking for jump-and-flash", async () => {
  const { writes, ctx } = ctxWith();
  const res = await handler(ev("ntok", { id: "recL1", action: "link", bookingId: "recB1" }), ctx);
  assert.equal(res.statusCode, 200);
  const out = JSON.parse(res.body);
  assert.equal(out.status, "ok");
  assert.equal(out.stage, "Booked");
  assert.equal(out.booking.id, "recB1");
  assert.equal(out.booking.city, "Madison");
  assert.deepEqual(writes[0].fields.Booking, ["recB1"]);
  assert.equal(writes[0].fields.Stage, "Booked");
  assert.match(writes[0].fields["Activity Log"], /linked → existing booking recB1/);
});

test("link: missing bookingId → 400, unknown booking → booking-not-found", async () => {
  const a = await handler(ev("ntok", { id: "recL1", action: "link" }), ctxWith().ctx);
  assert.equal(a.statusCode, 400);
  const { ctx } = ctxWith({ getImpl: async (x) => {
    if (x.table === "Bookings") throw new Error("airtable get 404");
    return leadRec("noah");
  } });
  const b = await handler(ev("ntok", { id: "recL1", action: "link", bookingId: "recGONE" }), ctx);
  assert.equal(b.statusCode, 400);
  assert.equal(JSON.parse(b.body).error, "booking-not-found");
});

test("link: an installer cannot touch another installer's lead", async () => {
  const { ctx } = ctxWith({ getImpl: async (a) => (a.table === "Bookings" ? bookRec : leadRec("cody")) });
  const res = await handler(ev("ntok", { id: "recL1", action: "link", bookingId: "recB1" }), ctx);
  assert.equal(JSON.parse(res.body).error, "not-your-market");
});

test("unlink clears both link fields and logs", async () => {
  const { writes, ctx } = ctxWith();
  const res = await handler(ev("ntok", { id: "recL1", action: "unlink" }), ctx);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(writes[0].fields.Booking, []);
  assert.equal(writes[0].fields["Converted Booking"], "");
  assert.equal(writes[0].fields.Stage, undefined);
});
```

- [ ] **Step 2: Verify failure** — `node --test tests/lead-update-link.test.js`: link/unlink hit the final `applyLeadUpdate` branch → `bad-action` 400s where 200 expected.

- [ ] **Step 3: Implement.** In `lead-update.js`, extend the lib require to:

```js
const { toLeadView, applyLeadUpdate, logLine, appendActivity, toBookingSummary, buildLinkPatch, buildUnlinkPatch } = require("./lib/leads.js");
```

Insert after the `convert` block (after line 77), before the `applyLeadUpdate` fallthrough:

```js
  // Link to an EXISTING booking — the dedupe motion. Same end-state as convert
  // (Stage Booked, link, audit line) without creating a record. The response
  // carries the booking so the console can jump-and-flash it (no silent outcomes).
  if (action === "link") {
    const bookingId = String(body.bookingId || "").trim();
    if (!bookingId) return { statusCode: 400, body: JSON.stringify({ error: "missing-booking-id" }) };
    let bkRec;
    try { bkRec = await getImpl({ token: c.token, baseId: c.baseId, table: c.bookings, id: bookingId }); }
    catch (e) {
      const notFound = /40[34]/.test(String(e && e.message));
      return { statusCode: notFound ? 400 : 502, body: JSON.stringify({ error: notFound ? "booking-not-found" : "store-unavailable" }) };
    }
    const booking = toBookingSummary(bkRec);
    try {
      await updateTolerant(updateImpl, { token: c.token, baseId: c.baseId, table: c.priority, id, fields: buildLinkPatch(lead, booking, now) },
        ["Booking", "Converted Booking", "Stage", "Activity Log"]);
    } catch (e) { return { statusCode: 502, body: JSON.stringify({ error: "store-unavailable" }) }; }
    return { statusCode: 200, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ok", stage: "Booked", bookingId: booking.id, booking }) };
  }

  if (action === "unlink") {
    try {
      await updateTolerant(updateImpl, { token: c.token, baseId: c.baseId, table: c.priority, id, fields: buildUnlinkPatch(lead, now) },
        ["Booking", "Converted Booking", "Activity Log"]);
    } catch (e) { return { statusCode: 502, body: JSON.stringify({ error: "store-unavailable" }) }; }
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "ok", unlinked: true }) };
  }
```

- [ ] **Step 4: Verify pass** — file green, `npm test` green.

- [ ] **Step 5: Commit** — `git commit -m "feat(lead-update): link/unlink lead to an existing booking"`

---

### Task 7: `convert` writes the linked field too

**Files:**
- Modify: `netlify/functions/lead-update.js:66-68` (the post-create patch)
- Test: `tests/lead-update-link.test.js`

- [ ] **Step 1: Failing test** (append)

```js
test("convert also writes the Booking linked field", async () => {
  const writes = [];
  const ctx = { env, now: new Date("2026-07-30T12:00:00Z"),
    getImpl: async () => leadRec("noah"),
    updateImpl: async (a) => { writes.push(a); return {}; },
    createBookingImpl: async () => ({ id: "recNEW" }) };
  const res = await handler(ev("ntok", { id: "recL1", action: "convert", dateISO: "2026-08-02" }), ctx);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(writes[0].fields.Booking, ["recNEW"]);
  assert.equal(writes[0].fields["Converted Booking"], "recNEW");
});
```

- [ ] **Step 2: Verify failure** — `writes[0].fields.Booking` undefined.

- [ ] **Step 3: Implement.** In the convert block, change the patch (currently `lead-update.js:66-68`) to:

```js
    const patch = { "Converted Booking": bk && bk.id, Booking: bk && bk.id ? [bk.id] : [], Stage: "Booked",
      "Activity Log": appendActivity(lead.activity, logLine(now, `converted → booking ${bk && bk.id} (${bookCity} ${dateISO}${time ? " " + time : ""})`)) };
    try { await updateTolerant(updateImpl, { token: c.token, baseId: c.baseId, table: c.priority, id, fields: patch }, ["Converted Booking", "Booking", "Stage", "Activity Log"]); }
```

(`Booking` is in the tolerant list so convert keeps working until the field is created at rollout.)

- [ ] **Step 4: Verify pass**, **Step 5: Commit** — `git commit -m "feat(lead-update): convert writes the Booking linked field"`

---

### Task 8: `leads-list.js` enrichment (matches, booking, client, staleDays)

**Files:**
- Modify: `netlify/functions/leads-list.js`
- Test: `tests/leads-list-connections.test.js` (create)

- [ ] **Step 1: Failing tests**

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/leads-list.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b",
  INSTALLER_TOKENS: '{"aaron":"atok"}', INSTALLER_ADMINS: "aaron" };
const ev = { headers: { "x-installer-token": "atok" }, queryStringParameters: {} };
const leadRows = [
  { id: "recL1", fields: { Name: "Text 619", Phone: "+16194176865", Installer: "aaron", Stage: "New", "Last Contact": "2026-07-29" } },
  { id: "recL2", fields: { Name: "Quiet Quinn", Email: "q@x.com", Installer: "aaron", Stage: "New", "Last Contact": "2026-05-01" } },
];
const bookRows = [{ id: "recB1", fields: { Name: "Eli Soetenga", Phone: "6194176865", City: "Madison",
  "Event Date": "2026-08-01", Slot: "10:20", Status: "Booked", Installer: ["aaron"] } }];
const clientRows = [{ id: "recC1", fields: { Email: "q@x.com", Vehicles: '[{"year":"2019","make":"Toyota","model":"Tacoma"}]' } }];

const listFor = (rows) => async (a) => {
  if (a.table === "Priority List") return rows.priority;
  if (a.table === "Bookings") return rows.bookings;
  if (a.table === "Clients") return rows.clients;
  return [];
};

test("leads carry matches, client, and staleDays", async () => {
  const res = await handler(ev, { env, listImpl: listFor({ priority: leadRows, bookings: bookRows, clients: clientRows }) });
  assert.equal(res.statusCode, 200);
  const out = JSON.parse(res.body);
  const l1 = out.leads.find((l) => l.id === "recL1");
  assert.equal(l1.matches.length, 1);
  assert.equal(l1.matches[0].id, "recB1");
  const l2 = out.leads.find((l) => l.id === "recL2");
  assert.equal(l2.client.email, "q@x.com");
  assert.ok(l2.staleDays >= 30);
  assert.equal(l1.staleDays, undefined);
  assert.ok(out.summary.stale >= 1);
});

test("fail-open: a dead Bookings/Clients read never blocks the Leads tab", async () => {
  const listImpl = async (a) => {
    if (a.table === "Priority List") return leadRows;
    throw new Error("airtable listAll 503");
  };
  const res = await handler(ev, { env, listImpl });
  assert.equal(res.statusCode, 200);
  const out = JSON.parse(res.body);
  assert.equal(out.leads.length, 2);
  assert.deepEqual(out.leads[0].matches, []);
  assert.equal(out.leads[0].client, null);
});

test("a linked lead resolves its booking summary instead of matches", async () => {
  const linked = [{ id: "recL3", fields: { Name: "Eli", Phone: "6194176865", Installer: "aaron", Stage: "Booked", Booking: ["recB1"] } }];
  const res = await handler(ev, { env, listImpl: listFor({ priority: linked, bookings: bookRows, clients: [] }) });
  const l = JSON.parse(res.body).leads[0];
  assert.equal(l.booking.city, "Madison");
  assert.deepEqual(l.matches, []);
});
```

- [ ] **Step 2: Verify failure** — `l1.matches` undefined.

- [ ] **Step 3: Implement.** Replace `leads-list.js` requires + handler body:

```js
const { toLeadView, scopeLeads, ACTIVE_STAGES, toBookingSummary, bookingMatchesForLead, clientForLead, staleLeads } = require("./lib/leads.js");
```

`summarize` gains a stale count — change its signature to `summarize(leads, today)` and move the `today` computation to the caller:

```js
function summarize(leads, today) {
  const byChannel = {}, byStage = {};
  let dueOrOverdue = 0;
  for (const l of leads) {
    byChannel[l.channel] = (byChannel[l.channel] || 0) + 1;
    byStage[l.stage] = (byStage[l.stage] || 0) + 1;
    if (ACTIVE_STAGES.includes(l.stage) && l.nextFollowup && l.nextFollowup <= today) dueOrOverdue++;
  }
  const won = byStage.Booked || 0;
  return { byChannel, byStage, dueOrOverdue, stale: staleLeads(leads, today).length, total: leads.length,
    conversionRate: leads.length ? Math.round((won / leads.length) * 100) : 0 };
}
```

In the handler, after the Priority List read succeeds:

```js
  // Enrichment reads — fail-open: match suggestions, linked-booking context and
  // account info are extras; the Leads tab must render even when these tables
  // are unreachable.
  const [bookingRecs, clientRecs] = await Promise.all([
    listImpl({ token: c.token, baseId: c.baseId, table: c.bookings }).catch(() => []),
    listImpl({ token: c.token, baseId: c.baseId, table: c.clients }).catch(() => []),
  ]);
  const summaries = bookingRecs.map(toBookingSummary);
  const byId = new Map(summaries.map((b) => [b.id, b]));
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const staleDaysById = new Map(staleLeads(recs.map(toLeadView), today).map((l) => [l.id, l.staleDays]));
  const all = recs.map(toLeadView).map((l) => {
    const booking = l.bookingId ? (byId.get(l.bookingId) || null) : null;
    return { ...l, booking,
      matches: bookingMatchesForLead(l, summaries, today),
      client: clientForLead(l, booking, clientRecs),
      staleDays: staleDaysById.get(l.id),
    };
  });
  const q = (event.queryStringParameters) || {};
  const filter = q.installer || q.scope || "";
  const leads = scopeLeads(all, { key, admin, filter });
  return { statusCode: 200, headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leads, admin, summary: admin ? summarize(all, today) : summarize(leads, today) }) };
```

- [ ] **Step 4: Verify pass** — new file green; run `npm test` — if an existing test calls `summarize(leads)` without `today`, update that call site to pass a date string (behavior for its old assertions is unchanged).

- [ ] **Step 5: Commit** — `git commit -m "feat(leads-list): match suggestions, linked booking, client + stale enrichment"`

---### Task 9: Schema scripts (ensure-field options, rename-field, backfill)

**Files:**
- Modify: `scripts/airtable/ensure-field.mjs`
- Create: `scripts/airtable/rename-field.mjs`, `scripts/airtable/backfill-booking-links.mjs`

Scripts are argv-driven top-level-await `.mjs` (repo pattern, no unit tests — verified by `--dry-run` + idempotence at rollout).

- [ ] **Step 1: Extend `ensure-field.mjs`.** Change line 11 to accept an options JSON 5th arg and resolve `@TableName`:

```js
const [table, field, type = "singleLineText", description = "", optionsJson = ""] = process.argv.slice(2);
```

After the `existing` check (line 24), replace the body construction (lines 25-26) with:

```js
const body = { name: field, type };
if (description) body.description = description;
if (optionsJson) {
  try { body.options = JSON.parse(optionsJson); }
  catch { console.error("options (5th arg) must be valid JSON"); process.exit(1); }
  // "@Table Name" resolves to that table's id — linked-record fields need it.
  if (typeof body.options.linkedTableId === "string" && body.options.linkedTableId.startsWith("@")) {
    const target = tables.find((t) => t.name === body.options.linkedTableId.slice(1));
    if (!target) { console.error(`linked table "${body.options.linkedTableId.slice(1)}" not found`); process.exit(1); }
    body.options.linkedTableId = target.id;
  }
}
```

- [ ] **Step 2: Create `scripts/airtable/rename-field.mjs`** (for the auto-created mirror):

```js
// scripts/airtable/rename-field.mjs — rename a field via the metadata API.
// Idempotent: exits 0 if the target name already exists.
//   AIRTABLE_TOKEN=.. AIRTABLE_BASE_ID=.. node scripts/airtable/rename-field.mjs <table> <from> <to>
const [table, from, to] = process.argv.slice(2);
const token = process.env.AIRTABLE_TOKEN, baseId = process.env.AIRTABLE_BASE_ID;
if (!token || !baseId || !table || !from || !to) {
  console.error("usage: node rename-field.mjs <table> <from> <to>"); process.exit(1);
}
const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const metaRes = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, { headers: H });
if (!metaRes.ok) { console.error(`meta list failed: ${metaRes.status}`); process.exit(1); }
const tbl = ((await metaRes.json()).tables || []).find((t) => t.name === table);
if (!tbl) { console.error(`table "${table}" not found`); process.exit(1); }
if ((tbl.fields || []).find((f) => f.name === to)) { console.log(`ok: "${to}" already exists on "${table}"`); process.exit(0); }
const fld = (tbl.fields || []).find((f) => f.name === from);
if (!fld) { console.error(`field "${from}" not found on "${table}"`); process.exit(1); }
const res = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables/${tbl.id}/fields/${fld.id}`,
  { method: "PATCH", headers: H, body: JSON.stringify({ name: to }) });
if (!res.ok) { console.error(`rename failed: ${res.status} ${await res.text()}`); process.exit(1); }
console.log(`renamed: "${from}" → "${to}" on "${table}"`);
```

- [ ] **Step 3: Create `scripts/airtable/backfill-booking-links.mjs`:**

```js
// scripts/airtable/backfill-booking-links.mjs
// Copy legacy "Converted Booking" text ids into the real Booking linked field.
// Idempotent (already-linked rows skipped); dangling ids (booking since purged)
// skipped loudly; --dry-run prints the plan without writing.
//   AIRTABLE_TOKEN=.. AIRTABLE_BASE_ID=.. node scripts/airtable/backfill-booking-links.mjs [--dry-run]
const dry = process.argv.includes("--dry-run");
const token = process.env.AIRTABLE_TOKEN, baseId = process.env.AIRTABLE_BASE_ID;
if (!token || !baseId) { console.error("AIRTABLE_TOKEN and AIRTABLE_BASE_ID required"); process.exit(1); }
const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
async function listAll(table) {
  const out = []; let offset;
  do {
    const u = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
    u.searchParams.set("pageSize", "100");
    if (offset) u.searchParams.set("offset", offset);
    const r = await fetch(u, { headers: H });
    if (!r.ok) { console.error(`${table} list failed: ${r.status}`); process.exit(1); }
    const j = await r.json(); out.push(...(j.records || [])); offset = j.offset;
  } while (offset);
  return out;
}
const leads = await listAll("Priority List");
const bookingIds = new Set((await listAll("Bookings")).map((r) => r.id));
let linked = 0, dangling = 0, already = 0, none = 0;
for (const r of leads) {
  const f = r.fields || {};
  if (Array.isArray(f.Booking) && f.Booking.length) { already++; continue; }
  const legacy = String(f["Converted Booking"] || "").trim();
  if (!legacy) { none++; continue; }
  if (!bookingIds.has(legacy)) { console.log(`skip (dangling): ${r.id} "${f.Name || ""}" → ${legacy}`); dangling++; continue; }
  console.log(`${dry ? "would link" : "link"}: ${r.id} "${f.Name || ""}" → ${legacy}`);
  if (!dry) {
    const res = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent("Priority List")}/${r.id}`,
      { method: "PATCH", headers: H, body: JSON.stringify({ fields: { Booking: [legacy] } }) });
    if (!res.ok) { console.error(`  FAILED: ${res.status} ${await res.text()}`); process.exit(1); }
  }
  linked++;
}
console.log(`${dry ? "dry-run" : "done"}: ${linked} linked, ${already} already linked, ${dangling} dangling skipped, ${none} never converted, of ${leads.length} leads`);
```

- [ ] **Step 4: Sanity-run** `node --check`-equivalent: `node -e "import('./scripts/airtable/backfill-booking-links.mjs').catch(e=>console.error(e.message))"` is NOT safe (it executes). Instead verify syntax only: `node --input-type=module -e "await import('node:fs')" && npx acorn --ecma2022 --module scripts/airtable/backfill-booking-links.mjs >/dev/null 2>&1 || node --check scripts/airtable/rename-field.mjs` — simplest reliable check: `node --check` works for .mjs on Node ≥20: run `node --check scripts/airtable/backfill-booking-links.mjs` and `node --check scripts/airtable/rename-field.mjs` and `node --check scripts/airtable/ensure-field.mjs`. Expected: no output, exit 0. (These scripts only execute at rollout, Task 12.)

- [ ] **Step 5: Commit** — `git commit -m "feat(scripts): linked-record support for ensure-field + mirror rename + booking-link backfill"`

---

### Task 10: Console — lead card connections UI

**Files:**
- Modify: `site/installer.html` — `leadCard` (`:1805-1897`), `leadUpdate` (`:1900-1923`)

No unit tests (single-file console, repo practice = live smoke). After each edit, sanity-check by loading `/inst` locally if `netlify dev` is running, else rely on rollout smoke (Task 12).

- [ ] **Step 1: Shared TY-thread opener.** Extract the duplicated open-chat logic. Add near `linkBtn` (`:1898`):

```js
  // Open (or create) this person's SMS thread through the TY business line and
  // land in Chats with it open. Shared by lead cards and booking cards.
  async function openTyThread(phone,name,vehicle,btn,label){
    btn.disabled=true;
    try{
      var r=await chatApi({op:'openSms', phone:phone, name:name, vehicle:vehicle});
      if(r && r.session){
        if(r.isNew){
          var first=(name||'').trim().split(/\s+/)[0]||'there';
          var me=STATE.me ? STATE.me.charAt(0).toUpperCase()+STATE.me.slice(1) : 'Tuned Yota';
          STATE.chatPrefill='Hi '+first+", it's "+me+' with Tuned Yota'+(vehicle?' about your '+vehicle:'')+' — ';
        }
        STATE.tab='chats'; STATE.chatOpen=r.session; renderAll(); return;
      }
      btn.textContent='Failed';
    }catch(e){ btn.textContent='Failed'; }
    finally{ setTimeout(function(){ btn.textContent=label; btn.disabled=false; },4000); }
  }
```

In `leadCard`, replace the whole `row.appendChild(act('💬 Open chat', async function(ev){ ... }));` block (`:1838-1852`) with:

```js
      row.appendChild(act('💬 Open chat',function(ev){ openTyThread(l.phone,l.name,l.vehicle,ev.target,'💬 Open chat'); }));
```

- [ ] **Step 2: Waitlist badge + client line + linked line + suggestions.** In `leadCard`, immediately after `var body=document.createElement('div'); body.className='ebody';` (`:1819`), insert:

```js
    // Waitlist context (original Priority List schema) — why they're waiting.
    if(l.reason){
      var wl=document.createElement('div'); wl.className='ffnote';
      wl.textContent='⏳ Waitlist — '+l.reason+(l.eventDate?' · '+l.eventDate:'')+(l.requestedSlot?' · wanted '+l.requestedSlot:'');
      body.appendChild(wl);
    }
    // Linked booking: where this person landed. Tap = jump-and-flash the card.
    if(l.booking){
      var lb=document.createElement('div'); lb.className='walkmini';
      lb.appendChild(act('📅 '+(l.booking.city||'—')+' · '+relDate(l.booking.dateISO)+(l.booking.scheduledTime?' · '+l.booking.scheduledTime:(l.booking.slot?' · '+l.booking.slot:''))+(l.booking.status!=='Booked'?' · '+l.booking.status:''),function(){
        var full=(STATE.bookings||[]).filter(function(x){ return x.id===l.booking.id; })[0];
        jumpToBooking(full||l.booking);
      }));
      lb.appendChild(act('Unlink',function(){
        if(confirm('Unlink this lead from the booking? (Stage stays Booked — change it after if needed.)')) leadUpdate(l.id,{action:'unlink'});
      }));
      body.appendChild(lb);
    }
    // "Looks booked already" — same phone/email as an existing booking. One tap links.
    if(!l.bookingId && (l.matches||[]).length){
      var sg=document.createElement('div'); sg.className='ffnote';
      var sgt=document.createElement('div'); sgt.textContent='Looks booked already:'; sg.appendChild(sgt);
      l.matches.forEach(function(m){
        sg.appendChild(act('🔗 Link: '+(m.name||'client')+' — '+(m.city||'—')+' · '+relDate(m.dateISO)+(m.scheduledTime?' · '+m.scheduledTime:(m.slot?' · '+m.slot:''))+(m.status!=='Booked'?' · '+m.status:''),function(){
          leadUpdate(l.id,{action:'link',bookingId:m.id});
        }));
      });
      body.appendChild(sg);
    }
    // Client-portal account behind this lead (matched by email).
    if(l.client){
      var cl=document.createElement('div'); cl.className='edate'; cl.style.marginTop='4px';
      cl.textContent='👤 tunedyota.com account · '+l.client.email+((l.client.vehicles||[]).length?' · garage: '+l.client.vehicles.map(function(v){ return [v.year,v.make,v.model].filter(Boolean).join(' '); }).join(', '):'');
      body.appendChild(cl);
    }
```

Note: `act` is defined a few lines below this insertion point (`function act(label,fn)` inside `leadCard`) — move that one-line helper definition up so it sits directly after `var body=...`, before the inserted block.

- [ ] **Step 3: Match hint on the collapsed card.** In `sum.innerHTML` (`:1815`), after the OTT badge fragment `(l.channel==='ott-national'?...:'')`, insert:

```js
+((!l.bookingId&&(l.matches||[]).length)?' <span class="tabbadge" style="background:#8a6d3b">🔗 match</span>':'')
```

And in the `edate` line (`:1816`), append staleness: change `esc(l.vehicle||'—')+' · '+esc(l.city||'—')` to:

```js
esc(l.vehicle||'—')+' · '+esc(l.city||'—')+(l.staleDays!=null?' · '+l.staleDays+'d quiet':'')
```

- [ ] **Step 4: Manual link picker.** In `leadCard`, right after the convert block ends (`body.appendChild(conv);` at `:1894`), insert:

```js
    // Link to an EXISTING booking (dedupe: this person already booked directly).
    if(!l.bookingId && (STATE.bookings||[]).length){
      var lkRow=document.createElement('div'); lkRow.className='walkmini';
      var lkSel=document.createElement('select');
      var cands=(STATE.bookings||[]).slice().sort(function(a,b){ return String(b.dateISO||'').localeCompare(String(a.dateISO||'')); });
      lkSel.innerHTML='<option value="">Link to existing booking…</option>'+cands.map(function(b){
        return '<option value="'+esc(b.id)+'">'+esc((b.dateISO||'—')+(b.slotLabel?' '+b.slotLabel:(b.scheduledTime?' '+b.scheduledTime:''))+' — '+(b.name||'')+' ('+(b.city||'—')+')')+'</option>';
      }).join('');
      lkRow.appendChild(lkSel);
      lkRow.appendChild(act('Link',function(){ if(lkSel.value) leadUpdate(l.id,{action:'link',bookingId:lkSel.value}); }));
      body.appendChild(lkRow);
    }
```

- [ ] **Step 5: `leadUpdate` handles link like convert (jump-and-flash).** In `leadUpdate` (`:1905-1919`), insert a branch after the convert branch:

```js
        } else if(payload.action==='link' && out.booking){
          loadLeads();
          var full=(STATE.bookings||[]).filter(function(x){ return x.id===out.booking.id; })[0];
          jumpToBooking(full||out.booking);
          succeed('✓ Linked to '+(out.booking.name||'booking')+' — '+(out.booking.city||'—')+' · '+relDate(out.booking.dateISO)+'. Card highlighted below.');
        } else {
```

(The final `else` message line stays as-is; `unlink` falls through to the generic '✓ Updated.' + `loadLeads()` path.)

- [ ] **Step 6: Commit** — `git commit -m "feat(console): lead card booking links, match suggestions, waitlist + client context"`

---

### Task 11: Console — Stale/Waitlist chips + booking-card contact buttons

**Files:**
- Modify: `site/installer.html` — `renderLeads` (`:1784-1804`), `rowCard` (`:2114-2187`)

- [ ] **Step 1: Filter chips.** In `renderLeads`, after the search box wiring (`:1790`), insert:

```js
    // Focus chips: Stale = the fell-through-the-cracks bucket (server-computed
    // staleDays, single source of truth in lib/leads.js); Waitlist = event-
    // waitlist-born rows (Reason present).
    var chips=document.createElement('div'); chips.className='walkmini';
    function chipBtn(idc,label,count){
      var b=document.createElement('button'); b.className='btn'+(STATE.leadFilter===idc?' addwalk':'');
      b.textContent=label+(count?' ('+count+')':'');
      b.onclick=function(){ STATE.leadFilter=(STATE.leadFilter===idc?'':idc); renderLeads(); };
      return b;
    }
    var staleCount=STATE.leads.filter(function(l){ return l.staleDays!=null; }).length;
    var wlCount=STATE.leads.filter(function(l){ return !!l.reason; }).length;
    if(staleCount) chips.appendChild(chipBtn('stale','🕸 Stale',staleCount));
    if(wlCount) chips.appendChild(chipBtn('waitlist','⏳ Waitlist',wlCount));
    if(chips.children.length) host.appendChild(chips);
```

Then change the `visible` computation (`:1791`) to honor the filter — replace `var visible=STATE.leads.filter(leadMatchesQ);` with:

```js
    var visible=STATE.leads.filter(leadMatchesQ);
    if(STATE.leadFilter==='waitlist'){ visible=visible.filter(function(l){ return !!l.reason; }); }
    if(STATE.leadFilter==='stale'){
      visible=visible.filter(function(l){ return l.staleDays!=null; })
        .sort(function(a,b){ return b.staleDays-a.staleDays; });
      host.appendChild(secHead('Stale — quiet 30+ days, nothing scheduled ('+visible.length+')',''));
      visible.forEach(function(l){ host.appendChild(leadCard(l)); });
      if(!visible.length){ var em0=document.createElement('div'); em0.className='empty'; em0.textContent='Nothing stale — every active lead has been touched in the last 30 days.'; host.appendChild(em0); }
      return;
    }
```

- [ ] **Step 2: Booking-card Call/Text.** In `rowCard`, after the `head` string is built (`:2123`, after the pcm line) add:

```js
    // Reach the client from the booking — same TY-line thread motion as leads.
    var contact = b.phone ? '<div class="row-actions" style="margin-top:6px">'+
      '<a class="btn" style="text-align:center" href="tel:'+esc(b.phone)+'">Call</a>'+
      '<button type="button" class="btn" id="chat_'+b.id+'">💬 Text via TY</button></div>' : '';
```

Include `contact` in all three render branches:
- Completed branch (`:2127`): `c.innerHTML=head+contact+'<div class="done">…`
- No-show branch (`:2148`): leave unchanged (spec scope: Booked + Completed).
- Open branch (`:2154`): `c.innerHTML=head+contact+'<details …`

At the end of `rowCard` (before each `return c;` in the Completed branch and the open branch — two call sites), wire the button. Add this helper line right after the `contact` definition, then call it in both branches after `c.innerHTML` is set:

```js
    function wireChat(){ var cbtn=c.querySelector('#chat_'+b.id);
      if(cbtn) cbtn.onclick=function(){ openTyThread(b.phone,b.name,b.vehicle,cbtn,'💬 Text via TY'); }; }
```

(Insert `wireChat();` after `c.innerHTML=…` in the Completed branch — before its `return c;` — and after the open branch's `c.innerHTML=…` alongside the existing querySelector wiring at `:2177`.)

- [ ] **Step 3: Commit** — `git commit -m "feat(console): stale/waitlist chips + call/text from booking cards"`

---

### Task 12: Rollout (schema, backfill, deploy, live smoke)

- [ ] **Step 1: Full suite** — `npm test` → all green.

- [ ] **Step 2: Create the linked field + rename the mirror** (from repo root, Git Bash):

```bash
export AIRTABLE_TOKEN=$(npx netlify env:get AIRTABLE_TOKEN | tr -d '\r\n')
export AIRTABLE_BASE_ID=$(npx netlify env:get AIRTABLE_BASE_ID | tr -d '\r\n')
node scripts/airtable/ensure-field.mjs "Priority List" "Booking" multipleRecordLinks "Linked booking (lead connections)" '{"linkedTableId":"@Bookings","prefersSingleRecordLink":true}'
# The create response / meta listing shows the auto-created mirror name on Bookings
# (usually "Priority List"); rename it:
node scripts/airtable/rename-field.mjs "Bookings" "Priority List" "Leads"
```

Expected: `created: "Booking" on "Priority List" (multipleRecordLinks, fld…)` then `renamed: "Priority List" → "Leads" on "Bookings"`. If the mirror got a different auto-name, list it via the meta API output of ensure-field's error path or Airtable UI, and rename that name instead.

- [ ] **Step 3: Backfill** — dry-run, review every line, then live:

```bash
node scripts/airtable/backfill-booking-links.mjs --dry-run
node scripts/airtable/backfill-booking-links.mjs
```

Expected: converted leads listed as `link: …`, dangling ids skipped loudly, summary counts consistent between the two runs.

- [ ] **Step 4: Push to deploy** — `git push` (Netlify builds from master).

- [ ] **Step 5: Live smoke (the Eli case):**
1. Open `/inst` as Aaron → Leads tab. The "Text 619-417-6865" card shows the 🔗 match badge; expanded, the strip reads "Looks booked already: Eli Soetenga — Madison · Sat Aug 1 · 10:20".
2. Tap Link → success banner, jump-and-flash lands on the Madison 10:20 booking card in Jobs.
3. Back in Leads: the lead sits under Booked with "📅 Madison · Aug 1 · 10:20"; its activity log ends with `linked → existing booking recLBhEKXFytNfzp0 (…)`.
4. In Airtable: the lead's `Booking` field links the booking; the booking's `Leads` field links back.
5. Stale chip shows a plausible count; opening it lists quiet leads oldest-first with "Nd quiet".
6. A waitlist-born row (Reason set) shows the ⏳ badge and appears under the Waitlist chip.
7. Any booking card with a phone: "💬 Text via TY" opens the client's thread in Chats.

- [ ] **Step 6: Update memory + report** — mark the feature shipped, note follow-ups (stale notifications routine).

---

## Self-review checklist (done at authoring)

- Spec coverage: storage/migration (T9,T12), matching (T2,T8), client (T3,T8), actions (T5,T6,T7), suggestion strip/picker/linked line/client line (T10), stale bucket (T4,T8,T11), waitlist visibility (T1,T10,T11), booking chat (T11), fail-open (T8), rollout+smoke (T12). No gaps.
- Type consistency: `bookingId` (lead), summary shape `{id,name,phone,email,city,dateISO,slot,scheduledTime,status,installer,vehicle}` used identically in T2/T6/T8/T10; `staleDays` attached in T8, read in T10/T11; `openTyThread(phone,name,vehicle,btn,label)` defined T10 step 1, used T11 step 2.
- No placeholders.
