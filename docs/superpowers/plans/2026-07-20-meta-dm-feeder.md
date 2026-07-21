# Meta DM Feeder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Facebook Messenger PMs and Instagram DMs flow through the existing chat stack (spec `docs/superpowers/specs/2026-07-20-meta-dm-feeder-design.md`): instant AI replies, installer escalation into the console Chats inbox, installer replies delivered back into the DM thread.

**Architecture:** New webhook `netlify/functions/meta-dm.js` (handshake, HMAC auth, event normalization, always-200) bridges normalized DM events into the exported `processChat` engine and delivers replies via new `lib/meta-graph.js` (Graph Send API). A `lib/meta-deliver.js` hook pushes installer turns from the console inbox and SMS relay back out to Meta. One new store helper (`loadActiveByPrefix`) resolves per-sender sessions.

**Tech Stack:** Netlify functions + Node `crypto` HMAC, Airtable Chat Sessions (existing), Anthropic chat agent (existing, untouched), `node --test` + deps-injection per repo convention.

**Conventions:** work on master, push after each green commit. Tests: CJS, `node:test`, `node:assert/strict`, mocks via `deps` objects (see `tests/chat-admin.test.js`). Existing exports you will use — `netlify/functions/chat.js`: `{ processChat, escalate, installerOp, MAX_CHARS }`; `lib/chat-store.js`: `{ loadSession, saveSession, TABLE, parseTranscript }`; `lib/chat-agent.js`: `{ runChat }`; `lib/secrets.js`: `secretEquals`; `lib/alert.js`: `notifyOwner`; `lib/airtable.js`: `{ cfg, escapeFormula, listRecords }`. Env (all new): `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_PAGE_TOKEN`, optional `META_GRAPH_VERSION` (default `"v22.0"`).

---

### Task 1: Graph client (`netlify/functions/lib/meta-graph.js`)

**Files:**
- Create: `netlify/functions/lib/meta-graph.js`
- Test: `tests/meta-graph.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/meta-graph.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const mg = require("../netlify/functions/lib/meta-graph.js");

const ENV = { META_APP_SECRET: "shh", META_PAGE_TOKEN: "tok123", META_GRAPH_VERSION: "v22.0" };

test("verifySignature accepts a valid sha256 header and rejects everything else", () => {
  const body = '{"object":"page"}';
  const good = "sha256=" + crypto.createHmac("sha256", "shh").update(body).digest("hex");
  assert.equal(mg.verifySignature(body, good, "shh"), true);
  assert.equal(mg.verifySignature(body, "sha256=deadbeef", "shh"), false);
  assert.equal(mg.verifySignature(body, "", "shh"), false);
  assert.equal(mg.verifySignature(body, good, ""), false);       // no secret -> fail closed
  assert.equal(mg.verifySignature(body, good.replace("sha256=", "sha1="), "shh"), false);
});

test("sendDm posts the Graph message shape with the page token", async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => { calls.push([url, opts]); return { ok: true, json: async () => ({ message_id: "m1" }) }; };
  const out = await mg.sendDm({ platform: "facebook", recipientId: "PSID9", text: "hello" }, { env: ENV, fetchImpl });
  assert.equal(out.ok, true);
  assert.equal(calls[0][0], "https://graph.facebook.com/v22.0/me/messages?access_token=tok123");
  const body = JSON.parse(calls[0][1].body);
  assert.deepEqual(body, { recipient: { id: "PSID9" }, message: { text: "hello" } });
  assert.equal(calls[0][1].method, "POST");
});

test("sendDm fails closed without a token and never throws on network error", async () => {
  const noTok = await mg.sendDm({ platform: "facebook", recipientId: "P", text: "x" }, { env: { META_APP_SECRET: "s" }, fetchImpl: async () => { throw new Error("must not be called"); } });
  assert.deepEqual(noTok, { ok: false, skipped: true });
  const boom = await mg.sendDm({ platform: "facebook", recipientId: "P", text: "x" }, { env: ENV, fetchImpl: async () => { throw new Error("net down"); } });
  assert.equal(boom.ok, false);
  assert.match(boom.error, /net down/);
});

test("sendDm maps the outside-window Graph error to windowClosed", async () => {
  const fetchImpl = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: "This message is sent outside of allowed window.", code: 10, error_subcode: 2018278 } }) });
  const out = await mg.sendDm({ platform: "instagram", recipientId: "IG1", text: "late" }, { env: ENV, fetchImpl });
  assert.equal(out.ok, false);
  assert.equal(out.windowClosed, true);
});

test("getProfile returns a name best-effort and null on any failure", async () => {
  const fetchImpl = async (url) => ({ ok: true, json: async () => ({ first_name: "Pat", last_name: "K", name: "Pat K" }) });
  assert.equal(await mg.getProfile("PSID9", { env: ENV, fetchImpl }), "Pat K");
  assert.equal(await mg.getProfile("PSID9", { env: ENV, fetchImpl: async () => { throw new Error("x"); } }), null);
  assert.equal(await mg.getProfile("PSID9", { env: { }, fetchImpl }), null); // no token
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/meta-graph.test.js`
Expected: FAIL — `Cannot find module '.../lib/meta-graph.js'`

