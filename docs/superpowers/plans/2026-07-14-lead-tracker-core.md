# Lead Tracker (Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-channel lead pipeline into the installer console (the app): one normalized `lead-ingest` write path with cross-channel dedupe, a scoped `Jobs · Leads` view with stage/contact/follow-up/convert actions, and a morning web-push sweep of due follow-ups.

**Architecture:** Pure logic in `netlify/functions/lib/leads.js` (unit-tested in Node, no I/O), thin Netlify function wrappers (`lead-ingest`, `leads-list`, `lead-update`, scheduled `lead-followups`), and a Leads view added to `site/installer.html`. Data lives on the existing `Priority List` Airtable table plus six new columns. Auth reuses the installer-token model; adapters (later sub-projects) authenticate to `lead-ingest` with `INTERNAL_TASK_SECRET`.

**Tech Stack:** Node (`node --test`), Netlify Functions, Airtable REST (`lib/airtable.js`), FCM push (`lib/push.js`), vanilla JS console, Playwright for the browser test.

**Spec:** `docs/superpowers/specs/2026-07-14-lead-tracker-core-design.md`

---

## File structure

**Create:**
- `netlify/functions/lib/leads.js` — pure logic (normalize, ingest, scope, view, update-patch, due).
- `netlify/functions/lead-ingest.js` — POST, the single write path (installer token OR task secret).
- `netlify/functions/leads-list.js` — GET, scoped read.
- `netlify/functions/lead-update.js` — POST, mutate one lead (stage/contact/follow-up/reassign/convert).
- `netlify/functions/lead-followups.js` — scheduled morning sweep → web push.
- `tests/leads.test.js` — unit tests for `lib/leads.js`.
- `tests/lead-endpoints.test.js` — endpoint auth/ownership/convert tests.
- `tests/leads-browser.test.mjs` — Playwright UI regression (skips without a browser).

**Modify:**
- `site/installer.html` — `Jobs · Leads` toggle, Leads view, `+ Log a lead` form, wiring.
- `netlify.toml` — schedule `lead-followups`.

**Owner/Airtable (Task 1):** six new `Priority List` columns.

---

## Task 1: Add the six Priority List columns

**Files:** none (Airtable schema).

- [ ] **Step 1: Add columns to the `Priority List` table** — either the owner adds them, or (preferred) create them via an ephemeral schema-scoped PAT (see `[[airtable-metadata-api]]`: owner copies a `schema.bases:write` token to clipboard → create fields → write-test → clear clipboard).

Add exactly:
| Column | Type | Options |
|---|---|---|
| `Stage` | Single select | `New`, `Contacted`, `Following up`, `Booked`, `Not now` |
| `Channel` | Single select | `email`, `facebook`, `instagram`, `sms`, `phone`, `walk-in`, `other` |
| `Next Follow-up` | Date | (ISO date, no time) |
| `Last Contact` | Date | (ISO date, no time) |
| `Activity Log` | Long text | — |
| `Converted Booking` | Single line text | — |

- [ ] **Step 2: Verify** — list the table fields and confirm all six exist:

Run:
```bash
BASE=$(netlify env:get AIRTABLE_BASE_ID); TOK=$(netlify env:get AIRTABLE_TOKEN)
curl -s -H "Authorization: Bearer $TOK" "https://api.airtable.com/v0/$BASE/Priority%20List?pageSize=1" \
| node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(Object.keys((j.records[0]||{}).fields||{}))})"
```
Expected: the response (or a manual Airtable check) shows the new columns are accepted on write. The code is written to **tolerate** missing columns (`createTolerant`/`updateTolerant`), so implementation is not blocked if this slips — but the feature is inert until they exist.

- [ ] **Step 3: Commit** — nothing to commit (schema only). Proceed.

---

## Task 2: `lib/leads.js` — channel + contact normalization

**Files:**
- Create: `netlify/functions/lib/leads.js`
- Test: `tests/leads.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/leads.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const L = require("../netlify/functions/lib/leads.js");

test("normalizeChannel maps sources to one of the seven channels", () => {
  assert.equal(L.normalizeChannel("intake:facebook"), "facebook");
  assert.equal(L.normalizeChannel("installer:walk-in"), "walk-in");
  assert.equal(L.normalizeChannel("intake:instagram"), "instagram");
  assert.equal(L.normalizeChannel("intake:email"), "email");
  assert.equal(L.normalizeChannel("lead:sms"), "sms");
  assert.equal(L.normalizeChannel("some text message"), "sms");
  assert.equal(L.normalizeChannel("missed call"), "phone");
  assert.equal(L.normalizeChannel(""), "other");
  assert.equal(L.normalizeChannel(undefined), "other");
});

test("validChannel gates the allowed set", () => {
  assert.equal(L.validChannel("phone"), true);
  assert.equal(L.validChannel("carrier-pigeon"), false);
});

test("normalizePhone reduces to a last-10 key; normalizeEmail lowercases", () => {
  assert.equal(L.normalizePhone("1 (701) 426-9395"), "7014269395");
  assert.equal(L.normalizePhone("701.426.9395"), "7014269395");
  assert.equal(L.normalizePhone(""), "");
  assert.equal(L.normalizeEmail("  Kevin@Leier.com "), "kevin@leier.com");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/leads.test.js`
Expected: FAIL — cannot find module `lib/leads.js`.

- [ ] **Step 3: Implement**

```js
// netlify/functions/lib/leads.js
// Pure logic for the multi-channel lead tracker. No I/O — dependencies are injected
// so this unit-tests in Node and runs in Netlify functions unchanged.
const CHANNELS = ["email", "facebook", "instagram", "sms", "phone", "walk-in", "other"];
const STAGES = ["New", "Contacted", "Following up", "Booked", "Not now"];
const ACTIVE_STAGES = ["New", "Contacted", "Following up"];

function validChannel(c) { return CHANNELS.includes(String(c || "")); }
function validStage(s) { return STAGES.includes(String(s || "")); }

// Map a free-form Source/channel string to exactly one channel value.
function normalizeChannel(source) {
  const s = String(source == null ? "" : source).toLowerCase();
  for (const ch of ["email", "facebook", "instagram", "sms", "phone", "walk-in"]) {
    if (s.includes(ch)) return ch;
  }
  if (s.includes("text")) return "sms";
  if (s.includes("call")) return "phone";
  return "other";
}

function normalizePhone(p) { return String(p == null ? "" : p).replace(/\D/g, "").slice(-10); }
function normalizeEmail(e) { return String(e == null ? "" : e).trim().toLowerCase(); }

module.exports = { CHANNELS, STAGES, ACTIVE_STAGES, validChannel, validStage, normalizeChannel, normalizePhone, normalizeEmail };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/leads.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/leads.js tests/leads.test.js
git commit -m "feat(leads): channel + contact normalization helpers"
```

---

## Task 3: `lib/leads.js` — `toLeadView` + `scopeLeads`

**Files:**
- Modify: `netlify/functions/lib/leads.js`
- Test: `tests/leads.test.js`

