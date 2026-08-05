# CRM Contacts Directory (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an iPhone-Contacts-style directory to the installer console — one deduped person per human across Clients + Leads + Bookings, instantly searchable/sortable/filterable in the browser, tapping into the existing Customer 360.

**Architecture:** A pure dedup/merge module (`contacts-index.js`) turns per-source contributions into a lightweight index; a thin GET endpoint (`contacts.js`) reads the three tables, maps them to contributions, and returns the index (installer-auth, admin sees all / installer sees own+unassigned, mirroring Customer 360). The console loads the index once and does all search/sort/filter client-side, then reuses `openCustomerView` for detail.

**Tech Stack:** Node.js Netlify functions, Airtable REST via `listAllRecords`, `node --test` (deps-injected `list`/`fetchImpl`), vanilla-JS SPA (`site/installer.html`).

This is Phase 2 of the spec `docs/superpowers/specs/2026-08-05-console-comms-crm-hub-design.md`. Phase 1 (unified inbox) shipped. Phases 3–4 get their own plans.

## File structure

- **Create** `netlify/functions/lib/contacts-index.js` — pure logic: `normalizeName`, `personKey`, `splitName`, `buildContactIndex`. No I/O; the testable core.
- **Create** `netlify/functions/contacts.js` — GET endpoint: auth, read Clients+Leads+Bookings, map to contributions, call `buildContactIndex`, return rows. Thin I/O wrapper mirroring `customer-view.js`.
- **Create** `tests/contacts-index.test.js` — unit tests for dedup/merge/territory/shape.
- **Create** `tests/contacts.test.js` — endpoint auth (401) + integration with injected `listImpl`.
- **Modify** `site/installer.html` — a Contacts tab: `STATE` fields, `loadContacts`, `renderContacts`, and wiring into `renderTabs`/`renderAll`.

Reused (do not re-implement): `normalizePhone`/`normalizeEmail`/`toLeadView` (`lib/leads.js`), `normalizeInstallerKey` (`lib/routing.js`), `getMarket` (`lib/markets.js` — `getMarket(city)` → `{city,state,inst}` or null), `cfg`/`listAllRecords` (`lib/airtable.js`), `resolveInstaller`/`isAdmin` (`lib/installer-auth.js`), `withCors` (`lib/cors.js`), and the console's `openCustomerView({phone,email,name})`, `tok()`, `relTime`, `cap`, `esc`.

---

### Task 1: Pure helpers — `normalizeName`, `personKey`, `splitName`

**Files:**
- Create: `netlify/functions/lib/contacts-index.js`
- Test: `tests/contacts-index.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/contacts-index.test.js`:

```js
// tests/contacts-index.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeName, personKey, splitName } = require("../netlify/functions/lib/contacts-index.js");

test("normalizeName lowercases, trims, collapses whitespace", () => {
  assert.equal(normalizeName("  Aaron   Groshong "), "aaron groshong");
  assert.equal(normalizeName(null), "");
});

test("personKey prefers phone, then email, then name+vehicle", () => {
  assert.equal(personKey({ phone: "(612) 406-7117", email: "a@b.com", name: "Aaron", vehicle: "4Runner" }), "p:6124067117");
  assert.equal(personKey({ email: "A@B.com", name: "Aaron", vehicle: "4Runner" }), "e:a@b.com");
  assert.equal(personKey({ name: "Aaron", vehicle: "4Runner" }), "n:aaron|4runner");
  assert.equal(personKey({}), ""); // nothing identifies the person
});

test("splitName splits first/last, handles single and empty", () => {
  assert.deepEqual(splitName("Aaron Groshong"), { firstName: "Aaron", lastName: "Groshong" });
  assert.deepEqual(splitName("Cher"), { firstName: "Cher", lastName: "" });
  assert.deepEqual(splitName("  "), { firstName: "", lastName: "" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/contacts-index.test.js`
Expected: FAIL — cannot find module `contacts-index.js`.

- [ ] **Step 3: Create the module with the three helpers**

Create `netlify/functions/lib/contacts-index.js`:

```js
// netlify/functions/lib/contacts-index.js
// Pure dedup/merge for the console Contacts directory. Turns per-source
// contributions (Bookings, Leads, Clients) into one deduped person per human
// with a lightweight index row. No I/O — unit-tested directly.
const { normalizePhone, normalizeEmail } = require("./leads.js");

function normalizeName(s) {
  return String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, " ");
}

// Dedup key: phone (last 10) wins, else email, else name+vehicle. "" when
// nothing identifies the person (the caller drops those).
function personKey(c) {
  const p = normalizePhone(c.phone);
  if (p) return "p:" + p;
  const e = normalizeEmail(c.email);
  if (e) return "e:" + e;
  const nv = normalizeName(c.name) + "|" + normalizeName(c.vehicle);
  return nv === "|" ? "" : "n:" + nv;
}

function splitName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

module.exports = { normalizeName, personKey, splitName };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/contacts-index.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/contacts-index.js tests/contacts-index.test.js
git commit -m "feat(contacts): pure name/key/split helpers for the directory index"
```

---

### Task 2: `buildContactIndex` — dedupe, merge, territory, sort

**Files:**
- Modify: `netlify/functions/lib/contacts-index.js`
- Test: `tests/contacts-index.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/contacts-index.test.js`:

```js
const { buildContactIndex } = require("../netlify/functions/lib/contacts-index.js");

const getMarket = (city) => (String(city).toLowerCase() === "duluth" ? { city: "Duluth", state: "MN", inst: "aaron" } : null);

test("buildContactIndex merges the same person across sources into one row", () => {
  const contribs = [
    { source: "booking", recordId: "bk1", name: "Aaron Groshong", phone: "612-406-7117", vehicle: "2021 4Runner", modelYear: "2021", city: "Duluth", installer: "aaron", activityDate: "2026-07-01" },
    { source: "lead", recordId: "ld1", name: "Aaron G", phone: "(612) 406 7117", email: "aaron@x.com", city: "Duluth", installer: "aaron", activityDate: "2026-08-04" },
  ];
  const out = buildContactIndex(contribs, { getMarket });
  assert.equal(out.length, 1);
  const c = out[0];
  assert.equal(c.phone.replace(/\D/g, "").slice(-10), "6124067117");
  assert.equal(c.email, "aaron@x.com");            // filled from the lead
  assert.equal(c.firstName, "Aaron");
  assert.equal(c.lastName, "G");                   // newest (lead) name wins
  assert.equal(c.territory, "aaron");              // assigned installer
  assert.equal(c.lastActivity, "2026-08-04");      // max date
  assert.deepEqual(c.sources.bookingIds, ["bk1"]);
  assert.deepEqual(c.sources.leadIds, ["ld1"]);
});

test("buildContactIndex derives territory from city when no installer is assigned", () => {
  const out = buildContactIndex([
    { source: "lead", recordId: "ld2", name: "Pat Lee", phone: "218-555-0000", city: "Duluth", installer: "", activityDate: "2026-08-01" },
  ], { getMarket });
  assert.equal(out[0].territory, "aaron"); // from getMarket("Duluth")
});

test("buildContactIndex drops keyless contributions and sorts by last name", () => {
  const out = buildContactIndex([
    { source: "client", recordId: "c1", name: "", phone: "", email: "", vehicle: "" }, // keyless -> dropped
    { source: "lead", recordId: "l1", name: "Zed Zephyr", phone: "111", installer: "", activityDate: "2026-01-01" },
    { source: "lead", recordId: "l2", name: "Amy Adams", phone: "222", installer: "", activityDate: "2026-01-01" },
  ], { getMarket });
  assert.equal(out.length, 2);
  assert.equal(out[0].lastName, "Adams"); // alphabetical by last name
  assert.equal(out[1].lastName, "Zephyr");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/contacts-index.test.js`
Expected: FAIL — `buildContactIndex` is not a function.

- [ ] **Step 3: Implement `buildContactIndex`**

In `netlify/functions/lib/contacts-index.js`, add before `module.exports`:

```js
// Merge per-source contributions into one row per person. For scalar fields the
// most-recently-active non-empty value wins; dates take the max; source record
// ids are collected. Territory = assigned installer, else the market covering
// the city (getMarket), else "".
function buildContactIndex(contributions, { getMarket } = {}) {
  const groups = new Map();
  for (const c of contributions || []) {
    const key = personKey(c);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  const rows = [];
  for (const [key, list] of groups) {
    const byRecency = [...list].sort((a, b) => String(b.activityDate || "").localeCompare(String(a.activityDate || "")));
    const pick = (field) => { for (const c of byRecency) { if (c[field]) return c[field]; } return ""; };
    const name = pick("name");
    const installer = pick("installer");
    const city = pick("city");
    const market = installer ? null : (getMarket ? getMarket(city) : null);
    const territory = installer || (market && market.inst) || "";
    const sources = { bookingIds: [], leadIds: [], clientId: "" };
    for (const c of list) {
      if (c.source === "booking" && c.recordId) sources.bookingIds.push(c.recordId);
      else if (c.source === "lead" && c.recordId) sources.leadIds.push(c.recordId);
      else if (c.source === "client" && c.recordId) sources.clientId = c.recordId;
    }
    const lastActivity = byRecency.reduce((m, c) => (String(c.activityDate || "") > m ? String(c.activityDate || "") : m), "");
    rows.push(Object.assign({
      personKey: key, displayName: name || pick("phone") || pick("email") || "Unknown",
      phone: pick("phone"), email: pick("email"), vehicle: pick("vehicle"), modelYear: pick("modelYear"),
      city, territory, sources, lastActivity,
    }, splitName(name)));
  }
  return rows.sort((a, b) => (normalizeName(a.lastName + " " + a.firstName) < normalizeName(b.lastName + " " + b.firstName) ? -1 : 1));
}
```

And update the exports line to:

```js
module.exports = { normalizeName, personKey, splitName, buildContactIndex };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/contacts-index.test.js`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/contacts-index.js tests/contacts-index.test.js
git commit -m "feat(contacts): buildContactIndex dedupe/merge/territory"
```

---

### Task 3: `contacts.js` endpoint

**Files:**
- Create: `netlify/functions/contacts.js`
- Test: `tests/contacts.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/contacts.test.js`:

```js
// tests/contacts.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/contacts.js");

const ENV = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", INSTALLER_TOKENS: JSON.stringify({ aaron: "SECRET" }), INSTALLER_ADMINS: "aaron" };
const H = { "x-installer-token": "SECRET" };

// listImpl is called once per table; route by table name.
function mkList(env) {
  const c = require("../netlify/functions/lib/airtable.js").cfg(env);
  const bookings = [{ id: "bk1", fields: { Name: "Aaron Groshong", Phone: "612-406-7117", Vehicle: "2021 4Runner", "Model Year": "2021", City: "Duluth", Installer: "aaron", "Event Date": "2026-07-01", Status: "Completed" } }];
  const leads = [{ id: "ld1", fields: { Name: "Aaron G", Phone: "(612) 406-7117", Email: "aaron@x.com", City: "Duluth", Installer: "aaron", "Last Contact": "2026-08-04", Stage: "Qualified" } }];
  const clients = [{ id: "cl1", fields: { Email: "newbie@x.com", Vehicles: JSON.stringify([{ make: "Toyota", model: "Tacoma", year: "2023" }]) } }];
  return async ({ table }) => (table === c.bookings ? bookings : table === c.priority ? leads : clients);
}

test("contacts 401s without a valid installer token", async () => {
  const res = await handler({ httpMethod: "GET", headers: {} }, { env: ENV, listImpl: mkList(ENV) });
  assert.equal(res.statusCode, 401);
});

