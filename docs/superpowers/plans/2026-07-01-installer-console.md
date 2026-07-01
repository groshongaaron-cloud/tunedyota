# Installer Event Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A per-installer mobile console: a live, scoped event roster with inline close-out that marks a booking Completed, records the OTT Calibration, and emails the Certificate of Calibration immediately.

**Architecture:** A token→installer auth lib, a scoped live-roster read function, a scoped close-out write function (with immediate certificate send, reusing `certificate.js`), and a static console page. Every read/write is filtered to the authenticated installer's key; close-out re-verifies record ownership server-side.

**Tech Stack:** Node CommonJS Netlify functions, `node --test` (CJS tests, DI via `fetchImpl`/`list`/`get`/`update`/`send`), Airtable via `lib/airtable.js`, Resend, `lib/certificate.js`.

**Conventions:** commit trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Emails from `Tuned Yota <events@send.tunedyota.events>`, reply-to `info@tunedyota.com`.

**File structure:**
- Modify `netlify/functions/lib/airtable.js` — add `getRecord` (single-record GET).
- Create `netlify/functions/lib/installer-auth.js` — `resolveInstaller(headers, env)`.
- Create `netlify/functions/installer-roster.js` — scoped live roster.
- Create `netlify/functions/installer-closeout.js` — scoped close-out + immediate cert.
- Create `site/installer.html` — console page (unlisted, not in sitemap).
- Tests: `tests/airtable.test.js` (extend if present, else new), `tests/installer-auth.test.js`, `tests/installer-roster.test.js`, `tests/installer-closeout.test.js`.

---

### Task 1: `getRecord` single-record fetch

**Files:** Modify `netlify/functions/lib/airtable.js`; Test `tests/airtable.test.js`.

- [ ] **Step 1: Write the failing test** — append to `tests/airtable.test.js` (create the file with the two `require` lines at top if it does not exist):

```js
test("getRecord GETs one record by id and returns its json", async () => {
  const { getRecord } = require("../netlify/functions/lib/airtable.js");
  let seenUrl;
  const fetchImpl = async (url) => { seenUrl = url; return { ok: true, json: async () => ({ id: "rec1", fields: { Name: "Jane" } }) }; };
  const out = await getRecord({ fetchImpl, token: "t", baseId: "appX", table: "Bookings", id: "rec1" });
  assert.equal(out.id, "rec1");
  assert.match(seenUrl, /appX\/Bookings\/rec1$/);
});

test("getRecord throws on non-ok", async () => {
  const { getRecord } = require("../netlify/functions/lib/airtable.js");
  const fetchImpl = async () => ({ ok: false, status: 404 });
  await assert.rejects(getRecord({ fetchImpl, token: "t", baseId: "b", table: "Bookings", id: "x" }), /airtable get 404/);
});
```

If `tests/airtable.test.js` doesn't exist, start it with:
```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
```

- [ ] **Step 2: Run it, expect FAIL** — `node --test tests/airtable.test.js` (getRecord undefined).

- [ ] **Step 3: Implement** — in `netlify/functions/lib/airtable.js`, add after `updateRecord` (before `createTolerant`):

```js
async function getRecord({ fetchImpl = fetch, token, baseId, table, id }) {
  const url = `${API}/${baseId}/${encodeURIComponent(table)}/${id}`;
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`airtable get ${res.status}`);
  return res.json();
}
```
and add `getRecord` to `module.exports`:
```js
module.exports = { cfg, listRecords, createRecord, createTolerant, updateRecord, listAllRecords, getRecord };
```

- [ ] **Step 4: Run it, expect PASS** — `node --test tests/airtable.test.js`.

- [ ] **Step 5: Commit** — `git add netlify/functions/lib/airtable.js tests/airtable.test.js && git commit -m "feat(airtable): getRecord single-record fetch" -m "<trailer>"`.

---

### Task 2: Installer auth

**Files:** Create `netlify/functions/lib/installer-auth.js`; Test `tests/installer-auth.test.js`.

