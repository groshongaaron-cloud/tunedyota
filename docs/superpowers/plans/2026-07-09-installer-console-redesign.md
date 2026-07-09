# Installer Console Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework `/installer.html` so installers see & close out past-open bookings, browse the reporting month by event, add walk-ins inline, and have no-shows go to the priority waitlist behind a confirmation.

**Architecture:** `installer-roster.js` returns the installer's full non-cancelled history as a flat list; the client buckets it (needs-close-out / month events / walk-ins / completed). A new `installer-walkin.js` creates scoped walk-in bookings. `installer-closeout.js`'s no-show path adds a Priority-waitlist record and requires a confirmation flag.

**Tech Stack:** Node (Netlify Functions, `node:test`), vanilla client JS, Airtable via `lib/airtable.js`. Deps-injection test pattern (`processX(body, deps)`).

Spec: `docs/superpowers/specs/2026-07-09-installer-console-redesign-design.md`.

---

## File Structure
- `netlify/functions/installer-roster.js` — modify `buildRoster` to flat shape incl. past + `isWalkin`.
- `netlify/functions/installer-walkin.js` — **new**: `processWalkin` + `handler`.
- `netlify/functions/installer-closeout.js` — modify no-show path (confirm + waitlist).
- `site/installer.html` — full UI/JS rewrite.
- `tests/installer-roster.test.js` — update to flat shape.
- `tests/installer-walkin.test.js` — **new**.
- `tests/installer-closeout.test.js` — replace/extend no-show tests.

Run all tests: `npm test`. Single file: `node --test tests/installer-roster.test.js`.

---

## Task 1: Roster returns full history as a flat list

**Files:**
- Modify: `netlify/functions/installer-roster.js`
- Test: `tests/installer-roster.test.js`

- [ ] **Step 1: Replace the roster test with the flat-shape test**