test("contacts dedupes across bookings+leads and includes client-only people", async () => {
  const res = await handler({ httpMethod: "GET", headers: H }, { env: ENV, listImpl: mkList(ENV) });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.status, "ok");
  const byName = Object.fromEntries(body.contacts.map((c) => [c.displayName, c]));
  // Aaron appears once (booking+lead merged by phone)
  const aaron = body.contacts.find((c) => (c.phone || "").replace(/\D/g, "").slice(-10) === "6124067117");
  assert.ok(aaron);
  assert.equal(aaron.email, "aaron@x.com");
  assert.deepEqual(aaron.sources.bookingIds, ["bk1"]);
  assert.deepEqual(aaron.sources.leadIds, ["ld1"]);
  // Client-only person (no booking/lead) still appears, keyed by email
  assert.ok(body.contacts.some((c) => c.email === "newbie@x.com" && c.vehicle.includes("Tacoma")));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/contacts.test.js`
Expected: FAIL — cannot find module `contacts.js`.

- [ ] **Step 3: Create the endpoint**

Create `netlify/functions/contacts.js`:

```js
// netlify/functions/contacts.js
// Console Contacts directory index. GET, installer-auth, read-only. Merges
// Clients + Priority List (leads) + Bookings into one deduped person each, with
// a lightweight row for instant client-side search/sort/filter. Full history is
// the separate Customer 360 (customer-view.js) on tap. Admins see everyone; a
// regular installer sees people assigned to them or not yet assigned.
const { cfg, listAllRecords } = require("./lib/airtable.js");
const { resolveInstaller, isAdmin } = require("./lib/installer-auth.js");
const { toLeadView } = require("./lib/leads.js");
const { normalizeInstallerKey } = require("./lib/routing.js");
const { getMarket } = require("./lib/markets.js");
const { buildContactIndex } = require("./lib/contacts-index.js");
const { withCors } = require("./lib/cors.js");

const dateOnly = (s) => String(s == null ? "" : s).slice(0, 10);
function parseJson(s, d) { try { const v = JSON.parse(s || ""); return v == null ? d : v; } catch { return d; } }

function bookingContribs(recs) {
  return recs.map((r) => { const f = r.fields || {}; return {
    source: "booking", recordId: r.id, name: f.Name || "", phone: f.Phone || "", email: f.Email || "",
    vehicle: f.Vehicle || "", modelYear: f["Model Year"] || "", city: f.City || "",
    installer: normalizeInstallerKey(f.Installer), activityDate: dateOnly(f["Event Date"]), status: f.Status || "Booked" };
  }).filter((b) => b.status !== "Cancelled");
}
function leadContribs(recs) {
  return recs.map(toLeadView).map((l) => ({
    source: "lead", recordId: l.id, name: l.name, phone: l.phone, email: l.email,
    vehicle: l.vehicle, modelYear: l.modelYear, city: l.city,
    installer: normalizeInstallerKey(l.installer), activityDate: l.lastContact || "" }));
}
function clientContribs(recs) {
  return recs.map((r) => { const f = r.fields || {};
    const garage = parseJson(f.Vehicles, []); const v = Array.isArray(garage) && garage[0] ? garage[0] : null;
    const name = f.Name || [f["First Name"], f["Last Name"]].filter(Boolean).join(" ");
    return { source: "client", recordId: r.id, name, phone: f.Phone || "", email: f.Email || "",
      vehicle: v ? [v.year, v.make, v.model].filter(Boolean).join(" ") : (f.Vehicle || ""),
      modelYear: (v && v.year) || "", city: f.City || "", installer: normalizeInstallerKey(f.Installer),
      activityDate: dateOnly(f["Last Activity"] || f.Created || "") }; });
}

async function handler(event, ctx = {}) {
  const env = ctx.env || process.env;
  const fetchImpl = ctx.fetchImpl || fetch;
  const list = ctx.listImpl || ((a) => listAllRecords({ fetchImpl, ...a }));
  if ((event.httpMethod || "GET") !== "GET") return { statusCode: 405, body: "method not allowed" };
  const key = resolveInstaller(event.headers || {}, env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  const admin = isAdmin(key, env);
  const c = cfg(env);
  let partial = false;
  const safe = (p) => p.catch(() => { partial = true; return []; });
  const [bk, ld, cl] = await Promise.all([
    safe(list({ token: c.token, baseId: c.baseId, table: c.bookings }).then(bookingContribs)),
    safe(list({ token: c.token, baseId: c.baseId, table: c.priority }).then(leadContribs)),
    safe(list({ token: c.token, baseId: c.baseId, table: c.clients }).then(clientContribs)),
  ]);
  let contribs = [...bk, ...ld, ...cl];
  if (!admin) contribs = contribs.filter((x) => !x.installer || x.installer === key);
  const contacts = buildContactIndex(contribs, { getMarket });
  return { statusCode: 200, headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "ok", partial, count: contacts.length, contacts }) };
}
module.exports = { handler: withCors(handler) };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/contacts.test.js`
Expected: PASS (both tests). If the 401 test fails because `withCors` intercepts OPTIONS/headers, verify `resolveInstaller` reads `x-installer-token` (it does) — no code change expected.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/contacts.js tests/contacts.test.js
git commit -m "feat(contacts): GET endpoint building the deduped directory index"
```

