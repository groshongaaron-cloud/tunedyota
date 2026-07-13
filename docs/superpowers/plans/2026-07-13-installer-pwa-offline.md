# Installer Console PWA / Offline Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/installer.html` open and work offline — the app shell + last roster are cached, and close-outs and walk-ins entered with no signal are queued locally and auto-synced when signal returns (walk-ins deduped by a client key).

**Architecture:** Phase A (read) — a dedicated installer PWA manifest, a service-worker shell cache (stale-while-revalidate, API never cached), and a localStorage roster cache with an offline banner. Phase B (write) — a testable `site/offline-queue.js` module, enqueue-on-network-failure in the console's write paths with optimistic UI, walk-in dedupe via a `Client Key` column, and flush on reconnect/load/manual/Background-Sync.

**Tech Stack:** vanilla JS + Service Worker + Cache API + localStorage in `site/installer.html`/`site/sw.js`; CommonJS Netlify Functions; `node:test`; dual browser/Node module pattern (like `site/commission-tally.js`).

**Spec:** `docs/superpowers/specs/2026-07-13-installer-pwa-offline-design.md`

**Conventions:** one test file per run (`node --test tests/<f>.test.js`); full suite `npm test`. Commit per task. Confirm `git branch --show-current` before committing. Fresh-worktree-only pre-existing failure to IGNORE: `tests/magnuson-schema-image.test.js`. The console's token lives in `localStorage['ty_installer_token']` (helper `tok()`); the shared client-module pattern = `if (typeof module !== 'undefined' && module.exports) module.exports = {...}; if (typeof window !== 'undefined') window.X = {...};`.

---

## File Structure

**Create:** `site/installer.webmanifest`, `site/offline-queue.js`, `tests/offline-queue.test.js`.
**Modify:** `site/sw.js` (shell cache + sync handler), `site/installer.html` (manifest link, SW registration, roster cache, enqueue/flush/optimistic/badge/guard), `netlify/functions/installer-walkin.js` (+ `tests/installer-walkin.test.js`).

---

## Task 1: Dedicated installer PWA manifest

**Files:** Create `site/installer.webmanifest`; Modify `site/installer.html`

- [ ] **Step 1: Create `site/installer.webmanifest`:**

```json
{
  "name": "Tuned Yota Installer",
  "short_name": "TY Installer",
  "description": "Tuned Yota installer console — roster, close-out, and certificates.",
  "start_url": "/installer.html",
  "scope": "/installer.html",
  "display": "standalone",
  "background_color": "#EDECEB",
  "theme_color": "#3A2E26",
  "icons": [
    { "src": "/icon-192.png", "type": "image/png", "sizes": "192x192" },
    { "src": "/icon-512.png", "type": "image/png", "sizes": "512x512" }
  ]
}
```

- [ ] **Step 2: Point the console at it.** In `site/installer.html` `<head>`, change the existing `<link rel="manifest" href="/site.webmanifest">` to:

```html
  <link rel="manifest" href="/installer.webmanifest">
```