- [ ] **Step 3: Write the implementation**

```javascript
// netlify/functions/lib/meta-graph.js
// Meta Graph API client for the DM feeder (spec 2026-07-20-meta-dm-feeder-design.md).
// One Page token serves both Messenger and the linked Instagram account. All
// functions are best-effort and deps-injected; callers never break on failure.
const crypto = require("crypto");
const { secretEquals } = require("./secrets.js");

const GRAPH_VERSION = (env) => (env && env.META_GRAPH_VERSION) || "v22.0";
const WINDOW_SUBCODE = 2018278; // "sent outside of allowed window"

function verifySignature(rawBody, header, appSecret) {
  if (!appSecret || !header || typeof header !== "string" || header.indexOf("sha256=") !== 0) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody || "", "utf8").digest("hex");
  return secretEquals(header, expected);
}

async function sendDm({ platform, recipientId, text }, { env = process.env, fetchImpl = fetch, log = console } = {}) {
  const token = env.META_PAGE_TOKEN;
  if (!token) return { ok: false, skipped: true };
  const url = `https://graph.facebook.com/${GRAPH_VERSION(env)}/me/messages?access_token=${token}`;
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: recipientId }, message: { text: String(text || "").slice(0, 2000) } }),
    });
    if (res.ok) return { ok: true };
    const j = await res.json().catch(() => ({}));
    const err = (j && j.error) || {};
    const windowClosed = err.error_subcode === WINDOW_SUBCODE || /outside of allowed window/i.test(err.message || "");
    return { ok: false, error: err.message || `graph ${res.status}`, code: err.code, windowClosed };
  } catch (e) {
    if (log.error) log.error("meta sendDm", e.message);
    return { ok: false, error: e.message };
  }
}

async function getProfile(senderId, { env = process.env, fetchImpl = fetch } = {}) {
  const token = env.META_PAGE_TOKEN;
  if (!token) return null;
  try {
    const res = await fetchImpl(`https://graph.facebook.com/${GRAPH_VERSION(env)}/${senderId}?fields=name,first_name,last_name&access_token=${token}`);
    if (!res.ok) return null;
    const j = await res.json();
    return j.name || [j.first_name, j.last_name].filter(Boolean).join(" ") || null;
  } catch (e) { return null; }
}

module.exports = { verifySignature, sendDm, getProfile, GRAPH_VERSION };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/meta-graph.test.js` — expected: PASS (5). Note: `secretEquals` compares equal-length strings constant-time; confirm its behavior on unequal lengths by reading `lib/secrets.js` — if it throws or misbehaves on length mismatch, guard `verifySignature` with a length check first and note it in the commit.

- [ ] **Step 5: Full suite + commit**

Run: `npm test` — all green (1060 + 5 new = 1065).
```bash
git add netlify/functions/lib/meta-graph.js tests/meta-graph.test.js
git commit -m "feat(meta-dm): Graph client - signature verify, sendDm w/ window mapping, profile lookup"
git push
```

---

### Task 2: Session lookup by sender (`lib/chat-store.js` + `loadActiveByPrefix`)

**Files:**
- Modify: `netlify/functions/lib/chat-store.js` (add one function + export)
- Test: `tests/chat-store-prefix.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/chat-store-prefix.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadActiveByPrefix } = require("../netlify/functions/lib/chat-store.js");

const ENV = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };
const rec = (id, sid, status, last) => ({ id, fields: { "Session ID": sid, Status: status, Transcript: "[]", "Last Activity": last } });

test("returns the most recent non-closed session whose id starts with the prefix", async () => {
  let formula = "";
  const fetchImpl = async (url) => {
    formula = decodeURIComponent(url);
    return { ok: true, json: async () => ({ records: [
      rec("r1", "fb:99", "closed", "2026-07-19T10:00:00Z"),
      rec("r2", "fb:99:1752900000000", "ai", "2026-07-20T10:00:00Z"),
      rec("r3", "fb:99:1752800000000", "escalated", "2026-07-19T22:00:00Z"),
    ] }) };
  };
  const sess = await loadActiveByPrefix("fb:99", { env: ENV, fetchImpl });
  assert.equal(sess.id, "fb:99:1752900000000"); // newest by Last Activity, closed excluded
  assert.ok(formula.includes("fb:99"));
  assert.ok(formula.includes("closed"));
});

