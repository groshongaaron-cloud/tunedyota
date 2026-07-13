# Web Push (Browser Console) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver web push to installers' phone browsers — a service worker + VAPID subscription + a `web-push` send lib + enable/self-test UI, plus four non-blocking triggers (new booking, day-of roster, cert held, monthly report due).

**Architecture:** Browser-native Push API + `site/sw.js` service worker; subscriptions stored in a "Web Push Subs" Airtable table; `lib/webpush.js` sends via the `web-push` library (VAPID). Parallel to the dormant FCM path. Each trigger adds one non-blocking `sendWebPush` at an existing hook.

**Tech Stack:** Node (Netlify Functions), **`web-push`** (new dep), Airtable via `lib/airtable.js`, `node:test`, service worker + Push API in the console.

**Spec:** `docs/superpowers/specs/2026-07-13-web-push-console-design.md`

**Conventions:** one test file `node --test tests/<f>.test.js`; full suite `npm test`. Commit per task. Confirm `git branch --show-current` before committing. Fresh-worktree-only pre-existing failure to ignore: `tests/magnuson-schema-image.test.js`. Reused: `cfg`/`listRecords`/`createRecord`/`updateRecord`/`deleteRecord` from `lib/airtable.js`; `resolveInstaller`/`isAdmin` from `lib/installer-auth.js`. Trigger hosts already inject their deps (e.g. `book-background` `processNotifications`, `event-reminders` `runReminders`, `certificate-dispatch` `dispatchCertificates`, `ott-report-reminder` `runOttReminder`).

---

## File Structure

**Create:** `netlify/functions/lib/webpush.js`, `netlify/functions/push-subscribe.js`, `netlify/functions/push-test.js`, `site/sw.js`; tests `tests/webpush.test.js`, `tests/push-subscribe.test.js`, `tests/push-test.test.js`.
**Modify:** `package.json` (+`web-push`), `netlify/functions/installer-roster.js` (+`vapidPublicKey`), `site/installer.html` (enable/test UI), and the four trigger hosts: `book-background.js`, `event-reminders.js`, `certificate-dispatch.js`, `ott-report-reminder.js`.

---

## Task 1: Add `web-push` + `lib/webpush.js` send helper

**Files:** `package.json`; Create `netlify/functions/lib/webpush.js`, `tests/webpush.test.js`

- [ ] **Step 1: Add the dependency**

Run: `npm install web-push` (adds it to `package.json` dependencies + `package-lock`/`node_modules`).

- [ ] **Step 2: Write the failing test** — `tests/webpush.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { sendWebPush } = require("../netlify/functions/lib/webpush.js");

const env = { VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv", VAPID_SUBJECT: "mailto:info@tunedyota.com" };

test("no subscriptions -> no-op, no send", async () => {
  let calls = 0;
  const out = await sendWebPush("aaron", { title: "a", body: "b" }, { env, listSubs: async () => [], send: async () => { calls++; } });
  assert.deepEqual(out, { sent: 0, failed: 0 });
  assert.equal(calls, 0);
});

test("no VAPID env -> no-op", async () => {
  const out = await sendWebPush("aaron", { title: "a", body: "b" }, { env: {}, listSubs: async () => [{ id: "1", sub: {} }], send: async () => {} });
  assert.deepEqual(out, { sent: 0, failed: 0 });
});

test("sends one per subscription with the right payload", async () => {
  const sent = [];
  const out = await sendWebPush("aaron", { title: "Roster", body: "Fargo", url: "/x" },
    { env, listSubs: async () => [{ id: "1", sub: { endpoint: "e1" } }, { id: "2", sub: { endpoint: "e2" } }],
      send: async (sub, payload) => { sent.push({ sub, payload }); } });
  assert.deepEqual(out, { sent: 2, failed: 0 });
  const p = JSON.parse(sent[0].payload);
  assert.equal(p.title, "Roster"); assert.equal(p.body, "Fargo"); assert.equal(p.url, "/x");
});

test("a 410 deletes the expired subscription", async () => {
  const deleted = [];
  const out = await sendWebPush("aaron", { title: "a", body: "b" },
    { env, listSubs: async () => [{ id: "dead", sub: { endpoint: "e" } }],
      send: async () => { const e = new Error("gone"); e.statusCode = 410; throw e; },
      del: async (id) => { deleted.push(id); }, log: { error() {} } });
  assert.deepEqual(out, { sent: 0, failed: 1 });
  assert.deepEqual(deleted, ["dead"]);
});

test("a non-expiry failure is counted, not thrown, sub kept", async () => {
  const deleted = [];
  const out = await sendWebPush("aaron", { title: "a", body: "b" },
    { env, listSubs: async () => [{ id: "x", sub: {} }],
      send: async () => { const e = new Error("500"); e.statusCode = 500; throw e; },
      del: async (id) => { deleted.push(id); }, log: { error() {} } });
  assert.deepEqual(out, { sent: 0, failed: 1 });
  assert.deepEqual(deleted, []);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/webpush.test.js`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation** — `netlify/functions/lib/webpush.js`:

```js
// netlify/functions/lib/webpush.js
// Browser web push (VAPID) to an installer's subscribed browsers. Reads the installer's
// subscriptions from the "Web Push Subs" Airtable table, sends each via the web-push
// library, and deletes any that return 404/410 (expired). Non-blocking: a failure is
// counted, never thrown. Parallel to the dormant FCM lib/push.js.
const webpush = require("web-push");
const { cfg, listRecords, deleteRecord } = require("./airtable.js");

const SUBS = (env) => env.AIRTABLE_WEBPUSH_TABLE || "Web Push Subs";
function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

async function defaultListSubs(installerKey, env, fetchImpl) {
  const c = cfg(env);
  const recs = await listRecords({ fetchImpl, token: c.token, baseId: c.baseId, table: SUBS(env),
    filterByFormula: `{Installer}="${installerKey}"`, fields: ["Subscription"] });
  return recs.map((r) => ({ id: r.id, sub: safeParse(r.fields.Subscription) })).filter((x) => x.sub);
}

async function sendWebPush(installerKey, msg, deps = {}) {
  const { env = process.env, fetchImpl = fetch, log = console,
          listSubs = (k) => defaultListSubs(k, env, fetchImpl),
          del = (id) => { const c = cfg(env); return deleteRecord({ fetchImpl, token: c.token, baseId: c.baseId, table: SUBS(env), id }); },
          send } = deps;
  const pub = env.VAPID_PUBLIC_KEY, priv = env.VAPID_PRIVATE_KEY, subj = env.VAPID_SUBJECT || "mailto:info@tunedyota.com";
  if (!pub || !priv) return { sent: 0, failed: 0 };
  const rows = await listSubs(installerKey);
  if (!rows.length) return { sent: 0, failed: 0 };
  const sender = send || ((sub, payload) => { webpush.setVapidDetails(subj, pub, priv); return webpush.sendNotification(sub, payload); });
  const payload = JSON.stringify({ title: msg.title, body: msg.body, url: msg.url || "/installer.html" });
  let sent = 0, failed = 0;
  for (const row of rows) {
    try { await sender(row.sub, payload); sent++; }
    catch (e) {
      failed++;
      const code = e && e.statusCode;
      if (code === 404 || code === 410) { try { await del(row.id); } catch (e2) { if (log.error) log.error("webpush del", e2.message); } }
      else if (log.error) log.error("webpush send", (e && e.message) || code);
    }
  }
  return { sent, failed };
}
module.exports = { sendWebPush };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/webpush.test.js` (5 pass). Then `npm test` (no new failures).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json netlify/functions/lib/webpush.js tests/webpush.test.js
git commit -m "feat(push): web-push send helper + web-push dependency"
```

- [ ] **Step 7: Generate VAPID keys for the owner (record, do not commit)**

Run: `node -e "console.log(JSON.stringify(require('web-push').generateVAPIDKeys()))"` → note the `publicKey`/`privateKey`. Report them to the controller so the owner can set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (secret) / `VAPID_SUBJECT=mailto:info@tunedyota.com` in Netlify env. **Do not commit the keys.**

---

## Task 2: `push-subscribe.js` — store a browser subscription

**Files:** Create `netlify/functions/push-subscribe.js`, `tests/push-subscribe.test.js`

- [ ] **Step 1: Write the failing test** — `tests/push-subscribe.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processSubscribe } = require("../netlify/functions/push-subscribe.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };
const sub = { endpoint: "https://push.example/abc", keys: { p256dh: "k", auth: "a" } };

test("rejects a missing subscription", async () => {
  const out = await processSubscribe({}, { env, key: "aaron", list: async () => [], create: async () => ({}), update: async () => ({}) });
  assert.equal(out.status, "error");
  assert.equal(out.error, "missing-subscription");
});

test("registers a new subscription scoped to the installer", async () => {
  let created;
  const out = await processSubscribe({ subscription: sub }, { env, key: "aaron",
    list: async () => [], create: async (a) => { created = a; return { id: "s1" }; }, update: async () => ({}) });
  assert.equal(out.status, "registered");
  assert.equal(created.fields.Installer, "aaron");
  assert.equal(created.fields.Endpoint, sub.endpoint);
  assert.equal(JSON.parse(created.fields.Subscription).endpoint, sub.endpoint);
});

test("updates (does not duplicate) a known endpoint", async () => {
  let updatedId, created = false;
  const out = await processSubscribe({ subscription: sub }, { env, key: "noah",
    list: async () => [{ id: "existing1", fields: { Endpoint: sub.endpoint } }],
    create: async () => { created = true; return {}; }, update: async (a) => { updatedId = a.id; return {}; } });
  assert.equal(out.status, "updated");
  assert.equal(updatedId, "existing1");
  assert.equal(created, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/push-subscribe.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation** — `netlify/functions/push-subscribe.js`:

```js
// netlify/functions/push-subscribe.js
// Installer-token authed: upsert a browser PushSubscription into the "Web Push Subs"
// Airtable table, keyed to the installer, deduped by endpoint. Called by the console
// after the browser grants notification permission.
const { cfg, listRecords, createRecord, updateRecord } = require("./lib/airtable.js");
const { resolveInstaller } = require("./lib/installer-auth.js");

const SUBS = (env) => env.AIRTABLE_WEBPUSH_TABLE || "Web Push Subs";

async function processSubscribe(body, deps) {
  const { env = process.env, fetchImpl = fetch, key,
          list = (a) => listRecords({ fetchImpl, ...a }),
          create = (a) => createRecord({ fetchImpl, ...a }),
          update = (a) => updateRecord({ fetchImpl, ...a }) } = deps;
  const sub = body && body.subscription;
  const endpoint = sub && String(sub.endpoint || "").trim();
  if (!endpoint) return { status: "error", error: "missing-subscription" };
  const c = cfg(env);
  const table = SUBS(env);
  const fields = { Installer: key, Endpoint: endpoint, Subscription: JSON.stringify(sub) };
  try {
    const existing = await list({ token: c.token, baseId: c.baseId, table, filterByFormula: `{Endpoint}="${endpoint}"` });
    if (existing.length) { await update({ token: c.token, baseId: c.baseId, table, id: existing[0].id, fields }); return { status: "updated" }; }
    await create({ token: c.token, baseId: c.baseId, table, fields });
    return { status: "registered" };
  } catch (e) { return { status: "error", error: "store-unavailable" }; }
}

async function handler(event) {
  const key = resolveInstaller(event.headers || {}, process.env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  const out = await processSubscribe(body, { key });
  const code = out.status !== "error" ? 200 : (out.error === "missing-subscription" ? 400 : 502);
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, processSubscribe };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/push-subscribe.test.js` (3 pass). Then `npm test`.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/push-subscribe.js tests/push-subscribe.test.js
git commit -m "feat(push): web-push subscription registration endpoint"
```

---

## Task 3: `push-test.js` — self-test send

**Files:** Create `netlify/functions/push-test.js`, `tests/push-test.test.js`

- [ ] **Step 1: Write the failing test** — `tests/push-test.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processTest } = require("../netlify/functions/push-test.js");

test("sends a test push to the caller and returns sent count", async () => {
  let calledKey, calledMsg;
  const out = await processTest({ key: "aaron", push: async (k, m) => { calledKey = k; calledMsg = m; return { sent: 1, failed: 0 }; } });
  assert.equal(out.ok, true);
  assert.equal(out.sent, 1);
  assert.equal(calledKey, "aaron");
  assert.match(calledMsg.body, /notification/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/push-test.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation** — `netlify/functions/push-test.js`:

```js
// netlify/functions/push-test.js
// Installer-token authed: send a test web push to the caller so they can confirm
// notifications are working on their device.
const { resolveInstaller } = require("./lib/installer-auth.js");
const { sendWebPush } = require("./lib/webpush.js");

async function processTest(deps) {
  const { key, push = sendWebPush } = deps;
  const r = await push(key, { title: "Tuned Yota", body: "✅ Notifications are on.", url: "/installer.html" });
  return { ok: true, sent: (r && r.sent) || 0 };
}

async function handler(event) {
  const key = resolveInstaller(event.headers || {}, process.env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  const out = await processTest({ key });
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, processTest };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/push-test.test.js` (1 pass). Then `npm test`.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/push-test.js tests/push-test.test.js
git commit -m "feat(push): self-test send endpoint"
```

---

## Task 4: `site/sw.js` — service worker

**Files:** Create `site/sw.js` (no unit test — service-worker API).

- [ ] **Step 1: Create `site/sw.js`**

```js
// site/sw.js — Tuned Yota console service worker: receive web push + open on tap.
self.addEventListener("push", function (event) {
  var d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = {}; }
  event.waitUntil(self.registration.showNotification(d.title || "Tuned Yota", {
    body: d.body || "", data: { url: d.url || "/installer.html" },
    icon: "/icon-192.png", badge: "/icon-192.png",
  }));
});
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || "/installer.html";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) { if (list[i].url.indexOf(url) >= 0 && "focus" in list[i]) return list[i].focus(); }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  }));
});
```

- [ ] **Step 2: Verify it parses**

Run: `node --check site/sw.js`
Expected: no output (valid JS).

- [ ] **Step 3: Commit**

```bash
git add site/sw.js
git commit -m "feat(push): console service worker (show notification + open on tap)"
```

---

## Task 5: Expose `vapidPublicKey` on the roster

**Files:** Modify `netlify/functions/installer-roster.js`; Test `tests/installer-roster.test.js`

- [ ] **Step 1: Add failing tests** to `tests/installer-roster.test.js` (match the `buildRoster` harness):

```js
test("roster exposes vapidPublicKey from env", async () => {
  const out = await buildRoster({ key: "aaron", env: { VAPID_PUBLIC_KEY: "BPUBKEY" }, list: async () => [], loadEvents: async () => [] });
  assert.equal(out.vapidPublicKey, "BPUBKEY");
});
test("roster vapidPublicKey empty when unset", async () => {
  const out = await buildRoster({ key: "aaron", env: {}, list: async () => [], loadEvents: async () => [] });
  assert.equal(out.vapidPublicKey, "");
});
```

Run: `node --test tests/installer-roster.test.js` → FAIL.

- [ ] **Step 2: Implement**

In the object `buildRoster` returns, add:
```js
    vapidPublicKey: String((env.VAPID_PUBLIC_KEY || "")).trim(),