- [ ] **Step 1: Write the failing test** — `tests/installer-auth.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { resolveInstaller } = require("../netlify/functions/lib/installer-auth.js");

const env = { INSTALLER_TOKENS: JSON.stringify({ aaron: "AA", noah: "NN", cody: "CC" }) };

test("maps a matching token to its installer key", () => {
  assert.equal(resolveInstaller({ "x-installer-token": "NN" }, env), "noah");
  assert.equal(resolveInstaller({ "x-installer-token": "CC" }, env), "cody");
});
test("unknown or blank token → null", () => {
  assert.equal(resolveInstaller({ "x-installer-token": "zz" }, env), null);
  assert.equal(resolveInstaller({}, env), null);
});
test("fail-closed on unset or garbage env", () => {
  assert.equal(resolveInstaller({ "x-installer-token": "NN" }, {}), null);
  assert.equal(resolveInstaller({ "x-installer-token": "NN" }, { INSTALLER_TOKENS: "{bad json" }), null);
});
```

- [ ] **Step 2: Run it, expect FAIL** — `node --test tests/installer-auth.test.js`.

- [ ] **Step 3: Implement** — `netlify/functions/lib/installer-auth.js`:

```js
// netlify/functions/lib/installer-auth.js
// Maps an x-installer-token header to an installer key using the INSTALLER_TOKENS
// JSON env map {"aaron":"…","noah":"…","cody":"…"}. Fail-closed.
function resolveInstaller(headers, env) {
  const raw = env && env.INSTALLER_TOKENS;
  if (!raw) return null;
  let map;
  try { map = JSON.parse(raw); } catch { return null; }
  const got = (headers["x-installer-token"] || headers["X-Installer-Token"] || "").toString();
  if (!got) return null;
  for (const [key, secret] of Object.entries(map)) {
    if (secret && got === secret) return key;
  }
  return null;
}
module.exports = { resolveInstaller };
```

- [ ] **Step 4: Run it, expect PASS** — `node --test tests/installer-auth.test.js`.

- [ ] **Step 5: Commit** — `git add netlify/functions/lib/installer-auth.js tests/installer-auth.test.js && git commit -m "feat(installer): token->installer auth (fail-closed)" -m "<trailer>"`.

---

### Task 3: Scoped live roster

**Files:** Create `netlify/functions/installer-roster.js`; Test `tests/installer-roster.test.js`.

- [ ] **Step 1: Write the failing test** — `tests/installer-roster.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildRoster } = require("../netlify/functions/installer-roster.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };

test("scopes to the installer, drops past events, groups + sorts", async () => {
  let formula;
  const list = async (a) => {
    formula = a.filterByFormula;
    return [
      { id: "r1", fields: { City: "Omaha", "Event Date": "2026-07-03", Slot: "9:40", Name: "B", Vehicle: "Tundra", Installer: "cody", Status: "Booked" } },
      { id: "r2", fields: { City: "Omaha", "Event Date": "2026-07-03", Slot: "9:00", Name: "A", Vehicle: "Tacoma", Installer: "cody", Status: "Booked" } },
      { id: "r3", fields: { City: "Lincoln", "Event Date": "2020-01-01", Slot: "9:00", Name: "Old", Installer: "cody", Status: "Booked" } }, // past → dropped
    ];
  };
  const out = await buildRoster({ env, key: "cody", now: new Date("2026-07-03T12:00:00Z"), list });
  assert.match(formula, /\{Installer\}="cody"/);
  assert.match(formula, /\{Status\}!="Cancelled"/);
  assert.equal(out.installer, "cody");
  assert.equal(out.events.length, 1);                 // Lincoln (past) dropped
  assert.equal(out.events[0].city, "Omaha");
  assert.equal(out.events[0].bookings[0].name, "A");  // sorted by slot: 9:00 before 9:40
  assert.equal(out.events[0].bookings[0].slotLabel, "9:00 AM");
});
```

- [ ] **Step 2: Run it, expect FAIL** — `node --test tests/installer-roster.test.js`.

