# CRM Capture at First Touch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the spec at `docs/superpowers/specs/2026-07-31-crm-capture-at-first-touch-design.md` — exact model year captured at first touch on every channel (A), a client record that forms at first touch universally with suggest-and-confirm merge (B), and a one-flow close-out with a report-field gate, drafts, A2P consent at the signature, and client-record propagation (C).

**Architecture:** Pure logic lives in `netlify/functions/lib/leads.js` (deps-injected, unit-tested); endpoints stay thin. The client record is a Priority List row (client-notes decision). B extracts the resolve-or-mint pattern already shipped inline in `installer-client-note.js` into shared lib helpers, then wires it into booking creation paths. C extends `installer-closeout.js` (gate + draft + propagation) and the console close-out flow.

**Tech Stack:** Node 18+ Netlify functions, Airtable REST via `lib/airtable.js` (`createTolerant`/`updateTolerant`), `node --test` + `assert/strict`, static-wiring tests for `site/installer.html`.

**Repo rules that bind every task:**
- `git pull --ff-only` before ANY `site/installer.html` edit (parallel Claude sessions push to this repo).
- NEVER edit `app/www/**` (gitignored build output; sources live in `site/`).
- Ship rhythm: tests green (`npm test`, baseline 1430 pass) → commit → push, one motion per task.
- Airtable table names come from `cfg(env)`: `c.priority` = Priority List, `c.bookings` = Bookings.

---

# Sub-project A — Model year at first touch (ships alone)

### Task A1: Tune-finder — exact year required for every vehicle selection

**Files:**
- Modify: `site/find-your-exact-tune.html` (function `populateModelYear`, ~line 907; submit handler `modelYear` reads at ~lines 1056 and 1103)
- Test: `tests/tune-finder-year.test.js` (create)

Behavior change: today the year select shows only for ambiguous multi-year ranges (`if(!r||r.hi<=r.lo)` hides it). New rules: single-year platform → capture the year silently (zero taps); unparseable/absent range → show a generic year list (current+1 down to 1995), required; multi-year range → unchanged (required). The submit handlers stop gating `modelYear` on visibility.

- [ ] **Step 1: Write the failing static test**

```js
// tests/tune-finder-year.test.js
// Model year is captured for EVERY vehicle selection (spec 2026-07-31):
// single-year platforms capture silently, unknown ranges get a generic required
// list, and the submit payload never gates modelYear on the field being visible.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const html = fs.readFileSync("site/find-your-exact-tune.html", "utf8");

test("single-year platforms auto-capture the year (no hidden empty select)", () => {
  assert.match(html, /r\.hi===r\.lo/, "populateModelYear must special-case single-year ranges");
  assert.match(html, /sel\.value=String\(r\.lo\)/, "single-year value must be set so it submits");
});

test("unparseable ranges fall back to a generic required year list", () => {
  assert.match(html, /const lo=r\?r\.lo:1995/, "generic fallback low bound");
});

test("submit reads the year unconditionally, not only when shown", () => {
  assert.doesNotMatch(html, /modelYear=yearShown\?yearEl\.value:""/,
    "modelYear must not be dropped when the group is hidden (single-year case)");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/tune-finder-year.test.js`
Expected: FAIL (all three — current code has neither branch and gates on `yearShown`).

- [ ] **Step 3: Implement in `site/find-your-exact-tune.html`**

Replace the body of `populateModelYear` (keep `parseYearRange` as is):

```js
function populateModelYear(){
  const group=$("#fYearGroup"), sel=$("#fYear");
  if(!group||!sel) return;
  sel.innerHTML='<option value="" disabled selected>Select your exact year</option>';
  const CUR=new Date().getFullYear();
  const r=parseYearRange(S.cfg&&S.cfg.y);
  if(r&&r.hi===r.lo){ /* single-year platform: capture silently, zero taps */
    const o=document.createElement("option"); o.value=String(r.lo); o.textContent=String(r.lo);
    sel.appendChild(o); sel.value=String(r.lo);
    group.style.display="none"; sel.required=false; return;
  }
  const lo=r?r.lo:1995, hi=r?r.hi:CUR+1;   /* no parseable range → generic list, still required */
  for(let y=hi;y>=lo;y--){ const o=document.createElement("option"); o.value=String(y); o.textContent=String(y); sel.appendChild(o); }
  group.style.display=""; sel.required=true;
}
```

In the booking submit handler (~line 1056), replace:

```js
const modelYear=yearShown?yearEl.value:"";
```
with:
```js
const modelYear=yearEl?yearEl.value:"";
```
(the `yearShown && !yearEl.value` required-error check above it stays — it only fires for visible-and-empty).

In the legacy no-market path (~line 1103), replace the `modelYear` const that checks `style.display!=="none"` with:

```js
const modelYear=($("#fYear")&&$("#fYear").value)||"";
```

- [ ] **Step 4: Run the new test + full suite**

Run: `node --test tests/tune-finder-year.test.js` → PASS, then `npm test` → 0 fail.

- [ ] **Step 5: Commit + push**

```bash
git add site/find-your-exact-tune.html tests/tune-finder-year.test.js
git commit -m "feat(funnel): exact model year captured on every tune-finder submission"
git push
```

### Task A2: `processLeadIngest` writes Model Year (all AI/adapter channels)

**Files:**
- Modify: `netlify/functions/lib/leads.js` (`processLeadIngest`, lines ~126–209)
- Test: `tests/leads.test.js` (append)

Today `processLeadIngest` drops `modelYear` entirely — no channel writes it to the client record. Fix at the single normalized write path: new leads store it; deduped touches backfill it when blank.