```
(alongside the `reviewUrl` field added earlier).

- [ ] **Step 3: Run tests / commit**

Run: `node --test tests/installer-roster.test.js` → PASS; then `npm test`.
```bash
git add netlify/functions/installer-roster.js tests/installer-roster.test.js
git commit -m "feat(push): expose vapidPublicKey on the roster"
```

---

## Task 6: Console — enable + self-test UI

**Files:** Modify `site/installer.html` (no unit test). READ THE FILE FIRST.

- [ ] **Step 1: State**

Append `vapidPublicKey:''` to the `STATE` object literal.

- [ ] **Step 2: Header link**

Next to the existing header links (Calibration reference / Log out / review), add a hidden link:
```html
    <a class="link" href="#" id="pushlink" style="display:none;margin-left:14px">🔔 Enable notifications</a>
```

- [ ] **Step 3: Helpers + enable/test flow (module scope)**

```js
function urlB64ToUint8Array(base64String){
  var padding = '='.repeat((4 - base64String.length % 4) % 4);
  var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  var raw = atob(base64), arr = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
async function enablePush(){
  clearMsg();
  if(!('serviceWorker' in navigator) || !('PushManager' in window)){ fail('Notifications aren’t supported on this browser.'); return; }
  try{
    var reg = await navigator.serviceWorker.register('/sw.js');
    var perm = await Notification.requestPermission();
    if(perm !== 'granted'){ fail('Notifications not enabled — allow them in your browser settings.'); return; }
    var sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(STATE.vapidPublicKey) });
    var res = await fetch('/.netlify/functions/push-subscribe', { method:'POST', headers:{ 'Content-Type':'application/json', 'x-installer-token':tok() }, body: JSON.stringify({ subscription: sub }) });
    if(!res.ok){ fail('Could not save your subscription.'); return; }
    var pl = document.getElementById('pushlink'); if(pl){ pl.textContent = '🔔 Notifications on · Send test'; pl.onclick = function(e){ e.preventDefault(); testPush(); }; }
    succeed('Notifications enabled on this device.');
  }catch(e){ fail('Couldn’t enable notifications: ' + (e && e.message ? e.message : 'error')); }
}
async function testPush(){
  clearMsg();
  try{ var res = await fetch('/.netlify/functions/push-test', { method:'POST', headers:{ 'x-installer-token':tok() } }); var out = await res.json().catch(function(){return{};}); succeed(out.sent ? 'Test sent — check your notifications.' : 'No device is subscribed yet.'); }
  catch(e){ fail('Test failed: ' + (e && e.message ? e.message : 'error')); }
}
```

- [ ] **Step 4: Wire it in `load()`**

After `STATE.reviewUrl = ...` (added earlier), add:
```js
    STATE.vapidPublicKey = data.vapidPublicKey || '';
    var pl = document.getElementById('pushlink');
    if(pl){
      var supported = ('serviceWorker' in navigator) && ('PushManager' in window);
      if(STATE.vapidPublicKey && supported){ pl.style.display = ''; pl.onclick = function(e){ e.preventDefault(); enablePush(); }; }
      else { pl.style.display = 'none'; }
    }