- [ ] **Step 3: Implement** — `netlify/functions/installer-roster.js`:

```js
// netlify/functions/installer-roster.js
// Live, per-installer event roster. Scoped to the authenticated installer's key.
const { cfg, listRecords } = require("./lib/airtable.js");
const { resolveInstaller } = require("./lib/installer-auth.js");
const { formatSlot } = require("./lib/slots.js");

const dateOnly = (s) => String(s == null ? "" : s).slice(0, 10);
const bySlot = (a, b) => String(a.slot || "").localeCompare(String(b.slot || ""), undefined, { numeric: true });

async function buildRoster(deps) {
  const { env = process.env, fetchImpl = fetch, now = new Date(), key,
          list = (a) => listRecords({ fetchImpl, ...a }) } = deps;
  const c = cfg(env);
  const recs = await list({ token: c.token, baseId: c.baseId, table: c.bookings,
    filterByFormula: `AND({Installer}="${key}",{Status}!="Cancelled")` });
  const today = now.toISOString().slice(0, 10);
  const rows = recs.map((r) => ({ ...r.fields, id: r.id })).filter((f) => dateOnly(f["Event Date"]) >= today);
  const events = new Map();
  for (const f of rows) {
    const ek = `${f.City}|${dateOnly(f["Event Date"])}`;
    if (!events.has(ek)) events.set(ek, { city: f.City, dateISO: dateOnly(f["Event Date"]), bookings: [] });
    events.get(ek).bookings.push({
      id: f.id, slot: f.Slot || "", slotLabel: f.Slot ? formatSlot(f.Slot) : "",
      name: f.Name || "", vehicle: f.Vehicle || "", phone: f.Phone || "", email: f.Email || "",
      mods: f.Modifications || "", status: f.Status || "Booked", calibration: f["OTT Calibration"] || "",
    });
  }
  const out = [...events.values()].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  out.forEach((e) => e.bookings.sort(bySlot));
  return { installer: key, events: out };
}

async function handler(event) {
  const key = resolveInstaller(event.headers || {}, process.env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  try {
    const out = await buildRoster({ key });
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
  } catch (e) { return { statusCode: 502, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: e.message }) }; }
}
module.exports = { handler, buildRoster };
```

- [ ] **Step 4: Run it, expect PASS** — `node --test tests/installer-roster.test.js`.

- [ ] **Step 5: Commit** — `git add netlify/functions/installer-roster.js tests/installer-roster.test.js && git commit -m "feat(installer): live scoped event roster" -m "<trailer>"`.

---

### Task 4: Scoped close-out + immediate certificate

**Files:** Create `netlify/functions/installer-closeout.js`; Test `tests/installer-closeout.test.js`.