- [ ] **Step 1: Write the failing test** (append to `tests/leads.test.js`)

```js
test("toLeadView flattens an Airtable record into a stable shape", () => {
  const rec = { id: "recA", fields: { Name: "Dana", Phone: "1", Email: "d@x.com", City: "Fargo",
    Vehicle: "Tundra", Goals: "more power", Installer: "aaron", Source: "intake:facebook",
    Stage: "New", "Next Follow-up": "2026-07-20", "Last Contact": "2026-07-15",
    "Activity Log": "line1", "Converted Booking": "", "Created Time": "2026-07-14T00:00:00Z" } };
  const v = L.toLeadView(rec);
  assert.equal(v.id, "recA");
  assert.equal(v.name, "Dana");
  assert.equal(v.channel, "facebook");        // derived when no explicit Channel
  assert.equal(v.stage, "New");
  assert.equal(v.installer, "aaron");
  assert.equal(v.nextFollowup, "2026-07-20");
});

test("toLeadView defaults stage to New and prefers an explicit Channel", () => {
  const v = L.toLeadView({ id: "r", fields: { Name: "X", Channel: "sms", Source: "intake:facebook" } });
  assert.equal(v.stage, "New");
  assert.equal(v.channel, "sms");             // explicit Channel wins over Source
});

test("scopeLeads: installer sees own; admin sees all or filtered or unassigned", () => {
  const leads = [
    { id: "1", installer: "aaron" }, { id: "2", installer: "cody" }, { id: "3", installer: "" },
  ];
  assert.deepEqual(L.scopeLeads(leads, { key: "cody", admin: false }).map((l) => l.id), ["2"]);
  assert.deepEqual(L.scopeLeads(leads, { key: "aaron", admin: true }).map((l) => l.id), ["1", "2", "3"]);
  assert.deepEqual(L.scopeLeads(leads, { key: "aaron", admin: true, filter: "cody" }).map((l) => l.id), ["2"]);
  assert.deepEqual(L.scopeLeads(leads, { key: "aaron", admin: true, filter: "unassigned" }).map((l) => l.id), ["3"]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/leads.test.js`
Expected: FAIL — `L.toLeadView is not a function`.

- [ ] **Step 3: Implement** (add to `lib/leads.js`, before `module.exports`, and extend the exports)

```js
// Flatten an Airtable Priority List record into the shape the app + endpoints use.
function toLeadView(rec) {
  const f = (rec && rec.fields) || {};
  const explicit = validChannel(f.Channel) ? f.Channel : "";
  return {
    id: rec && rec.id,
    name: f.Name || "", phone: f.Phone || "", email: f.Email || "",
    city: f.City || "", vehicle: f.Vehicle || "", goals: f.Goals || "",
    installer: f.Installer || "",
    channel: explicit || normalizeChannel(f.Source),
    stage: validStage(f.Stage) ? f.Stage : "New",
    source: f.Source || "",
    nextFollowup: (f["Next Follow-up"] || "").slice(0, 10),
    lastContact: (f["Last Contact"] || "").slice(0, 10),
    activity: f["Activity Log"] || "",
    convertedBooking: f["Converted Booking"] || "",
    reason: f.Reason || "",
    createdTime: f["Created Time"] || "",
  };
}

// Apply visibility. A regular installer sees only their own leads; an admin sees all,
// or a single installer via `filter`, or the blank-installer bucket via filter "unassigned".
function scopeLeads(leads, { key, admin, filter } = {}) {
  if (!admin) return leads.filter((l) => (l.installer || "") === key);
  if (filter === "unassigned") return leads.filter((l) => !(l.installer || ""));
  if (filter) return leads.filter((l) => (l.installer || "") === filter);
  return leads;
}
```

Update the exports line to add: `toLeadView, scopeLeads`.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/leads.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/leads.js tests/leads.test.js
git commit -m "feat(leads): toLeadView + scopeLeads"
```

---

## Task 4: `lib/leads.js` — `processLeadIngest` (create + dedupe)

**Files:**
- Modify: `netlify/functions/lib/leads.js`
- Test: `tests/leads.test.js`

- [ ] **Step 1: Write the failing test** (append)

```js
test("processLeadIngest requires a name and at least one contact", async () => {
  const out = await L.processLeadIngest({ name: "", phone: "" }, { list: async () => [] });
  assert.equal(out.error, "missing-contact");
});

test("processLeadIngest creates a New lead assigned by market", async () => {
  let created;
  const out = await L.processLeadIngest(
    { name: "Dana", phone: "6055551212", channel: "sms", city: "Sioux Falls", vehicle: "Tundra" },
    { now: new Date("2026-07-14T12:00:00Z"), list: async () => [],
      create: async (a) => { created = a.fields; return { id: "recNew" }; } });
  assert.equal(out.status, "lead");
  assert.equal(out.recordId, "recNew");
  assert.equal(out.deduped, false);
  assert.equal(created.Stage, "New");
  assert.equal(created.Channel, "sms");
  assert.equal(created.Installer, "cody");            // Sioux Falls routes to cody
  assert.match(created["Activity Log"], /sms/);
});

test("processLeadIngest sends an unknown city to the Unassigned bucket", async () => {
  let created;
  await L.processLeadIngest({ name: "X", phone: "1", channel: "phone", city: "Nowhere" },
    { list: async () => [], create: async (a) => { created = a.fields; return { id: "r" }; } });
  assert.equal(created.City, "Unassigned");
  assert.equal("Installer" in created, false);        // blank installer, not written
});

test("processLeadIngest dedupes onto an ACTIVE lead by phone (appends, no create)", async () => {
  let created = false, updated;
  const existing = { id: "recX", fields: { Name: "Dana", Phone: "16055551212", Stage: "Contacted", "Activity Log": "old" } };
  const out = await L.processLeadIngest({ name: "Dana", phone: "605-555-1212", channel: "email", message: "emailed back" },
    { list: async () => [existing], create: async () => { created = true; return {}; },
      update: async (a) => { updated = a; return { id: a.id }; } });
  assert.equal(out.deduped, true);
  assert.equal(out.recordId, "recX");
  assert.equal(created, false);
  assert.match(updated.fields["Activity Log"], /old/);        // preserved
  assert.match(updated.fields["Activity Log"], /emailed back/); // appended
});