```

- [ ] **Step 5: Verify**

- `npm test` unchanged. Re-read edits for balanced quotes/parens. Load `/site/installer.html` locally → gate renders, no console errors.

- [ ] **Step 6: Commit**

```bash
git add site/installer.html
git commit -m "feat(console): enable-notifications + send-test UI (web push)"
```

---

## Task 7: Trigger — new booking (book-background.js)

**Files:** Modify `netlify/functions/book-background.js`; Test `tests/book-push-trigger.test.js` (existing — add a case)

- [ ] **Step 1: Add a failing test** to `tests/book-push-trigger.test.js`

Add a `webPush` dep to a booking-job invocation and assert it's called for the installer. Match the file's existing harness (it already builds a booking `job` + injects `push`/`send`). Example assertion to add:
```js
test("booking also sends a web push to the installer", async () => {
  let wp;
  await processNotifications(
    { kind: "booking", d: { name: "Pat", slot: "10:00" }, inst: { key: "aaron", name: "Aaron", email: "a@x.com", phone: "1" },
      market: { city: "Fargo", state: "ND" }, event: { dateISO: "2026-08-01", label: "Fargo" }, recordId: "r1", stamp: 1 },
    { send: async () => {}, notify: async () => {}, update: async () => {}, ping: async () => {}, push: async () => {},
      webPush: async (k, m) => { wp = { k, m }; return { sent: 1, failed: 0 }; }, log: { error() {} } });
  assert.equal(wp.k, "aaron");
  assert.match(wp.m.title, /New booking/i);
});
```

Run: `node --test tests/book-push-trigger.test.js` → FAIL (webPush not called).

- [ ] **Step 2: Implement**

In `book-background.js`:
- Import: `const { sendWebPush } = require("./lib/webpush.js");`
- Add to the `processNotifications` deps destructure: `webPush = sendWebPush`.
- Right after the existing FCM `push(...)` block (the `try { if (inst && inst.key) await push(...) }`), add a parallel web push:
```js
  try {
    if (inst && inst.key) await webPush(inst.key, { title: "New booking", body: `${d.name || "A customer"} — ${market.city}`, url: "/installer.html" });
  } catch (e) { if (log.error) log.error("booking webpush", e.message); }