- [ ] **Step 1: Write the failing test** — `tests/installer-closeout.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processCloseout } = require("../netlify/functions/installer-closeout.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", RESEND_API_KEY: "k" };
const recFor = (installer, extra = {}) => ({ id: "rec1", fields: { Installer: installer, Name: "Jane", Vehicle: "Tundra", ...extra } });

test("refuses a booking that belongs to another installer (403 shape)", async () => {
  const out = await processCloseout({ recordId: "rec1", action: "complete", calibration: "Spicy" },
    { env, key: "noah", get: async () => recFor("cody"), update: async () => ({}), send: async () => ({}) });
  assert.equal(out.status, "error");
  assert.equal(out.error, "not-yours");
});

test("complete requires a valid calibration", async () => {
  const out = await processCloseout({ recordId: "rec1", action: "complete", calibration: "Nope" },
    { env, key: "cody", get: async () => recFor("cody"), update: async () => ({}), send: async () => ({}) });
  assert.equal(out.error, "bad-calibration");
});

test("complete sets fields, sends the cert, marks Certificate Sent", async () => {
  const updates = []; let sent = null;
  const out = await processCloseout({ recordId: "rec1", action: "complete", calibration: "Medium and Spicy" },
    { env, key: "cody", now: new Date("2026-07-03T12:00:00Z"),
      get: async () => recFor("cody"),
      update: async (a) => { updates.push(a.fields); return {}; },
      send: async (m) => { sent = m; return { ok: true }; } });
  assert.equal(out.status, "completed");
  assert.equal(out.certSent, true);
  assert.equal(updates[0].Status, "Completed");
  assert.equal(updates[0]["OTT Calibration"], "Medium and Spicy");
  assert.equal(updates[0]["Calibration Date"], "2026-07-03");
  assert.equal(updates[1]["Certificate Sent"], true);       // second update after send
  assert.equal(sent.to, "cody@tunedyota.com");              // routed to the installer
  assert.ok(sent.attachments && sent.attachments[0].filename === "certificate.html");
});

test("noshow just sets Status", async () => {
  const updates = [];
  const out = await processCloseout({ recordId: "rec1", action: "noshow" },
    { env, key: "cody", get: async () => recFor("cody"), update: async (a) => { updates.push(a.fields); return {}; }, send: async () => ({}) });
  assert.equal(out.status, "noshow");
  assert.equal(updates[0].Status, "No-show");
});

test("a cert-send failure still leaves the booking Completed, certSent false", async () => {
  const updates = [];
  const out = await processCloseout({ recordId: "rec1", action: "complete", calibration: "Light" },
    { env, key: "cody", get: async () => recFor("cody"),
      update: async (a) => { updates.push(a.fields); return {}; },
      send: async () => { throw new Error("resend down"); }, log: { error() {} } });
  assert.equal(out.status, "completed");
  assert.equal(out.certSent, false);
  assert.equal(updates[0].Status, "Completed");             // completion persisted
  assert.ok(!updates.some((u) => u["Certificate Sent"]));   // never marked sent
});
```

- [ ] **Step 2: Run it, expect FAIL** — `node --test tests/installer-closeout.test.js`.

- [ ] **Step 3: Implement** — `netlify/functions/installer-closeout.js`:

```js
// netlify/functions/installer-closeout.js
// Per-installer close-out: mark a booking Completed (+ OTT Calibration) or No-show.
// On completion, emails the Certificate of Calibration immediately (daily
// certificate-dispatch backstops any send failure). Ownership is re-checked server-side.
const { cfg, getRecord, updateRecord } = require("./lib/airtable.js");
const { resolveInstaller } = require("./lib/installer-auth.js");
const { keyToInstaller } = require("./lib/routing.js");
const { buildCertificate, certSerial, CAL_OPTIONS } = require("./lib/certificate.js");
const { sendEmail } = require("./lib/resend.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";

async function processCloseout(body, deps) {
  const { env = process.env, fetchImpl = fetch, now = new Date(), key,
          get = (a) => getRecord({ fetchImpl, ...a }),
          update = (a) => updateRecord({ fetchImpl, ...a }),
          send = sendEmail, log = console } = deps;
  const d = body || {};
  if (!d.recordId) return { status: "error", error: "missing-record" };
  const c = cfg(env);

  let rec;
  try { rec = await get({ token: c.token, baseId: c.baseId, table: c.bookings, id: d.recordId }); }
  catch (e) { if (log.error) log.error("closeout get", e.message); return { status: "error", error: "store-unavailable" }; }
  const f = (rec && rec.fields) || {};
  if (f.Installer !== key) return { status: "error", error: "not-yours" };

  if (d.action === "noshow") {
    try { await update({ token: c.token, baseId: c.baseId, table: c.bookings, id: d.recordId, fields: { Status: "No-show" } }); }
    catch (e) { if (log.error) log.error("closeout noshow", e.message); return { status: "error", error: "store-unavailable" }; }
    return { status: "noshow" };
  }

  // complete
  const calibration = String(d.calibration || "").trim();
  if (!CAL_OPTIONS.includes(calibration)) return { status: "error", error: "bad-calibration" };
  const issueDate = now.toISOString().slice(0, 10);
  try {
    await update({ token: c.token, baseId: c.baseId, table: c.bookings, id: d.recordId,
      fields: { Status: "Completed", "OTT Calibration": calibration, "Calibration Date": issueDate } });
  } catch (e) { if (log.error) log.error("closeout complete", e.message); return { status: "error", error: "store-unavailable" }; }

  let certSent = false;
  try {
    const inst = keyToInstaller(f.Installer);
    const certNo = certSerial(d.recordId, issueDate, issueDate);
    const { subject, html } = buildCertificate({
      name: f.Name, vehicle: f.Vehicle, calibration, installer: inst.name,
      installerRegion: inst.region, calibrationDate: issueDate, certNo, issueDate });
    await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: inst.email,
      cc: inst.email === OWNER ? undefined : OWNER, replyTo: OWNER, subject,
      text: `Attached is the Tuned Yota Certificate of Calibration for ${f.Name || "your customer"}. Open certificate.html, confirm the OTT Calibration, then Print -> Save as PDF and send it to the customer.`,
      attachments: [{ filename: "certificate.html", content: Buffer.from(html).toString("base64") }] });
    await update({ token: c.token, baseId: c.baseId, table: c.bookings, id: d.recordId, fields: { "Certificate Sent": true } });
    certSent = true;
  } catch (e) { if (log.error) log.error("closeout cert", e.message); }

  return { status: "completed", certSent };
}

async function handler(event) {
  const key = resolveInstaller(event.headers || {}, process.env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  const out = await processCloseout(body, { key });
  const code = out.status !== "error" ? 200
    : out.error === "not-yours" ? 403
    : (out.error === "bad-calibration" || out.error === "missing-record") ? 400 : 502;
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, processCloseout };
```