- [ ] **Step 1: Write the failing tests** (append to `tests/leads.test.js`, using its existing deps-injection pattern — a `create`/`update`/`list` capture like the file's other `processLeadIngest` tests):

```js
test("ingest: modelYear lands in Model Year on create", async () => {
  const writes = [];
  const deps = { env: { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" }, now: new Date("2026-08-01T12:00:00Z"),
    list: async () => [], update: async () => ({}),
    create: async (a) => { writes.push(a); return { id: "recNew" }; } };
  const out = await processLeadIngest({ name: "Sam", phone: "6125550100", city: "Madison",
    vehicle: "2016-2023 Toyota Tacoma 3.5L", modelYear: "2019", channel: "sms" }, deps);
  assert.equal(out.status, "lead");
  assert.equal(writes[0].fields["Model Year"], "2019");
});

test("ingest: dedupe touch backfills a blank Model Year, never overwrites", async () => {
  const patches = [];
  const existing = (my) => [{ id: "recL1", fields: { Name: "Sam", Phone: "6125550100", Stage: "New",
    ...(my ? { "Model Year": my } : {}) } }];
  const deps = (rows) => ({ env: { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" }, now: new Date("2026-08-01T12:00:00Z"),
    list: async () => rows, create: async () => ({ id: "x" }),
    update: async (a) => { patches.push(a); return {}; } });
  await processLeadIngest({ name: "Sam", phone: "6125550100", modelYear: "2019" }, deps(existing()));
  assert.equal(patches[0].fields["Model Year"], "2019");
  patches.length = 0;
  await processLeadIngest({ name: "Sam", phone: "6125550100", modelYear: "2021" }, deps(existing("2019")));
  assert.equal(patches[0].fields["Model Year"], undefined, "a stored year is never overwritten by ingest");
});
```

(Import `processLeadIngest` at the top of the test file if not already imported.)

- [ ] **Step 2: Run to verify both fail**

Run: `node --test tests/leads.test.js` → the two new tests FAIL (`Model Year` undefined on create).

- [ ] **Step 3: Implement in `processLeadIngest`**

After `const city = String(d.city || "").trim();` add:

```js
  const modelYear = String(d.modelYear || "").trim().slice(0, 4);
```

In the **match** branch, after the name-backfill block, add:

```js
    if (modelYear && !String(match.fields["Model Year"] || "").trim()) fields["Model Year"] = modelYear;
```
and add `"Model Year"` to that `updateTolerant` tolerated list.

In the **create** `fields` object add:

```js
    ...(modelYear ? { "Model Year": modelYear } : {}),
```
and add `"Model Year"` to the `createTolerant` tolerated list.

- [ ] **Step 4: Run tests** — new tests PASS, `npm test` 0 fail.

- [ ] **Step 5: Commit + push**

```bash
git add netlify/functions/lib/leads.js tests/leads.test.js
git commit -m "feat(leads): Model Year captured at the single ingest write path — all channels"
git push
```

### Task A3: Thread modelYear from the chat transfer + OTT email adapter

**Files:**
- Modify: `netlify/functions/chat.js` (the transfer-tool → lead body mapping; the vehicle-string builder is at ~line 31)
- Modify: `netlify/functions/gmail-lead-poll.js` (the parsed-email → ingest body mapping)
- Test: `tests/chat-transfer-year.test.js` (create) — or append to the existing chat/gmail test files if they already exercise the ingest body shape (check `ls tests | grep -E "chat|gmail"` first and follow suit).

The chat agent already REQUIRES `modelYear` in its transfer schema (`lib/chat-agent.js:47`); it's currently only baked into the vehicle display string. Pass it as its own field so A2's write path stores it.

- [ ] **Step 1: Write the failing test.** Locate where `chat.js` builds the ingest/lead body from the transfer payload `t` (grep `vehicleMake` in `chat.js`). The test asserts the body passed to lead ingest carries `modelYear: t.modelYear`. If the existing chat tests stub `processLeadIngest`/`lead-ingest` calls, extend the stub to capture the body and assert `body.modelYear === "2019"` for a transfer with `modelYear: "2019"`. Same pattern for `gmail-lead-poll.js`: for a fixture email whose vehicle line contains a 4-digit year, assert the ingest body has that year.

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement.**

In `chat.js`, where the lead body is assembled from `t` (alongside `vehicle: …`), add:

```js
  modelYear: /^(19|20)\d{2}$/.test(String(t.modelYear || "").trim()) ? String(t.modelYear).trim() : "",
```

In `gmail-lead-poll.js`, where the parsed fields become the ingest body, add:

```js
  modelYear: ((String(parsed.vehicle || "").match(/\b(19|20)\d{2}\b/) || [])[0]) || "",
```
(adjust `parsed.vehicle` to the actual local name of the parsed vehicle string in that file — grep `vehicle` there; if the parser already captures a separate year token, prefer it).

- [ ] **Step 4: Run tests** — new tests PASS, `npm test` 0 fail.

- [ ] **Step 5: Commit + push**

```bash
git add netlify/functions/chat.js netlify/functions/gmail-lead-poll.js tests/
git commit -m "feat(leads): chat transfer + OTT email adapter thread exact model year into the client record"
git push
```

### Task A4: Walk-in year passthrough (optional, never blocking)

**Files:**
- Modify: `netlify/functions/installer-walkin.js` (fields block at ~line 71)
- Modify: `site/installer.html` (walk-in form — grep `installer-walkin` for the POST + form markup)
- Test: append one test to the existing walk-in test file (`ls tests | grep walkin`)

- [ ] **Step 1: Failing test:** POST body with `modelYear: "2019"` → created Bookings fields carry `"Model Year": "2019"`; body without it → field absent. Follow the file's existing `processWalkin` deps pattern.

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement.** In `installer-walkin.js` near the other field consts:

```js
  const modelYear = String(d.modelYear || "").trim().slice(0, 4);
```
In the `fields` object: `if (modelYear) fields["Model Year"] = modelYear;` and add `"Model Year"` to the `createTolerant` tolerated list. In the console walk-in form add an optional `Model year` input (number/select, placeholder "Year (optional)") wired into the POST body as `modelYear`.

- [ ] **Step 4: Run tests** — PASS; `npm test` 0 fail.

- [ ] **Step 5: Commit + push**

```bash
git add netlify/functions/installer-walkin.js site/installer.html tests/
git commit -m "feat(console): walk-in captures model year when known — never blocking"
git push
```

**Sub-project A live smoke (after deploy):** submit a tune-finder lead for a single-year platform and a range platform; confirm `Model Year` populated on both rows in Airtable.

---

# Sub-project B — Client record at first touch + merge

### Task B1: Extract resolve-or-mint into `lib/leads.js` (refactor, no behavior change)

**Files:**
- Modify: `netlify/functions/lib/leads.js` (new exports `findLeadForBooking`, `mintLeadFields`)
- Modify: `netlify/functions/installer-client-note.js` (booking path uses the new helpers)
- Test: `tests/leads.test.js` (append); existing client-note tests must stay green untouched.

- [ ] **Step 1: Failing tests** (append to `tests/leads.test.js`):

```js
test("findLeadForBooking: linked id wins, then phone, then email", () => {
  const { findLeadForBooking } = require("../netlify/functions/lib/leads.js");
  const leads = [
    { id: "recA", bookingId: "recB9", phone: "", email: "" },
    { id: "recB", bookingId: "", phone: "(612) 555-0100", email: "" },
    { id: "recC", bookingId: "", phone: "", email: "Sam@X.com" },
  ];
  const f = { Phone: "+16125550100", Email: "sam@x.com" };
  assert.equal(findLeadForBooking("recB9", f, leads).id, "recA");
  assert.equal(findLeadForBooking("recOther", f, leads).id, "recB");
  assert.equal(findLeadForBooking("recOther", { Email: "SAM@X.COM" }, leads).id, "recC");
  assert.equal(findLeadForBooking("recOther", { Phone: "999" }, [leads[1]]), null);
});

test("mintLeadFields: market-routed, linked back, Model Year carried", () => {
  const { mintLeadFields } = require("../netlify/functions/lib/leads.js");
  const f = { Name: "Sam", Phone: "6125550100", Email: "", City: "Madison",
    Vehicle: "2016-2023 Tacoma 3.5L", "Model Year": "2019", Installer: ["aaron"] };
  const out = mintLeadFields("recB1", f, new Date("2026-08-01T12:00:00Z"), { source: "booking:web", fields: { Channel: "web" } });
  assert.equal(out.Stage, "Booked");
  assert.deepEqual(out.Booking, ["recB1"]);
  assert.equal(out["Converted Booking"], "recB1");
  assert.equal(out["Model Year"], "2019");
  assert.equal(out.Channel, "web");
  assert.equal(out.Source, "booking:web");
  assert.ok(out.Installer, "market routing sets an installer");
  assert.match(out["Activity Log"], /minted from booking recB1/);
});
```

- [ ] **Step 2: Run to verify both fail** (helpers don't exist).

- [ ] **Step 3: Implement in `lib/leads.js`** (below `buildUnlinkPatch`):

```js
// Resolve the client record behind a booking: linked lead first, then the same
// normalized phone, then email. Views come from toLeadView. Null when unknown.
function findLeadForBooking(bookingId, bookingFields, leadViews) {
  const pKey = normalizePhone(bookingFields.Phone), eKey = normalizeEmail(bookingFields.Email);
  return leadViews.find((l) => l.bookingId === bookingId)
    || (pKey && leadViews.find((l) => normalizePhone(l.phone) === pKey))
    || (eKey && leadViews.find((l) => normalizeEmail(l.email) === eKey)) || null;
}

// The Priority List fields for a client record minted from a booking identity —
// market-routed, Stage Booked, linked back. `extra.fields` lets callers add
// channel/notes columns; `extra.source` names the minting motion.
function mintLeadFields(bookingId, f, now = new Date(), extra = {}) {
  const city = String(f.City || "").trim();
  const market = getMarket(city);
  const owner = normalizeInstallerKey(f.Installer);
  const instKey = market ? keyToInstaller(market.inst).key : owner;
  const fields = {
    Name: String(f.Name || ""), Phone: String(f.Phone || ""), Email: String(f.Email || ""),
    City: market ? market.city : (city || "Unassigned"), Vehicle: String(f.Vehicle || ""),
    ...(String(f["Model Year"] || "").trim() ? { "Model Year": String(f["Model Year"]).trim() } : {}),
    Source: extra.source || "booking", Stage: "Booked",
    Booking: [bookingId], "Converted Booking": bookingId,
    "Activity Log": logLine(now, `minted from booking ${bookingId}`),
    ...(extra.fields || {}),
  };
  if (instKey) fields.Installer = instKey;
  return fields;
}
```
Export both. Then refactor `installer-client-note.js`'s booking path: replace its inline `const match = leads.find(...)` chain with `findLeadForBooking(d.bookingId, f, leads)`, and its mint `fields` object with `mintLeadFields(d.bookingId, f, now, { source: "booking-note", fields: { "Client Notes": line } })` — the tolerated list on its `createTolerant` stays exactly as is (`"Client Notes"` deliberately not tolerated).

- [ ] **Step 4: Run** `npm test` — new tests PASS, all existing client-note tests still green (behavior-preserving refactor).

- [ ] **Step 5: Commit + push**

```bash
git add netlify/functions/lib/leads.js netlify/functions/installer-client-note.js tests/leads.test.js
git commit -m "refactor(leads): shared findLeadForBooking + mintLeadFields — client-note resolver extracted for reuse"
git push
```

### Task B2: `ensureClientRecordForBooking` + wire into web bookings (book-background)

**Files:**
- Modify: `netlify/functions/lib/leads.js` (new I/O helper)
- Modify: `netlify/functions/book-background.js` (booking branch of `processNotifications`)
- Test: `tests/leads.test.js` + `tests/book-background.test.js` (append)

- [ ] **Step 1: Failing tests:**

```js
// tests/leads.test.js
test("ensureClientRecordForBooking: links an unlinked match, mints when none, leaves other-booking links alone", async () => {
  const { ensureClientRecordForBooking } = require("../netlify/functions/lib/leads.js");
  const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };
  const bookingFields = { Name: "Sam", Phone: "6125550100", Email: "", City: "Madison", Vehicle: "Tacoma", Installer: ["aaron"] };
  // unlinked phone match → linked
  const patches = [], creates = [];
  const deps = (rows) => ({ env, now: new Date("2026-08-01T12:00:00Z"), channel: "web",
    list: async () => rows,
    update: async (a) => { patches.push(a); return {}; },
    create: async (a) => { creates.push(a); return { id: "recMint" }; } });
  const linked = await ensureClientRecordForBooking("recB1", bookingFields,
    deps([{ id: "recL1", fields: { Name: "Sam", Phone: "6125550100", Stage: "New" } }]));
  assert.deepEqual(linked, { leadId: "recL1", linked: true, minted: false });
  assert.deepEqual(patches[0].fields.Booking, ["recB1"]);
  assert.equal(patches[0].fields.Stage, "Booked");
  // no match → minted
  const minted = await ensureClientRecordForBooking("recB2", bookingFields, deps([]));
  assert.deepEqual(minted, { leadId: "recMint", linked: true, minted: true });
  assert.equal(creates[0].fields.Channel, "web");
  // match already linked to a DIFFERENT booking → untouched (single-link stays honest)
  patches.length = 0;
  const other = await ensureClientRecordForBooking("recB3", bookingFields,
    deps([{ id: "recL2", fields: { Phone: "6125550100", Booking: ["recB9"] } }]));
  assert.equal(other.leadId, "recL2");
  assert.equal(patches.length, 0);
});
```

```js
// tests/book-background.test.js (append; follow the file's job/deps fixture pattern)
test("booking job ensures a client record — awaited, fail-open", async () => {
  // build the standard booking job fixture the file already uses; inject
  // ensureClient (see Step 3's deps seam) capturing its args; assert it was
  // AWAITED with the booking recordId and a bookingFields object carrying
  // Name/Phone/Model Year; then make it throw and assert processNotifications
  // still resolves without error (fail-open).
});
```

- [ ] **Step 2: Run to verify both fail.**

- [ ] **Step 3: Implement.** In `lib/leads.js`:

```js
// Ensure a client record exists and is linked for a just-created booking.
// The universal first-touch rule (spec 2026-07-31): every booking either links
// to the existing client record or mints one. Callers wrap in try/catch —
// client-record upkeep must NEVER fail a booking (fail-open), and callers must
// AWAIT it (Lambda freeze: fire-and-forget never runs).
async function ensureClientRecordForBooking(bookingId, bookingFields, deps = {}) {
  const { env = process.env, fetchImpl = fetch, now = new Date(), channel = "web",
          list = (a) => listAllRecords({ fetchImpl, ...a }),
          create = (a) => createRecord({ fetchImpl, ...a }),
          update = (a) => updateRecord({ fetchImpl, ...a }) } = deps;
  const c = cfg(env);
  const leads = (await list({ token: c.token, baseId: c.baseId, table: c.priority })).map(toLeadView);
  const match = findLeadForBooking(bookingId, bookingFields, leads);
  if (match) {
    if (match.bookingId) return { leadId: match.id, linked: false, minted: false }; // this or another booking — leave links alone
    const patch = buildLinkPatch(match, toBookingSummary({ id: bookingId, fields: bookingFields }), now);
    await updateTolerant(update, { token: c.token, baseId: c.baseId, table: c.priority, id: match.id, fields: patch },
      ["Booking", "Converted Booking", "Stage", "Activity Log"]);
    return { leadId: match.id, linked: true, minted: false };
  }
  const fields = mintLeadFields(bookingId, bookingFields, now, { source: `booking:${channel}`, fields: { Channel: channel } });
  const rec = await createTolerant(create, { token: c.token, baseId: c.baseId, table: c.priority, fields },
    ["Booking", "Converted Booking", "Stage", "Source", "Channel", "Activity Log", "Model Year"]);
  return { leadId: rec && rec.id, linked: true, minted: true };
}
```
Export it.

In `book-background.js`, add a deps seam `ensureClient = ensureClientRecordForBooking` to `processNotifications`' destructured deps, and in the `kind === "booking"` branch (after the existing email/notify work):

```js
    try {
      await ensureClient(job.recordId, {
        Name: d.name, Phone: d.phone || "", Email: d.email || "",
        City: market.city, Vehicle: d.vehicle || "", "Model Year": d.modelYear || "",
        Installer: inst.key,
      }, { env, fetchImpl, channel: "web" });
    } catch (e) { if (log.error) log.error("client-record", e.message); }
```
(`d`, `market`, `inst` are already unpacked from the job in that branch; `job.recordId` is the booking id book.js passes.)

- [ ] **Step 4: Run** `npm test` — 0 fail.

- [ ] **Step 5: Commit + push**

```bash
git add netlify/functions/lib/leads.js netlify/functions/book-background.js tests/
git commit -m "feat(crm): every web booking links or mints its client record — first-touch rule, fail-open"
git push
```

### Task B3: Walk-in bookings get the same treatment

**Files:**
- Modify: `netlify/functions/installer-walkin.js`
- Test: walk-in test file (append)

- [ ] **Step 1: Failing test:** deps-inject `ensureClient` into `processWalkin`; assert it's awaited after create with the new booking id + fields (`channel: "walk-in"`), and that an `ensureClient` throw still returns `status:"booked"`.

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement.** Add `ensureClient = ensureClientRecordForBooking` to `processWalkin`'s deps; after the successful `createTolerant` (before the return):

```js
  try {
    await ensureClient(id, { Name: name, Phone: phone, Email: email, City: bookCity,
      Vehicle: vehicle, ...(modelYear ? { "Model Year": modelYear } : {}), Installer: ownerKey },
      { env, fetchImpl, channel: "walk-in" });
  } catch (e) { if (log.error) log.error("walkin client-record", e.message); }
```
(Import `ensureClientRecordForBooking` from `./lib/leads.js`; confirm `processWalkin` exposes `env`/`fetchImpl`/`log` in deps — mirror the file's existing destructure.)

- [ ] **Step 4: Run** `npm test` — 0 fail.

- [ ] **Step 5: Commit + push**

```bash
git add netlify/functions/installer-walkin.js tests/
git commit -m "feat(crm): walk-in bookings link or mint the client record too"
git push
```

### Task B4: Duplicate detection — `duplicateLeadsFor` + `duplicates[]` in leads-list

**Files:**
- Modify: `netlify/functions/lib/leads.js`
- Modify: `netlify/functions/leads-list.js` (alongside the existing `matches`/`booking`/`client` enrichment)
- Test: `tests/leads.test.js` + `tests/leads-list-connections.test.js` (append)

- [ ] **Step 1: Failing tests:**

```js
// tests/leads.test.js
test("duplicateLeadsFor: same phone or email, self excluded, no-contact leads never match", () => {
  const { duplicateLeadsFor } = require("../netlify/functions/lib/leads.js");
  const L = (id, phone, email) => ({ id, phone: phone || "", email: email || "" });
  const all = [L("a", "+1 (612) 555-0100"), L("b", "6125550100"), L("c", "", "s@x.com"), L("d", "", "S@X.COM"), L("e")];
  assert.deepEqual(duplicateLeadsFor(all[0], all).map((l) => l.id), ["b"]);
  assert.deepEqual(duplicateLeadsFor(all[2], all).map((l) => l.id), ["d"]);
  assert.deepEqual(duplicateLeadsFor(all[4], all), []);
});
```
For `leads-list`: extend an existing response-shape test — a fixture with two same-phone leads asserts each carries `duplicates: [{ id, name, channel, stage, createdTime }]`, and that duplicates are only computed within the caller's scoped leads (an installer never sees another installer's row as a duplicate).

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement.** In `lib/leads.js`:

```js
// Two client records that look like the same person: same normalized phone or
// email. Merge is ALWAYS human-confirmed (owner decision 2026-07-31) — this
// only powers the suggestion strip. Self excluded; contact-less leads never match.
function duplicateLeadsFor(lead, leads) {
  const pKey = normalizePhone(lead.phone), eKey = normalizeEmail(lead.email);
  if (!pKey && !eKey) return [];
  return (leads || []).filter((l) => l.id !== lead.id &&
    ((pKey && normalizePhone(l.phone) === pKey) || (eKey && normalizeEmail(l.email) === eKey)));
}
```
Export it. In `leads-list.js`, after scoping, per lead:

```js
    duplicates: duplicateLeadsFor(l, scoped).map((x) => ({
      id: x.id, name: x.name, channel: x.channel, stage: x.stage, createdTime: x.createdTime })),
```
(match the actual local variable names in that file — the scoped array feeding the response).

- [ ] **Step 4: Run** `npm test` — 0 fail.

- [ ] **Step 5: Commit + push**

```bash
git add netlify/functions/lib/leads.js netlify/functions/leads-list.js tests/
git commit -m "feat(crm): duplicate-client detection surfaces in leads-list — suggestion only, never auto"
git push
```

### Task B5: Merge computation — `computeMerge` (pure, heaviest test coverage)

**Files:**
- Modify: `netlify/functions/lib/leads.js` (export `computeMerge`, `isPlaceholderName`; reuse the placeholder regex currently inline in `processLeadIngest`)
- Test: `tests/lead-merge.test.js` (create)

- [ ] **Step 1: Write the failing tests:**

```js
// tests/lead-merge.test.js — absorb+delete mechanics (spec decisions 1–2, 2026-07-31)
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { computeMerge, isPlaceholderName } = require("../netlify/functions/lib/leads.js");
const NOW = new Date("2026-08-01T15:00:00Z");
const R = (id, fields) => ({ id, fields });

test("survivor is the earlier Created Time, regardless of argument order", () => {
  const a = R("recOld", { "Created Time": "2026-07-01T00:00:00Z" });
  const b = R("recNew", { "Created Time": "2026-07-20T00:00:00Z" });
  assert.equal(computeMerge(a, b, NOW).survivorId, "recOld");
  assert.equal(computeMerge(b, a, NOW).survivorId, "recOld");
  assert.equal(computeMerge(b, a, NOW).duplicateId, "recNew");
});

test("blanks fill from the duplicate; placeholder names count as blank; real values never overwritten", () => {
  const a = R("recOld", { "Created Time": "2026-07-01T00:00:00Z", Name: "Text 619-417-6865", Phone: "6194176865", Vehicle: "" });
  const b = R("recNew", { "Created Time": "2026-07-20T00:00:00Z", Name: "Eli Soetenga", Email: "eli@x.com", Vehicle: "Tundra 5.7L", "Model Year": "2014" });
  const m = computeMerge(a, b, NOW);
  assert.equal(m.fields.Name, "Eli Soetenga");
  assert.equal(m.fields.Email, "eli@x.com");
  assert.equal(m.fields.Vehicle, "Tundra 5.7L");
  assert.equal(m.fields["Model Year"], "2014");
  assert.equal(m.fields.Phone, undefined, "survivor's real phone untouched");
  assert.ok(isPlaceholderName("Caller (612) 555-0100"));
  assert.ok(!isPlaceholderName("Eli Soetenga"));
});

test("stage keeps the most advanced; Not now never overrides an active stage", () => {
  const mk = (sStage, dStage) => computeMerge(
    R("a", { "Created Time": "2026-07-01T00:00:00Z", Stage: sStage }),
    R("b", { "Created Time": "2026-07-20T00:00:00Z", Stage: dStage }), NOW).fields.Stage;
  assert.equal(mk("New", "Booked"), "Booked");
  assert.equal(mk("Booked", "New"), undefined);
  assert.equal(mk("Contacted", "Not now"), undefined);
  assert.equal(mk("Not now", "Contacted"), "Contacted");
});

test("booking links union; legacy text id fills only when survivor's is blank", () => {
  const m = computeMerge(
    R("recA", { "Created Time": "2026-07-01T00:00:00Z", Booking: ["recB1"] }),
    R("recNew", { "Created Time": "2026-07-20T00:00:00Z", Booking: ["recB2"], "Converted Booking": "recB2" }), NOW);
  assert.deepEqual(m.fields.Booking, ["recB1", "recB2"]);
  assert.equal(m.fields["Converted Booking"], "recB2", "survivor had no legacy id — the duplicate's fills");
});

test("notes and activity append under a stamped merge divider naming the duplicate", () => {
  const m = computeMerge(
    R("recA", { "Created Time": "2026-07-01T00:00:00Z", "Client Notes": "old note", "Activity Log": "old log" }),
    R("recNew", { "Created Time": "2026-07-20T00:00:00Z", Channel: "sms", Name: "Text 619", "Client Notes": "dup note", "Activity Log": "dup log" }), NOW);
  assert.match(m.fields["Activity Log"], /^old log\n/);
  assert.match(m.fields["Activity Log"], /merged in recNew — sms "Text 619"/);
  assert.match(m.fields["Client Notes"], /^old note\n/);
  assert.match(m.fields["Client Notes"], /dup note$/);
});

test("follow-up urgency: earlier Next Follow-up and later Last Contact win", () => {
  const m = computeMerge(
    R("a", { "Created Time": "2026-07-01T00:00:00Z", "Next Follow-up": "2026-08-20", "Last Contact": "2026-07-01" }),
    R("b", { "Created Time": "2026-07-20T00:00:00Z", "Next Follow-up": "2026-08-05", "Last Contact": "2026-07-28" }), NOW);
  assert.equal(m.fields["Next Follow-up"], "2026-08-05");
  assert.equal(m.fields["Last Contact"], "2026-07-28");
});

test("idempotent: a survivor already stamped with this duplicate re-appends nothing", () => {
  const m = computeMerge(
    R("a", { "Created Time": "2026-07-01T00:00:00Z", "Activity Log": "x\n2026-08-01 15:00 — merged in recNew — sms \"Text 619\"" }),
    R("recNew", { "Created Time": "2026-07-20T00:00:00Z", "Activity Log": "dup log" }), NOW);
  assert.equal(m.already, true);
  assert.equal(m.fields["Activity Log"], undefined);
});
```

- [ ] **Step 2: Run to verify they fail** (`computeMerge` not exported).

- [ ] **Step 3: Implement in `lib/leads.js`:**

```js
// Placeholder identities minted by channel adapters and the contact resolver.
// Shared by ingest name-backfill and merge fill logic.
function isPlaceholderName(n) {
  return !String(n || "").trim() || /^(caller|text|unknown)\b/i.test(String(n).trim());
}

const MERGE_FILL_FIELDS = ["Phone", "Email", "Vehicle", "Model Year", "City", "Goals", "Modifications",
  "Preferred Contact", "Marketing Consent", "Consent Version"];
const STAGE_ADVANCE = ["New", "Contacted", "Qualified", "Following up", "Booked"]; // "Not now" deliberately absent

// Absorb-and-delete merge (owner decisions 2026-07-31): survivor = earlier
// Created Time; blanks fill from the duplicate (placeholder names count as
// blank); notes/activity append under a stamped divider; booking links union;
// stage keeps the most advanced active value. Pure — the endpoint writes
// `fields` to survivorId, verifies, then deletes duplicateId. `already` guards
// idempotent retries after a failed delete (absorb once, delete again).
function computeMerge(aRec, bRec, now = new Date()) {
  const created = (r) => String(((r || {}).fields || {})["Created Time"] || "");
  let s = aRec, d = bRec;
  if (created(bRec) && (!created(aRec) || created(bRec) < created(aRec))) { s = bRec; d = aRec; }
  const sf = s.fields || {}, df = d.fields || {};
  const already = String(sf["Activity Log"] || "").includes(`merged in ${d.id}`);
  const fields = {};
  if (isPlaceholderName(sf.Name) && !isPlaceholderName(df.Name)) fields.Name = df.Name;
  for (const k of MERGE_FILL_FIELDS) {
    if (!String(sf[k] == null ? "" : sf[k]).trim() && String(df[k] == null ? "" : df[k]).trim()) fields[k] = df[k];
  }
  const si = STAGE_ADVANCE.indexOf(sf.Stage), di = STAGE_ADVANCE.indexOf(df.Stage);
  if (di > si) fields.Stage = df.Stage;
  const sNF = String(sf["Next Follow-up"] || "").slice(0, 10), dNF = String(df["Next Follow-up"] || "").slice(0, 10);
  if (dNF && (!sNF || dNF < sNF)) {
    fields["Next Follow-up"] = dNF;
    if (df["Follow-up Message"]) fields["Follow-up Message"] = df["Follow-up Message"];
  }
  const sLC = String(sf["Last Contact"] || "").slice(0, 10), dLC = String(df["Last Contact"] || "").slice(0, 10);
  if (dLC && (!sLC || dLC > sLC)) fields["Last Contact"] = dLC;
  const sB = Array.isArray(sf.Booking) ? sf.Booking : [], dB = Array.isArray(df.Booking) ? df.Booking : [];
  const union = [...new Set([...sB, ...dB])];
  if (union.length !== sB.length) fields.Booking = union;
  if (!String(sf["Converted Booking"] || "").trim() && df["Converted Booking"]) fields["Converted Booking"] = df["Converted Booking"];
  if (!already) {
    const divider = logLine(now, `merged in ${d.id} — ${df.Channel || "?"} "${String(df.Name || "").trim() || "(blank)"}"`);
    if (String(df["Client Notes"] || "").trim()) {
      fields["Client Notes"] = appendActivity(sf["Client Notes"] || "", appendActivity(divider, df["Client Notes"]));
    }
    fields["Activity Log"] = appendActivity(sf["Activity Log"] || "",
      String(df["Activity Log"] || "").trim() ? appendActivity(divider, df["Activity Log"]) : divider);
  }
  return { survivorId: s.id, duplicateId: d.id, fields, already };
}
```
Export `computeMerge`, `isPlaceholderName`; replace the inline `isPlaceholder` in `processLeadIngest` with the shared `isPlaceholderName` (its regex grows `text|unknown` — matching the contact-resolver's placeholder convention; existing ingest tests must stay green).

- [ ] **Step 4: Run** `node --test tests/lead-merge.test.js` → PASS; `npm test` → 0 fail.

- [ ] **Step 5: Commit + push**

```bash
git add netlify/functions/lib/leads.js tests/lead-merge.test.js
git commit -m "feat(crm): computeMerge — absorb-and-delete client-record merge, pure and heavily tested"
git push
```

### Task B6: `merge` action in lead-update.js

**Files:**
- Modify: `netlify/functions/lead-update.js`
- Test: `tests/lead-merge-endpoint.test.js` (create — mirror `tests/lead-update-link.test.js`'s `ctxWith` pattern)

- [ ] **Step 1: Failing tests:**

```js
// tests/lead-merge-endpoint.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/lead-update.js");
const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b",
  INSTALLER_TOKENS: '{"noah":"ntok","aaron":"atok"}', INSTALLER_ADMINS: "aaron" };
const ev = (token, body) => ({ headers: { "x-installer-token": token }, body: JSON.stringify(body) });
const OLD = { id: "recOld", fields: { Name: "Eli Soetenga", Installer: "noah", Phone: "6194176865",
  "Created Time": "2026-07-01T00:00:00Z", "Activity Log": "old" } };
const NEW = { id: "recNew", fields: { Name: "Text 619-417-6865", Installer: "noah", Phone: "6194176865",
  Channel: "sms", "Created Time": "2026-07-20T00:00:00Z" } };
function ctxWith(over = {}) {
  const writes = [], deletes = [];
  return { writes, deletes, ctx: { env, now: new Date("2026-08-01T15:00:00Z"),
    getImpl: async (a) => (a.id === "recNew" ? NEW : OLD),
    updateImpl: async (a) => { writes.push(a); return { id: a.id, fields: a.fields }; },
    deleteImpl: async (a) => { deletes.push(a); return {}; }, ...over } };
}

test("merge: absorbs into the earlier record and deletes the duplicate", async () => {
  const { writes, deletes, ctx } = ctxWith();
  const res = await handler(ev("ntok", { id: "recNew", action: "merge", duplicateId: "recOld" }), ctx);
  assert.equal(res.statusCode, 200);
  const out = JSON.parse(res.body);
  assert.deepEqual(out, { status: "ok", merged: true, survivorId: "recOld", deleted: true });
  assert.equal(writes[0].id, "recOld", "absorb writes the SURVIVOR even when the caller passed the newer id");
  assert.match(writes[0].fields["Activity Log"], /merged in recNew/);
  assert.deepEqual(deletes.map((x) => x.id), ["recNew"]);
});

test("merge: duplicate-not-found and self-merge are 400s; other-installer duplicate rejected", async () => {
  const a = await handler(ev("ntok", { id: "recOld", action: "merge", duplicateId: "recOld" }), ctxWith().ctx);
  assert.equal(a.statusCode, 400);
  const { ctx } = ctxWith({ getImpl: async (x) => { if (x.id === "recGone") throw new Error("airtable get 404"); return OLD; } });
  const b = await handler(ev("ntok", { id: "recOld", action: "merge", duplicateId: "recGone" }), ctx);
  assert.equal(JSON.parse(b.body).error, "duplicate-not-found");
  const { ctx: c2 } = ctxWith({ getImpl: async (x) => (x.id === "recNew" ? { ...NEW, fields: { ...NEW.fields, Installer: "cody" } } : OLD) });
  const c = await handler(ev("ntok", { id: "recOld", action: "merge", duplicateId: "recNew" }), c2);
  assert.equal(JSON.parse(c.body).error, "not-your-market");
});

test("merge: a failed delete still reports the absorb — deleted:false, retry-safe", async () => {
  const { ctx } = ctxWith({ deleteImpl: async () => { throw new Error("airtable 503"); } });
  const res = await handler(ev("ntok", { id: "recNew", action: "merge", duplicateId: "recOld" }), ctx);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { status: "ok", merged: true, survivorId: "recOld", deleted: false });
});
```

- [ ] **Step 2: Run to verify they fail** (unknown action → `bad-action`).

- [ ] **Step 3: Implement in `lead-update.js`** (after the `unlink` block; import `computeMerge` from `./lib/leads.js`, and note `deleteRecord` is already imported):

```js
  // Merge two client records (owner decisions 2026-07-31): absorb-and-delete,
  // survivor = earlier Created Time. Human-confirmed only — the console's
  // duplicate strip is the sole caller. Absorb is written and verified BEFORE
  // the delete; a failed delete returns deleted:false and the retry (computeMerge
  // is idempotent via the audit stamp) re-attempts only the delete.
  if (action === "merge") {
    const deleteImpl = ctx.deleteImpl || ((a) => deleteRecord({ ...a }));
    const duplicateId = String(body.duplicateId || "").trim();
    if (!duplicateId || duplicateId === id) return { statusCode: 400, body: JSON.stringify({ error: "missing-duplicate-id" }) };
    let dupRec;
    try { dupRec = await getImpl({ token: c.token, baseId: c.baseId, table: c.priority, id: duplicateId }); }
    catch (e) {
      const notFound = /40[34]/.test(String(e && e.message));
      return { statusCode: notFound ? 400 : 502, body: JSON.stringify({ error: notFound ? "duplicate-not-found" : "store-unavailable" }) };
    }
    const dupLead = toLeadView(dupRec);
    if (!admin && (dupLead.installer || "") !== key) return { statusCode: 400, body: JSON.stringify({ error: "not-your-market" }) };
    const m = computeMerge(rec, dupRec, now);
    if (Object.keys(m.fields).length) {
      try {
        await updateTolerant(updateImpl, { token: c.token, baseId: c.baseId, table: c.priority, id: m.survivorId, fields: m.fields },
          ["Preferred Contact", "Marketing Consent", "Consent Version", "Model Year", "Client Notes", "Goals",
           "Modifications", "Next Follow-up", "Follow-up Message", "Last Contact", "Stage", "Booking",
           "Converted Booking", "Activity Log"]);
      } catch (e) { return { statusCode: 502, body: JSON.stringify({ error: "store-unavailable" }) }; }
    }
    let deleted = true;
    try { await deleteImpl({ token: c.token, baseId: c.baseId, table: c.priority, id: m.duplicateId }); }
    catch (e) { deleted = false; }
    return { statusCode: 200, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ok", merged: true, survivorId: m.survivorId, deleted }) };
  }
```

- [ ] **Step 4: Run** `node --test tests/lead-merge-endpoint.test.js` → PASS; `npm test` → 0 fail.

- [ ] **Step 5: Commit + push**

```bash
git add netlify/functions/lead-update.js tests/lead-merge-endpoint.test.js
git commit -m "feat(crm): merge action — one-tap absorb-and-delete with retry-safe delete"
git push
```

### Task B7: Schema — create the three Priority List fields

**Files:** none (live Airtable meta-API operation via existing script)

- [ ] **Step 1:** Read `scripts/airtable/ensure-field.mjs` usage (it gained an options-JSON argument in the lead-connections work) — confirm the exact CLI shape before running.
- [ ] **Step 2:** Create the fields (adjust argv shape to what Step 1 shows):

```bash
node scripts/airtable/ensure-field.mjs "Priority List" "Preferred Contact" singleSelect '{"choices":[{"name":"SMS"},{"name":"Email"},{"name":"Messenger"},{"name":"Instagram"},{"name":"Call"}]}'
node scripts/airtable/ensure-field.mjs "Priority List" "Marketing Consent" date
node scripts/airtable/ensure-field.mjs "Priority List" "Consent Version" singleLineText
```
- [ ] **Step 3:** Verify all three exist (script output or Airtable UI). These land before B8/C ship so the non-tolerated writes hit real columns.

### Task B8: Console — the "Possible duplicate" strip

**Files:**
- Modify: `site/installer.html` (**`git pull --ff-only` first** — parallel sessions; Leads-tab card renderer: grep `Looks booked already` for the sibling suggestion strip shipped 2026-07-30 and render this strip alongside it)
- Test: `tests/installer-merge-strip.test.js` (create)

- [ ] **Step 1: Failing static test:**

```js
// tests/installer-merge-strip.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const html = fs.readFileSync("site/installer.html", "utf8");

test("duplicate strip renders from lead.duplicates with Merge / Review / Notes actions", () => {
  assert.match(html, /Possible duplicate/);
  assert.match(html, /action:\s*["']merge["']/);
  assert.match(html, /duplicateId/);
  assert.match(html, /mergeReview|dup-review/i, "Review affordance present");
  assert.match(html, /dup-notes|mergeNotes/i, "Notes jump affordance present");
});

test("merge success jump-and-flashes the surviving card (console rule: no silent outcomes)", () => {
  // the merge handler must call the console's existing flash/jump helper with survivorId
  assert.match(html, /survivorId/);
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement.** On lead cards where `lead.duplicates && lead.duplicates.length`, render (adapting to the card renderer's local idioms — `esc()`, template strings, the suggestion-strip CSS classes):

```js
'<div class="dupstrip">⚠ Possible duplicate: <b>'+esc(dup.name||"(no name)")+'</b> — '+esc(dup.channel)+' · '+esc(dup.stage)+
' <button class="btn sm" data-merge="'+esc(l.id)+'" data-dup="'+esc(dup.id)+'">Merge</button>'+
' <button class="btn sm ghost dup-review" data-a="'+esc(l.id)+'" data-b="'+esc(dup.id)+'">Review</button>'+
' <button class="btn sm ghost dup-notes" data-lead="'+esc(l.id)+'">📝 Notes</button></div>'
```
Handlers: **Merge** → confirm dialog naming both records → `POST lead-update {id, action:"merge", duplicateId}` → on `{survivorId, deleted}` remove both cards from STATE, reload/patch the survivor, jump-and-flash it (reuse the existing jump/flash helper the link action uses); if `deleted:false`, show "Merged — cleanup retry needed" and leave the strip on the survivor (a retry re-sends merge). **Review** → expand both cards' existing edit panels stacked (scroll the second into view). **Notes** → open that card's existing `📝 Add note` details element (client-notes feature) and focus its input.

- [ ] **Step 4: Run** `node --test tests/installer-merge-strip.test.js` → PASS; `npm test` → 0 fail.

- [ ] **Step 5: Commit + push**

```bash
git add site/installer.html tests/installer-merge-strip.test.js
git commit -m "feat(console): possible-duplicate strip — one-tap merge with review + notes access"
git push
```

**Sub-project B live smoke:** create an SMS-style lead sharing a phone with an existing web lead → both cards show the strip → Merge → survivor card flashes with combined notes/links; duplicate row gone from Airtable; booking's `Leads` mirror intact.

---

# Sub-project C — One-flow close-out

### Task C1: Schema — `Closeout Draft` on Bookings

- [ ] **Step 1:** `node scripts/airtable/ensure-field.mjs "Bookings" "Closeout Draft" checkbox` (argv shape per B7 Step 1; checkbox fields need their options JSON if the script requires `{"icon":"check","color":"greenBright"}` — follow the script's usage).
- [ ] **Step 2:** Verify the column exists.

### Task C2: `lib/consent.js` — versioned A2P disclosure copy

**Files:**
- Create: `netlify/functions/lib/consent.js`
- Test: `tests/consent.test.js` (create)

- [ ] **Step 1: Failing test:**

```js
// tests/consent.test.js — the disclosure shown at signing IS the consent evidence;
// version and copy must stay in lockstep, and the console must show it verbatim.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { CONSENT_VERSION, CONSENT_TEXT } = require("../netlify/functions/lib/consent.js");

test("consent copy carries every required A2P/TCPA element", () => {
  assert.match(CONSENT_VERSION, /^a2p-\d{4}-\d{2}$/);
  for (const req of ["Tuned Yota", "STOP", "HELP", "data rates", "not a condition", "frequency varies", "tunedyota.com"]) {
    assert.ok(CONSENT_TEXT.includes(req), `missing: ${req}`);
  }
});

```
(The console-embed drift guard — asserting `site/installer.html` contains `CONSENT_TEXT` verbatim — belongs to Task C6's test file, since the embed ships there.)

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement `netlify/functions/lib/consent.js`:**

```js
// netlify/functions/lib/consent.js
// A2P marketing-consent disclosure shown in the close-out signature overlay.
// The stored `Consent Version` on the client record points at this exact copy —
// NEVER edit CONSENT_TEXT without bumping CONSENT_VERSION (tests enforce the
// console shows it verbatim). Decline never blocks completion or the cert.
const CONSENT_VERSION = "a2p-2026-08";
const CONSENT_TEXT = "I agree to receive service updates and occasional parts & maintenance offers for my vehicle from Tuned Yota by text message and email. Message frequency varies. Message & data rates may apply. Reply STOP to opt out, HELP for help. Consent is not a condition of purchase or service. Terms & privacy: tunedyota.com";
module.exports = { CONSENT_VERSION, CONSENT_TEXT };
```

- [ ] **Step 4: Run** — PASS; `npm test` 0 fail.

- [ ] **Step 5: Commit + push**

```bash
git add netlify/functions/lib/consent.js tests/consent.test.js
git commit -m "feat(consent): versioned A2P disclosure copy — single source for console + evidence chain"
git push
```

### Task C3: Close-out server — report-field gate + Model Year backfill

**Files:**
- Modify: `netlify/functions/installer-closeout.js`
- Test: `tests/installer-closeout-gate.test.js` (create — reuse the deps pattern from the existing closeout tests, `ls tests | grep closeout`)

- [ ] **Step 1: Failing tests** (gate matrix):

```js
// tests/installer-closeout-gate.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processCloseout } = require("../netlify/functions/installer-closeout.js");
const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", RESEND_API_KEY: "k" };
const FULL = { calibration: "Medium", vin: "1GCHK23274F212345", tuningPlatform: "VFT",
  calibrationType: "Basic", ecuId: "AUTO", gearSize: "3.90", mileage: "88000", modelYear: "2019" };
const booking = (fields) => ({ id: "recB1", fields: { Name: "Sam", Installer: ["cody"], City: "Madison",
  "Event Date": "2026-08-01", Vehicle: "Tacoma 3.5L", ...fields } });
const deps = (over = {}) => ({ env, key: "cody", admin: false, now: new Date("2026-08-01T20:00:00Z"),
  get: async () => booking(over.bookingFields || {}),
  update: async () => ({}), create: async () => ({ id: "x" }), send: async () => ({}),
  list: async () => [], ...over });

test("non-admin completion missing report fields → report-fields-missing with the list", async () => {
  const { mileage, ...rest } = FULL;
  const out = await processCloseout({ recordId: "recB1", action: "complete", ...rest }, deps());
  assert.equal(out.status, "error");
  assert.equal(out.error, "report-fields-missing");
  assert.deepEqual(out.missing, ["Mileage"]);
});

test("fields already on the booking satisfy the gate", async () => {
  const { vin, ...rest } = FULL;
  const out = await processCloseout({ recordId: "recB1", action: "complete", ...rest },
    deps({ bookingFields: { VIN: "1GCHK23274F212345" } }));
  assert.equal(out.status, "completed");
});

test("admin bypasses the gate (never-block-the-owner)", async () => {
  const out = await processCloseout({ recordId: "recB1", action: "complete", calibration: "Medium" },
    deps({ key: "aaron", admin: true }));
  assert.equal(out.status, "completed");
});

test("modelYear backfills a blank booking Model Year, never overwrites", async () => {
  const writes = [];
  const d = deps({ update: async (a) => { writes.push(a); return {}; } });
  await processCloseout({ recordId: "recB1", action: "complete", ...FULL }, d);
  assert.equal(writes[0].fields["Model Year"], "2019");
  writes.length = 0;
  const d2 = deps({ bookingFields: { "Model Year": "2018" }, update: async (a) => { writes.push(a); return {}; } });
  await processCloseout({ recordId: "recB1", action: "complete", ...FULL }, d2);
  assert.equal(writes[0].fields["Model Year"], undefined);
});
```

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement.** In `processCloseout`, after the existing normalizations (`mileage` line) add:

```js
  const modelYear = /^(19|20)\d{2}$/.test(String(d.modelYear || "").trim()) ? String(d.modelYear).trim() : "";
  // Report-field gate (owner decision 2026-07-31): an installer completes only a
  // report-ready record; the ADMIN may skip anything (never-block-the-owner).
  // "Present" = supplied now or already on the booking. The console pre-fills
  // most of these, so the gate normally costs zero taps.
  if (d.action !== "draft" && !admin) {
    const finals = { VIN: vin, "Tuning Platform": tuningPlatform, "Calibration Type": calibrationType,
      "ECU ID": ecuId, "Gear Size": gearSize, Mileage: mileage, "Model Year": modelYear };
    const missing = Object.keys(finals).filter((k) => !String(finals[k] || "").trim() && !String(f[k] == null ? "" : f[k]).trim());
    if (missing.length) return { status: "error", error: "report-fields-missing", missing };
  }
```
(Place it after the `bad-calibration` check so calibration errors keep their name.) In `completeFields`, add:

```js
  if (modelYear && !String(f["Model Year"] || "").trim()) completeFields["Model Year"] = modelYear;
```
and `"Model Year"` to the complete `updateTolerant` tolerated list. In the handler's status-code mapping nothing changes (`report-fields-missing` → 400 via the default).

- [ ] **Step 4: Run** — PASS; `npm test` 0 fail. (If existing closeout tests completed as non-admin without report fields, they now hit the gate — update those fixtures to pass `admin: true` or full fields, whichever preserves each test's intent.)

- [ ] **Step 5: Commit + push**

```bash
git add netlify/functions/installer-closeout.js tests/
git commit -m "feat(closeout): report-field gate — installers complete report-ready, admin retains skip"
git push
```

### Task C4: Close-out server — `draft` action

**Files:**
- Modify: `netlify/functions/installer-closeout.js`
- Test: `tests/installer-closeout-draft.test.js` (create)

- [ ] **Step 1: Failing tests:**

```js
// tests/installer-closeout-draft.test.js — a draft never loses data, never
// blocks, never completes, never sends a cert.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processCloseout } = require("../netlify/functions/installer-closeout.js");
// reuse env/booking/deps helpers from the gate test (copy them in — tests are standalone files)

test("draft saves whatever was entered + Closeout Draft flag; Status untouched; no cert", async () => {
  const writes = []; let sent = 0;
  const d = deps({ update: async (a) => { writes.push(a); return {}; }, send: async () => { sent++; } });
  const out = await processCloseout({ recordId: "recB1", action: "draft", vin: "1GCHK23274F212345", mileage: "88000" }, d);
  assert.equal(out.status, "draft");
  assert.equal(writes[0].fields["Closeout Draft"], true);
  assert.equal(writes[0].fields.VIN, "1GCHK23274F212345");
  assert.equal(writes[0].fields.Mileage, 88000);
  assert.equal(writes[0].fields.Status, undefined);
  assert.equal(sent, 0);
});

test("draft with no fields still flags; completed/cancelled bookings refuse drafts", async () => {
  const out = await processCloseout({ recordId: "recB1", action: "draft" }, deps());
  assert.equal(out.status, "draft");
  const done = await processCloseout({ recordId: "recB1", action: "draft" }, deps({ bookingFields: { Status: "Completed" } }));
  assert.equal(done.error, "not-open");
});

test("complete clears the draft flag", async () => {
  const writes = [];
  await processCloseout({ recordId: "recB1", action: "complete", ...FULL },
    deps({ bookingFields: { "Closeout Draft": true }, update: async (a) => { writes.push(a); return {}; } }));
  assert.equal(writes[0].fields["Closeout Draft"], false);
});
```

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement.** The normalization consts (`vin`…`modelYear`, `customerEmail`) must be hoisted ABOVE the action branches so `draft` shares them (move them up; `calibration` validation stays complete-only). Then, before the complete path:

```js
  // Draft (owner decision 2026-07-31): an unfinished close-out saves everything
  // entered and lands in the console's Drafts bucket. Real fields write
  // immediately (they ARE the data); only Status/cert wait for complete.
  if (d.action === "draft") {
    if (f.Status === "Completed" || f.Status === "Cancelled") return { status: "error", error: "not-open" };
    const fields = { "Closeout Draft": true };
    if (vin) fields.VIN = vin;
    if (tuningPlatform) fields["Tuning Platform"] = tuningPlatform;
    if (calibrationType) fields["Calibration Type"] = calibrationType;
    if (ecuId) fields["ECU ID"] = ecuId;
    if (gearSize) fields["Gear Size"] = gearSize;
    if (mileage) fields.Mileage = Number(mileage);
    if (modelYear && !String(f["Model Year"] || "").trim()) fields["Model Year"] = modelYear;
    if (customerEmail) fields.Email = customerEmail;
    if (CAL_OPTIONS.includes(String(d.calibration || "").trim())) fields["OTT Calibration"] = String(d.calibration).trim();
    try {
      await updateTolerant(update, { token: c.token, baseId: c.baseId, table: c.bookings, id: d.recordId, fields },
        ["Closeout Draft", "VIN", "Tuning Platform", "Calibration Type", "ECU ID", "Gear Size", "Mileage", "Model Year", "Email", "OTT Calibration"]);
    } catch (e) { if (log.error) log.error("closeout draft", e.message); return { status: "error", error: "store-unavailable" }; }
    return { status: "draft" };
  }
```
On the complete path add `completeFields["Closeout Draft"] = false;` and `"Closeout Draft"` to its tolerated list.

- [ ] **Step 4: Run** — PASS; `npm test` 0 fail.

- [ ] **Step 5: Commit + push**

```bash
git add netlify/functions/installer-closeout.js tests/installer-closeout-draft.test.js
git commit -m "feat(closeout): draft action — unfinished close-outs never lose data"
git push
```

### Task C5: Close-out server — consent + client-record propagation

**Files:**
- Modify: `netlify/functions/installer-closeout.js`
- Modify: `netlify/functions/lib/leads.js` (`toLeadView` gains `preferredContact`, `marketingConsent`)
- Test: `tests/installer-closeout-propagation.test.js` (create)

- [ ] **Step 1: Failing tests:**

```js
// tests/installer-closeout-propagation.test.js
// The close-out is the moment the client record becomes retail-funnel-complete:
// email/preferred-contact/year flow to the lead; consent ONLY with a signature.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processCloseout } = require("../netlify/functions/installer-closeout.js");
// copy env/FULL/booking/deps helpers; deps gains list (leads) + leadUpdate capture via update on c.priority
const SIG = "data:image/png;base64,iVBORw0KGgo=";

function propDeps(leadRows, over = {}) {
  const leadPatches = [];
  return { leadPatches, deps: deps({
    list: async () => leadRows,
    update: async (a) => { if (a.table === "Priority List") leadPatches.push(a); return {}; },
    ...over }) };
}
// cfg(env) with the stub env resolves c.priority to its default "Priority List" —
// confirm against lib/airtable.js cfg defaults and adjust the string if they differ.

test("complete propagates email + preferred contact + year to the linked client record", async () => {
  const lead = { id: "recL1", fields: { Name: "Sam", Phone: "6125550100", Installer: "cody", Booking: ["recB1"] } };
  const { leadPatches, deps: d } = propDeps([lead]);
  await processCloseout({ recordId: "recB1", action: "complete", ...FULL,
    customerEmail: "sam@x.com", preferredContact: "SMS" }, d);
  const patch = leadPatches.find((p) => p.id === "recL1");
  assert.equal(patch.fields.Email, "sam@x.com");
  assert.equal(patch.fields["Preferred Contact"], "SMS");
  assert.equal(patch.fields["Model Year"], "2019");
});

test("consent recorded only with signature + toggle; evidence names the booking + version", async () => {
  const lead = { id: "recL1", fields: { Phone: "6125550100", Installer: "cody", Booking: ["recB1"] } };
  const on = propDeps([lead]);
  await processCloseout({ recordId: "recB1", action: "complete", ...FULL,
    marketingConsent: true, signature: SIG }, on.deps);
  const p1 = on.leadPatches.find((p) => p.id === "recL1");
  assert.equal(p1.fields["Marketing Consent"], "2026-08-01");
  assert.match(p1.fields["Consent Version"], /^a2p-/);
  assert.match(p1.fields["Activity Log"], /consent .* booking recB1/);
  const off = propDeps([lead]);
  await processCloseout({ recordId: "recB1", action: "complete", ...FULL, marketingConsent: true }, off.deps);
  const p2 = off.leadPatches.find((p) => p.id === "recL1");
  assert.equal((p2 && p2.fields["Marketing Consent"]) || undefined, undefined, "no signature → no consent");
});

test("no client record → propagation mints one; propagation failure never blocks completion", async () => {
  const creates = [];
  const { deps: d } = propDeps([], { create: async (a) => { creates.push(a); return { id: "recMint" }; } });
  const out = await processCloseout({ recordId: "recB1", action: "complete", ...FULL, customerEmail: "sam@x.com" }, d);
  assert.equal(out.status, "completed");
  assert.ok(creates.some((a) => a.fields && a.fields.Booking));
  const boom = deps({ list: async () => { throw new Error("airtable down"); } });
  const out2 = await processCloseout({ recordId: "recB1", action: "complete", ...FULL }, boom);
  assert.equal(out2.status, "completed", "propagation is fail-open");
});
```

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement.**

`toLeadView` additions in `lib/leads.js`:

```js
    preferredContact: f["Preferred Contact"] || "",
    marketingConsent: (f["Marketing Consent"] || "").slice(0, 10),
```

In `installer-closeout.js` — imports gain `list` dep (`listAllRecords`), `ensureClientRecordForBooking`, `toLeadView`, `logLine`, `appendActivity` from `./lib/leads.js`, and `{ CONSENT_VERSION }` from `./lib/consent.js`. Add deps entry `list = (a) => listAllRecords({ fetchImpl, ...a })`. New helper in the file:

```js
const PREFERRED = ["SMS", "Email", "Messenger", "Instagram", "Call"];

// Best-effort, fail-open, AWAITED (Lambda freeze): push contact prefs, year,
// and consent evidence to the client record. Consent requires BOTH the toggle
// and a captured signature — the signed booking is the evidence artifact.
async function propagateToClient({ c, list, update, create, env, fetchImpl, log, now, recordId, f, d,
                                   customerEmail, modelYear, signatureCaptured }) {
  const pref = PREFERRED.includes(String(d.preferredContact || "").trim()) ? String(d.preferredContact).trim() : "";
  const consent = d.marketingConsent === true && signatureCaptured;
  if (!customerEmail && !pref && !modelYear && !consent) return;
  const r = await ensureClientRecordForBooking(recordId,
    { Name: f.Name, Phone: f.Phone || "", Email: f.Email || "", City: f.City || "",
      Vehicle: f.Vehicle || "", "Model Year": f["Model Year"] || modelYear || "", Installer: f.Installer },
    { env, fetchImpl, now, channel: "walk-in", list, create, update });
  if (!r || !r.leadId) return;
  const cur = r.minted ? null : toLeadView((await list({ token: c.token, baseId: c.baseId, table: c.priority }))
    .find((x) => x.id === r.leadId) || null);
  const patch = {};
  if (customerEmail && (!cur || !cur.email)) patch.Email = customerEmail;
  if (pref) patch["Preferred Contact"] = pref;
  if (modelYear && (!cur || !cur.modelYear)) patch["Model Year"] = modelYear;
  if (consent && (!cur || !cur.marketingConsent)) {
    patch["Marketing Consent"] = now.toISOString().slice(0, 10);
    patch["Consent Version"] = CONSENT_VERSION;
    patch["Activity Log"] = appendActivity((cur && cur.activity) || "",
      logLine(now, `a2p marketing consent (${CONSENT_VERSION}) — signature on booking ${recordId}`));
  }
  if (!Object.keys(patch).length) return;
  await updateTolerant(update, { token: c.token, baseId: c.baseId, table: c.priority, id: r.leadId, fields: patch },
    ["Email", "Preferred Contact", "Model Year", "Marketing Consent", "Consent Version", "Activity Log"]);
}
```
(Optional efficiency follow-up, not required for this task: `ensureClientRecordForBooking` already listed the leads, so returning the matched lead view from it would save `propagateToClient`'s second list. Take it only if done cleanly with B2's tests updated in the same commit.) Call `propagateToClient` on the **complete** path (after the completion write, before the cert try/catch) and on the **draft** path (after the draft write), both as:

```js
  const signatureCaptured = !!completeFields["Customer Signature"]; // complete path; draft: false
  try {
    await propagateToClient({ c, list, update, create, env, fetchImpl, log, now,
      recordId: d.recordId, f, d, customerEmail, modelYear, signatureCaptured });
  } catch (e) { if (log.error) log.error("closeout propagate", e.message); }
```
Move Task C2's console-embed drift test here if not yet passing (C6 embeds the copy).

- [ ] **Step 4: Run** — PASS; `npm test` 0 fail.

- [ ] **Step 5: Commit + push**

```bash
git add netlify/functions/installer-closeout.js netlify/functions/lib/leads.js tests/
git commit -m "feat(closeout): client-record propagation + A2P consent evidence — signature-gated, fail-open"
git push
```

### Task C6: Console — one-flow close-out UI (cert panel, consent, prefills, gate, VIN-year backfill)

**Files:**
- Modify: `site/installer.html` (**pull first**; anchors: the close-out form region — grep `closeout(` and the signature overlay `#sigdone` at ~line 564; VIN decode handling ~lines 2283–2390)
- Test: `tests/installer-closeout-flow.test.js` (create)

- [ ] **Step 1: Failing static test:**

```js
// tests/installer-closeout-flow.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { CONSENT_TEXT } = require("../netlify/functions/lib/consent.js");
const html = fs.readFileSync("site/installer.html", "utf8");

test("cert panel: email ask headline + preferred contact select posted to closeout", () => {
  assert.match(html, /Where should we send your Certificate of Calibration\?/);
  assert.match(html, /preferredContact/);
  for (const opt of ["SMS", "Messenger", "Instagram"]) assert.ok(html.includes(">" + opt + "<"), opt);
});

test("consent block: verbatim versioned copy + affirmative toggle riding the signature", () => {
  assert.ok(html.includes(CONSENT_TEXT), "console must embed lib/consent.js CONSENT_TEXT verbatim");
  assert.match(html, /a2pconsent/);
  assert.match(html, /marketingConsent/);
});

test("prefills: platform from the roster's pcm protocol; VIN decode backfills a blank year", () => {
  assert.match(html, /pcm\s*&&\s*.*(vft|VFT)/, "Tuning Platform defaults from b.pcm");
  assert.match(html, /decoded\.modelYear/, "vin-decode year feeds the year field when blank");
});

test("gate + drafts: missing-field highlight and a Drafts chip", () => {
  assert.match(html, /report-fields-missing/);
  assert.match(html, /action:\s*["']draft["']|"draft"/);
  assert.match(html, /Drafts/);
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement** (each piece anchored to the existing close-out form; keep the console's inline-JS idioms):

1. **Order the form** as the spec's flow: VIN scan → calibration → platform/type/ECU/gear → mileage → cert panel → notes; signature stays the final overlay.
2. **Prefills** when opening the form for booking `b`: if the platform input is empty, default `b.pcm && b.pcm.vft ? "VFT" : (b.pcm ? "PCM" : "")` (editable — HPT/BB stay one tap away); default Calibration Type from the calibration choice (`Supercharger` calibrations → "Supercharger", else "Basic") with the existing ECU/gear auto-fill untouched; year input pre-set from `b.modelYear`.
3. **VIN-decode year backfill:** where the `/vin-decode` response is handled, add:
   ```js
   if (out.decoded && out.decoded.modelYear && !yearInput.value) yearInput.value = out.decoded.modelYear;
   ```
4. **Cert panel** markup:
   ```html
   <div class="certpanel"><b>Where should we send your Certificate of Calibration?</b>
     <input type="email" id="cocEmail_ID" placeholder="Customer email" value="…prefill b.email…">
     <select id="cocPref_ID"><option value="">Preferred contact…</option>
       <option>SMS</option><option>Email</option><option>Messenger</option><option>Instagram</option><option>Call</option></select>
   </div>
   ```
   posted as `customerEmail` / `preferredContact` in the closeout body.
5. **Consent in the signature overlay** (above the pad, before `#sigdone`):
   ```html
   <label class="a2pconsent"><input type="checkbox" id="a2pconsent"> <span><!-- CONSENT_TEXT verbatim --></span></label>
   ```
   and in the `#sigdone` handler: `extra.marketingConsent = !!ov.querySelector('#a2pconsent').checked;`
6. **Gate UX:** non-admin hides/disables bare Complete until required inputs are filled; on a 400 `report-fields-missing` response, highlight each named field and scroll to the first. Admin (`STATE.isAdmin` — reuse however the console flags admin) sees a "Complete anyway" affordance.
7. **Drafts:** a "Save draft" button posts the current inputs with `action:"draft"`; a **Drafts chip** on the Jobs tab (pattern-match the Stale/Waitlist chips) filters bookings with `closeoutDraft` — add `closeoutDraft: !!f["Closeout Draft"]` to `installer-roster.js`'s booking payload (one-line server change, include in this task's commit); reopening a draft prefills every input from the roster's stored values (vin/platform/type/ecu/gear/mileage/email already ride the payload).
8. If the app shell mirrors the console, run `node app/scripts/sync-web.mjs` per its README (never hand-edit `app/www`).

- [ ] **Step 4: Run** `node --test tests/installer-closeout-flow.test.js` → PASS; `npm test` → 0 fail.

- [ ] **Step 5: Commit + push**

```bash
git add site/installer.html netlify/functions/installer-roster.js tests/installer-closeout-flow.test.js
git commit -m "feat(console): one-flow close-out — cert ask, consent at signature, prefills, gate, drafts"
git push
```

**Sub-project C live smoke:** on a test booking — VIN scan (watch year backfill), confirm prefilled platform/type, enter mileage, cert email + preferred contact, consent toggle on, sign, Complete; verify: cert email received, booking report-complete in Airtable, client record carries Email/Preferred Contact/Marketing Consent/Consent Version + activity line naming the booking. Then a second booking: half-fill, Save draft, find it under the Drafts chip, resume, complete. Finally an OTT report dry run (`ott-report-review`) for the month shows the row fully populated.

---

## Post-ship

- [ ] Update memory (`lead-connections-feature.md` or a new `crm-capture-first-touch.md`): what shipped, the consent version, and the funnel gate now satisfied (opt-in capture live; campaign-scope reconciliation still open).
- [ ] Tell Aaron the tune-finder now requires year on every path (watch conversion for a week — if the extra tap measurably hurts, the generic-fallback list is the first suspect).