```

- [ ] **Step 3: Run tests / commit**

Run: `node --test tests/book-push-trigger.test.js` → PASS (incl. existing); then `npm test`.
```bash
git add netlify/functions/book-background.js tests/book-push-trigger.test.js
git commit -m "feat(push): web push to installer on a new booking"
```

---

## Task 8: Trigger — day-of roster (event-reminders.js)

**Files:** Modify `netlify/functions/event-reminders.js`; Test `tests/event-reminders.test.js` (existing — add a case)

- [ ] **Step 1: Add a failing test**

`runReminders` currently builds actions via `planDispatch`. Add an injected `plan` seam so the test can supply actions directly, and an injected `push`. Test (add to the existing file; it already stubs `now`/`send`/`listAll`):
```js
test("day-of roster fires a web push to the installer", async () => {
  let wp;
  const at7 = new Date("2026-08-01T12:00:00Z"); // 07:00 America/Chicago (CDT)
  const out = await runReminders({
    now: at7, env: {},
    loadEvents: async () => ({}), listAll: async () => [],
    plan: () => ([{ type: "installer-roster", daysUntil: 0, event: { city: "fargo" }, bookings: [{}, {}], waitlist: [] }]),
    send: async () => {}, create: async () => ({}), notify: async () => {},
    push: async (k, m) => { wp = { k, m }; return { sent: 1, failed: 0 }; }, log: { error() {}, warn() {} } });
  assert.ok(wp, "push should fire");
  assert.match(wp.m.title, /Today/i);
});
```
(If the file's existing tests reveal the 07:00-Central instant differs, use the value they use.)

Run: `node --test tests/event-reminders.test.js` → FAIL.

- [ ] **Step 2: Implement**

In `event-reminders.js` `runReminders`:
- Import: `const { sendWebPush } = require("./lib/webpush.js");`
- Add to the deps destructure: `plan = (a) => planDispatch(a)` and `push = sendWebPush`.
- Change `const actions = planDispatch({ events, bookings, priority, nowCentral });` → `const actions = plan({ events, bookings, priority, nowCentral });`
- Inside the `if (act.type === "installer-roster")` branch, after the `await send({...})` roster email, add:
```js
        if (act.daysUntil === 0) {
          try { await push(inst.key, { title: `Today: ${market.city}`, body: `${(act.bookings || []).length} booking(s)`, url: "/installer.html" }); }
          catch (e) { if (log.error) log.error("roster webpush", e.message); }
        }