---

### Task 4: Console — Contacts state + loader

**Files:**
- Modify: `site/installer.html` (`STATE` init ~360-367; add a `loadContacts` near `loadChats` ~1141)

No unit test (SPA); verified live in Task 7.

- [ ] **Step 1: Add Contacts fields to STATE**

In `site/installer.html`, in the `STATE` initializer, find the line that currently ends with `chatSource:'open'` (added in Phase 1):

```js
    , chats:[], chatOpen:null, chatsLoaded:false, chatSource:'open'
```

and append the contacts fields on the next line inside the same object literal:

```js
    , chats:[], chatOpen:null, chatsLoaded:false, chatSource:'open'
    , contacts:[], contactsLoaded:false, contactQ:'', contactSort:'last', contactTerritory:''
```

- [ ] **Step 2: Add `loadContacts` next to `loadChats`**

Immediately after the `loadChats` function (ends ~line 1145), add:

```js
  async function loadContacts(){
    try{
      var res = await fetch('/.netlify/functions/contacts', { headers:{ 'x-installer-token':tok() } });
      if(!res.ok) throw new Error('contacts '+res.status);
      var j = await res.json(); STATE.contacts = j.contacts||[]; STATE.contactsLoaded = true;
    }catch(e){ STATE.contacts = []; STATE.contactsLoaded = true; }
    renderAll();
  }
```

- [ ] **Step 3: Commit**

```bash
git add site/installer.html
git commit -m "feat(contacts): console state + loader for the directory"
```

---

### Task 5: Console — `renderContacts` directory UI

**Files:**
- Modify: `site/installer.html` (add `renderContacts` near `renderChats` ~1176)

- [ ] **Step 1: Add the `renderContacts` function**

In `site/installer.html`, immediately after the `renderChats` function's closing brace, add:

```js
  function contactTerritories(){ var t={}; STATE.contacts.forEach(function(c){ if(c.territory) t[c.territory]=1; }); return Object.keys(t).sort(); }
  function renderContacts(){
    var host = document.getElementById('feed');
    var terrs = contactTerritories();
    var head = '<div class="search"><input id="contactq" type="search" autocomplete="off" placeholder="Search name, phone, email, vehicle, city…" value="'+esc(STATE.contactQ)+'"></div>'+
      '<div class="mnav">'+
        '<select id="contactterr" style="font:inherit;font-size:13px"><option value="">All territories</option>'+
          terrs.map(function(k){ return '<option value="'+esc(k)+'"'+(STATE.contactTerritory===k?' selected':'')+'>'+esc(cap(k))+'</option>'; }).join('')+'</select> '+
        '<select id="contactsort" style="font:inherit;font-size:13px"><option value="last"'+(STATE.contactSort==='last'?' selected':'')+'>Sort: Last name</option><option value="first"'+(STATE.contactSort==='first'?' selected':'')+'>Sort: First name</option></select>'+
      '</div>';
    var q = STATE.contactQ.trim().toLowerCase();
    var rows = STATE.contacts.filter(function(c){
      if(STATE.contactTerritory && c.territory!==STATE.contactTerritory) return false;
      if(!q) return true;
      return [c.displayName,c.phone,c.email,c.vehicle,c.city].join(' ').toLowerCase().indexOf(q) >= 0;
    }).slice().sort(function(a,b){
      var ka = (STATE.contactSort==='first'?(a.firstName+' '+a.lastName):(a.lastName+' '+a.firstName)).toLowerCase();
      var kb = (STATE.contactSort==='first'?(b.firstName+' '+b.lastName):(b.lastName+' '+b.firstName)).toLowerCase();
      return ka<kb?-1:ka>kb?1:0;
    });
    var listHtml = rows.length ? '<div class="card" style="padding:0;overflow:hidden">'+rows.map(function(c){
        var initial = (c.displayName||'?').trim().charAt(0).toUpperCase() || '?';
        return '<div class="crow" data-contact="'+esc(c.personKey)+'">'+
          '<div class="cava">'+esc(initial)+'</div>'+
          '<div class="cmeta"><div class="cname">'+esc(c.displayName)+
            (c.territory?' <span class="installer-tag">'+esc(cap(c.territory))+'</span>':'')+'</div>'+
          '<div class="csnip">'+esc([c.vehicle,c.city].filter(Boolean).join(' · ') || c.phone || c.email)+'</div></div>'+
          '<div class="cwhen">'+esc(relTime(c.lastActivity))+'</div>'+
          '</div>';
      }).join('')+'</div>' : '<p class="muted" style="padding:14px">'+(STATE.contactsLoaded?'No contacts match.':'Loading contacts…')+'</p>';
    host.innerHTML = head + '<div style="margin-top:6px">'+listHtml+'</div>';
    var qi = document.getElementById('contactq');
    if(qi){ qi.oninput = function(){ var pos = qi.selectionStart; STATE.contactQ = qi.value; renderContacts();
      var qi2 = document.getElementById('contactq'); if(qi2){ qi2.focus(); try{ qi2.selectionStart=qi2.selectionEnd=pos; }catch(e){} } }; }
    var ts = document.getElementById('contactterr'); if(ts) ts.onchange = function(){ STATE.contactTerritory=ts.value; renderContacts(); };
    var ss = document.getElementById('contactsort'); if(ss) ss.onchange = function(){ STATE.contactSort=ss.value; renderContacts(); };
    host.onclick = function(e){ var el = e.target.closest('[data-contact]'); if(el){
      var pk = el.getAttribute('data-contact'); var c = STATE.contacts.filter(function(x){ return x.personKey===pk; })[0];
      if(c) openCustomerView({ phone:c.phone||'', email:c.email||'', name:c.displayName||'' }); } };
  }
```

- [ ] **Step 2: Commit**

```bash
git add site/installer.html
git commit -m "feat(contacts): iPhone-style directory UI with search/sort/territory filter"
```

---

### Task 6: Console — wire the Contacts tab in

**Files:**
- Modify: `site/installer.html` (`renderAll` ~1034-1040; `renderTabs` ~1329-1343)

- [ ] **Step 1: Dispatch the Contacts tab in `renderAll`**

In `renderAll` (~1034), find:

```js
    if(STATE.tab==='chats'){ renderChats(); return; }
    if(STATE.tab==='calls'){ renderCalls(); return; }
```

and add a contacts line right after them:

```js
    if(STATE.tab==='chats'){ renderChats(); return; }
    if(STATE.tab==='calls'){ renderCalls(); return; }
    if(STATE.tab==='contacts'){ renderContacts(); return; }
```

- [ ] **Step 2: Hide the Jobs sub-tab strip on the Contacts tab**

In `renderAll` (~1037), find:

```js
    var st=document.getElementById('subtabs'); if(st) st.style.display = (STATE.tab==='leads'||STATE.tab==='chats'||STATE.tab==='calls') ? 'none' : 'flex';
```

and add `contacts` to the hide list:

```js
    var st=document.getElementById('subtabs'); if(st) st.style.display = (STATE.tab==='leads'||STATE.tab==='chats'||STATE.tab==='calls'||STATE.tab==='contacts') ? 'none' : 'flex';
```

- [ ] **Step 3: Add the Contacts tab button and lazy-load**

In `renderTabs` (~1335), change the `host.innerHTML=` line from:

```js
    host.innerHTML=tab('jobs','Jobs','')+tab('leads','Leads', due? String(due):'')+tab('chats','Chats', STATE.chats.length?String(STATE.chats.length):'')+tab('calls','Calls','');
```