test("processLeadIngest treats a match in a TERMINAL stage as a new lead", async () => {
  let created = false;
  const existing = { id: "recX", fields: { Phone: "16055551212", Stage: "Booked" } };
  const out = await L.processLeadIngest({ name: "Dana", phone: "6055551212", channel: "sms" },
    { list: async () => [existing], create: async () => { created = true; return { id: "recNew2" }; } });
  assert.equal(out.deduped, false);
  assert.equal(created, true);
  assert.equal(out.recordId, "recNew2");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/leads.test.js`
Expected: FAIL — `L.processLeadIngest is not a function`.

- [ ] **Step 3: Implement** (add to `lib/leads.js`; require the shared libs at the top of the file)

Add these requires to the TOP of `lib/leads.js`:
```js
const { getMarket } = require("./markets.js");
const { keyToInstaller } = require("./routing.js");
const { cfg, createRecord, updateRecord, createTolerant, updateTolerant, listAllRecords } = require("./airtable.js");
```

Add before `module.exports`:
```js
function logLine(now, text) { return `${new Date(now).toISOString().slice(0, 16).replace("T", " ")} — ${text}`; }
function appendActivity(existing, line) { return existing ? existing + "\n" + line : line; }

// The single normalized write path. Adapters + the manual UI all call this.
async function processLeadIngest(body, deps) {
  const { env = process.env, fetchImpl = fetch, now = new Date(),
          create = (a) => createRecord({ fetchImpl, ...a }),
          update = (a) => updateRecord({ fetchImpl, ...a }),
          list = (a) => listAllRecords({ fetchImpl, ...a }) } = deps;
  const d = body || {};
  const name = String(d.name || "").trim();
  const phone = String(d.phone || "").trim();
  const email = String(d.email || "").trim();
  if (!name || (!phone && !email)) return { status: "error", error: "missing-contact" };

  const channel = validChannel(d.channel) ? d.channel : normalizeChannel(d.source || d.channel);
  const source = String(d.source || `lead:${channel}`);
  const city = String(d.city || "").trim();
  const market = getMarket(city);
  const ownerKey = market ? keyToInstaller(market.inst).key : "";
  const c = cfg(env);

  // Dedupe: find an ACTIVE existing lead for this contact.
  const pKey = normalizePhone(phone), eKey = normalizeEmail(email);
  let existing = [];
  try { existing = await list({ token: c.token, baseId: c.baseId, table: c.priority }); }
  catch (e) { /* fall through to create — never lose a lead */ }
  const match = existing.find((r) => {
    const f = r.fields || {};
    const stage = f.Stage || "New";
    if (!ACTIVE_STAGES.includes(stage)) return false;
    const samePhone = pKey && normalizePhone(f.Phone) === pKey;
    const sameEmail = eKey && normalizeEmail(f.Email) === eKey;
    return samePhone || sameEmail;
  });

  const touch = logLine(now, `${channel}: ${d.message ? String(d.message).slice(0, 200) : "new contact"}`);

  if (match) {
    const fields = { "Last Contact": new Date(now).toISOString().slice(0, 10),
      "Activity Log": appendActivity(match.fields["Activity Log"], touch) };
    try {
      await updateTolerant(update, { token: c.token, baseId: c.baseId, table: c.priority, id: match.id, fields },
        ["Last Contact", "Activity Log"]);
    } catch (e) { return { status: "error", error: "store-unavailable" }; }
    return { status: "lead", recordId: match.id, deduped: true };
  }

  const fields = {
    Name: name, Phone: phone, Email: email, City: market ? market.city : "Unassigned",
    Vehicle: String(d.vehicle || ""), Goals: String(d.goals || ""),
    Source: source, Channel: channel, Stage: "New",
    "Last Contact": new Date(now).toISOString().slice(0, 10), "Activity Log": touch,
  };
  if (ownerKey) fields.Installer = ownerKey;
  let rec;
  try {
    rec = await createTolerant(create, { token: c.token, baseId: c.baseId, table: c.priority, fields },
      ["Channel", "Stage", "Last Contact", "Activity Log", "Source"]);
  } catch (e) { return { status: "error", error: "store-unavailable" }; }
  return { status: "lead", recordId: rec && rec.id, deduped: false };
}
```

Update exports to add: `processLeadIngest, logLine, appendActivity`.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/leads.test.js`
Expected: PASS (all lead tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/leads.js tests/leads.test.js
git commit -m "feat(leads): processLeadIngest with cross-channel dedupe"
```

---

## Task 5: `lib/leads.js` — `applyLeadUpdate` + `dueLeads`

**Files:**
- Modify: `netlify/functions/lib/leads.js`
- Test: `tests/leads.test.js`

- [ ] **Step 1: Write the failing test** (append)

```js
test("applyLeadUpdate builds the field patch + activity line per action", () => {
  const lead = { activity: "start" };
  const now = new Date("2026-07-14T12:00:00Z");
  const s = L.applyLeadUpdate(lead, "setStage", { stage: "Contacted" }, now);
  assert.equal(s.fields.Stage, "Contacted");
  assert.match(s.fields["Activity Log"], /stage → Contacted/);

  const c = L.applyLeadUpdate(lead, "logContact", { note: "left VM" }, now);
  assert.equal(c.fields["Last Contact"], "2026-07-14");
  assert.match(c.fields["Activity Log"], /left VM/);

  const fu = L.applyLeadUpdate(lead, "setFollowup", { date: "2026-07-20" }, now);
  assert.equal(fu.fields["Next Follow-up"], "2026-07-20");

  const ra = L.applyLeadUpdate(lead, "reassign", { city: "Omaha", installer: "cody" }, now);
  assert.equal(ra.fields.City, "Omaha");
  assert.equal(ra.fields.Installer, "cody");
});

test("applyLeadUpdate rejects an invalid stage", () => {
  const out = L.applyLeadUpdate({ activity: "" }, "setStage", { stage: "Nope" }, new Date());
  assert.equal(out.error, "bad-stage");
});

test("dueLeads picks active leads due today/overdue, grouped by installer", () => {
  const leads = [
    { id: "1", installer: "aaron", stage: "Contacted", nextFollowup: "2026-07-10" }, // overdue
    { id: "2", installer: "aaron", stage: "New", nextFollowup: "2026-07-14" },        // today
    { id: "3", installer: "cody", stage: "Booked", nextFollowup: "2026-07-10" },      // terminal → excluded
    { id: "4", installer: "aaron", stage: "New", nextFollowup: "2026-07-20" },        // future → excluded
    { id: "5", installer: "cody", stage: "Following up", nextFollowup: "2026-07-14" },
  ];
  const g = L.dueLeads(leads, "2026-07-14");
  assert.deepEqual(g.aaron.map((l) => l.id), ["1", "2"]);
  assert.deepEqual(g.cody.map((l) => l.id), ["5"]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/leads.test.js`
Expected: FAIL — `L.applyLeadUpdate is not a function`.

- [ ] **Step 3: Implement** (add before `module.exports`)

```js
// Compute the Airtable field patch + a new activity line for a field-level action.
// (The `convert` action creates a Booking and is handled in the endpoint, not here.)
function applyLeadUpdate(lead, action, payload = {}, now = new Date()) {
  const today = new Date(now).toISOString().slice(0, 10);
  const add = (line) => appendActivity(lead.activity, logLine(now, line));
  if (action === "setStage") {
    if (!validStage(payload.stage)) return { error: "bad-stage" };
    return { fields: { Stage: payload.stage, "Activity Log": add(`stage → ${payload.stage}`) } };
  }
  if (action === "logContact") {
    const note = String(payload.note || "contacted").slice(0, 200);
    return { fields: { "Last Contact": today, "Activity Log": add(note) } };
  }
  if (action === "setFollowup") {
    const date = String(payload.date || "");
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "bad-date" };
    return { fields: { "Next Follow-up": date, "Activity Log": add(date ? `follow-up set ${date}` : "follow-up cleared") } };
  }
  if (action === "reassign") {
    return { fields: { City: String(payload.city || ""), Installer: String(payload.installer || ""),
      "Activity Log": add(`reassigned → ${payload.installer || "unassigned"} (${payload.city || "—"})`) } };
  }
  return { error: "bad-action" };
}

// Active leads whose Next Follow-up is today or earlier, grouped by installer key.
function dueLeads(leads, todayISO) {
  const out = {};
  for (const l of leads) {
    if (!ACTIVE_STAGES.includes(l.stage || "New")) continue;
    if (!l.nextFollowup || l.nextFollowup > todayISO) continue;
    const k = l.installer || "unassigned";
    (out[k] = out[k] || []).push(l);
  }
  return out;
}
```

Update exports to add: `applyLeadUpdate, dueLeads`.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/leads.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/leads.js tests/leads.test.js
git commit -m "feat(leads): applyLeadUpdate + dueLeads"
```

---

## Task 6: `lead-ingest` endpoint

**Files:**
- Create: `netlify/functions/lead-ingest.js`
- Test: `tests/lead-endpoints.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/lead-endpoints.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const ingest = require("../netlify/functions/lead-ingest.js");

const env = { INSTALLER_TOKENS: JSON.stringify({ cody: "cody-tok" }), INTERNAL_TASK_SECRET: "task-secret",
  AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };

test("lead-ingest rejects with neither installer token nor task secret", async () => {
  const res = await ingest.handler({ headers: {}, body: "{}" }, { env });
  assert.equal(res.statusCode, 401);
});

test("lead-ingest accepts a valid installer token", async () => {
  const res = await ingest.handler(
    { headers: { "x-installer-token": "cody-tok" }, body: JSON.stringify({ name: "A", phone: "1", channel: "phone" }) },
    { env, processImpl: async () => ({ status: "lead", recordId: "r", deduped: false }) });
  assert.equal(res.statusCode, 200);
});

test("lead-ingest accepts the internal task secret (adapters)", async () => {
  const res = await ingest.handler(
    { headers: { "x-ty-task": "task-secret" }, body: JSON.stringify({ name: "A", email: "a@x.com", channel: "email" }) },
    { env, processImpl: async () => ({ status: "lead", recordId: "r", deduped: false }) });
  assert.equal(res.statusCode, 200);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/lead-endpoints.test.js`
Expected: FAIL — cannot find module `lead-ingest.js`.

- [ ] **Step 3: Implement**

```js
// netlify/functions/lead-ingest.js
// The single normalized write path for leads. Auth: an installer token (manual UI) OR
// the internal task secret (server-to-server channel adapters). Fail-closed.
const { processLeadIngest } = require("./lib/leads.js");
const { resolveInstaller, isAdmin } = require("./lib/installer-auth.js");

function taskAuthed(headers, env) {
  const s = env && env.INTERNAL_TASK_SECRET;
  const got = (headers["x-ty-task"] || headers["X-Ty-Task"] || "").toString();
  return !!(s && got === s);
}

async function handler(event, ctx = {}) {
  const env = ctx.env || process.env;
  const processImpl = ctx.processImpl || processLeadIngest;
  const headers = event.headers || {};
  const key = resolveInstaller(headers, env);
  const viaTask = taskAuthed(headers, env);
  if (!key && !viaTask) return { statusCode: 401, body: "unauthorized" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  const out = await processImpl(body, { env, key: key || "", admin: key ? isAdmin(key, env) : false });
  const code = out.status !== "error" ? 200 : (out.error === "store-unavailable" ? 502 : 400);
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, taskAuthed };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/lead-endpoints.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lead-ingest.js tests/lead-endpoints.test.js
git commit -m "feat(leads): lead-ingest endpoint (installer token or task secret)"
```

---

## Task 7: `leads-list` endpoint (scoped read)

**Files:**
- Create: `netlify/functions/leads-list.js`
- Test: `tests/lead-endpoints.test.js` (append)

- [ ] **Step 1: Write the failing test** (append)

```js
const list = require("../netlify/functions/leads-list.js");

const listEnv = { INSTALLER_TOKENS: JSON.stringify({ cody: "cody-tok", aaron: "aaron-tok" }),
  INSTALLER_ADMINS: "aaron", AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };
const recs = [
  { id: "1", fields: { Name: "A", Installer: "cody", Stage: "New", Source: "intake:sms" } },
  { id: "2", fields: { Name: "B", Installer: "aaron", Stage: "Contacted", Source: "intake:email" } },
  { id: "3", fields: { Name: "C", Installer: "", Stage: "New", Source: "lead:phone" } },
];

test("leads-list 401 without a token", async () => {
  const res = await list.handler({ headers: {} }, { env: listEnv, listImpl: async () => recs });
  assert.equal(res.statusCode, 401);
});

test("leads-list scopes a regular installer to their own leads", async () => {
  const res = await list.handler({ headers: { "x-installer-token": "cody-tok" } }, { env: listEnv, listImpl: async () => recs });
  const body = JSON.parse(res.body);
  assert.equal(body.admin, false);
  assert.deepEqual(body.leads.map((l) => l.id), ["1"]);
});

test("leads-list gives an admin everyone + the summary", async () => {
  const res = await list.handler({ headers: { "x-installer-token": "aaron-tok" } }, { env: listEnv, listImpl: async () => recs });
  const body = JSON.parse(res.body);
  assert.equal(body.admin, true);
  assert.equal(body.leads.length, 3);
  assert.equal(body.summary.byChannel.sms, 1);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/lead-endpoints.test.js`
Expected: FAIL — cannot find module `leads-list.js`.

- [ ] **Step 3: Implement**

```js
// netlify/functions/leads-list.js
// Scoped read of the leads pipeline. Installer token required. A regular installer sees
// only their own leads; an admin sees all (optionally filtered by ?installer= or ?scope=unassigned).
const { cfg, listAllRecords } = require("./lib/airtable.js");
const { resolveInstaller, isAdmin } = require("./lib/installer-auth.js");
const { toLeadView, scopeLeads } = require("./lib/leads.js");

function summarize(leads) {
  const byChannel = {}, byStage = {};
  let dueOrOverdue = 0;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  for (const l of leads) {
    byChannel[l.channel] = (byChannel[l.channel] || 0) + 1;
    byStage[l.stage] = (byStage[l.stage] || 0) + 1;
    if (["New", "Contacted", "Following up"].includes(l.stage) && l.nextFollowup && l.nextFollowup <= today) dueOrOverdue++;
  }
  const won = byStage.Booked || 0;
  return { byChannel, byStage, dueOrOverdue, total: leads.length,
    conversionRate: leads.length ? Math.round((won / leads.length) * 100) : 0 };
}

async function handler(event, ctx = {}) {
  const env = ctx.env || process.env;
  const listImpl = ctx.listImpl || ((a) => listAllRecords({ ...a }));
  const key = resolveInstaller(event.headers || {}, env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  const admin = isAdmin(key, env);
  const c = cfg(env);
  let recs;
  try { recs = await listImpl({ token: c.token, baseId: c.baseId, table: c.priority }); }
  catch (e) { return { statusCode: 502, body: JSON.stringify({ error: "store-unavailable" }) }; }
  const all = recs.map(toLeadView);
  const q = (event.queryStringParameters) || {};
  const filter = q.installer || q.scope || "";
  const leads = scopeLeads(all, { key, admin, filter });
  return { statusCode: 200, headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leads, admin, summary: admin ? summarize(all) : summarize(leads) }) };
}
module.exports = { handler, summarize };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/lead-endpoints.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/leads-list.js tests/lead-endpoints.test.js
git commit -m "feat(leads): leads-list scoped read + summary"
```

---

## Task 8: `lead-update` endpoint (stage/contact/follow-up/reassign/convert)

**Files:**
- Create: `netlify/functions/lead-update.js`
- Test: `tests/lead-endpoints.test.js` (append)

- [ ] **Step 1: Write the failing test** (append)

```js
const upd = require("../netlify/functions/lead-update.js");

const updEnv = { INSTALLER_TOKENS: JSON.stringify({ cody: "cody-tok", aaron: "aaron-tok" }),
  INSTALLER_ADMINS: "aaron", AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };
const leadRec = { id: "recL", fields: { Name: "Dana", Phone: "1", City: "Sioux Falls", Installer: "cody", Stage: "New", "Activity Log": "" } };

test("lead-update rejects a foreign-market lead for a regular installer", async () => {
  const res = await upd.handler(
    { headers: { "x-installer-token": "cody-tok" }, body: JSON.stringify({ id: "recL", action: "setStage", stage: "Contacted" }) },
    { env: updEnv, getImpl: async () => ({ id: "recL", fields: { Installer: "aaron", Stage: "New" } }) });
  assert.equal(res.statusCode, 400);
  assert.match(res.body, /not-your-market/);
});

test("lead-update setStage patches the owning installer's lead", async () => {
  let patched;
  const res = await upd.handler(
    { headers: { "x-installer-token": "cody-tok" }, body: JSON.stringify({ id: "recL", action: "setStage", stage: "Contacted" }) },
    { env: updEnv, getImpl: async () => leadRec, updateImpl: async (a) => { patched = a.fields; return { id: a.id }; } });
  assert.equal(res.statusCode, 200);
  assert.equal(patched.Stage, "Contacted");
});

test("lead-update convert creates a booking, links it, sets Booked", async () => {
  let booking, patched;
  const res = await upd.handler(
    { headers: { "x-installer-token": "cody-tok" }, body: JSON.stringify({ id: "recL", action: "convert", dateISO: "2026-08-01" }) },
    { env: updEnv, getImpl: async () => leadRec,
      createBookingImpl: async (a) => { booking = a.fields; return { id: "recBk" }; },
      updateImpl: async (a) => { patched = a.fields; return { id: a.id }; } });
  assert.equal(res.statusCode, 200);
  assert.equal(booking.Status, "Booked");
  assert.equal(booking.City, "Sioux Falls");
  assert.equal(patched["Converted Booking"], "recBk");
  assert.equal(patched.Stage, "Booked");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/lead-endpoints.test.js`
Expected: FAIL — cannot find module `lead-update.js`.

- [ ] **Step 3: Implement**

```js
// netlify/functions/lead-update.js
// Mutate one lead: setStage / logContact / setFollowup / reassign (admin) / convert.
// Ownership is enforced by the lead's Installer (a regular installer may only touch
// their own; admin may touch any + reassign). `convert` creates a Bookings record
// (walk-in-style, any date) and links it back to the lead.
const { cfg, getRecord, updateRecord, updateTolerant, createRecord, createTolerant } = require("./lib/airtable.js");
const { resolveInstaller, isAdmin } = require("./lib/installer-auth.js");
const { toLeadView, applyLeadUpdate, logLine, appendActivity } = require("./lib/leads.js");
const { getMarket } = require("./lib/markets.js");
const { keyToInstaller } = require("./lib/routing.js");

async function handler(event, ctx = {}) {
  const env = ctx.env || process.env;
  const now = ctx.now || new Date();
  const key = resolveInstaller(event.headers || {}, env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  const admin = isAdmin(key, env);
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  const { id, action } = body;
  if (!id || !action) return { statusCode: 400, body: JSON.stringify({ error: "missing-id-or-action" }) };

  const c = cfg(env);
  const getImpl = ctx.getImpl || ((a) => getRecord({ ...a }));
  const updateImpl = ctx.updateImpl || ((a) => updateRecord({ ...a }));
  const createBookingImpl = ctx.createBookingImpl || ((a) => createRecord({ ...a }));

  let rec;
  try { rec = await getImpl({ token: c.token, baseId: c.baseId, table: c.priority, id }); }
  catch (e) { return { statusCode: 502, body: JSON.stringify({ error: "store-unavailable" }) }; }
  const lead = toLeadView(rec);
  if (!admin && (lead.installer || "") !== key) return { statusCode: 400, body: JSON.stringify({ error: "not-your-market" }) };
  if (action === "reassign" && !admin) return { statusCode: 400, body: JSON.stringify({ error: "admin-only" }) };

  if (action === "convert") {
    const dateISO = String(body.dateISO || "").trim() || new Date(now).toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return { statusCode: 400, body: JSON.stringify({ error: "bad-date" }) };
    const market = getMarket(lead.city);
    const owner = market ? keyToInstaller(market.inst).key : (lead.installer || key);
    const fields = { City: market ? market.city : lead.city, "Event Date": dateISO, Name: lead.name,
      Vehicle: lead.vehicle, Phone: lead.phone, Email: lead.email, Goals: lead.goals,
      Status: "Booked", Source: "lead:convert", Installer: owner };
    let bk;
    try { bk = await createTolerant(createBookingImpl, { token: c.token, baseId: c.baseId, table: c.bookings, fields }, ["Source", "Goals"]); }
    catch (e) { return { statusCode: 502, body: JSON.stringify({ error: "store-unavailable" }) }; }
    const patch = { "Converted Booking": bk && bk.id, Stage: "Booked",
      "Activity Log": appendActivity(lead.activity, logLine(now, `converted → booking ${bk && bk.id} (${dateISO})`)) };
    try { await updateTolerant(updateImpl, { token: c.token, baseId: c.baseId, table: c.priority, id, fields: patch }, ["Converted Booking", "Stage", "Activity Log"]); }
    catch (e) { return { statusCode: 502, body: JSON.stringify({ error: "store-unavailable" }) }; }
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "ok", bookingId: bk && bk.id, stage: "Booked" }) };
  }

  const built = applyLeadUpdate(lead, action, body, now);
  if (built.error) return { statusCode: 400, body: JSON.stringify({ error: built.error }) };
  try {
    await updateTolerant(updateImpl, { token: c.token, baseId: c.baseId, table: c.priority, id, fields: built.fields },
      ["Stage", "Channel", "Next Follow-up", "Last Contact", "Activity Log", "Installer", "City"]);
  } catch (e) { return { statusCode: 502, body: JSON.stringify({ error: "store-unavailable" }) }; }
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "ok", fields: built.fields }) };
}
module.exports = { handler };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/lead-endpoints.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lead-update.js tests/lead-endpoints.test.js
git commit -m "feat(leads): lead-update (stage/contact/follow-up/reassign/convert)"
```

---

## Task 9: `lead-followups` scheduled sweep

**Files:**
- Create: `netlify/functions/lead-followups.js`
- Modify: `netlify.toml`
- Test: `tests/lead-endpoints.test.js` (append)

- [ ] **Step 1: Write the failing test** (append)

```js
const sweep = require("../netlify/functions/lead-followups.js");

test("runFollowups pushes one message per installer with due leads", async () => {
  const sent = [];
  const recs = [
    { id: "1", fields: { Installer: "cody", Stage: "New", "Next Follow-up": "2026-07-10" } },
    { id: "2", fields: { Installer: "cody", Stage: "Contacted", "Next Follow-up": "2026-07-14" } },
    { id: "3", fields: { Installer: "aaron", Stage: "Booked", "Next Follow-up": "2026-07-01" } }, // terminal
  ];
  const out = await sweep.runFollowups({ today: "2026-07-14", listImpl: async () => recs,
    pushImpl: async (key, msg) => { sent.push([key, msg.body]); return { sent: 1 }; }, env: {} });
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0], "cody");
  assert.match(sent[0][1], /2 lead/);
  assert.equal(out.installersNotified, 1);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/lead-endpoints.test.js`
Expected: FAIL — cannot find module `lead-followups.js`.

- [ ] **Step 3: Implement**

```js
// netlify/functions/lead-followups.js
// Scheduled morning sweep: web-push each installer the count of their leads due today
// or overdue for follow-up, deep-linking into the console's Leads view.
const { cfg, listAllRecords } = require("./lib/airtable.js");
const { toLeadView, dueLeads } = require("./lib/leads.js");
const { sendPush } = require("./lib/push.js");

async function runFollowups(deps = {}) {
  const env = deps.env || process.env;
  const today = deps.today || new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const listImpl = deps.listImpl || ((a) => listAllRecords({ ...a }));
  const pushImpl = deps.pushImpl || sendPush;
  const c = cfg(env);
  let recs = [];
  try { recs = await listImpl({ token: c.token, baseId: c.baseId, table: c.priority }); } catch (e) { return { installersNotified: 0, error: "store-unavailable" }; }
  const groups = dueLeads(recs.map(toLeadView), today);
  let notified = 0;
  for (const [key, leads] of Object.entries(groups)) {
    if (key === "unassigned") continue;                 // no device owner to notify
    const n = leads.length;
    try {
      await pushImpl(key, { title: "Leads to follow up", body: `⏰ ${n} lead${n === 1 ? "" : "s"} to follow up today`,
        data: { url: "/installer.html#leads" } }, { env });
      notified++;
    } catch (e) { /* non-blocking */ }
  }
  return { installersNotified: notified, today };
}

async function handler() {
  const out = await runFollowups({});
  return { statusCode: 200, body: JSON.stringify(out) };
}
module.exports = { handler, runFollowups };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/lead-endpoints.test.js`
Expected: PASS.

- [ ] **Step 5: Schedule it** — add to `netlify.toml` after the `amsoil-followup` block:

```toml
[functions."lead-followups"]
  schedule = "0 13 * * *"
```
(13:00 UTC ≈ 8:00am Central — a morning nudge. Adjacent to the other daily jobs.)

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/lead-followups.js netlify.toml tests/lead-endpoints.test.js
git commit -m "feat(leads): scheduled follow-up web-push sweep"
```

---

## Task 10: Leads view in `installer.html` — toggle + list + log-a-lead

**Files:**
- Modify: `site/installer.html`

This adds a `Jobs · Leads` toggle above `#feed`, a `renderLeads()` view, a `loadLeads()` fetch, and the `+ Log a lead` form. It reuses existing helpers (`tok()`, `mkInput`, `esc`, `succeed`, `fail`, `renderAll`, `STATE`).

- [ ] **Step 1: Add lead state to `STATE`** — in `site/installer.html`, extend the `STATE` object (currently at the `var STATE = { … }` line) with:

```js
    , tab:'jobs', leads:[], leadsLoaded:false, leadStageOpen:{}, leadFilter:'', leadQ:''
```
(Append inside the `STATE` object literal.)

- [ ] **Step 2: Render the toggle + route rendering** — find `function renderAll(){ renderTally(); renderFeed(); }` and replace it with:

```js
  function renderAll(){ renderTally(); renderTabs(); if(STATE.tab==='leads'){ renderLeads(); } else { renderFeed(); } }
  function renderTabs(){
    var host=document.getElementById('tabs');
    if(!host){ host=document.createElement('div'); host.id='tabs'; host.style.cssText='display:flex;gap:8px;margin:6px 0 10px';
      var feed=document.getElementById('feed'); feed.parentNode.insertBefore(host, feed); }
    function tab(id,label,badge){ return '<button class="tabbtn'+(STATE.tab===id?' on':'')+'" data-tab="'+id+'">'+esc(label)+(badge?' <span class="tabbadge">'+badge+'</span>':'')+'</button>'; }
    var due=STATE.leads.filter(function(l){ return ['New','Contacted','Following up'].indexOf(l.stage)>=0 && l.nextFollowup && l.nextFollowup<=STATE.today; }).length;
    host.innerHTML=tab('jobs','Jobs','')+tab('leads','Leads', due? String(due):'');
    Array.prototype.forEach.call(host.querySelectorAll('.tabbtn'),function(b){ b.onclick=function(){ STATE.tab=b.getAttribute('data-tab'); if(STATE.tab==='leads'&&!STATE.leadsLoaded){ loadLeads(); } renderAll(); }; });
  }
```

- [ ] **Step 3: Add `loadLeads()` + `renderLeads()` + the log-a-lead form + card actions** — insert this block just before the `// --- VIN scan` comment in `site/installer.html`:

```js
  // ---- Leads pipeline ----
  var LEAD_STAGES=['New','Contacted','Following up','Booked','Not now'];
  var CHAN_ICON={email:'📧',sms:'💬',phone:'📞',facebook:'f',instagram:'ig','walk-in':'🚶',other:'•'};
  async function loadLeads(){
    try{
      var res=await fetch('/.netlify/functions/leads-list',{headers:{'x-installer-token':tok()}});
      if(res.status===401){ localStorage.removeItem('ty_installer_token'); location.reload(); return; }
      var data=await res.json(); STATE.leads=data.leads||[]; STATE.leadsLoaded=true;
    }catch(e){ /* keep whatever we have */ }
    renderAll();
  }
  function leadMatchesQ(l){ var q=STATE.leadQ.trim().toLowerCase(); if(!q) return true;
    return [l.name,l.vehicle,l.phone,l.city,l.channel].some(function(v){ return String(v||'').toLowerCase().indexOf(q)>=0; }); }
  function renderLeads(){
    var host=document.getElementById('feed'); host.innerHTML='';
    host.appendChild(logLeadForm());
    var box=document.createElement('div'); box.className='search';
    box.innerHTML='<input id="leadq" type="search" placeholder="Search leads — name, vehicle, phone…">';
    host.appendChild(box);
    var qi=document.getElementById('leadq'); qi.value=STATE.leadQ; qi.oninput=function(){ STATE.leadQ=this.value; renderLeads(); };
    var visible=STATE.leads.filter(leadMatchesQ);
    LEAD_STAGES.forEach(function(stage){
      var inStage=visible.filter(function(l){ return (l.stage||'New')===stage; });
      if(!inStage.length) return;
      inStage.sort(function(a,b){
        var ao=(['New','Contacted','Following up'].indexOf(a.stage)>=0 && a.nextFollowup && a.nextFollowup<=STATE.today)?0:1;
        var bo=(['New','Contacted','Following up'].indexOf(b.stage)>=0 && b.nextFollowup && b.nextFollowup<=STATE.today)?0:1;
        if(ao!==bo) return ao-bo; return (b.lastContact||'').localeCompare(a.lastContact||'');
      });
      host.appendChild(secHead(stage+' ('+inStage.length+')',''));
      inStage.forEach(function(l){ host.appendChild(leadCard(l)); });
    });
    if(!visible.length){ var em=document.createElement('div'); em.className='empty'; em.textContent='No leads yet. Use “＋ Log a lead” above.'; host.appendChild(em); }
  }
  function leadCard(l){
    var overdue=(['New','Contacted','Following up'].indexOf(l.stage)>=0 && l.nextFollowup && l.nextFollowup<=STATE.today);
    var det=document.createElement('details'); det.className='evt';
    var sum=document.createElement('summary');
    sum.innerHTML='<span><span class="etitle">'+(CHAN_ICON[l.channel]||'•')+' '+esc(l.name)+'</span>'+(l.installer&&STATE.admin?' <span class="installer-tag">'+esc(l.installer)+'</span>':'')+
      '<br><span class="edate">'+esc(l.vehicle||'—')+' · '+esc(l.city||'—')+'</span></span>'+
      '<span class="pill'+(overdue?' hasopen':'')+'">'+(overdue?'⏰ due':(l.nextFollowup?('→ '+esc(l.nextFollowup)):esc(l.stage)))+'</span>';
    det.appendChild(sum);
    var body=document.createElement('div'); body.className='ebody';
    var row=document.createElement('div'); row.className='walkmini';
    function act(label,fn){ var b=document.createElement('button'); b.className='btn'; b.textContent=label; b.onclick=fn; return b; }
    if(l.phone){ row.appendChild(linkBtn('Call','tel:'+l.phone)); row.appendChild(linkBtn('Text','sms:'+l.phone)); }
    if(l.email){ row.appendChild(linkBtn('Email','mailto:'+l.email)); }
    body.appendChild(row);
    var stagesRow=document.createElement('div'); stagesRow.className='walkmini';
    LEAD_STAGES.forEach(function(s){ if(s!==l.stage){ stagesRow.appendChild(act('→ '+s,function(){ leadUpdate(l.id,{action:'setStage',stage:s}); })); } });
    body.appendChild(stagesRow);
    var fu=document.createElement('div'); fu.className='walkmini';
    [['Today',0],['Tomorrow',1],['+3d',3],['+1wk',7]].forEach(function(p){ fu.appendChild(act('Follow-up '+p[0],function(){ leadUpdate(l.id,{action:'setFollowup',date:addDays(STATE.today,p[1])}); })); });
    body.appendChild(fu);
    var note=mkInput('Log a contact note'); var logb=act('Log contact',function(){ leadUpdate(l.id,{action:'logContact',note:note.value}); });
    var mini=document.createElement('div'); mini.className='walkmini'; mini.appendChild(note); mini.appendChild(logb); body.appendChild(mini);
    var conv=document.createElement('div'); conv.className='walkmini';
    var cd=document.createElement('input'); cd.type='date'; cd.value=STATE.today;
    conv.appendChild(cd); conv.appendChild(act('Convert to booking',function(){ leadUpdate(l.id,{action:'convert',dateISO:cd.value}); }));
    body.appendChild(conv);
    if(l.activity){ var log=document.createElement('div'); log.className='edate'; log.style.whiteSpace='pre-wrap'; log.style.marginTop='6px'; log.textContent=l.activity; body.appendChild(log); }
    det.appendChild(body); return det;
  }
  function linkBtn(label,href){ var a=document.createElement('a'); a.className='btn'; a.textContent=label; a.href=href; a.style.textAlign='center'; return a; }
  function addDays(iso,n){ var d=new Date(iso+'T00:00:00'); d.setDate(d.getDate()+n); var p=function(x){return String(x).padStart(2,'0');}; return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); }
  async function leadUpdate(id,payload){
    clearMsg();
    try{
      var res=await fetch('/.netlify/functions/lead-update',{method:'POST',headers:{'Content-Type':'application/json','x-installer-token':tok()},body:JSON.stringify(Object.assign({id:id},payload))});
      var out=await res.json().catch(function(){return{};});
      if(res.ok && out.status==='ok'){ succeed(payload.action==='convert'?'✓ Converted to a booking.':'✓ Updated.'); loadLeads(); }
      else { fail('Could not update: '+(out.error||res.status)); }
    }catch(e){ fail('Network error — try again.'); }
  }
  function logLeadForm(){
    var K='__lead__'; var det=document.createElement('details'); det.className='evt'; det.open=!!STATE.leadStageOpen[K];
    det.addEventListener('toggle',function(){ STATE.leadStageOpen[K]=det.open; });
    var sum=document.createElement('summary'); sum.innerHTML='<span class="etitle">＋ Log a lead</span><span class="pill">any channel</span>'; det.appendChild(sum);
    var box=document.createElement('div'); box.className='ebody walkmini';
    var n=mkInput('Customer name'), v=mkInput('Vehicle (e.g. 2021 Tundra)'), p=mkInput('Phone'); p.inputMode='tel';
    var em=mkInput('Email'); em.type='email';
    var ch=document.createElement('select'); ch.innerHTML=['phone','sms','email','facebook','instagram','walk-in','other'].map(function(x){return '<option>'+x+'</option>';}).join('');
    var city=mkInput('City / market'); var note=mkInput('Note (what they want)');
    var btn=document.createElement('button'); btn.className='btn addwalk'; btn.textContent='Save lead';
    [n,v,p,em,ch,city,note,btn].forEach(function(el){ box.appendChild(el); });
    det.appendChild(box);
    btn.onclick=function(){
      var name=(n.value||'').trim(); if(!name){ fail('Enter a name.'); return; }
      if(!(p.value||'').trim() && !(em.value||'').trim()){ fail('Enter a phone or email.'); return; }
      STATE.leadStageOpen[K]=true;
      ingestLead({name:name,vehicle:v.value,phone:p.value,email:em.value,channel:ch.value,city:city.value,message:note.value});
    };
    return det;
  }
  async function ingestLead(vals){
    clearMsg();
    try{
      var res=await fetch('/.netlify/functions/lead-ingest',{method:'POST',headers:{'Content-Type':'application/json','x-installer-token':tok()},body:JSON.stringify(vals)});
      var out=await res.json().catch(function(){return{};});
      if(res.ok && out.status==='lead'){ succeed(out.deduped?'✓ Added to an existing lead.':'✓ Lead saved.'); loadLeads(); }
      else { fail('Could not save lead: '+(out.error||res.status)); }
    }catch(e){ fail('Network error — try again.'); }
  }
```

- [ ] **Step 4: Add minimal styles** — in the `<style>` block, add:

```css
    .tabbtn{background:#1a1a1a;border:1px solid #333;color:var(--muted);padding:8px 16px;border-radius:8px;font-weight:700;cursor:pointer}
    .tabbtn.on{background:var(--accent);color:#111;border-color:var(--accent)}
    .tabbadge{background:#8a6d3b;color:#fff;border-radius:10px;padding:1px 7px;font-size:12px;margin-left:4px}
```

- [ ] **Step 5: Manual smoke (local)** — open `site/installer.html` behavior mentally / via the browser test in Task 11. No standalone run here.

- [ ] **Step 6: Commit**

```bash
git add site/installer.html
git commit -m "feat(leads): Jobs·Leads console view — pipeline, log-a-lead, actions"
```

---

## Task 11: Browser regression test for the Leads view

**Files:**
- Create: `tests/leads-browser.test.mjs`

- [ ] **Step 1: Write the test** (mirrors `tests/installer-walkin-browser.test.mjs`: serves `site/`, stubs endpoints, skips if no browser)

```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(__dirname, "..", "site");
let chromium = null; try { ({ chromium } = await import("playwright")); } catch {}
let server, base, browser, ok = false;

before(async () => {
  server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/installer.html";
    const f = path.join(SITE, p); if (!f.startsWith(SITE) || !fs.existsSync(f)) { res.writeHead(404); res.end("nf"); return; }
    const ext = path.extname(f);
    res.writeHead(200, { "Content-Type": ext === ".js" ? "text/javascript" : ext === ".html" ? "text/html" : "text/plain" });
    res.end(fs.readFileSync(f));
  });
  await new Promise((r) => server.listen(0, r)); base = `http://127.0.0.1:${server.address().port}`;
  if (chromium) { try { browser = await chromium.launch(); ok = true; } catch { ok = false; } }
});
after(async () => { if (browser) await browser.close(); if (server) server.close(); });

async function boot() {
  const leads = [];
  const page = await (await browser.newContext()).newPage();
  await page.route("**/sw.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: "/*x*/" }));
  await page.route("**/installer-roster**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bookings: [], events: [], admin: false }) }));
  await page.route("**/amsoil-metrics**", (r) => r.fulfill({ status: 200, body: "{}" }));
  await page.route("**/leads-list**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ leads, admin: false, summary: {} }) }));
  await page.route("**/lead-ingest**", async (r) => {
    const b = JSON.parse(r.request().postData() || "{}");
    leads.push({ id: "L" + (leads.length + 1), name: b.name, vehicle: b.vehicle, phone: b.phone, email: b.email,
      city: b.city, channel: b.channel, stage: "New", installer: "cody", nextFollowup: "", lastContact: "2026-07-14", activity: "", convertedBooking: "" });
    await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "lead", recordId: "L", deduped: false }) });
  });
  await page.addInitScript(() => localStorage.setItem("ty_installer_token", "t"));
  await page.goto(base + "/installer.html");
  await page.waitForFunction(() => !document.getElementById("app").classList.contains("hidden"));
  await page.waitForTimeout(150);
  return { page, leads };
}

test("switch to Leads, log a lead, it appears under New", async (t) => {
  if (!ok) return t.skip("no browser");
  const { page } = await boot();
  await page.click('.tabbtn[data-tab="leads"]');
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const det = document.querySelector("#feed details.evt");
    if (!det.open) { det.open = true; det.dispatchEvent(new Event("toggle")); }
    const form = det.querySelector(".ebody.walkmini");
    const byPh = (f) => Array.from(form.querySelectorAll("input")).find((i) => (i.placeholder || "").toLowerCase().includes(f));
    byPh("name").value = "Dana"; byPh("phone").value = "6055551212"; byPh("vehicle").value = "Tundra";
    form.querySelector("button.addwalk").click();
  });
  await page.waitForTimeout(200);
  const txt = await page.evaluate(() => document.getElementById("feed").textContent);
  await page.close();
  assert.match(txt, /New \(1\)/);
  assert.match(txt, /Dana/);
});
```

- [ ] **Step 2: Run**

Run: `node --test tests/leads-browser.test.mjs`
Expected: PASS (1 test; or skips cleanly if no browser).

- [ ] **Step 3: Commit**

```bash
git add tests/leads-browser.test.mjs
git commit -m "test(leads): browser regression for the Leads view"
```

---

## Task 12: Full suite + ship

**Files:** none (verification + deploy).

- [ ] **Step 1: Run the full suite**

Run: `node --test`
Expected: all tests PASS (existing 581 + the new lead tests).

- [ ] **Step 2: Ship** — invoke the `ship` skill. No SEO inputs changed, so skip `build:seo`. Stage the specific new/modified files, push `master`, confirm the Netlify deploy is `ready`, and curl-verify:

Run:
```bash
curl -s https://tunedyota.com/.netlify/functions/leads-list -H "x-installer-token: BOGUS" -o /dev/null -w "%{http_code}\n"   # expect 401
```
Expected: `401` (endpoint deployed + fail-closed). Then load `/installer.html`, switch to **Leads**, and log a test lead against the live roster (delete it after, like the walk-in smoke test).

- [ ] **Step 3: Update memory** — record the Core lead tracker as shipped in `[[funnel-roadmap-and-lead-setup]]` (and the program/decomposition in a new `lead-tracking-program` memory), noting Twilio approved, forwarding numbers in secure config, and the adapter sequence.

---

## Self-review notes

- **Spec coverage:** §4 columns → Task 1; `lead-ingest`/dedupe → Tasks 4,6; `leads-list` scope → Tasks 3,7; `lead-update`+convert → Tasks 5,8; UI → Task 10; follow-up sweep → Task 9; light summary → Task 7 (`summarize`); tests → Tasks 2–9,11.
- **Auth:** `lead-ingest` = installer token OR `INTERNAL_TASK_SECRET` (Task 6); reads/updates = installer token with ownership (Tasks 7,8).
- **Type consistency:** the lead view shape (`toLeadView`, Task 3) is the single object consumed by `leads-list`, `lead-update`, `dueLeads`, and the UI. Field patch keys match the Airtable columns from Task 1 exactly.
- **Tolerance:** every write uses `createTolerant`/`updateTolerant` so the feature degrades gracefully until Task 1's columns exist.