test("returns null when nothing matches or on store failure", async () => {
  assert.equal(await loadActiveByPrefix("ig:1", { env: ENV, fetchImpl: async () => ({ ok: true, json: async () => ({ records: [] }) }) }), null);
  assert.equal(await loadActiveByPrefix("ig:1", { env: ENV, fetchImpl: async () => { throw new Error("503"); } }), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/chat-store-prefix.test.js`
Expected: FAIL — `loadActiveByPrefix is not a function`

- [ ] **Step 3: Implement in `lib/chat-store.js`**

Add above `module.exports` (uses the file's existing `cfg`/`escapeFormula`/`listRecords` imports and `fromRecord`):

```javascript
// DM feeder: latest non-closed session for a sender (ids "fb:<PSID>" or
// "fb:<PSID>:<ts>"). Best-effort: null on store failure — caller starts fresh.
async function loadActiveByPrefix(prefix, { env = process.env, fetchImpl = fetch } = {}) {
  const c = cfg(env);
  const p = escapeFormula(String(prefix || ""));
  try {
    const recs = await listRecords({
      fetchImpl, token: c.token, baseId: c.baseId, table: TABLE(env),
      filterByFormula: `AND(FIND("${p}", {Session ID}) = 1, {Status} != "closed")`,
      fields: ["Session ID", "Status", "Transcript", "Page Context", "Customer Name", "Phone", "Vehicle", "City", "Installer", "Last Activity"],
    });
    if (!recs.length) return null;
    const sessions = recs.map(fromRecord).sort((a, b) => (a.lastActivity < b.lastActivity ? 1 : -1));
    return sessions[0];
  } catch (e) { return null; }
}
```

Add `loadActiveByPrefix` to `module.exports`. (Check the file's existing `listRecords` import — it is already imported at the top; if the fields list param name differs, mirror `loadEscalatedForInstaller`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/chat-store-prefix.test.js` then `node --test tests/chat-store.test.js` (regression) — expected: PASS.

- [ ] **Step 5: Full suite + commit**

Run: `npm test` — green (1067).
```bash
git add netlify/functions/lib/chat-store.js tests/chat-store-prefix.test.js
git commit -m "feat(meta-dm): chat-store loadActiveByPrefix - per-sender session resolution"
git push
```

---

### Task 3: Webhook plumbing (`netlify/functions/meta-dm.js` — handshake, auth, normalize)

**Files:**
- Create: `netlify/functions/meta-dm.js` (plumbing + exported `normalizeEvents`; the bridge lands in Task 4)
- Test: `tests/meta-dm.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/meta-dm.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { handler, normalizeEvents } = require("../netlify/functions/meta-dm.js");

const SECRET = "shh";
const ENV_KEYS = { META_APP_SECRET: SECRET, META_VERIFY_TOKEN: "vt-1" };
function withEnv(fn) {
  const prev = {};
  for (const [k, v] of Object.entries(ENV_KEYS)) { prev[k] = process.env[k]; process.env[k] = v; }
  return Promise.resolve(fn()).finally(() => {
    for (const k of Object.keys(ENV_KEYS)) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; }
  });
}
const sign = (body) => "sha256=" + crypto.createHmac("sha256", SECRET).update(body).digest("hex");

const PAGE_EVENT = JSON.stringify({ object: "page", entry: [{ id: "PAGE1", time: 1, messaging: [
  { sender: { id: "PSID9" }, recipient: { id: "PAGE1" }, timestamp: 1, message: { mid: "m_1", text: "do you tune 4runners?" } },
] }] });
const IG_EVENT = JSON.stringify({ object: "instagram", entry: [{ id: "IGB1", time: 2, messaging: [
  { sender: { id: "IGSID7" }, recipient: { id: "IGB1" }, timestamp: 2, message: { mid: "aW_2", text: "price on tundra tune?" } },
] }] });

test("GET handshake echoes hub.challenge only with the right verify token", () => withEnv(async () => {
  const ok = await handler({ httpMethod: "GET", queryStringParameters: { "hub.mode": "subscribe", "hub.verify_token": "vt-1", "hub.challenge": "12345" } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body, "12345");
  const bad = await handler({ httpMethod: "GET", queryStringParameters: { "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "x" } });
  assert.equal(bad.statusCode, 403);
}));

test("GET fails closed when META_VERIFY_TOKEN is unset", async () => {
  const prev = process.env.META_VERIFY_TOKEN; delete process.env.META_VERIFY_TOKEN;
  const res = await handler({ httpMethod: "GET", queryStringParameters: { "hub.verify_token": "", "hub.challenge": "x" } });
  if (prev !== undefined) process.env.META_VERIFY_TOKEN = prev;
  assert.equal(res.statusCode, 403);
});

test("POST rejects a bad signature and never processes it", () => withEnv(async () => {
  const res = await handler({ httpMethod: "POST", headers: { "x-hub-signature-256": "sha256=bad" }, body: PAGE_EVENT });
  assert.equal(res.statusCode, 403);
}));

test("normalizeEvents extracts page and instagram messages, skips echo/read/delivery", () => {
  const page = normalizeEvents(JSON.parse(PAGE_EVENT));
  assert.deepEqual(page, [{ platform: "facebook", senderId: "PSID9", mid: "m_1", text: "do you tune 4runners?" }]);
  const ig = normalizeEvents(JSON.parse(IG_EVENT));
  assert.deepEqual(ig, [{ platform: "instagram", senderId: "IGSID7", mid: "aW_2", text: "price on tundra tune?" }]);
  const noise = normalizeEvents({ object: "page", entry: [{ messaging: [
    { sender: { id: "P" }, message: { mid: "m", text: "self", is_echo: true } },
    { sender: { id: "P" }, read: { watermark: 1 } },
    { sender: { id: "P" }, delivery: { mids: [] } },
  ] }] });
  assert.deepEqual(noise, []);
});

test("attachment-only messages normalize to the [attachment] marker", () => {
  const out = normalizeEvents({ object: "page", entry: [{ messaging: [
    { sender: { id: "P2" }, message: { mid: "m_9", attachments: [{ type: "image" }] } },
  ] }] });
  assert.deepEqual(out, [{ platform: "facebook", senderId: "P2", mid: "m_9", text: "[attachment]" }]);
});

test("POST with valid signature always returns 200 even when processing throws", () => withEnv(async () => {
  const res = await handler({ httpMethod: "POST", headers: { "x-hub-signature-256": sign(PAGE_EVENT) }, body: PAGE_EVENT },
    { processDm: async () => { throw new Error("boom"); }, notify: async () => {} });
  assert.equal(res.statusCode, 200);
}));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/meta-dm.test.js` — expected: FAIL, module not found.

- [ ] **Step 3: Implement the plumbing**

```javascript
// netlify/functions/meta-dm.js
// Meta DM feeder webhook (spec 2026-07-20-meta-dm-feeder-design.md): Messenger
// ("page") + Instagram ("instagram") messages -> the existing chat stack.
// GET = subscription handshake. POST = HMAC-verified events; ALWAYS 200 after a
// valid signature (Meta disables webhooks that error persistently) — failures
// are logged + Slack-notified instead.
const { verifySignature, sendDm, getProfile } = require("./lib/meta-graph.js");
const { secretEquals } = require("./lib/secrets.js");
const { notifyOwner } = require("./lib/alert.js");

function normalizeEvents(payload) {
  const platform = payload && payload.object === "instagram" ? "instagram" : payload && payload.object === "page" ? "facebook" : null;
  if (!platform) return [];
  const out = [];
  for (const entry of payload.entry || []) {
    for (const ev of entry.messaging || []) {
      const m = ev.message;
      if (!m || m.is_echo || ev.read || ev.delivery) continue;
      const text = (m.text && String(m.text).trim()) || (Array.isArray(m.attachments) && m.attachments.length ? "[attachment]" : "");
      if (!text || !ev.sender || !ev.sender.id || !m.mid) continue;
      out.push({ platform, senderId: String(ev.sender.id), mid: String(m.mid), text });
    }
  }
  return out;
}

async function handler(event, deps = {}) {
  const env = process.env;
  if (event.httpMethod === "GET") {
    const q = event.queryStringParameters || {};
    const tokenOk = !!env.META_VERIFY_TOKEN && secretEquals(String(q["hub.verify_token"] || ""), env.META_VERIFY_TOKEN);
    return tokenOk ? { statusCode: 200, body: String(q["hub.challenge"] || "") } : { statusCode: 403, body: "forbidden" };
  }
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "method not allowed" };
  const headers = event.headers || {};
  const sig = headers["x-hub-signature-256"] || headers["X-Hub-Signature-256"] || "";
  if (!verifySignature(event.body || "", sig, env.META_APP_SECRET)) return { statusCode: 403, body: "bad signature" };

  const { processDm: processImpl = processDm, notify = (text) => notifyOwner({ webhookUrl: env.SLACK_WEBHOOK_URL, text }) } = deps;
  let payload = {};
  try { payload = JSON.parse(event.body || "{}"); } catch (e) { return { statusCode: 200, body: "ok" }; }
  for (const evt of normalizeEvents(payload)) {
    try { await processImpl(evt, {}); }
    catch (e) {
      console.error("meta-dm process", e.message);
      try { notify(`⚠ Meta DM processing failed (${evt.platform} ${evt.senderId}): ${e.message}`).catch(() => {}); } catch (e2) {}
    }
  }
  return { statusCode: 200, body: "ok" };
}

// processDm lands in Task 4; stub keeps Task 3 shippable.
async function processDm(evt, deps) { throw new Error("not implemented"); }

module.exports = { handler, normalizeEvents, processDm };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/meta-dm.test.js` — expected: PASS (6). The always-200 test passes because the injected `processDm` throw is swallowed.

- [ ] **Step 5: Full suite + commit**

Run: `npm test` — green (1073).
```bash
git add netlify/functions/meta-dm.js tests/meta-dm.test.js
git commit -m "feat(meta-dm): webhook plumbing - handshake, HMAC auth, event normalization, always-200"
git push
```

---

### Task 4: Conversation bridge (`processDm`)

**Files:**
- Modify: `netlify/functions/meta-dm.js` (replace the `processDm` stub)
- Test: append to `tests/meta-dm.test.js`

- [ ] **Step 1: Write the failing tests (append)**

```javascript
const { processDm } = require("../netlify/functions/meta-dm.js");

function bridgeDeps(over = {}) {
  const sent = [], notified = [], saved = [];
  return {
    refs: { sent, notified, saved },
    deps: Object.assign({
      env: { META_PAGE_TOKEN: "tok", SLACK_WEBHOOK_URL: "https://hooks.example" },
      findActive: async () => null,
      chat: async (body) => ({ status: 200, body: { reply: "Happy to help!", escalated: false } }),
      send: async (args) => { sent.push(args); return { ok: true }; },
      notify: async (text) => { notified.push(text); },
      profile: async () => "Pat K",
      now: () => 1752900000000,
    }, over),
  };
}

test("processDm: new sender -> new session id, chat called, reply delivered, owner notified once", async () => {
  const { deps, refs } = bridgeDeps();
  const chatCalls = [];
  deps.chat = async (body) => { chatCalls.push(body); return { status: 200, body: { reply: "Yes we tune those!", escalated: false } }; };
  await processDm({ platform: "facebook", senderId: "PSID9", mid: "m_1", text: "do you tune 4runners?" }, deps);
  assert.deepEqual(chatCalls[0], { session: "fb:PSID9", message: "do you tune 4runners?", page: "facebook" });
  assert.deepEqual(refs.sent[0], { platform: "facebook", recipientId: "PSID9", text: "Yes we tune those!" });
  assert.equal(refs.notified.length, 1);
  assert.match(refs.notified[0], /New facebook DM/i);
  assert.match(refs.notified[0], /Pat K/);
});

test("processDm: existing active session reuses its id and does NOT re-notify", async () => {
  const { deps, refs } = bridgeDeps({ findActive: async () => ({ id: "fb:PSID9:1752800000000", turns: [{ role: "user", text: "hi", at: 1, mid: "m_0" }] }) });
  const chatCalls = [];
  deps.chat = async (body) => { chatCalls.push(body); return { status: 200, body: { reply: "ok", escalated: true } }; };
  await processDm({ platform: "facebook", senderId: "PSID9", mid: "m_2", text: "still there?" }, deps);
  assert.equal(chatCalls[0].session, "fb:PSID9:1752800000000");
  assert.equal(refs.notified.length, 0);
});

test("processDm: duplicate mid is skipped entirely", async () => {
  const { deps, refs } = bridgeDeps({ findActive: async () => ({ id: "fb:PSID9", turns: [{ role: "user", text: "hi", at: 1, mid: "m_dup" }] }) });
  let chatCalled = false;
  deps.chat = async () => { chatCalled = true; return { status: 200, body: { reply: "x" } }; };
  await processDm({ platform: "facebook", senderId: "PSID9", mid: "m_dup", text: "hi" }, deps);
  assert.equal(chatCalled, false);
  assert.equal(refs.sent.length, 0);
});

test("processDm: expired session re-mints a suffixed id and retries once", async () => {
  const { deps, refs } = bridgeDeps();
  const sessions = [];
  deps.chat = async (body) => {
    sessions.push(body.session);
    return sessions.length === 1
      ? { status: 200, body: { expired: true, reply: "" } }
      : { status: 200, body: { reply: "fresh start", escalated: false } };
  };
  await processDm({ platform: "instagram", senderId: "IG7", mid: "m_3", text: "hey" }, deps);
  assert.equal(sessions[0], "ig:IG7");
  assert.equal(sessions[1], "ig:IG7:1752900000000");
  assert.deepEqual(refs.sent[0], { platform: "instagram", recipientId: "IG7", text: "fresh start" });
});

test("processDm: capped reply still gets delivered; empty reply sends nothing", async () => {
  const { deps, refs } = bridgeDeps();
  deps.chat = async () => ({ status: 200, body: { reply: "We've covered a lot!", capped: true } });
  await processDm({ platform: "facebook", senderId: "P", mid: "m4", text: "x" }, deps);
  assert.equal(refs.sent.length, 1);
  const d2 = bridgeDeps(); d2.deps.chat = async () => ({ status: 200, body: { reply: "", degraded: true } });
  await processDm({ platform: "facebook", senderId: "P", mid: "m5", text: "x" }, d2.deps);
  assert.equal(d2.refs.sent.length, 0);
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `node --test tests/meta-dm.test.js` — expected: the 5 new tests FAIL ("not implemented"); prior 6 still pass.

- [ ] **Step 3: Replace the stub**

```javascript
const { processChat } = require("./chat.js");
const { loadActiveByPrefix } = require("./lib/chat-store.js");

const PREFIX = { facebook: "fb:", instagram: "ig:" };

// Bridge one normalized DM event into the chat engine and deliver the reply.
async function processDm(evt, deps = {}) {
  const {
    env = process.env,
    findActive = (p) => loadActiveByPrefix(p, { env }),
    chat = (body) => processChat(body, {}),
    send = (args) => sendDm(args, { env }),
    notify = (text) => notifyOwner({ webhookUrl: env.SLACK_WEBHOOK_URL, text }),
    profile = (id) => getProfile(id, { env }),
    now = Date.now,
  } = deps;

  const base = PREFIX[evt.platform] + evt.senderId;
  const active = await findActive(base);
  if (active && (active.turns || []).some((t) => t.mid === evt.mid)) return { skipped: "dup" };

  const isNew = !active;
  let sessionId = active ? active.id : base;
  let out = await chat({ session: sessionId, message: evt.text, page: evt.platform });
  if (out.body && out.body.expired) {
    sessionId = base + ":" + now();
    out = await chat({ session: sessionId, message: evt.text, page: evt.platform });
  }

  const reply = out.body && out.body.reply;
  if (reply) { try { await send({ platform: evt.platform, recipientId: evt.senderId, text: reply }); } catch (e) {} }

  if (isNew) {
    let name = null;
    try { name = await profile(evt.senderId); } catch (e) {}
    try { await notify(`💬 New ${evt.platform} DM${name ? " from " + name : ""}: ${evt.text.slice(0, 120)}`); } catch (e) {}
  }
  return { sessionId };
}
```

Also: mid-stamping so dedupe works across invocations. `processChat` saves turns without `mid`; wrap its save via deps at the call site in `processDm`'s default `chat`:

```javascript
    chat = (body) => processChat(body, {
      save: (s) => {
        for (let i = s.turns.length - 1; i >= 0; i--) {
          if (s.turns[i].role === "user" && !s.turns[i].mid) { s.turns[i].mid = evt.mid; break; }
        }
        return require("./lib/chat-store.js").saveSession(s, { env });
      },
    }),
```
(Place the mid-stamping `chat` default INSIDE `processDm` so it closes over `evt`; the destructuring default shown first is replaced by this version. Injected test `chat` fns bypass it — that's fine, the dedupe test covers the read side and a unit assertion on the wrapper isn't needed.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/meta-dm.test.js` — expected: PASS (11).

- [ ] **Step 5: Full suite + commit**

Run: `npm test` — green (1078). Existing chat suites must be untouched (no chat.js changes in this task).
```bash
git add netlify/functions/meta-dm.js tests/meta-dm.test.js
git commit -m "feat(meta-dm): conversation bridge - sessions, mid dedupe, re-mint, reply delivery, new-DM notify"
git push
```

---

### Task 5: Installer-reply delivery hook (`lib/meta-deliver.js` + wiring)

**Files:**
- Create: `netlify/functions/lib/meta-deliver.js`
- Modify: `netlify/functions/lib/chat-admin.js` (`installerReply` gains an `onInstallerTurn` dep)
- Modify: `netlify/functions/twilio-sms.js` (`relayInstallerReply` gains the same hook)
- Test: `tests/meta-deliver.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/meta-deliver.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { deliverInstallerTurn, isMetaSession } = require("../netlify/functions/lib/meta-deliver.js");
const admin = require("../netlify/functions/lib/chat-admin.js");

const ENV = { META_PAGE_TOKEN: "tok", SLACK_WEBHOOK_URL: "https://hooks.example" };
const SESS = (id) => ({ id, recordId: "recX", status: "escalated", customerName: "Pat", phone: "612",
  installer: "aaron", turns: [{ role: "user", text: "hi", at: 1 }], lastActivity: new Date().toISOString() });

test("isMetaSession recognizes fb:/ig: ids only", () => {
  assert.equal(isMetaSession("fb:123"), true);
  assert.equal(isMetaSession("ig:9:1752"), true);
  assert.equal(isMetaSession("web-uuid-1"), false);
});

test("deliverInstallerTurn sends to Meta with the right platform/recipient", async () => {
  const sent = [];
  await deliverInstallerTurn(SESS("ig:IG7:1752"), { role: "installer", text: "On my way", at: 2 },
    { env: ENV, send: async (a) => { sent.push(a); return { ok: true }; } });
  assert.deepEqual(sent[0], { platform: "instagram", recipientId: "IG7", text: "On my way" });
});

test("deliverInstallerTurn is a no-op for web sessions", async () => {
  let called = false;
  await deliverInstallerTurn(SESS("web-uuid"), { role: "installer", text: "x", at: 2 },
    { env: ENV, send: async () => { called = true; } });
  assert.equal(called, false);
});

test("window-closed send appends a system note and notifies", async () => {
  const saved = [], notified = [];
  await deliverInstallerTurn(SESS("fb:P9"), { role: "installer", text: "late reply", at: 2 }, {
    env: ENV,
    send: async () => ({ ok: false, windowClosed: true }),
    saveFn: async (s) => { saved.push(s); return s; },
    notify: async (t) => { notified.push(t); },
  });
  const note = saved[0].turns[saved[0].turns.length - 1];
  assert.equal(note.role, "system");
  assert.match(note.text, /window closed/i);
  assert.match(note.text, /612/);
  assert.equal(notified.length, 1);
});

test("chat-admin installerReply fires onInstallerTurn after save with the sess and turn", async () => {
  const hook = [];
  const out = await admin.installerReply("fb:P9", "aaron", "reply text", {
    env: ENV,
    loadFn: async () => SESS("fb:P9"),
    saveFn: async (s) => s,
    now: () => 777,
    onInstallerTurn: async (sess, turn) => { hook.push([sess.id, turn]); },
  });
  assert.equal(out.status, "ok");
  assert.deepEqual(hook[0], ["fb:P9", { role: "installer", text: "reply text", at: 777 }]);
});

test("installerReply survives a sync-throwing onInstallerTurn", async () => {
  const out = await admin.installerReply("fb:P9", "aaron", "x", {
    env: ENV, loadFn: async () => SESS("fb:P9"), saveFn: async (s) => s,
    onInstallerTurn: () => { throw new Error("boom"); },
  });
  assert.equal(out.status, "ok");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/meta-deliver.test.js` — expected: FAIL, module not found.

- [ ] **Step 3: Implement `lib/meta-deliver.js`**

```javascript
// netlify/functions/lib/meta-deliver.js
// Pushes installer turns (console inbox reply or SMS relay) back out to the
// customer's Messenger/Instagram thread. No-op for web sessions. Window-lapse
// (customer silent > 24h) appends a visible system note with the fallback phone
// and Slacks the owner — the reply itself stays in the transcript either way.
const { sendDm } = require("./meta-graph.js");
const { saveSession } = require("./chat-store.js");
const { notifyOwner } = require("./alert.js");

const RE = /^(fb|ig):([^:]+)/;

function isMetaSession(id) { return RE.test(String(id || "")); }

async function deliverInstallerTurn(sess, turn, deps = {}) {
  const { env = process.env, send = (a) => sendDm(a, { env }),
    saveFn = (s) => saveSession(s, { env }),
    notify = (t) => notifyOwner({ webhookUrl: env.SLACK_WEBHOOK_URL, text: t }), log = console } = deps;
  const m = RE.exec(String(sess && sess.id || ""));
  if (!m) return { skipped: true };
  const platform = m[1] === "fb" ? "facebook" : "instagram";
  let out;
  try { out = await send({ platform, recipientId: m[2], text: turn.text }); }
  catch (e) { out = { ok: false, error: e.message }; }
  if (out && out.windowClosed) {
    try {
      sess.turns.push({ role: "system", text: `⚠ ${platform} window closed — this reply was NOT delivered. Reach the customer at ${sess.phone || "their listed contact"}.`, at: Date.now() });
      await saveFn(sess);
    } catch (e) { if (log.error) log.error("meta-deliver note", e.message); }
    try { notify(`⚠ Meta reply window closed for ${sess.customerName || sess.id} — installer reply not delivered; fallback: ${sess.phone || "n/a"}`).catch(() => {}); } catch (e) {}
  } else if (out && out.ok === false && !out.skipped) {
    try { notify(`⚠ Meta reply send failed for ${sess.id}: ${out.error || "unknown"}`).catch(() => {}); } catch (e) {}
  }
  return out;
}

module.exports = { deliverInstallerTurn, isMetaSession };
```

- [ ] **Step 4: Wire the hook into `lib/chat-admin.js`**

In `installerReply`, add to the deps destructuring: `onInstallerTurn = require("./meta-deliver.js").deliverInstallerTurn` — then after `await saveFn(sess, deps);` insert:

```javascript
  const turn = sess.turns[sess.turns.length - 1];
  try { Promise.resolve(onInstallerTurn(sess, turn, deps)).catch(() => {}); } catch (e) {}
```
(Fire-and-forget, sync-throw-safe — same pattern as the chat notify. `require` inline or top-of-file; top-of-file is fine, no cycle: meta-deliver does not import chat-admin.)

- [ ] **Step 5: Wire the hook into `netlify/functions/twilio-sms.js`**

In `relayInstallerReply`, mirror it: add `onInstallerTurn = require("./lib/meta-deliver.js").deliverInstallerTurn` to its deps destructuring and, after the successful `await save(sess)`, insert the same two-line fire-and-forget with the turn just pushed. (SMS relay to a DM session happens when an installer answers the escalation SMS for a Meta conversation.)

- [ ] **Step 6: Run tests**

Run: `node --test tests/meta-deliver.test.js` (PASS, 6) then `node --test tests/chat-admin.test.js tests/twilio-sms.test.js` (or the twilio relay's actual test file — find it with `ls tests | grep twilio`) — all green: the hook must not disturb existing behavior (default hook on web sessions is a no-op via `isMetaSession`).

- [ ] **Step 7: Full suite + commit**

Run: `npm test` — green (1084).
```bash
git add netlify/functions/lib/meta-deliver.js netlify/functions/lib/chat-admin.js netlify/functions/twilio-sms.js tests/meta-deliver.test.js
git commit -m "feat(meta-dm): installer replies deliver to Messenger/IG - window-lapse note + fallback"
git push
```

---

### Task 6: Activation runbook + ship

**Files:**
- Create: `docs/operations/meta-dm-activation.md`
- Modify: `docs/operations/README.md` (add one index line matching its existing list style)

- [ ] **Step 1: Write the runbook**

```markdown
# Meta DM Feeder — Activation Runbook (Messenger + Instagram)

Code is live and dormant (spec `2026-07-20-meta-dm-feeder-design.md`): the webhook
fails closed until the env vars below exist. Owner does the Meta clicks; each
"→ Claude" line is the handoff.

## Phase A — Facebook Messenger (works in Development Mode, ~1 sitting)

1. **Create the app:** developers.facebook.com → My Apps → Create App → type
   **Business** → name "Tuned Yota DM". (Log in with the account that admins the
   Tuned Yota Facebook Page.)
2. **App secret:** App Settings → Basic → App Secret → Show. → **Claude:** set as
   Netlify env `META_APP_SECRET` (clipboard flow — never in chat).
3. **Verify token:** invent a random string (or ask Claude to generate one). →
   **Claude:** set as `META_VERIFY_TOKEN`.
4. **Add Messenger:** Dashboard → Add Product → **Messenger** → Set up.
5. **Page token:** Messenger → Messenger API Settings → Generate token for the
   Tuned Yota Page (grants `pages_messaging`, `pages_manage_metadata`). →
   **Claude:** set as `META_PAGE_TOKEN`. (Redeploy after env changes — stale-deploy gotcha.)
6. **Webhook:** same Messenger settings → Configure webhooks →
   Callback URL `https://tunedyota.com/.netlify/functions/meta-dm`, Verify token =
   the string from step 3 → Verify and save (the GET handshake must pass — env
   must be set FIRST). Subscribe the Page to the **messages** field.
7. **Smoke test:** from a personal account, PM the Page. Expect: AI answer in
   Messenger within seconds · Slack "New facebook DM" ping · ask for a human +
   give contact/vehicle/city → escalation SMS/push → session in the console
   Chats tab → reply from the console → reply appears in Messenger.

## Phase B — Instagram DMs (Meta-gated, days-to-weeks)

Prereq (already true per owner): IG account is Business/Creator AND linked to the
Facebook Page.

1. **Add product:** Dashboard → Add Product → **Instagram** → set up Instagram
   messaging with the linked account.
2. **App Review:** request **Advanced Access** for `instagram_manage_messages`
   (+ `instagram_basic`, `pages_manage_metadata`). Meta wants a screencast: record
   the Phase-A Messenger flow (DM → AI reply → human handoff) and describe the
   identical IG use. Business Verification may be requested — follow their steps
   (business documents for Tuned Yota LLC).
3. **On approval:** Webhooks → **Instagram** object → subscribe **messages** with
   the same callback URL + verify token. No code changes, no new env.
4. **Smoke test:** DM the IG account; same expectations as Phase A step 7.

## Env registry
| Var | What |
|---|---|
| `META_APP_SECRET` | App Settings → Basic (webhook HMAC auth) |
| `META_VERIFY_TOKEN` | invented string (webhook handshake) |
| `META_PAGE_TOKEN` | Page access token (send API + profile lookup, both platforms) |
| `META_GRAPH_VERSION` | optional, default v22.0 |

Inbound keeps working (leads never lost) even if `META_PAGE_TOKEN` is missing —
only outbound replies pause, with a Slack alert.
```

- [ ] **Step 2: Index it**

Open `docs/operations/README.md`, find its doc list, add a line for `meta-dm-activation.md` in the same format ("Meta DM feeder activation — Messenger/IG webhook + AI chat go-live").

- [ ] **Step 3: Full verification sweep**

Run: `npm test` — every suite green (1084). Run `node --test tests/meta-dm.test.js tests/meta-graph.test.js tests/meta-deliver.test.js tests/chat-store-prefix.test.js` once more, isolated.

- [ ] **Step 4: Ship + live fail-closed verify**

```bash
git add docs/operations/meta-dm-activation.md docs/operations/README.md
git commit -m "docs(meta-dm): activation runbook - phased Messenger/IG go-live"
git push
```
After the Netlify deploy (~2 min): `curl -s -o /dev/null -w "%{http_code}" "https://tunedyota.com/.netlify/functions/meta-dm?hub.verify_token=x&hub.challenge=1"` → expect **403** (deployed, fail-closed, awaiting env). A POST without signature → 403 likewise.

---

## Self-review notes (already applied)

- Spec §1→Task 3, §2→Tasks 2+4, §3→Tasks 1+5, §4→Task 6, §5 fail-closed→Tasks 1/3/6, §6 tests→every task. Out-of-scope items have no tasks (correct).
- Type consistency: `sendDm({platform, recipientId, text}, deps)` (Tasks 1/4/5); normalized event `{platform, senderId, mid, text}` (Tasks 3/4); `onInstallerTurn(sess, turn, deps)` (Task 5 test ↔ wiring); session prefixes `fb:`/`ig:` everywhere.
- Deliberate choices an implementer must not "fix": always-200 on valid-signature POSTs; inbound ingestion independent of `META_PAGE_TOKEN`; `role:"system"` note renders as "AI" in the console (acceptable); mid-stamping lives in `processDm`'s save wrapper, not in chat.js (chat.js is untouched in Task 4).