```

- [ ] **Step 3: Run tests / commit**

Run: `node --test tests/event-reminders.test.js` → PASS; then `npm test`.
```bash
git add netlify/functions/event-reminders.js tests/event-reminders.test.js
git commit -m "feat(push): day-of roster web push to the installer"
```

---

## Task 9: Trigger — certificate held (certificate-dispatch.js)

**Files:** Modify `netlify/functions/certificate-dispatch.js`; Test `tests/certificate-dispatch.test.js` (existing — add a case)

- [ ] **Step 1: Add a failing test**

```js
test("a held certificate (blank calibration) web-pushes the installer", async () => {
  let wp;
  await dispatchCertificates({
    list: async () => ([{ id: "h1", fields: { Status: "Completed", "OTT Calibration": "", Name: "Dana", Installer: "aaron" } }]),
    update: async () => ({}), send: async () => {}, notify: async () => {},
    push: async (k, m) => { wp = { k, m }; return { sent: 1, failed: 0 }; }, env: {} });
  assert.equal(wp.k, "aaron");
  assert.match(wp.m.title, /hold/i);
});
```

Run: `node --test tests/certificate-dispatch.test.js` → FAIL.

- [ ] **Step 2: Implement**

In `certificate-dispatch.js` `dispatchCertificates`:
- Import: `const { sendWebPush } = require("./lib/webpush.js");`
- Add to deps: `push = sendWebPush`.
- In the held branch (`if (!calibration) { held.push(f.Name || row.id); ... }`), before `continue;`, add:
```js
      const heldOwner = Array.isArray(f.Installer) ? f.Installer[0] : f.Installer;
      if (heldOwner) { try { await push(heldOwner, { title: "Certificate on hold", body: `Set the OTT calibration for ${f.Name || "a customer"}`, url: "/installer.html" }); } catch (e) { if (log.error) log.error("held webpush", e.message); } }