- [ ] **Step 4: Run it, expect PASS** — `node --test tests/installer-closeout.test.js` (5 tests).

- [ ] **Step 5: Commit** — `git add netlify/functions/installer-closeout.js tests/installer-closeout.test.js && git commit -m "feat(installer): scoped close-out with immediate certificate" -m "<trailer>"`.

---

### Task 5: Console page

**Files:** Create `site/installer.html` (unlisted; NOT in `HEAD_PAGES`/sitemap).

- [ ] **Step 1: Create `site/installer.html`:**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Tuned Yota — Installer Console</title>
<style>
  :root{--ink:#3A2E26;--accent:#5B4B42;--line:#d8d2ca;--muted:#7c8472;}
  *{box-sizing:border-box;} body{font-family:-apple-system,Arial,sans-serif;color:var(--ink);margin:0;background:#faf8f5;}
  main{max-width:640px;margin:0 auto;padding:16px 14px 60px;}
  h1{font-size:19px;color:var(--accent);margin:6px 0 10px;}
  h2{font-size:16px;color:var(--accent);margin:20px 0 6px;border-bottom:1px solid var(--line);padding-bottom:4px;}
  input{width:100%;padding:12px;font-size:16px;border:1px solid var(--line);border-radius:8px;}
  .btn{padding:12px;font-size:15px;font-weight:700;color:#fff;background:var(--accent);border:0;border-radius:8px;}
  .link{display:inline-block;margin:2px 0 8px;color:#2f5d8a;font-size:14px;}
  .card{border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin:8px 0;background:#fff;}
  .top{display:flex;justify-content:space-between;gap:8px;font-size:14px;}
  .who{font-weight:700;} .meta{color:var(--muted);font-size:13px;margin:2px 0 6px;}
  select{padding:9px;font-size:15px;border:1px solid var(--line);border-radius:8px;width:100%;margin:6px 0;}
  .row-actions{display:flex;gap:8px;} .row-actions .btn{flex:1;}
  .ns{background:#8a6a3a;} .done{color:#2f5d2a;font-weight:700;} .noshow{color:#8a2a2a;font-weight:700;}
  .hidden{display:none;} .msg{margin-top:8px;font-size:13px;} .err{color:#8a2a2a;}
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
    <a class="link" href="/intake.html">+ Add a walk-in (intake form)</a>
    <div id="events"></div>
    <div id="msg" class="msg"></div>
  </div>
</main>
<script>
  var CAL = ["Light","Mild","Medium","Spicy","SS","Light and Mild","Mild and Medium","Medium and Spicy","Spicy and SS"];
  function tok(){ return localStorage.getItem('ty_installer_token') || ''; }
  function esc(s){ var d=document.createElement('div'); d.textContent=(s==null?'':s); return d.innerHTML; }

  document.getElementById('unlock').onclick=function(){
    var v=document.getElementById('tok').value.trim(); if(!v) return;
    localStorage.setItem('ty_installer_token', v); showApp();
  };
  if(tok()) showApp();

  function showApp(){ document.getElementById('gate').classList.add('hidden'); document.getElementById('app').classList.remove('hidden'); load(); }
  function fail(m){ var el=document.getElementById('msg'); el.className='msg err'; el.textContent=m; }

  async function load(){
    document.getElementById('events').innerHTML='Loading…';
    var res = await fetch('/.netlify/functions/installer-roster', { headers:{ 'x-installer-token':tok() } });
    if(res.status===401){ localStorage.removeItem('ty_installer_token'); location.reload(); return; }
    if(!res.ok){ document.getElementById('events').textContent='Could not load roster.'; return; }
    var data = await res.json();
    render(data);
  }

  function render(data){
    var host=document.getElementById('events'); host.innerHTML='';
    if(!data.events.length){ host.textContent='No upcoming events assigned to you.'; return; }
    data.events.forEach(function(ev){
      var h=document.createElement('h2'); h.textContent=ev.city+' · '+ev.dateISO; host.appendChild(h);
      ev.bookings.forEach(function(b){ host.appendChild(rowCard(b)); });
    });
  }

  function rowCard(b){
    var c=document.createElement('div'); c.className='card'; c.id='c_'+b.id;
    var head='<div class="top"><span class="who">'+(b.slotLabel?esc(b.slotLabel)+' · ':'')+esc(b.name)+'</span><span>'+esc(b.vehicle)+'</span></div>'+
      '<div class="meta">'+esc(b.phone)+(b.mods?' · '+esc(b.mods):'')+'</div>';
    if(b.status==='Completed'){ c.innerHTML=head+'<div class="done">✓ Completed'+(b.calibration?' · '+esc(b.calibration):'')+'</div>'; return c; }
    if(b.status==='No-show'){ c.innerHTML=head+'<div class="noshow">No-show</div>'; return c; }
    var opts='<option value="" disabled selected>Choose OTT Calibration…</option>'+CAL.map(function(o){return '<option>'+o+'</option>';}).join('');
    c.innerHTML=head+'<select id="cal_'+b.id+'">'+opts+'</select>'+
      '<div class="row-actions"><button class="btn" id="ok_'+b.id+'">Mark complete</button>'+
      '<button class="btn ns" id="ns_'+b.id+'">No-show</button></div>';
    c.querySelector('#ok_'+b.id).onclick=function(){ complete(b.id); };
    c.querySelector('#ns_'+b.id).onclick=function(){ closeout(b.id,{action:'noshow'}); };
    return c;
  }

  async function complete(id){
    var cal=document.getElementById('cal_'+id).value;
    if(!cal){ fail('Pick a calibration first.'); return; }
    closeout(id,{action:'complete',calibration:cal});
  }
  async function closeout(id,extra){
    var body=Object.assign({recordId:id},extra);
    var res=await fetch('/.netlify/functions/installer-closeout',{method:'POST',headers:{'Content-Type':'application/json','x-installer-token':tok()},body:JSON.stringify(body)});
    if(res.status===401){ localStorage.removeItem('ty_installer_token'); location.reload(); return; }
    var out=await res.json().catch(function(){return{};});
    var card=document.getElementById('c_'+id);
    if(out.status==='completed'){ card.querySelector('select').classList.add('hidden'); card.querySelector('.row-actions').classList.add('hidden');
      var d=document.createElement('div'); d.className='done'; d.textContent='✓ Completed · '+(out.certSent?'certificate sent':'certificate will send shortly'); card.appendChild(d); }
    else if(out.status==='noshow'){ card.querySelector('.row-actions').classList.add('hidden'); if(card.querySelector('select')) card.querySelector('select').classList.add('hidden');
      var n=document.createElement('div'); n.className='noshow'; n.textContent='No-show'; card.appendChild(n); }
    else { fail('Could not save: '+(out.error||'error '+res.status)); }
  }
</script>
</body>
</html>
```

- [ ] **Step 2: Verify wiring + not in sitemap:**

Run: `node -e "const h=require('fs').readFileSync('site/installer.html','utf8'); if(!/x-installer-token/.test(h)||!/installer-roster/.test(h)||!/installer-closeout/.test(h)) throw new Error('missing wiring'); console.log('installer.html OK')"`
Expected: `installer.html OK`
Run: `grep -c "installer" scripts/lib/seo-data.mjs || true`
Expected: `0` (must stay out of the sitemap; do not add to HEAD_PAGES).

- [ ] **Step 3: Commit** — `git add site/installer.html && git commit -m "feat(installer): mobile console page (live roster + close-out)" -m "<trailer>"`.

---

### Task 6: Full suite + build check

- [ ] **Step 1:** `npm test` → all pass (new: airtable getRecord, installer-auth, installer-roster, installer-closeout).
- [ ] **Step 2:** `npm run build:seo` → "seo build complete"; if only `site/sitemap.xml`'s date changed, `git checkout site/sitemap.xml` (no SEO inputs changed here).

---

### Task 7: Ship + set INSTALLER_TOKENS

- [ ] **Step 1: Generate three tokens + set the env var** (Claude runs; keep the map handy for the owner):

```bash
node -e "const c=require('crypto');const m={aaron:c.randomBytes(12).toString('base64url'),noah:c.randomBytes(12).toString('base64url'),cody:c.randomBytes(12).toString('base64url')};console.log(JSON.stringify(m));"
```
Then `netlify env:set INSTALLER_TOKENS '<the JSON map>'` (single-quote the JSON).

- [ ] **Step 2: Deploy** — `git push origin master`.
- [ ] **Step 3: Confirm Netlify `ready`** for the new commit, then smoke-test:
  - `curl -s -o /dev/null -w "%{http_code}\n" https://tunedyota.com/installer.html` → `200`
  - `curl -s -o /dev/null -w "%{http_code}\n" https://tunedyota.com/.netlify/functions/installer-roster` → `401`
  - `curl -s -X POST https://tunedyota.com/.netlify/functions/installer-closeout -d '{}' -w "%{http_code}\n" -o /dev/null` → `401`
- [ ] **Step 4:** Give the owner the console URL (`/installer.html`) and each installer's passcode (aaron/noah/cody) out-of-band.

---

## Self-review notes

- **Spec coverage:** auth (T2), scoped live roster (T3), scoped close-out + immediate cert + ownership 403 + backstop-on-failure (T4), console page with per-row calibration + complete/no-show + walk-in link (T5), `getRecord` helper (T1), ship + tokens (T7), regression (T6). All spec sections mapped.
- **Type/name consistency:** `resolveInstaller(headers, env)`, `buildRoster(deps{key,list,now,env})`, `processCloseout(body, deps{key,get,update,send,now,env})` consistent between impl + tests. `CAL_OPTIONS` imported from `certificate.js` (single source; page mirrors the 9 with a keep-in-sync comment). `getRecord` signature matches `airtable.js` style. Field names `Status`/`OTT Calibration`/`Calibration Date`/`Certificate Sent`/`Installer` match the schema + `certificate-dispatch.js`.
- **Placeholders:** none — every step has full code or an exact command.
- **Security:** roster scoped by formula to `Installer=key`; close-out re-fetches the record and 403s unless `Installer === key`; page renders server data via `textContent`/`esc`; endpoints 401 without a valid token.