Replace the entire body of `tests/installer-roster.test.js` with:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildRoster } = require("../netlify/functions/installer-roster.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };

test("scopes to installer, includes past + future, flags walk-ins, sorts by date", async () => {
  let formula;
  const list = async (a) => {
    formula = a.filterByFormula;
    return [
      { id: "r1", fields: { City: "Omaha", "Event Date": "2026-07-03", Slot: "9:40", Name: "B", Vehicle: "Tundra", Installer: "cody", Status: "Booked" } },
      { id: "r2", fields: { City: "Lincoln", "Event Date": "2020-01-01", Slot: "9:00", Name: "Old", Installer: "cody", Status: "Booked" } },
      { id: "r3", fields: { City: "Omaha", "Event Date": "2026-07-03", Name: "W", Installer: "cody", Status: "Booked", Source: "installer:walk-in" } },
    ];
  };
  const out = await buildRoster({ env, key: "cody", now: new Date("2026-07-03T12:00:00Z"), list });
  assert.match(formula, /\{Installer\}="cody"/);
  assert.match(formula, /\{Status\}!="Cancelled"/);
  assert.equal(out.installer, "cody");
  assert.equal(out.today, "2026-07-03");
  assert.equal(out.bookings.length, 3);              // past NOT dropped
  assert.equal(out.bookings[0].dateISO, "2020-01-01"); // earliest first
  assert.equal(out.bookings[0].name, "Old");
  const walk = out.bookings.find((b) => b.name === "W");
  assert.equal(walk.isWalkin, true);
  const reg = out.bookings.find((b) => b.name === "B");
  assert.equal(reg.isWalkin, false);
  assert.equal(reg.slotLabel, "9:40 AM");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/installer-roster.test.js`
Expected: FAIL (`out.today` undefined / `out.bookings` undefined — roster still returns `events`).

- [ ] **Step 3: Rewrite `buildRoster`**

In `netlify/functions/installer-roster.js`, replace the `buildRoster` function (keep the top `require`s and the `dateOnly`/`bySlot` helpers) with:

```js
async function buildRoster(deps) {
  const { env = process.env, fetchImpl = fetch, now = new Date(), key,
          list = (a) => listRecords({ fetchImpl, ...a }) } = deps;
  const c = cfg(env);
  const recs = await list({ token: c.token, baseId: c.baseId, table: c.bookings,
    filterByFormula: `AND({Installer}="${key}",{Status}!="Cancelled")` });
  const today = now.toISOString().slice(0, 10);
  const bookings = recs.map((r) => {
    const f = r.fields || {};
    const src = String(f.Source || "");
    return {
      id: r.id, city: f.City || "", dateISO: dateOnly(f["Event Date"]),
      slot: f.Slot || "", slotLabel: f.Slot ? formatSlot(f.Slot) : "",
      name: f.Name || "", vehicle: f.Vehicle || "", phone: f.Phone || "", email: f.Email || "",
      mods: f.Modifications || "", status: f.Status || "Booked",
      isWalkin: /^(intake|installer):walk-in/i.test(src),
      calibration: f["OTT Calibration"] || "", vin: f.VIN || "",
      tuningPlatform: f["Tuning Platform"] || "", calibrationType: f["Calibration Type"] || "",
      ecuId: f["ECU ID"] || "", gearSize: f["Gear Size"] || "", mileage: f.Mileage || "",
    };
  }).sort((a, b) => a.dateISO.localeCompare(b.dateISO) || bySlot(a, b));
  return { installer: key, today, bookings };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/installer-roster.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/installer-roster.js tests/installer-roster.test.js
git commit -m "feat(installer): roster returns full history as a flat list with isWalkin"
```

---

## Task 2: Walk-in quick-add endpoint

**Files:**
- Create: `netlify/functions/installer-walkin.js`
- Test: `tests/installer-walkin.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/installer-walkin.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processWalkin } = require("../netlify/functions/installer-walkin.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };
const okCreate = async () => ({ id: "recNEW" });

test("requires name + phone", async () => {
  const out = await processWalkin({ city: "Omaha", dateISO: "2026-07-03", name: "", phone: "" }, { env, key: "cody", create: okCreate });
  assert.equal(out.status, "error");
  assert.equal(out.error, "missing-contact");
});

test("rejects an unknown city", async () => {
  const out = await processWalkin({ city: "Nowhere", dateISO: "2026-07-03", name: "Jo", phone: "555" }, { env, key: "cody", create: okCreate });
  assert.equal(out.error, "unknown-city");
});

test("rejects a city that routes to a different installer", async () => {
  // Omaha routes to cody; authenticate as aaron
  const out = await processWalkin({ city: "Omaha", dateISO: "2026-07-03", name: "Jo", phone: "555" }, { env, key: "aaron", create: okCreate });
  assert.equal(out.error, "not-your-market");
});

test("rejects a malformed date", async () => {
  const out = await processWalkin({ city: "Omaha", dateISO: "07/03", name: "Jo", phone: "555" }, { env, key: "cody", create: okCreate });
  assert.equal(out.error, "bad-date");
});

test("creates a scoped walk-in booking with the right fields + Source", async () => {
  let created;
  const create = async (a) => { created = a; return { id: "recNEW" }; };
  const out = await processWalkin({ city: "Omaha", dateISO: "2026-07-03", name: "Jo", vehicle: "Tundra", phone: "555" }, { env, key: "cody", create });
  assert.equal(out.status, "booked");
  assert.equal(out.recordId, "recNEW");
  assert.equal(created.fields.Installer, "cody");
  assert.equal(created.fields.City, "Omaha");
  assert.equal(created.fields["Event Date"], "2026-07-03");
  assert.equal(created.fields.Status, "Booked");
  assert.equal(created.fields.Source, "installer:walk-in");
  assert.equal(out.booking.isWalkin, true);
  assert.equal(out.booking.dateISO, "2026-07-03");
  assert.equal(out.booking.name, "Jo");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/installer-walkin.test.js`
Expected: FAIL ("Cannot find module '../netlify/functions/installer-walkin.js'").

- [ ] **Step 3: Write the implementation**

Create `netlify/functions/installer-walkin.js`:

```js
// netlify/functions/installer-walkin.js
// Installer-scoped walk-in quick-add. Creates a Bookings record for one of the
// installer's own event markets, tagged Source "installer:walk-in" so the console
// surfaces it under "Walk-ins this month". Ownership is enforced by market routing.
const { cfg, createRecord, createTolerant } = require("./lib/airtable.js");
const { resolveInstaller } = require("./lib/installer-auth.js");
const { getMarket } = require("./lib/markets.js");
const { keyToInstaller } = require("./lib/routing.js");

async function processWalkin(body, deps) {
  const { env = process.env, fetchImpl = fetch, key,
          create = (a) => createRecord({ fetchImpl, ...a }) } = deps;
  const d = body || {};
  const name = String(d.name || "").trim();
  const phone = String(d.phone || "").trim();
  if (!name || !phone) return { status: "error", error: "missing-contact" };
  const city = String(d.city || "").trim();
  const market = getMarket(city);
  if (!market) return { status: "error", error: "unknown-city" };
  if (keyToInstaller(market.inst).key !== key) return { status: "error", error: "not-your-market" };
  const dateISO = String(d.dateISO || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return { status: "error", error: "bad-date" };

  const c = cfg(env);
  const vehicle = String(d.vehicle || "").trim();
  const fields = { City: market.city, "Event Date": dateISO, Name: name, Vehicle: vehicle,
    Phone: phone, Status: "Booked", Source: "installer:walk-in", Installer: key };
  let rec;
  try { rec = await createTolerant(create, { token: c.token, baseId: c.baseId, table: c.bookings, fields }, ["Source"]); }
  catch (e) { return { status: "error", error: "store-unavailable" }; }

  const id = rec && rec.id;
  return { status: "booked", recordId: id, booking: {
    id, city: market.city, dateISO, slot: "", slotLabel: "", name, vehicle, phone, email: "",
    mods: "", status: "Booked", isWalkin: true, calibration: "", vin: "", tuningPlatform: "",
    calibrationType: "", ecuId: "", gearSize: "", mileage: "" } };
}

async function handler(event) {
  const key = resolveInstaller(event.headers || {}, process.env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  const out = await processWalkin(body, { key });
  const code = out.status !== "error" ? 200 : (out.error === "store-unavailable" ? 502 : 400);
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, processWalkin };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/installer-walkin.test.js`
Expected: PASS (all 5).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/installer-walkin.js tests/installer-walkin.test.js
git commit -m "feat(installer): scoped walk-in quick-add endpoint"
```

---

## Task 3: No-show → priority waitlist + confirmation

**Files:**
- Modify: `netlify/functions/installer-closeout.js`
- Test: `tests/installer-closeout.test.js`

- [ ] **Step 1: Replace the old no-show test with the new no-show tests**

In `tests/installer-closeout.test.js`, delete the existing `test("noshow just sets Status", ...)` block and add these four tests (anywhere in the file):

```js
test("noshow requires confirmation", async () => {
  const out = await processCloseout({ recordId: "rec1", action: "noshow" }, {
    key: "cody", env: { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" },
    get: async () => ({ id: "rec1", fields: { Installer: "cody" } }),
    update: async () => ({}), create: async () => ({ id: "x" }), send: async () => ({}), log: { error() {} },
  });
  assert.equal(out.status, "error");
  assert.equal(out.error, "unconfirmed");
});

test("confirmed noshow sets Status No-show and waitlists the customer", async () => {
  const updates = [], created = [];
  const out = await processCloseout({ recordId: "rec1", action: "noshow", confirmed: true }, {
    key: "cody", env: { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" },
    get: async () => ({ id: "rec1", fields: { Installer: "cody", Name: "Jo", Phone: "555", City: "Omaha", "Event Date": "2026-07-03", Vehicle: "Tundra" } }),
    update: async (a) => { updates.push(a.fields); return {}; },
    create: async (a) => { created.push(a); return { id: "pr1" }; },
    send: async () => ({}), log: { error() {} },
  });
  assert.equal(out.status, "noshow");
  assert.equal(out.waitlisted, true);
  assert.equal(updates[0].Status, "No-show");
  assert.equal(created[0].fields.Source, "installer:no-show");
  assert.equal(created[0].fields.Installer, "cody");
  assert.match(created[0].fields.Reason, /No-show/);
});

test("re-noshow on an already No-show booking does not re-waitlist", async () => {
  let creates = 0;
  const out = await processCloseout({ recordId: "rec1", action: "noshow", confirmed: true }, {
    key: "cody", env: { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" },
    get: async () => ({ id: "rec1", fields: { Installer: "cody", Status: "No-show" } }),
    update: async () => ({}), create: async () => { creates++; return { id: "x" }; }, send: async () => ({}), log: { error() {} },
  });
  assert.equal(out.alreadyWaitlisted, true);
  assert.equal(creates, 0);
});

test("noshow still succeeds if the waitlist write fails", async () => {
  const out = await processCloseout({ recordId: "rec1", action: "noshow", confirmed: true }, {
    key: "cody", env: { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" },
    get: async () => ({ id: "rec1", fields: { Installer: "cody", City: "Omaha", "Event Date": "2026-07-03" } }),
    update: async () => ({}), create: async () => { throw new Error("boom"); }, send: async () => ({}), log: { error() {} },
  });
  assert.equal(out.status, "noshow");
  assert.equal(out.waitlisted, false);
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --test tests/installer-closeout.test.js`
Expected: FAIL (unconfirmed noshow currently sets Status; no `create`/waitlist; `out.waitlisted` undefined).

- [ ] **Step 3: Implement the no-show changes**

In `netlify/functions/installer-closeout.js`:

3a. Update the import line (add `createRecord`, `createTolerant`):
```js
const { cfg, getRecord, updateRecord, updateTolerant, createRecord, createTolerant } = require("./lib/airtable.js");
```

3b. Add a `dateOnly` helper just below the imports (after the `OWNER` const):
```js
const dateOnly = (s) => String(s == null ? "" : s).slice(0, 10);
```

3c. In `processCloseout`, add `create` to the destructured deps:
```js
  const { env = process.env, fetchImpl = fetch, now = new Date(), key,
          get = (a) => getRecord({ fetchImpl, ...a }),
          update = (a) => updateRecord({ fetchImpl, ...a }),
          create = (a) => createRecord({ fetchImpl, ...a }),
          send = sendEmail, log = console } = deps;
```

3d. Replace the entire `if (d.action === "noshow") { ... }` block with:
```js
  if (d.action === "noshow") {
    if (d.confirmed !== true) return { status: "error", error: "unconfirmed" };
    if (f.Status === "No-show") return { status: "noshow", alreadyWaitlisted: true };
    try { await update({ token: c.token, baseId: c.baseId, table: c.bookings, id: d.recordId, fields: { Status: "No-show" } }); }
    catch (e) { if (log.error) log.error("closeout noshow", e.message); return { status: "error", error: "store-unavailable" }; }
    let waitlisted = false;
    try {
      const fields = { City: f.City || "", Name: f.Name || "", Phone: f.Phone || "", Email: f.Email || "",
        Vehicle: f.Vehicle || "", Modifications: f.Modifications || "", Installer: key,
        Reason: `No-show — ${f.City || ""} ${dateOnly(f["Event Date"])}`.trim(), Source: "installer:no-show" };
      await createTolerant(create, { token: c.token, baseId: c.baseId, table: c.priority, fields }, ["Modifications", "Source"]);
      waitlisted = true;
    } catch (e) { if (log.error) log.error("closeout waitlist", e.message); }
    return { status: "noshow", waitlisted };
  }
```

3e. In `handler`, add `unconfirmed` to the 400 set:
```js
  const code = out.status !== "error" ? 200
    : out.error === "not-yours" ? 403
    : (out.error === "bad-calibration" || out.error === "missing-record" || out.error === "unconfirmed") ? 400 : 502;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/installer-closeout.test.js`
Expected: PASS (all, including the untouched complete-path tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/installer-closeout.js tests/installer-closeout.test.js
git commit -m "feat(installer): no-show adds customer to priority waitlist behind a confirmation"
```

---

## Task 4: Rewrite the console UI

**Files:**
- Modify (full rewrite): `site/installer.html`

No unit tests (client JS with no harness in this repo). Verified by loading the page.

- [ ] **Step 1: Replace `site/installer.html` in full**

Overwrite `site/installer.html` with:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Tuned Yota — Installer Console</title>
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
<link rel="icon" type="image/svg+xml" href="/fox.svg">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#3A2E26">
<style>
  :root{--ink:#3A2E26;--accent:#5B4B42;--line:#d8d2ca;--muted:#7c8472;}
  *{box-sizing:border-box;} body{font-family:-apple-system,Arial,sans-serif;color:var(--ink);margin:0;background:#faf8f5;}
  main{max-width:640px;margin:0 auto;padding:16px 14px 60px;}
  h1{font-size:19px;color:var(--accent);margin:6px 0 10px;}
  input{width:100%;padding:12px;font-size:16px;border:1px solid var(--line);border-radius:8px;}
  .btn{padding:12px;font-size:15px;font-weight:700;color:#fff;background:var(--accent);border:0;border-radius:8px;cursor:pointer;}
  .btn[disabled]{opacity:.45;}
  .link{display:inline-block;margin:2px 0 8px;color:#2f5d8a;font-size:14px;}
  .card{border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin:8px 0;background:#fff;}
  .top{display:flex;justify-content:space-between;gap:8px;font-size:14px;}
  .who{font-weight:700;} .meta{color:var(--muted);font-size:13px;margin:2px 0 6px;}
  select{padding:9px;font-size:15px;border:1px solid var(--line);border-radius:8px;width:100%;margin:6px 0;}
  .row-actions{display:flex;gap:8px;margin-top:6px;} .row-actions .btn{flex:1;}
  .ns{background:#8a6a3a;} .done{color:#2f5d2a;font-weight:700;} .noshow{color:#8a2a2a;font-weight:700;}
  .hidden{display:none;} .msg{margin-top:8px;font-size:13px;} .err{color:#8a2a2a;}
  .otthdr{font-size:11px;color:var(--muted);margin:10px 0 0;font-weight:700;text-transform:uppercase;letter-spacing:.04em;}
  .nsconfirm{display:flex;align-items:center;gap:8px;font-size:13px;margin-top:8px;color:#8a2a2a;}
  .nsconfirm input{width:auto;}
  .banner{background:#fff4e5;border:1px solid #e0b877;border-radius:10px;padding:4px 12px;margin:10px 0;}
  .mnav{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:14px 0 6px;}
  .mnav .lbl{font-weight:800;color:var(--accent);font-size:16px;}
  .mnav button{background:#fff;border:1px solid var(--line);border-radius:8px;padding:8px 14px;font-size:16px;cursor:pointer;}
  details{border:1px solid var(--line);border-radius:10px;background:#fff;margin:8px 0;}
  summary{padding:12px;font-weight:700;font-size:14px;cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:8px;}
  summary::-webkit-details-marker{display:none;}
  details[open]>summary{border-bottom:1px solid var(--line);}
  .dbody{padding:2px 12px 8px;}
  .count{color:var(--muted);font-weight:600;}
  .sec-h{font-size:12px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin:12px 0 2px;}
  .walkform input{margin:5px 0;}
</style>
</head>
<body>
<main>
  <h1>Tuned Yota — Installer Console</h1>
  <div id="gate">
    <input id="tok" type="password" autocomplete="off" placeholder="Your installer passcode">
    <div style="height:8px"></div>
    <button class="btn" id="unlock" style="width:100%">Unlock</button>
  </div>
  <div id="app" class="hidden">
    <a class="link" href="/calibration.html">Calibration reference (cal ID · TSB)</a>
    <a class="link" href="#" id="logout" style="margin-left:14px;color:#8a2a2a">Log out</a>
    <div id="needs"></div>
    <div id="monthnav"></div>
    <div id="monthbody"></div>
    <div id="msg" class="msg"></div>
  </div>
</main>
<script>
  var CAL = ["Light","Mild","Medium","Spicy","SS","Light and Mild","Mild and Medium","Medium and Spicy","Spicy and SS"];
  var TP = ["VFT","HPT","PCM","BB"];
  var CT = ["Basic","MAF","Basic + MAF","Supercharger","CARB Update","9.2 New","9.2 Update","TCM Update","Custom","K-Line"];
  var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  var STATE = { today:'', bookings:[], month:'' };

  function sel(id,list,ph){ return '<select id="'+id+'"><option value="" disabled selected>'+ph+'…</option>'+list.map(function(o){return '<option>'+o+'</option>';}).join('')+'</select>'; }
  function val(id){ var el=document.getElementById(id); return el?(el.value||'').trim():''; }
  function tok(){ return localStorage.getItem('ty_installer_token') || ''; }
  function esc(s){ var d=document.createElement('div'); d.textContent=(s==null?'':s); return d.innerHTML; }
  function ym(iso){ return (iso||'').slice(0,7); }
  function isOpen(b){ return b.status!=='Completed' && b.status!=='No-show' && b.status!=='Cancelled'; }
  function monthLabel(m){ var p=m.split('-'); return MONTHS[parseInt(p[1],10)-1]+' '+p[0]; }
  function addMonth(m,delta){ var y=parseInt(m.slice(0,4),10), mo=parseInt(m.slice(5,7),10)-1+delta; y+=Math.floor(mo/12); mo=((mo%12)+12)%12; return y+'-'+String(mo+1).padStart(2,'0'); }

  document.getElementById('unlock').onclick=function(){ var v=document.getElementById('tok').value.trim(); if(!v) return; localStorage.setItem('ty_installer_token', v); showApp(); };
  if(tok()) showApp();
  document.getElementById('logout').onclick=function(e){ e.preventDefault(); localStorage.removeItem('ty_installer_token'); location.reload(); };
  function showApp(){ document.getElementById('gate').classList.add('hidden'); document.getElementById('app').classList.remove('hidden'); load(); }
  function fail(m){ var el=document.getElementById('msg'); el.className='msg err'; el.textContent=m; }
  function clearMsg(){ var el=document.getElementById('msg'); el.className='msg'; el.textContent=''; }

  async function load(){
    document.getElementById('needs').textContent='Loading…';
    var res = await fetch('/.netlify/functions/installer-roster', { headers:{ 'x-installer-token':tok() } });
    if(res.status===401){ localStorage.removeItem('ty_installer_token'); location.reload(); return; }
    if(!res.ok){ document.getElementById('needs').textContent='Could not load roster.'; return; }
    var data = await res.json();
    STATE.today = data.today; STATE.bookings = data.bookings||[]; STATE.month = ym(data.today);
    renderAll();
  }

  function renderAll(){ renderNeeds(); renderMonthNav(); renderMonth(); }

  function eventsOf(list){
    var map={};
    list.forEach(function(b){ var k=b.city+'|'+b.dateISO; (map[k]=map[k]||{city:b.city,dateISO:b.dateISO,bookings:[]}).bookings.push(b); });
    return Object.keys(map).map(function(k){return map[k];}).sort(function(a,b){return a.dateISO.localeCompare(b.dateISO);});
  }
  function bySlot(a,b){ return String(a.slot||'').localeCompare(String(b.slot||''),undefined,{numeric:true}); }

  function renderNeeds(){
    var host=document.getElementById('needs'); host.innerHTML='';
    var open = STATE.bookings.filter(function(b){ return b.dateISO < STATE.today && isOpen(b); });
    if(!open.length) return;
    var wrap=document.createElement('div'); wrap.className='banner';
    var det=document.createElement('details'); det.open=true;
    var sum=document.createElement('summary'); sum.innerHTML='<span>⚠ '+open.length+' booking'+(open.length>1?'s':'')+' still open from past events</span><span class="count">close out ▾</span>';
    det.appendChild(sum);
    var body=document.createElement('div'); body.className='dbody';
    eventsOf(open).forEach(function(ev){
      var h=document.createElement('div'); h.className='sec-h'; h.textContent=ev.city+' · '+ev.dateISO; body.appendChild(h);
      ev.bookings.slice().sort(bySlot).forEach(function(b){ body.appendChild(rowCard(b)); });
    });
    det.appendChild(body); wrap.appendChild(det); host.appendChild(wrap);
  }

  function renderMonthNav(){
    var host=document.getElementById('monthnav'); host.innerHTML='';
    var nav=document.createElement('div'); nav.className='mnav';
    nav.innerHTML='<button id="mprev" aria-label="Previous month">◀</button><span class="lbl">'+monthLabel(STATE.month)+'</span><button id="mnext" aria-label="Next month">▶</button>';
    host.appendChild(nav);
    document.getElementById('mprev').onclick=function(){ STATE.month=addMonth(STATE.month,-1); renderMonthNav(); renderMonth(); };
    document.getElementById('mnext').onclick=function(){ STATE.month=addMonth(STATE.month,1); renderMonthNav(); renderMonth(); };
  }

  function renderMonth(){
    var host=document.getElementById('monthbody'); host.innerHTML='';
    var inMonth = STATE.bookings.filter(function(b){ return ym(b.dateISO)===STATE.month; });
    var events = eventsOf(inMonth.filter(function(b){return !b.isWalkin;}));
    var walkins = inMonth.filter(function(b){return b.isWalkin;});
    var completed = inMonth.filter(function(b){return b.status==='Completed';});
    host.appendChild(walkinBlock(eventsOf(inMonth)));
    if(!events.length && !walkins.length && !completed.length){
      var none=document.createElement('div'); none.className='meta'; none.textContent='No bookings this month.'; host.appendChild(none); return;
    }
    events.forEach(function(ev){
      var openN = ev.bookings.filter(isOpen).length;
      host.appendChild(accordion(ev.city+' · '+ev.dateISO, openN+' open · '+ev.bookings.length+' total', ev.bookings, openN>0));
    });
    if(walkins.length){ var openW=walkins.filter(isOpen).length; host.appendChild(accordion('Walk-ins this month', openW+' open · '+walkins.length+' total', walkins, openW>0)); }
    if(completed.length){ host.appendChild(accordion('Completed this month', String(completed.length), completed, false)); }
  }

  function accordion(title, countText, bookings, open){
    var det=document.createElement('details'); if(open) det.open=true;
    var sum=document.createElement('summary'); sum.innerHTML='<span>'+esc(title)+'</span><span class="count">'+esc(countText)+'</span>'; det.appendChild(sum);
    var body=document.createElement('div'); body.className='dbody';
    bookings.slice().sort(bySlot).forEach(function(b){ body.appendChild(rowCard(b)); });
    det.appendChild(body); return det;
  }

  function walkinBlock(events){
    var det=document.createElement('details');
    var sum=document.createElement('summary'); sum.innerHTML='<span>+ Add a walk-in</span><span class="count">this month</span>'; det.appendChild(sum);
    var body=document.createElement('div'); body.className='dbody walkform';
    if(!events.length){ body.innerHTML='<div class="meta">No events this month to attach a walk-in to.</div>'; det.appendChild(body); return det; }
    var opts=events.map(function(e){ return '<option value="'+esc(e.city+'|'+e.dateISO)+'">'+esc(e.city+' · '+e.dateISO)+'</option>'; }).join('');
    body.innerHTML=
      '<input id="w_name" placeholder="Customer name">'+
      '<input id="w_vehicle" placeholder="Vehicle (e.g. 2021 Tundra)">'+
      '<input id="w_phone" inputmode="tel" placeholder="Phone">'+
      '<select id="w_event">'+opts+'</select>'+
      '<button class="btn" id="w_add" style="width:100%">Add walk-in</button>';
    det.appendChild(body);
    body.querySelector('#w_add').onclick=addWalkin;
    return det;
  }

  async function addWalkin(){
    clearMsg();
    var name=val('w_name'), vehicle=val('w_vehicle'), phone=val('w_phone'), ev=val('w_event');
    if(!name){ fail('Enter the customer name.'); return; }
    if(!phone){ fail('Enter a phone number.'); return; }
    var parts=ev.split('|'), city=parts[0], dateISO=parts[1];
    var res=await fetch('/.netlify/functions/installer-walkin',{method:'POST',headers:{'Content-Type':'application/json','x-installer-token':tok()},body:JSON.stringify({city:city,dateISO:dateISO,name:name,vehicle:vehicle,phone:phone})});
    if(res.status===401){ localStorage.removeItem('ty_installer_token'); location.reload(); return; }
    var out=await res.json().catch(function(){return{};});
    if(out.status==='booked' && out.booking){ STATE.bookings.push(out.booking); renderAll(); }
    else { fail('Could not add walk-in: '+(out.error||'error '+res.status)); }
  }

  function rowCard(b){
    var c=document.createElement('div'); c.className='card'; c.id='c_'+b.id;
    var head='<div class="top"><span class="who">'+(b.slotLabel?esc(b.slotLabel)+' · ':'')+esc(b.name)+(b.isWalkin?' · walk-in':'')+'</span><span>'+esc(b.vehicle)+'</span></div>'+
      '<div class="meta">'+esc(b.phone)+(b.mods?' · '+esc(b.mods):'')+'</div>';
    if(b.status==='Completed'){ c.innerHTML=head+'<div class="done">✓ Completed'+(b.calibration?' · '+esc(b.calibration):'')+(b.vin?' · VIN '+esc(b.vin):'')+(b.tuningPlatform?' · '+esc(b.tuningPlatform)+(b.calibrationType?'/'+esc(b.calibrationType):''):'')+'</div>'; return c; }
    if(b.status==='No-show'){ c.innerHTML=head+'<div class="noshow">No-show · waitlisted</div>'; return c; }
    var opts='<option value="" disabled selected>Choose OTT Calibration…</option>'+CAL.map(function(o){return '<option>'+o+'</option>';}).join('');
    c.innerHTML=head+
      '<input id="vin_'+b.id+'" maxlength="17" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="VIN — 17 characters" style="text-transform:uppercase;margin:6px 0">'+
      '<select id="cal_'+b.id+'">'+opts+'</select>'+
      '<div class="otthdr">OTT commission report</div>'+
      sel('tp_'+b.id, TP, 'Tuning Platform')+
      sel('ct_'+b.id, CT, 'Calibration Type')+
      '<input id="ecu_'+b.id+'" autocomplete="off" spellcheck="false" placeholder="ECU ID" style="text-transform:uppercase;margin:5px 0">'+
      '<input id="gear_'+b.id+'" autocomplete="off" spellcheck="false" placeholder="Gear ratio (e.g. 4.30)" style="margin:5px 0">'+
      '<input id="mi_'+b.id+'" inputmode="numeric" autocomplete="off" placeholder="Mileage" style="margin:5px 0">'+
      '<div class="row-actions"><button class="btn" id="ok_'+b.id+'">Mark complete</button></div>'+
      '<label class="nsconfirm"><input type="checkbox" id="nsc_'+b.id+'"> Customer didn\'t show — add to waitlist</label>'+
      '<div class="row-actions"><button class="btn ns" id="ns_'+b.id+'" disabled>No-show</button></div>';
    c.querySelector('#ok_'+b.id).onclick=function(){ complete(b.id); };
    var cb=c.querySelector('#nsc_'+b.id), nsb=c.querySelector('#ns_'+b.id);
    cb.onchange=function(){ nsb.disabled=!cb.checked; };
    nsb.onclick=function(){ if(cb.checked) closeout(b.id,{action:'noshow',confirmed:true}); };
    return c;
  }

  async function complete(id){
    clearMsg();
    var vin=val('vin_'+id).toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(vin.length!==17){ fail('Enter the full 17-character VIN.'); return; }
    var cal=val('cal_'+id); if(!cal){ fail('Pick an OTT Calibration.'); return; }
    var tp=val('tp_'+id); if(!tp){ fail('Pick the Tuning Platform.'); return; }
    var ct=val('ct_'+id); if(!ct){ fail('Pick the Calibration Type.'); return; }
    var ecu=val('ecu_'+id).toUpperCase(); if(!ecu){ fail('Enter the ECU ID.'); return; }
    var gear=val('gear_'+id); if(!gear){ fail('Enter the gear ratio.'); return; }
    var mi=val('mi_'+id).replace(/[^0-9]/g,''); if(!mi){ fail('Enter the mileage.'); return; }
    closeout(id,{action:'complete',calibration:cal,vin:vin,tuningPlatform:tp,calibrationType:ct,ecuId:ecu,gearSize:gear,mileage:mi});
  }

  async function closeout(id,extra){
    clearMsg();
    var body=Object.assign({recordId:id},extra);
    var res=await fetch('/.netlify/functions/installer-closeout',{method:'POST',headers:{'Content-Type':'application/json','x-installer-token':tok()},body:JSON.stringify(body)});
    if(res.status===401){ localStorage.removeItem('ty_installer_token'); location.reload(); return; }
    var out=await res.json().catch(function(){return{};});
    var b=STATE.bookings.filter(function(x){return x.id===id;})[0];
    if(out.status==='completed'){ if(b){ b.status='Completed'; if(extra.calibration)b.calibration=extra.calibration; if(extra.vin)b.vin=extra.vin; if(extra.tuningPlatform)b.tuningPlatform=extra.tuningPlatform; if(extra.calibrationType)b.calibrationType=extra.calibrationType; } renderAll(); }
    else if(out.status==='noshow'){ if(b){ b.status='No-show'; } renderAll(); }
    else { fail('Could not save: '+(out.error||'error '+res.status)); }
  }
</script>
</body>
</html>
```

- [ ] **Step 2: Sanity-check it parses / no build breakage**

Run: `npm test`
Expected: PASS (installer.html isn't tested directly, but this confirms nothing else broke).

- [ ] **Step 3: Commit**

```bash
git add site/installer.html
git commit -m "feat(installer): action-first console — needs-close-out, month browser, inline walk-in, no-show confirm"
```

---

## Task 5: Ship & verify live

**Files:** none (deploy).

- [ ] **Step 1: Full test suite green**

Run: `npm test`
Expected: PASS (all, incl. the 3 new/updated installer suites).

- [ ] **Step 2: Push (this deploys the functions + page)**

```bash
git push origin master
```

- [ ] **Step 3: Confirm Netlify published**

Poll the roster endpoint shape (needs a real installer token — owner-run, or use a known test token). At minimum, confirm the page loads:
`curl -s https://tunedyota.com/installer.html | grep -c 'Add a walk-in'` → expect `1`.

- [ ] **Step 4: Live smoke (owner or token-holder, in browser)**

Open `https://tunedyota.com/installer.html`, unlock with an installer passcode, and confirm:
- A "⚠ N still open from past events" banner appears if there are past open bookings, and a card there can be closed out.
- Month nav (◀ ▶) switches months; current month is default.
- "+ Add a walk-in" creates a booking that appears under "Walk-ins this month".
- On an open card, "No-show" is disabled until the confirm checkbox is ticked; after no-show the card reads "No-show · waitlisted" and a Priority-list record exists.

---

## Self-Review notes
- **Spec coverage:** needs-close-out (Task 1 flat history + Task 4 banner) ✓; month browser (Task 4) ✓; walk-in quick-add (Task 2 + Task 4) ✓; no-show→waitlist+confirm (Task 3 + Task 4) ✓; ownership guard (Task 2) ✓; tests (Tasks 1-3) ✓.
- **Known minor:** `renderAll()` after a close-out collapses any open accordions (state not preserved). Acceptable v1 (YAGNI); revisit only if it annoys in the field.
- **Deviation from spec (noted):** walk-in validates ownership via market routing + date format only (no schedule-lookup for the exact event) — the UI already constrains the event to the installer's real roster events, and this keeps the endpoint decoupled from the events-sheet fetch.