(Leave every other page's `/site.webmanifest` link untouched.)

- [ ] **Step 3: Verify** the JSON parses: `node -e "JSON.parse(require('fs').readFileSync('site/installer.webmanifest','utf8')); console.log('ok')"`. Run `npm test` (unchanged).

- [ ] **Step 4: Commit**

```bash
git add site/installer.webmanifest site/installer.html
git commit -m "feat(pwa): dedicated installer manifest (installed app opens to the console)"
```

---

## Task 2: Service-worker shell cache + sync relay

**Files:** Modify `site/sw.js`

- [ ] **Step 1: Read `site/sw.js`** — note the existing `push` and `notificationclick` listeners; KEEP them verbatim. You are ADDING `install`/`activate`/`fetch`/`sync` handlers + two constants at the top.

- [ ] **Step 2: Rewrite `site/sw.js`** to this (preserve the exact existing push/notificationclick bodies where marked):

```js
// site/sw.js — Tuned Yota installer console: web push + offline shell cache.
var CACHE_VERSION = "ty-console-v1"; // bump when the SHELL list changes
var SHELL = ["/installer.html", "/commission-tally.js", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE_VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return k === CACHE_VERSION ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  var isNav = req.mode === "navigate" && url.pathname === "/installer.html";
  var isShell = isNav || SHELL.indexOf(url.pathname) >= 0;
  if (!isShell) return; // pass through the public site + all /.netlify/functions/* (never cached)
  var key = isNav ? "/installer.html" : req;
  event.respondWith(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.match(key).then(function (cached) {
        var network = fetch(req).then(function (res) {
          if (res && res.status === 200) cache.put(key, res.clone());
          return res;
        }).catch(function () { return cached; });
        return cached || network; // stale-while-revalidate
      });
    })
  );
});
// Background Sync (where supported): tell open clients to flush their offline queue.
self.addEventListener("sync", function (event) {
  if (event.tag === "ty-flush") {
    event.waitUntil(self.clients.matchAll({ includeUncontrolled: true }).then(function (list) {
      list.forEach(function (c) { c.postMessage({ type: "ty-flush" }); });
    }));
  }
});

self.addEventListener("push", function (event) {
  // <<< KEEP the existing push handler body exactly as it is in the current file >>>
});
self.addEventListener("notificationclick", function (event) {
  // <<< KEEP the existing notificationclick handler body exactly as it is >>>
});
```

Copy the real bodies of the two existing listeners into the marked spots (do not paraphrase them).

- [ ] **Step 3: Verify** — `node --check site/sw.js` (no output = valid). Run `npm test` (unchanged).

- [ ] **Step 4: Commit**

```bash
git add site/sw.js
git commit -m "feat(pwa): service-worker shell cache (stale-while-revalidate) + sync relay"
```

---

## Task 3: Register the SW on load + offline roster cache

**Files:** Modify `site/installer.html`

- [ ] **Step 1: Register the service worker on app start** (independently of push, so offline works even if notifications are never enabled). In the module script, add a helper and call it from `showApp()` (or right after `if(tok()) showApp();`):

```js
  function registerServiceWorker(){
    if(!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(function(){});
    navigator.serviceWorker.addEventListener('message', function(e){ if(e.data && e.data.type==='ty-flush') flushQueue(); });
  }
```
Call `registerServiceWorker();` once at startup (e.g. the first line of `showApp()`). (`flushQueue` is defined in Task 6; this handler is inert until then — but implement Task 6 before shipping.)

- [ ] **Step 2: Make `load()` network-first with a cached fallback + offline banner.** The current `load()` does `var res = await fetch('/.netlify/functions/installer-roster', …)`. Wrap the fetch so a NETWORK failure (throw) falls back to the cached roster:

```js
  async function load(){
    document.getElementById('feed').innerHTML='<div class="empty">Loading…</div>';
    var res;
    try {
      res = await fetch('/.netlify/functions/installer-roster', { headers:{ 'x-installer-token':tok() } });
    } catch(netErr) {
      return renderFromCache('Offline — showing your last synced roster');
    }
    if(res.status===401){ localStorage.removeItem('ty_installer_token'); location.reload(); return; }
    if(!res.ok){ document.getElementById('feed').innerHTML='<div class="empty">Could not load roster.</div>'; return; }
    var data = await res.json();
    try { localStorage.setItem('ty_roster_cache', JSON.stringify({ savedAt: Date.now(), data: data })); } catch(e){}
    clearOfflineBanner();
    applyRoster(data);
    flushQueue();   // opportunistic sync whenever we're online (defined in Task 6)
  }
```

Refactor the EXISTING body of `load()` that runs after `var data = await res.json();` (the part that sets `STATE.today/bookings/events/admin/reviewUrl/vapidPublicKey`, wires `#reviewlink`/`#pushlink`, and calls `renderAll()`) into a new function `applyRoster(data){ ... }`, and call it from both the network path (above) and the cache path. Then add:

```js
  function renderFromCache(msg){
    var raw; try { raw = localStorage.getItem('ty_roster_cache'); } catch(e){ raw = null; }
    if(!raw){ document.getElementById('feed').innerHTML='<div class="empty">Offline — no saved roster yet. Reconnect once to load it.</div>'; return; }
    var cached; try { cached = JSON.parse(raw); } catch(e){ cached = null; }
    if(!cached || !cached.data){ document.getElementById('feed').innerHTML='<div class="empty">Offline — no saved roster yet.</div>'; return; }
    showOfflineBanner(msg + (cached.savedAt ? ' (saved '+relTime(cached.savedAt)+')' : ''));
    applyRoster(cached.data);
  }
  function relTime(ms){ var s=Math.round((Date.now()-ms)/1000); if(s<60) return 'just now'; var m=Math.round(s/60); if(m<60) return m+'m ago'; var h=Math.round(m/60); if(h<24) return h+'h ago'; return Math.round(h/24)+'d ago'; }
  function showOfflineBanner(text){ var el=document.getElementById('offlinebanner'); if(!el){ el=document.createElement('div'); el.id='offlinebanner'; el.style.cssText='background:#8a6d3b;color:#fff;padding:8px 12px;border-radius:8px;margin:8px 0;font-size:14px'; var app=document.getElementById('app'); app.insertBefore(el, app.firstChild); } el.textContent='⚠ '+text; el.style.display=''; }
  function clearOfflineBanner(){ var el=document.getElementById('offlinebanner'); if(el) el.style.display='none'; }
```

- [ ] **Step 3: Verify** — extract the inline `<script>` and `node --check` it. Run `npm test` (unchanged). If `flushQueue` is not yet defined, temporarily stub `function flushQueue(){}` at module scope and REMOVE the stub in Task 6 (or implement Task 6 next before shipping). NOTE the stub in your report.

- [ ] **Step 4: Commit**

```bash
git add site/installer.html
git commit -m "feat(pwa): register SW on load + offline roster cache with banner"
```

---

## Task 4: `site/offline-queue.js` — testable queue module

**Files:** Create `site/offline-queue.js`, `tests/offline-queue.test.js`

- [ ] **Step 1: Write the failing test** — `tests/offline-queue.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Q = require("../site/offline-queue.js");

function fakeStorage() { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; }

test("makeOp builds an op with a unique clientKey and preserved payload", () => {
  const a = Q.makeOp("closeout", { recordId: "r1" });
  const b = Q.makeOp("walkin", { name: "Dana" });
  assert.equal(a.type, "closeout");
  assert.deepEqual(a.body, { recordId: "r1" });
  assert.ok(a.clientKey && typeof a.clientKey === "string");
  assert.notEqual(a.clientKey, b.clientKey);
});

test("shouldQueue: network error or 5xx yes; 4xx/2xx no", () => {
  assert.equal(Q.shouldQueue(new Error("offline"), undefined), true);
  assert.equal(Q.shouldQueue(null, 503), true);
  assert.equal(Q.shouldQueue(null, 400), false);
  assert.equal(Q.shouldQueue(null, 403), false);
  assert.equal(Q.shouldQueue(null, 200), false);
});

test("nextFlushResult classifies a replay response", () => {
  assert.equal(Q.nextFlushResult(200), "remove");
  assert.equal(Q.nextFlushResult(201), "remove");
  assert.equal(Q.nextFlushResult(401), "stop-auth");
  assert.equal(Q.nextFlushResult(0), "retry-later");      // network / unknown
  assert.equal(Q.nextFlushResult(502), "retry-later");
  assert.equal(Q.nextFlushResult(400), "drop");           // poison op
  assert.equal(Q.nextFlushResult(404), "drop");
});

test("loadQueue/saveQueue round-trip through storage", () => {
  const s = fakeStorage();
  assert.deepEqual(Q.loadQueue(s), []);
  const ops = [Q.makeOp("closeout", { recordId: "r1" })];
  Q.saveQueue(s, ops);
  assert.deepEqual(Q.loadQueue(s), ops);
});

test("loadQueue tolerates corrupt storage", () => {
  const s = fakeStorage(); s.setItem("ty_pending_ops", "{not json");
  assert.deepEqual(Q.loadQueue(s), []);
});
```

- [ ] **Step 2: Run to confirm failure** — `node --test tests/offline-queue.test.js` → FAIL (module not found).

- [ ] **Step 3: Implement** — `site/offline-queue.js`:

```js
// site/offline-queue.js — offline op-queue logic for the installer console.
// Pure + storage-injected so it unit-tests in Node and runs in the browser. The
// console wires these to fetch/localStorage/events; NO DOM or network here.
(function (root) {
  var KEY = "ty_pending_ops";

  function uuid() {
    try { if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return "op-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }
  function makeOp(type, body) { return { clientKey: uuid(), type: type, body: body || {}, ts: Date.now() }; }

  // Queue only what a retry could fix: a network failure (no response) or a 5xx.
  // Never queue a 4xx (validation/permission — it will fail again) or a 2xx (it worked).
  function shouldQueue(error, status) {
    if (error) return true;
    return !!(status && status >= 500);
  }

  // Classify a replay response during flush.
  function nextFlushResult(status) {
    if (!status) return "retry-later";          // network error / unknown → keep, retry
    if (status >= 200 && status < 300) return "remove";
    if (status === 401) return "stop-auth";     // token rejected — stop, keep queue, re-login
    if (status >= 500) return "retry-later";
    return "drop";                              // other 4xx — poison op, drop so it can't block
  }

  function loadQueue(storage) {
    try { var raw = storage.getItem(KEY); if (!raw) return []; var a = JSON.parse(raw); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function saveQueue(storage, ops) { try { storage.setItem(KEY, JSON.stringify(ops || [])); } catch (e) {} }

  var api = { KEY: KEY, makeOp: makeOp, shouldQueue: shouldQueue, nextFlushResult: nextFlushResult, loadQueue: loadQueue, saveQueue: saveQueue };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.OfflineQueue = api;
})(typeof window !== "undefined" ? window : this);
```

- [ ] **Step 4: Run tests** — `node --test tests/offline-queue.test.js` (5 pass). Then `npm test` (only `magnuson-schema-image` may fail in a worktree).

- [ ] **Step 5: Commit**

```bash
git add site/offline-queue.js tests/offline-queue.test.js
git commit -m "feat(pwa): offline op-queue module (enqueue/flush classification)"
```

---

## Task 5: Walk-in dedupe by `Client Key`

**Files:** Modify `netlify/functions/installer-walkin.js`; Test `tests/installer-walkin.test.js`

- [ ] **Step 1: Read** `netlify/functions/installer-walkin.js` (note `processWalkin(body, deps)`, the `create` dep + `createTolerant`, and the returned `booking` shape) and `tests/installer-walkin.test.js` (match its deps convention).

- [ ] **Step 2: Add failing tests** to `tests/installer-walkin.test.js`:

```js
test("a clientKey matching an existing booking returns it without creating", async () => {
  let created = false;
  const existing = { id: "recX", fields: { City: "Fargo", "Event Date": "2026-08-01", Name: "Dana", Vehicle: "Tundra", Phone: "1", Email: "", Installer: "aaron", "Client Key": "ck-1" } };
  const out = await processWalkin({ city: "fargo", name: "Dana", phone: "1", clientKey: "ck-1" },
    { key: "aaron", admin: false, list: async () => [existing], create: async () => { created = true; return {}; } });
  assert.equal(out.status, "booked");
  assert.equal(out.recordId, "recX");
  assert.equal(created, false);
});

test("a new clientKey creates and writes Client Key", async () => {
  let fields;
  const out = await processWalkin({ city: "fargo", name: "Dana", phone: "1", clientKey: "ck-2" },
    { key: "aaron", admin: false, list: async () => [], create: async (a) => { fields = a.fields; return { id: "recNew" }; } });
  assert.equal(out.status, "booked");
  assert.equal(out.recordId, "recNew");
  assert.equal(fields["Client Key"], "ck-2");
});

test("no clientKey still creates as before (no lookup required)", async () => {
  const out = await processWalkin({ city: "fargo", name: "Dana", phone: "1" },
    { key: "aaron", admin: false, list: async () => [], create: async () => ({ id: "rec3" }) });
  assert.equal(out.status, "booked");
});
```
Use a real market key the file's other tests use (`"fargo"` routes to Aaron — confirm against the existing tests). Match how the existing tests inject `create`/`env`/`now`; add a `list` dep alongside.

- [ ] **Step 3: Run to confirm failure** — `node --test tests/installer-walkin.test.js` → the dedupe/Client-Key tests FAIL.

- [ ] **Step 4: Implement.** In `installer-walkin.js`:
- Import `listRecords`: change the require to `const { cfg, createRecord, createTolerant, listRecords } = require("./lib/airtable.js");`
- Add a `list` dep to the destructure: `list = (a) => listRecords({ fetchImpl, ...a })`.
- Read `const clientKey = String(d.clientKey || "").trim();`.
- After computing `c = cfg(env)` and BEFORE the create, add a dedupe lookup (best-effort — an absent `Client Key` column just yields no match):

```js
  if (clientKey) {
    try {
      const dupes = await list({ token: c.token, baseId: c.baseId, table: c.bookings, filterByFormula: `{Client Key}="${clientKey}"` });
      if (dupes && dupes.length) {
        const g = dupes[0], gf = g.fields || {};
        return { status: "booked", recordId: g.id, booking: {
          id: g.id, city: gf.City || market.city, dateISO: String(gf["Event Date"] || dateISO).slice(0, 10),
          installer: ownerKey, slot: "", slotLabel: "", name: gf.Name || name, vehicle: gf.Vehicle || vehicle,
          phone: gf.Phone || phone, email: gf.Email || email, mods: gf.Modifications || "", status: gf.Status || "Booked",
          isWalkin: true, calibration: "", vin: "", tuningPlatform: "", calibrationType: "", ecuId: "", gearSize: "", mileage: "" } };
      }
    } catch (e) { /* column may not exist yet — fall through to create */ }
  }
```
- Add `Client Key` to the created `fields` when present, and to the `createTolerant` drop-list:
```js
  if (clientKey) fields["Client Key"] = clientKey;
  ...
  rec = await createTolerant(create, { token: c.token, baseId: c.baseId, table: c.bookings, fields }, ["Source", "Email", "Client Key"]);
```

- [ ] **Step 5: Run tests** — `node --test tests/installer-walkin.test.js` (all pass). Then `npm test`.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/installer-walkin.js tests/installer-walkin.test.js
git commit -m "feat(pwa): walk-in dedupe by Client Key (safe offline replay)"
```

---

## Task 6: Console — enqueue-on-failure, optimistic UI, flush, badge, guard

**Files:** Modify `site/installer.html` (no unit test — uses `site/offline-queue.js`). READ THE FILE FIRST.

- [ ] **Step 1: Load the queue module.** In `<head>` (next to `<script src="/commission-tally.js"></script>`), add:
```html
  <script src="/offline-queue.js"></script>
```
and add a short accessor at module scope: `function Q(){ return window.OfflineQueue; }` and `function store(){ return window.localStorage; }`.

- [ ] **Step 2: Enqueue-on-failure in `closeout(id, extra)`.** The current function does `var res=await fetch('/.netlify/functions/installer-closeout', …); if(res.status===401){…}; var out=…`. Wrap it so a network throw or a queue-worthy status enqueues instead of erroring:

```js
  async function closeout(id,extra){
    clearMsg();
    var body=Object.assign({recordId:id},extra);
    var res, netErr=null;
    try { res=await fetch('/.netlify/functions/installer-closeout',{method:'POST',headers:{'Content-Type':'application/json','x-installer-token':tok()},body:JSON.stringify(body)}); }
    catch(e){ netErr=e; }
    if(!netErr && res.status===401){ localStorage.removeItem('ty_installer_token'); location.reload(); return; }
    if(netErr || (res && Q().shouldQueue(null, res.status))){
      enqueueOp('closeout', body, id, extra);
      return;
    }
    var out=await res.json().catch(function(){return{};});
    var b=STATE.bookings.filter(function(x){return x.id===id;})[0];
    if(out.status==='completed'){ if(b){ b.status='Completed'; if(extra.calibration)b.calibration=extra.calibration; if(extra.vin)b.vin=extra.vin; if(extra.tuningPlatform)b.tuningPlatform=extra.tuningPlatform; if(extra.calibrationType)b.calibrationType=extra.calibrationType; if(extra.signature) b.signed=true; } renderAll(); }
    else if(out.status==='noshow'){ if(b){ b.status='No-show'; } renderAll(); }
    else { fail('Could not save: '+(out.error||'error '+res.status)); }
  }
```

- [ ] **Step 3: Enqueue-on-failure in `addWalkin(evt, vals)`.** Generate a `clientKey` up front, include it in the POST body, and on network failure enqueue + optimistically insert the booking. Replace the `fetch`/result handling:

```js
  async function addWalkin(evt, vals){
    clearMsg();
    var name=(vals.name||'').trim(), vehicle=(vals.vehicle||'').trim(), phone=(vals.phone||'').trim();
    var email=(vals.email||'').trim();
    if(!name){ fail('Enter the customer name.'); return; }
    if(!phone){ fail('Enter a phone number.'); return; }
    var op = Q().makeOp('walkin', { city:evt.city, dateISO:evt.dateISO, name:name, vehicle:vehicle, phone:phone, email:email, clientKey:null });
    op.body.clientKey = op.clientKey;
    var res, netErr=null;
    try { res=await fetch('/.netlify/functions/installer-walkin',{method:'POST',headers:{'Content-Type':'application/json','x-installer-token':tok()},body:JSON.stringify(op.body)}); }
    catch(e){ netErr=e; }
    if(!netErr && res.status===401){ localStorage.removeItem('ty_installer_token'); location.reload(); return; }
    if(netErr || (res && Q().shouldQueue(null, res.status))){
      queuePush(op);
      STATE.walkOpen[evt.key]=true; STATE.eventOpen[evt.key]=true;
      STATE.bookings.push(optimisticWalkin(evt, op));
      renderAll();
      succeed('Saved '+name+' — will sync when you’re back online.');
      registerBgSync();
      return;
    }
    var out=await res.json().catch(function(){return{};});
    if(out.status==='booked' && out.booking){
      STATE.walkOpen[evt.key]=true; STATE.eventOpen[evt.key]=true;
      STATE.bookings.push(out.booking); renderAll();
      succeed('✓ Added '+name+' — walk-in saved for '+evt.city+'.');
    } else {
      var er=out.error||('error '+(res?res.status:'network'));
      fail( er==='unknown-event'?'That event isn’t recognized — reload and try again.'
          : er==='not-your-market'?'That market isn’t assigned to you.'
          : er==='unknown-city'?'That city isn’t a recognized market.'
          : er==='missing-contact'?'Enter both a customer name and a phone number.'
          : 'Could not add walk-in: '+er );
    }
  }
  function optimisticWalkin(evt, op){
    return { id:'pending:'+op.clientKey, city:evt.city, dateISO:evt.dateISO, installer:'', slot:'', slotLabel:'',
      name:op.body.name, vehicle:op.body.vehicle, phone:op.body.phone, email:op.body.email, mods:'', status:'Booked',
      isWalkin:true, pendingSync:true, calibration:'', vin:'', tuningPlatform:'', calibrationType:'', ecuId:'', gearSize:'', mileage:'' };
  }
```

- [ ] **Step 4: Queue helpers + `enqueueOp` (close-out optimistic).**

```js
  function queuePush(op){ var q=Q().loadQueue(store()); q.push(op); Q().saveQueue(store(), q); renderPendingBadge(); }
  function enqueueOp(type, body, id, extra){
    var op=Q().makeOp(type, body); queuePush(op);
    if(type==='closeout'){
      var b=STATE.bookings.filter(function(x){return x.id===id;})[0];
      if(b){ if(extra.action==='noshow'){ b.status='No-show'; } else { b.status='Completed'; if(extra.calibration)b.calibration=extra.calibration; if(extra.vin)b.vin=extra.vin; if(extra.signature)b.signed=true; b.pendingSync=true; } }
      renderAll();
      succeed('Saved — will sync when you’re back online.' + (extra.signature||extra.calibration ? ' The certificate sends once synced.' : ''));
    }
    registerBgSync();
  }
```

- [ ] **Step 5: `flushQueue()` — replay oldest-first.**

```js
  var FLUSHING=false;
  async function flushQueue(){
    if(FLUSHING) return; FLUSHING=true;
    try{
      var q=Q().loadQueue(store());
      while(q.length){
        var op=q[0], url=op.type==='closeout'?'/.netlify/functions/installer-closeout':'/.netlify/functions/installer-walkin';
        var res, netErr=null;
        try{ res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-installer-token':tok()},body:JSON.stringify(op.body)}); }
        catch(e){ netErr=e; }
        var verdict = netErr ? 'retry-later' : Q().nextFlushResult(res.status);
        if(verdict==='remove' || verdict==='drop'){
          if(verdict==='drop') fail('A queued '+op.type+' could not be saved and was dropped.');
          q.shift(); Q().saveQueue(store(), q); renderPendingBadge();
        } else if(verdict==='stop-auth'){
          Q().saveQueue(store(), q); localStorage.removeItem('ty_installer_token'); location.reload(); return;
        } else { // retry-later
          break;
        }
      }
      if(!Q().loadQueue(store()).length){ /* fully synced */ if(navigator.onLine) load(); }
    } finally { FLUSHING=false; renderPendingBadge(); }
  }
```
(Guard against `flushQueue` calling `load()` which calls `flushQueue()` — the `FLUSHING` flag + the `navigator.onLine` gate + only reloading when the queue is empty prevents recursion; when `load()` re-invokes `flushQueue`, it early-returns because the queue is empty.)

- [ ] **Step 6: Pending badge + Background Sync + triggers.**

```js
  function renderPendingBadge(){
    var n=Q().loadQueue(store()).length, el=document.getElementById('pendingbadge');
    if(!el){ el=document.createElement('a'); el.id='pendingbadge'; el.href='#'; el.className='link'; el.style.cssText='margin-left:14px';
      el.onclick=function(e){ e.preventDefault(); flushQueue(); };
      var host=document.querySelector('.hdrlinks') || document.getElementById('app'); if(host) host.appendChild(el); }
    if(n>0){ el.style.display=''; el.textContent='⏳ '+n+' pending sync'; } else { el.style.display='none'; }
  }
  function registerBgSync(){
    if('serviceWorker' in navigator && 'SyncManager' in window){
      navigator.serviceWorker.ready.then(function(reg){ if(reg.sync) reg.sync.register('ty-flush').catch(function(){}); }).catch(function(){});
    }
  }
  window.addEventListener('online', flushQueue);
```
Call `renderPendingBadge();` once at startup (e.g. in `showApp()` after `registerServiceWorker()`), and locate the real header-links container class to append the badge (READ the header markup; use its actual class instead of `.hdrlinks` if different).

- [ ] **Step 7: Warn before losing unsynced work.** Add a `beforeunload` guard and intercept the logout link:

```js
  window.addEventListener('beforeunload', function(e){ if(Q().loadQueue(store()).length){ e.preventDefault(); e.returnValue=''; return ''; } });
```
And wrap the existing logout handler so it confirms when the queue is non-empty:
```js
  // replace the existing logout onclick:
  document.getElementById('logout').onclick=function(e){ e.preventDefault();
    if(Q().loadQueue(store()).length && !confirm('You have unsynced close-outs/walk-ins. Log out anyway and lose them?')) return;
    localStorage.removeItem('ty_installer_token'); location.reload(); };
```

- [ ] **Step 8: Show the ⏳ pending tag on optimistic cards.** In `bookingCard`/`rowCard`, where a booking renders, when `b.pendingSync` is truthy add a small tag (match the existing tag style, e.g. the walk-in `· walk-in` tag):
```js
      + (b.pendingSync ? ' <span class="pendtag" style="color:#8a6d3b">· ⏳ pending sync</span>' : '')
```
Insert it near the name/status line in whichever branch renders the card (open + completed). Purely display.

- [ ] **Step 9: Remove any temporary `flushQueue` stub** added in Task 3.

- [ ] **Step 10: Verify** — re-read every edit for balanced quotes/parens/braces; extract the inline `<script>` and `node --check` it (must be SYNTAX OK); confirm the localStorage token key is `ty_installer_token` throughout; `npm test` unchanged. Confirm the header-links container class you used actually exists.

- [ ] **Step 11: Commit**

```bash
git add site/installer.html
git commit -m "feat(pwa): offline queue wiring — enqueue, optimistic UI, flush, badge, guard"
```

---

## Task 7: Full suite + ship

- [ ] **Step 1:** `npm test` — all pass (existing + ~8 new: 5 offline-queue, 3 walk-in).
- [ ] **Step 2: Ship** via the `ship` skill: no SEO inputs changed (`installer.html`/`sw.js`/manifest/`offline-queue.js` aren't indexed pages), so no `build:seo` — but `npm test` must be green. Confirm branch `master`; push; confirm the Netlify deploy shows `ready`.
- [ ] **Step 3: Owner setup:** add one Airtable **Bookings** column **`Client Key`** (Single line text) for walk-in dedupe. The offline queue works without it (dedupe just inactive until added).
- [ ] **Step 4: Post-ship verification (live, on a phone):**
  - Add `/installer.html` to the Home Screen; confirm the installed app opens to the **console** (not the homepage).
  - Load once online (so the roster caches), then enable airplane mode and re-open — the app opens and shows the **cached roster** behind the offline banner.
  - Offline: close out a booking (sign or skip) → "will sync" + the card shows **⏳ pending sync** and the header shows **⏳ 1 pending sync**; log a walk-in → also pending.
  - Re-enable signal → the queue auto-flushes → the booking is Completed server-side (certificate sends) and the walk-in appears once (no duplicate). Confirm the pending badge clears.
  - With items pending, attempt Log out → confirm the warning fires.

---

## Owner inputs
1. Add Airtable **Bookings** column **`Client Key`** (Single line text) — walk-in offline-replay dedupe. No env vars. The queue + offline shell work without it; only walk-in dedupe waits on it.