to (append a Contacts tab):

```js
    host.innerHTML=tab('jobs','Jobs','')+tab('leads','Leads', due? String(due):'')+tab('chats','Chats', STATE.chats.length?String(STATE.chats.length):'')+tab('calls','Calls','')+tab('contacts','Contacts','');
```

And in the tab click handler just below it, add the contacts lazy-load next to the others:

```js
      if(STATE.tab==='leads'&&!STATE.leadsLoaded){ loadLeads(); }
      if(STATE.tab==='chats'&&!STATE.chatsLoaded){ loadChats(); }
      if(STATE.tab==='calls'&&!STATE.callsLoaded){ loadCalls(); }
      if(STATE.tab==='contacts'&&!STATE.contactsLoaded){ loadContacts(); }
```

- [ ] **Step 4: Commit**

```bash
git add site/installer.html
git commit -m "feat(contacts): wire the Contacts tab into the console nav"
```

---

### Task 7: Full test run, ship, live verification

**Files:** none (deploy + verify)

- [ ] **Step 1: Full suite green**

Run: `npm test`
Expected: all tests pass (0 fail), including the new `contacts-index` and `contacts` tests. No SEO inputs changed, so `build:seo` is not needed.

- [ ] **Step 2: Push to master (deploy)**

```bash
git push origin master
```

- [ ] **Step 3: Confirm Netlify published**

Confirm the deploy for the latest commit shows `ready` (deploys have silently skipped before):

```bash
netlify api listSiteDeploys --data '{"site_id":"47fd6491-fd07-4f6b-9e1e-20a83e164d36","per_page":3}'
```

Expected: newest deploy `state: ready`, `commit_ref` = the pushed commit.

- [ ] **Step 4: Live verify**

Verify the endpoint is live and auth-gated (should return HTTP 401 without a token):

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://tunedyota.com/.netlify/functions/contacts
```

Expected: `401`.

Then open `https://tunedyota.com/installer` (hard refresh) and confirm:
- A **Contacts** tab appears in the tab bar.
- It lists deduped people; typing in the search box filters instantly by name/phone/email/vehicle/city.
- The territory dropdown filters; the sort toggle switches last/first name order.
- Tapping a contact opens the Customer 360 overlay for that person.

- [ ] **Step 5: Mark Phase 2 complete**

Phase 2 is shippable on its own. Phases 3 (Nudges) and 4 (Purchases) are planned separately.

---

## Self-review

- **Spec coverage (Pillar 2):** everyone deduped across Clients+Leads+Bookings ✓ (Tasks 2–3, keys phone→email→name+vehicle); lightweight index ✓ (Task 2 row shape); client-side search/sort/filter ✓ (Task 5); filter by territory ✓ (Task 5 dropdown + Task 2 territory derivation) and truck model ✓ (search box matches `vehicle`); tap → Customer 360 ✓ (Task 5 `openCustomerView`); installer-auth + admin/own scoping ✓ (Task 3).
- **Placeholders:** none — every code step shows exact code and commands.
- **Type/name consistency:** `personKey`/`normalizeName`/`splitName`/`buildContactIndex` and the contribution shape (`source`/`recordId`/`name`/`phone`/`email`/`vehicle`/`modelYear`/`city`/`installer`/`activityDate`) are consistent across `contacts-index.js`, `contacts.js`, and their tests; the row shape (`personKey`/`displayName`/`firstName`/`lastName`/`phone`/`email`/`vehicle`/`city`/`territory`/`sources`/`lastActivity`) is consistent between Task 2 and the console `renderContacts`; `STATE.contacts`/`contactsLoaded`/`contactQ`/`contactSort`/`contactTerritory` match between Tasks 4–6.
- **Scope:** Phase 2 only; ships a working directory on its own.
- **Deviation noted:** territory derives from the assigned installer first, then `getMarket(city)` — the spec said "via routing.js"; `routing.js` has no city map, but `markets.js` `getMarket` is the correct existing source, and the assigned installer is a more accurate signal when present.