```

- [ ] **Step 3: Run tests / commit**

Run: `node --test tests/certificate-dispatch.test.js` → PASS; then `npm test`.
```bash
git add netlify/functions/certificate-dispatch.js tests/certificate-dispatch.test.js
git commit -m "feat(push): web push the installer when a certificate is held"
```

---

## Task 10: Trigger — monthly report due (ott-report-reminder.js)

**Files:** Modify `netlify/functions/ott-report-reminder.js`; Test `tests/ott-report-reminder.test.js` (existing — add a case)

- [ ] **Step 1: Add a failing test**

Reuse the existing file's fixture that produces a non-empty `subRows` (it already tests the email/slack path). Add `INSTALLER_ADMINS` to the env and an injected `push`; assert the admin is pushed:
```js
test("report-due reminder web-pushes the admin(s)", async () => {
  const pushed = [];
  await runOttReminder({
    // reuse this file's existing list/now setup that yields subRows.length > 0:
    now: <same now the other tests use>, listAll: <same listAll that returns completed prior-month bookings>,
    env: { INSTALLER_ADMINS: "aaron" },
    send: async () => {}, notify: async () => {},
    push: async (k, m) => { pushed.push({ k, m }); return { sent: 1, failed: 0 }; }, log: { error() {} } });
  assert.ok(pushed.some((p) => p.k === "aaron"));
  assert.match(pushed[0].m.title, /due/i);
});
```
(Copy the `now`/`listAll` fixture from an existing passing test in this file so `subRows.length > 0`.)

Run: `node --test tests/ott-report-reminder.test.js` → FAIL.

- [ ] **Step 2: Implement**

In `ott-report-reminder.js` `runOttReminder`:
- Import: `const { sendWebPush } = require("./lib/webpush.js");`
- Add to deps: `push = sendWebPush`.
- After the Slack `notify(...)` block (still inside the `subRows.length` path), add:
```js
  const admins = String(env.INSTALLER_ADMINS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (const a of admins) {
    try { await push(a, { title: `OTT report due by the ${DUE_DAY}th`, body: `Submit ${month.label}'s commission report · $${total}`, url: "/installer.html" }); }
    catch (e) { if (log.error) log.error("ott reminder webpush", e.message); }
  }
```

- [ ] **Step 3: Run tests / commit**

Run: `node --test tests/ott-report-reminder.test.js` → PASS; then `npm test`.
```bash
git add netlify/functions/ott-report-reminder.js tests/ott-report-reminder.test.js
git commit -m "feat(push): web push the admin when the OTT report is due"
```

---

## Task 11: Full suite + ship

- [ ] **Step 1:** `npm test` — all pass (existing + ~11 new).
- [ ] **Step 2: Ship** via the `ship` skill: `site/` changed but `sw.js`/`installer.html` aren't indexed and no SEO inputs changed, so `build:seo` isn't required — but `npm test` (which guards SEO drift) must pass; confirm branch `master`; push; confirm Netlify `ready`.
- [ ] **Step 3: Owner setup (enables the feature):**
  - Netlify env `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (secret), `VAPID_SUBJECT=mailto:info@tunedyota.com` (keys from Task 1 Step 7).
  - Airtable **"Web Push Subs"** table: `Installer` (text), `Endpoint` (text), `Subscription` (long text).
- [ ] **Step 4: Post-ship verification:** on the live console (iPhone: Add to Home Screen first; Android: in-browser) tap **Enable notifications** → grant → **Send test** → confirm the notification arrives. Then confirm a real booking pushes the assigned installer.

---

## Owner inputs
1. `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` (Netlify env; keys generated in Task 1).
2. Airtable **"Web Push Subs"** table (`Installer`, `Endpoint`, `Subscription`).
Absent these, the feature self-hides and every `sendWebPush` no-ops.
