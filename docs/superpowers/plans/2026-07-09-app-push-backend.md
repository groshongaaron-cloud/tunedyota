# Tuned Yota App — Push Notification Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the reusable push-notification backend the Tuned Yota app will use — a send helper (`lib/push.js`, FCM HTTP v1) and a device-token registration endpoint (`push-register.js`) — fully unit-tested, safe to ship inert (no devices → no-ops).

**Architecture:** Firebase Cloud Messaging (FCM) HTTP v1 covers Android + iOS-via-APNs in one integration. Auth reuses the repo's existing `google-auth-library` dependency (already used by the measurement scripts) with a Firebase service-account key from a Netlify env secret. Device tokens live in a new Airtable "Push Devices" table, keyed to the installer. Both units follow the repo's deps-injection test pattern.

**Tech Stack:** Node (Netlify Functions), `google-auth-library`, Airtable via `lib/airtable.js`, `node:test`.

Spec: `docs/superpowers/specs/2026-07-09-tunedyota-app-foundation-installer-design.md` (§3). This plan = the backend; the Capacitor app that registers tokens + the send triggers are Plan 2.

**Owner prerequisites (before this runs live — not needed for the unit tests):** a Firebase project; Netlify env `FCM_SERVICE_ACCOUNT` = the Firebase service-account JSON; an Airtable **"Push Devices"** table with columns `Installer` (single line or link), `Token` (single line), `Platform` (single line). These go in the Plan 2 runbook.

---

## File Structure
- `netlify/functions/lib/push.js` — **new**: `sendPush(installerKey, msg, deps)` → FCM.
- `netlify/functions/push-register.js` — **new**: token registration endpoint.
- `tests/push-send.test.js` — **new**.
- `tests/push-register.test.js` — **new**.

Tests: `node --test tests/push-send.test.js`, `node --test tests/push-register.test.js`, full `npm test`.

---

## Task 1: `lib/push.js` — FCM send helper

**Files:** Create `netlify/functions/lib/push.js`, `tests/push-send.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/push-send.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { sendPush } = require("../netlify/functions/lib/push.js");

const env = { FCM_SERVICE_ACCOUNT: JSON.stringify({ project_id: "ty-proj" }) };
const fakeAuth = { async getAccessToken() { return { token: "AT123" }; } };

test("no registered tokens → no-op, no FCM calls", async () => {
  let calls = 0;
  const out = await sendPush("aaron", { title: "Hi", body: "There" }, {
    env, auth: fakeAuth, listTokens: async () => [], fetchImpl: async () => { calls++; return { ok: true }; },
  });
  assert.deepEqual(out, { sent: 0, failed: 0 });
  assert.equal(calls, 0);
});

test("posts one FCM message per token with the right URL + payload", async () => {
  const posted = [];
  const fetchImpl = async (url, opts) => { posted.push({ url, opts }); return { ok: true }; };
  const out = await sendPush("aaron", { title: "Roster ready", body: "Fargo", data: { city: "Fargo" } }, {
    env, auth: fakeAuth, listTokens: async () => ["tokA", "tokB"], fetchImpl,
  });
  assert.deepEqual(out, { sent: 2, failed: 0 });
  assert.equal(posted.length, 2);
  assert.match(posted[0].url, /projects\/ty-proj\/messages:send/);
  assert.equal(posted[0].opts.headers.Authorization, "Bearer AT123");
  const msg = JSON.parse(posted[0].opts.body).message;
  assert.equal(msg.token, "tokA");
  assert.equal(msg.notification.title, "Roster ready");
  assert.equal(msg.notification.body, "Fargo");
  assert.equal(msg.data.city, "Fargo");
});

test("a failing FCM call is counted, not thrown", async () => {
  const fetchImpl = async () => ({ ok: false, status: 500 });
  const out = await sendPush("aaron", { title: "x", body: "y" }, {
    env, auth: fakeAuth, listTokens: async () => ["t1"], fetchImpl, log: { error() {} },
  });
  assert.deepEqual(out, { sent: 0, failed: 1 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/push-send.test.js`
Expected: FAIL ("Cannot find module '../netlify/functions/lib/push.js'").

- [ ] **Step 3: Write the implementation**

Create `netlify/functions/lib/push.js`:

```js
// netlify/functions/lib/push.js
// Send a push notification to all of an installer's registered devices via
// Firebase Cloud Messaging (FCM HTTP v1 — covers Android + iOS/APNs). Auth reuses
// google-auth-library (already a repo dependency) with the Firebase service-account
// key in env FCM_SERVICE_ACCOUNT. Non-blocking: a failed send is counted, never thrown.
const { GoogleAuth } = require("google-auth-library");
const { cfg, listRecords } = require("./airtable.js");

const DEVICES = (env) => env.AIRTABLE_DEVICES_TABLE || "Push Devices";

// Default token lookup: the installer's device tokens from the Push Devices table.
async function defaultListTokens(installerKey, env, fetchImpl) {
  const c = cfg(env);
  const recs = await listRecords({ fetchImpl, token: c.token, baseId: c.baseId, table: DEVICES(env),
    filterByFormula: `{Installer}="${installerKey}"`, fields: ["Token"] });
  return recs.map((r) => r.fields.Token).filter(Boolean);
}

async function sendPush(installerKey, msg, deps = {}) {
  const { env = process.env, fetchImpl = fetch, log = console,
          listTokens = (k) => defaultListTokens(k, env, fetchImpl), auth } = deps;
  const tokens = await listTokens(installerKey);
  if (!tokens.length) return { sent: 0, failed: 0 };

  const creds = JSON.parse(env.FCM_SERVICE_ACCOUNT || "{}");
  const projectId = creds.project_id;
  const client = auth || await new GoogleAuth({ credentials: creds,
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"] }).getClient();
  const at = await client.getAccessToken();
  const accessToken = (at && at.token) ? at.token : at;

  let sent = 0, failed = 0;
  for (const token of tokens) {
    try {
      const r = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
        method: "POST",
        headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
        body: JSON.stringify({ message: { token, notification: { title: msg.title, body: msg.body }, data: msg.data || {} } }),
      });
      if (r.ok) sent++; else { failed++; if (log.error) log.error("fcm send", r.status); }
    } catch (e) { failed++; if (log.error) log.error("fcm send", e.message); }
  }
  return { sent, failed };
}

module.exports = { sendPush };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/push-send.test.js` (expect 3 pass) then `npm test` (expect all pass).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/push.js tests/push-send.test.js
git commit -m "feat(app): FCM push-send helper (lib/push.js)"
```

---

## Task 2: `push-register.js` — device token registration

**Files:** Create `netlify/functions/push-register.js`, `tests/push-register.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/push-register.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processRegister } = require("../netlify/functions/push-register.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };

test("rejects a missing token", async () => {
  const out = await processRegister({ token: "" }, { env, key: "aaron",
    list: async () => [], create: async () => ({}), update: async () => ({}) });
  assert.equal(out.status, "error");
  assert.equal(out.error, "missing-token");
});

test("registers a new device token scoped to the installer", async () => {
  let created;
  const out = await processRegister({ token: "devTOK", platform: "iOS" }, { env, key: "aaron",
    list: async () => [], create: async (a) => { created = a; return { id: "d1" }; }, update: async () => ({}) });
  assert.equal(out.status, "registered");
  assert.equal(created.fields.Installer, "aaron");
  assert.equal(created.fields.Token, "devTOK");
  assert.equal(created.fields.Platform, "ios");
});

test("updates (does not duplicate) an already-registered token", async () => {
  let updatedId, created = false;
  const out = await processRegister({ token: "devTOK", platform: "android" }, { env, key: "noah",
    list: async () => [{ id: "existing1", fields: { Token: "devTOK" } }],
    create: async () => { created = true; return {}; },
    update: async (a) => { updatedId = a.id; return {}; } });
  assert.equal(out.status, "updated");
  assert.equal(updatedId, "existing1");
  assert.equal(created, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/push-register.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

Create `netlify/functions/push-register.js`:

```js
// netlify/functions/push-register.js
// Installer-token authed: upsert an app device's push token into the "Push Devices"
// Airtable table, keyed to the installer. Called by the Tuned Yota app after the OS
// grants notification permission. Dedups by token (update, not duplicate).
const { cfg, listRecords, createRecord, updateRecord } = require("./lib/airtable.js");
const { resolveInstaller } = require("./lib/installer-auth.js");

const DEVICES = (env) => env.AIRTABLE_DEVICES_TABLE || "Push Devices";

async function processRegister(body, deps) {
  const { env = process.env, fetchImpl = fetch, key,
          list = (a) => listRecords({ fetchImpl, ...a }),
          create = (a) => createRecord({ fetchImpl, ...a }),
          update = (a) => updateRecord({ fetchImpl, ...a }) } = deps;
  const token = String((body && body.token) || "").trim();
  const platform = String((body && body.platform) || "").trim().toLowerCase();
  if (!token) return { status: "error", error: "missing-token" };
  const c = cfg(env);
  const table = DEVICES(env);
  const fields = { Installer: key, Token: token, Platform: platform };
  try {
    const existing = await list({ token: c.token, baseId: c.baseId, table, filterByFormula: `{Token}="${token}"` });
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
  const out = await processRegister(body, { key });
  const code = out.status !== "error" ? 200 : (out.error === "missing-token" ? 400 : 502);
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, processRegister };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/push-register.test.js` (expect 3 pass) then `npm test` (expect all pass).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/push-register.js tests/push-register.test.js
git commit -m "feat(app): device push-token registration endpoint"
```

---

## Self-Review notes
- **Spec coverage (§3):** `sendPush` FCM helper (Task 1) ✓; `push-register` upsert keyed to installer (Task 2) ✓; deps-injected/testable ✓. The **send triggers** (event-reminders / walk-in → `sendPush`) and the **app-side registration call** are Plan 2 (they need the app + live devices to be meaningful; wiring them earlier is inert).
- **Auth reuse:** `google-auth-library` is already in `package.json` (measurement scripts) — no new dependency.
- **Safe to ship inert:** with no registered devices, `sendPush` no-ops and `push-register` simply has no callers yet; nothing else in the app is affected.
- **Consistency:** table name resolves via `env.AIRTABLE_DEVICES_TABLE || "Push Devices"` in both files; field names `Installer`/`Token`/`Platform` identical across `push-register` writes and `lib/push` lookup.
