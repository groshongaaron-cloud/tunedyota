# OTT Email Lead Loop (Gmail adapter) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest OTT "A New Lead From Facebook Ads" emails from `info@tunedyota.com` into the live lead tracker (tagged `ott-national`, capturing thread/reply refs), and auto-reply in the original thread confirming completion when the tune is closed out.

**Architecture:** Two scheduled Netlify functions over a thin, injectable Gmail REST client (`lib/gmail.js`, OAuth2 refresh-token via the existing `google-auth-library`). `gmail-lead-poll` parses new lead emails (`lib/ott-email.js`) and POSTs them to the already-live `/lead-ingest` (task-secret auth) with email refs; `ott-reply-sweep` finds OTT-lead bookings marked Completed and sends the templated in-thread reply, stamping the lead. Small Core extension persists the email refs and adds the `ott-national` channel.

**Tech Stack:** Node (`node --test`), Netlify Functions + scheduled crons, Gmail REST API, `google-auth-library` (OAuth2Client — already a dep), Airtable REST (`lib/airtable.js`).

**Spec:** `docs/superpowers/specs/2026-07-15-ott-email-lead-loop-design.md`

**Two external gates (do not block the code tasks — the adapter is inert-safe until both are met):**
- **A real sample email** finalizes the parser (Task 5).
- **Google OAuth setup + 4 Airtable columns** activate it live (Tasks 1 & 8).

---

## File structure

**Create:**
- `netlify/functions/lib/gmail.js` — Gmail client: `getAccessToken`, `listMessages`, `getMessage`(+normalize), `ensureLabel`/`addLabel`, `sendReply`. Injectable `fetchImpl`/`tokenImpl`.
- `netlify/functions/lib/ott-email.js` — `parseOttLeadEmail(message)` pure parser.
- `netlify/functions/gmail-lead-poll.js` — scheduled ingest.
- `netlify/functions/ott-reply-sweep.js` — scheduled completion reply.
- `tests/gmail.test.js`, `tests/ott-email.test.js`, `tests/gmail-lead-poll.test.js`, `tests/ott-reply-sweep.test.js`.
- `tests/fixtures/ott-lead-sample.txt` — the real captured email (Task 5).

**Modify:**
- `netlify/functions/lib/leads.js` — add `ott-national` to `CHANNELS`; persist `emailThread`/`emailMessageId`/`replyTo` in `processLeadIngest`.
- `tests/leads.test.js` — cover the two additions.
- `site/installer.html` — `CHAN_ICON["ott-national"]` + add `ott-national` to the log-a-lead channel `<select>`.
- `netlify.toml` — schedule the two functions.

**Owner setup (Tasks 1 & 8):** 4 Airtable columns + `ott-national` Channel option; Google OAuth env.

---

## Task 1: Airtable columns + `ott-national` Channel option (owner/schema)

**Files:** none (Airtable schema).

- [ ] **Step 1: Add via schema token** (per `[[airtable-metadata-api]]`; single-use token named e.g. `ty-ott-email-schema-temp-2026-07-15`, scopes `schema.bases:read/write` + `data.records:read`). Add to **Priority List**:
  - `Email Thread` (Single line text), `Email Message-Id` (Single line text), `Reply-To` (Single line text), `OTT Reply Sent` (Date, ISO).
  - Add a new choice **`ott-national`** to the existing `Channel` single-select.
- [ ] **Step 2: Verify** the four columns accept writes and `Channel` accepts `ott-national` (create+delete a probe record, as done for the Core's six columns).
- [ ] **Step 3:** No commit (schema only). Code tolerates their absence, so implementation is not blocked.

---

## Task 2: Core — `ott-national` channel + persist email refs

**Files:**
- Modify: `netlify/functions/lib/leads.js`
- Test: `tests/leads.test.js`

- [ ] **Step 1: Write the failing test** (append to `tests/leads.test.js`)

```js
test("ott-national is a valid channel", () => {
  assert.equal(L.validChannel("ott-national"), true);
});

test("processLeadIngest persists email refs when provided (create path)", async () => {
  let created;
  await L.processLeadIngest(
    { name: "Dana", email: "d@x.com", channel: "ott-national", source: "ott-national:fb-ads",
      emailThread: "thr123", emailMessageId: "<msg-1@mail>", replyTo: "info@overlandtailor.com" },
    { list: async () => [], create: async (a) => { created = a.fields; return { id: "recN" }; } });
  assert.equal(created.Channel, "ott-national");
  assert.equal(created["Email Thread"], "thr123");
  assert.equal(created["Email Message-Id"], "<msg-1@mail>");
  assert.equal(created["Reply-To"], "info@overlandtailor.com");
});

test("processLeadIngest keeps email refs on a dedupe-append", async () => {
  let updated;
  const existing = { id: "recX", fields: { Email: "d@x.com", Stage: "New", "Activity Log": "old" } };
  await L.processLeadIngest(
    { name: "Dana", email: "d@x.com", channel: "ott-national", emailThread: "thr9", emailMessageId: "<m9@x>", replyTo: "r@x.com", message: "again" },
    { list: async () => [existing], update: async (a) => { updated = a.fields; return { id: a.id }; }, create: async () => ({}) });
  assert.equal(updated["Email Thread"], "thr9");
  assert.match(updated["Activity Log"], /old/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/leads.test.js`
Expected: FAIL — `ott-national` not valid / `Email Thread` undefined.

- [ ] **Step 3: Implement** in `netlify/functions/lib/leads.js`:

(a) Add `"ott-national"` to the `CHANNELS` array:
```js
const CHANNELS = ["email", "facebook", "instagram", "sms", "phone", "walk-in", "other", "ott-national"];
```

(b) In `processLeadIngest`, compute the email refs once (after `const email = ...`):
```js
  const emailThread = String(d.emailThread || "").trim();
  const emailMessageId = String(d.emailMessageId || "").trim();
  const replyTo = String(d.replyTo || "").trim();
```

(c) In the **dedupe-append** branch, add the refs to `fields` (only when present) before the `updateTolerant` call:
```js
    if (emailThread) fields["Email Thread"] = emailThread;
    if (emailMessageId) fields["Email Message-Id"] = emailMessageId;
    if (replyTo) fields["Reply-To"] = replyTo;
```
and extend that call's optional-keys: `["Last Contact", "Activity Log", "Email Thread", "Email Message-Id", "Reply-To"]`.

(d) In the **create** branch, add to the `fields` object:
```js
    ...(emailThread ? { "Email Thread": emailThread } : {}),
    ...(emailMessageId ? { "Email Message-Id": emailMessageId } : {}),
    ...(replyTo ? { "Reply-To": replyTo } : {}),
```
and extend the `createTolerant` optional-keys with `"Email Thread", "Email Message-Id", "Reply-To"`.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/leads.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/leads.js tests/leads.test.js
git commit -m "feat(leads): ott-national channel + persist email refs on ingest"
```

---

## Task 3: Console — `ott-national` icon + log-a-lead option

**Files:**
- Modify: `site/installer.html`

- [ ] **Step 1: Add the icon** — find `var CHAN_ICON={email:'📧',sms:'💬',phone:'📞',facebook:'f',instagram:'ig','walk-in':'🚶',other:'•'};` and add the key:
```js
  var CHAN_ICON={email:'📧',sms:'💬',phone:'📞',facebook:'f',instagram:'ig','walk-in':'🚶','ott-national':'🇺🇸',other:'•'};
```

- [ ] **Step 2: Add to the log-a-lead dropdown** — find the channel `<select>` build in `logLeadForm`:
```js
    var ch=document.createElement('select'); ch.innerHTML=['phone','sms','email','facebook','instagram','walk-in','other'].map(function(x){return '<option>'+x+'</option>';}).join('');
```
and add `'ott-national'` to that array (after `'other'` or before — order is cosmetic).

- [ ] **Step 3: Verify the console still boots** — run the existing browser test:

Run: `node --test tests/leads-browser.test.mjs`
Expected: PASS (or skips without a browser).

- [ ] **Step 4: Commit**

```bash
git add site/installer.html
git commit -m "feat(leads): ott-national channel icon + log-a-lead option"
```

---

## Task 4: `lib/gmail.js` — Gmail REST client

**Files:**
- Create: `netlify/functions/lib/gmail.js`
- Test: `tests/gmail.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/gmail.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const G = require("../netlify/functions/lib/gmail.js");

const tokenImpl = async () => "acc-tok";

test("listMessages issues a search and returns id/threadId pairs", async () => {
  let seenUrl;
  const fetchImpl = async (url) => { seenUrl = url; return { ok: true, json: async () => ({ messages: [{ id: "m1", threadId: "t1" }] }) }; };
  const out = await G.listMessages("subject:x", { fetchImpl, tokenImpl });
  assert.match(seenUrl, /messages\?q=subject%3Ax/);
  assert.deepEqual(out, [{ id: "m1", threadId: "t1" }]);
});

test("getMessage normalizes headers + decodes the text/plain body", async () => {
  const b64 = (s) => Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const fetchImpl = async () => ({ ok: true, json: async () => ({ id: "m1", threadId: "t1", payload: {
    headers: [{ name: "From", value: "OTT <info@overlandtailor.com>" }, { name: "Reply-To", value: "lead@x.com" },
      { name: "Subject", value: "A New Lead From Facebook Ads" }, { name: "Message-ID", value: "<abc@mail>" }],
    parts: [{ mimeType: "text/plain", body: { data: b64("Hello lead") } }] } }) });
  const m = await G.getMessage("m1", { fetchImpl, tokenImpl });
  assert.equal(m.threadId, "t1");
  assert.equal(m.headers.from, "OTT <info@overlandtailor.com>");
  assert.equal(m.headers.replyTo, "lead@x.com");
  assert.equal(m.headers.messageId, "<abc@mail>");
  assert.equal(m.textBody, "Hello lead");
});

test("sendReply posts a base64url raw message with threadId + In-Reply-To", async () => {
  let body;
  const fetchImpl = async (url, opts) => { body = JSON.parse(opts.body); return { ok: true, json: async () => ({ id: "sent1" }) }; };
  const r = await G.sendReply({ threadId: "t1", to: "lead@x.com", inReplyTo: "<abc@mail>", references: "<abc@mail>",
    subject: "Re: A New Lead From Facebook Ads", body: "done" }, { fetchImpl, tokenImpl });
  assert.equal(r.id, "sent1");
  assert.equal(body.threadId, "t1");
  const raw = Buffer.from(body.raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString();
  assert.match(raw, /To: lead@x.com/);
  assert.match(raw, /In-Reply-To: <abc@mail>/);
  assert.match(raw, /done/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/gmail.test.js`
Expected: FAIL — cannot find module `lib/gmail.js`.

- [ ] **Step 3: Implement**

```js
// netlify/functions/lib/gmail.js
// Thin Gmail REST client for info@tunedyota.com. OAuth2 refresh-token auth via
// google-auth-library (already a dep). All I/O injectable for unit tests.
const { OAuth2Client } = require("google-auth-library");
const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

async function defaultToken(env) {
  const c = new OAuth2Client(env.GMAIL_CLIENT_ID, env.GMAIL_CLIENT_SECRET);
  c.setCredentials({ refresh_token: env.GMAIL_REFRESH_TOKEN });
  const t = await c.getAccessToken();
  return (t && t.token) ? t.token : t;
}
function b64url(s) { return Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function b64urlDecode(s) { return Buffer.from(String(s || "").replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"); }

async function authFetch(path, opts, deps) {
  const { fetchImpl = fetch, tokenImpl, env = process.env } = deps;
  const token = await (tokenImpl ? tokenImpl() : defaultToken(env));
  const res = await fetchImpl(`${BASE}${path}`, { ...opts, headers: { Authorization: `Bearer ${token}`,
    "Content-Type": "application/json", ...(opts && opts.headers) } });
  if (!res.ok) throw new Error(`gmail ${path} ${res.status}`);
  return res.json();
}

async function listMessages(query, deps) {
  const j = await authFetch(`/messages?q=${encodeURIComponent(query)}`, {}, deps);
  return (j.messages || []).map((m) => ({ id: m.id, threadId: m.threadId }));
}

function pickBody(payload) {
  // Prefer text/plain; fall back to text/html. Walk one level of parts.
  const parts = payload.parts || [payload];
  let text = "", html = "";
  for (const p of parts) {
    const data = p.body && p.body.data;
    if (!data) continue;
    if (p.mimeType === "text/plain" && !text) text = b64urlDecode(data);
    if (p.mimeType === "text/html" && !html) html = b64urlDecode(data);
  }
  return { text, html };
}
async function getMessage(id, deps) {
  const j = await authFetch(`/messages/${id}?format=full`, {}, deps);
  const h = {};
  for (const { name, value } of (j.payload && j.payload.headers) || []) h[name.toLowerCase()] = value;
  const { text, html } = pickBody(j.payload || {});
  return { id: j.id, threadId: j.threadId,
    headers: { from: h.from || "", to: h.to || "", cc: h.cc || "", replyTo: h["reply-to"] || "",
      subject: h.subject || "", messageId: h["message-id"] || "", date: h.date || "" },
    textBody: text, htmlBody: html };
}

async function ensureLabel(name, deps) {
  const j = await authFetch(`/labels`, {}, deps);
  const found = (j.labels || []).find((l) => l.name === name);
  if (found) return found.id;
  const created = await authFetch(`/labels`, { method: "POST", body: JSON.stringify({ name,
    labelListVisibility: "labelShow", messageListVisibility: "show" }) }, deps);
  return created.id;
}
async function addLabel(id, name, deps) {
  const labelId = await ensureLabel(name, deps);
  return authFetch(`/messages/${id}/modify`, { method: "POST", body: JSON.stringify({ addLabelIds: [labelId] }) }, deps);
}

async function sendReply({ threadId, to, inReplyTo, references, subject, body }, deps) {
  const lines = [`To: ${to}`, `Subject: ${subject}`,
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : null, references ? `References: ${references}` : null,
    "Content-Type: text/plain; charset=UTF-8", "", body].filter((x) => x !== null).join("\r\n");
  return authFetch(`/messages/send`, { method: "POST", body: JSON.stringify({ raw: b64url(lines), threadId }) }, deps);
}

module.exports = { listMessages, getMessage, ensureLabel, addLabel, sendReply, b64url, b64urlDecode };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/gmail.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/gmail.js tests/gmail.test.js
git commit -m "feat(gmail): injectable Gmail REST client (list/get/label/reply)"
```

---

## Task 5: `lib/ott-email.js` — parse the OTT lead email (SAMPLE-GATED)

**Files:**
- Create: `netlify/functions/lib/ott-email.js`
- Create: `tests/fixtures/ott-lead-sample.txt` (the real email — captured at execution time)
- Test: `tests/ott-email.test.js`

> **This task needs one real OTT lead email.** Save it verbatim to `tests/fixtures/ott-lead-sample.txt`. Then adjust the test's expected values + the parser's field regexes to match what that email actually contains. The parser below is a robust first pass (labeled-field scan + header fallbacks); refine the regexes against the fixture. If the email carries no customer contact fields, keep the header/`Reply-To` fallbacks so the lead still tracks on its email refs.

- [ ] **Step 1: Save the real sample** to `tests/fixtures/ott-lead-sample.txt` (headers + body). Until available, a representative fixture matching the described format is used and flagged to be replaced.

- [ ] **Step 2: Write the test**

```js
// tests/ott-email.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseOttLeadEmail } = require("../netlify/functions/lib/ott-email.js");

// A normalized message as lib/gmail.getMessage() would produce. Replace the body with
// the real tests/fixtures/ott-lead-sample.txt contents once captured, and adjust asserts.
const msg = {
  id: "m1", threadId: "t-abc",
  headers: { from: "Overland Tailor <info@overlandtailor.com>", cc: "Aaron Groshong <info@tunedyota.com>",
    replyTo: "", subject: "A New Lead From Facebook Ads", messageId: "<lead-abc@mail>", date: "Tue, 15 Jul 2026 09:00:00 -0500" },
  textBody: "Full Name: Jane Customer\nPhone: 6125550147\nEmail: jane@example.com\nVehicle: 2022 Tundra\n\nThank you for contacting Overland Tailor Tuning.",
};

test("parseOttLeadEmail extracts contact fields + always the email refs + ott-national tag", () => {
  const p = parseOttLeadEmail(msg);
  assert.equal(p.channel, "ott-national");
  assert.equal(p.source, "ott-national:fb-ads");
  assert.equal(p.threadId, "t-abc");
  assert.equal(p.messageIdHeader, "<lead-abc@mail>");
  assert.equal(p.name, "Jane Customer");
  assert.equal(p.phone, "6125550147");
  assert.equal(p.email, "jane@example.com");
  assert.equal(p.vehicle, "2022 Tundra");
  assert.equal(p.replyTo, "info@overlandtailor.com"); // falls back to From when Reply-To absent
});

test("parseOttLeadEmail on a boilerplate-only email still yields refs + a fallback name", () => {
  const bare = { ...msg, textBody: "Thank you for contacting Overland Tailor Tuning." };
  const p = parseOttLeadEmail(bare);
  assert.equal(p.threadId, "t-abc");
  assert.equal(p.channel, "ott-national");
  assert.ok(p.name && p.name.length > 0); // e.g. "OTT National Lead"
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `node --test tests/ott-email.test.js`
Expected: FAIL — cannot find module `lib/ott-email.js`.

- [ ] **Step 4: Implement**

```js
// netlify/functions/lib/ott-email.js
// Parse an OTT "A New Lead From Facebook Ads" email (normalized by lib/gmail.js) into
// the /lead-ingest shape. Refine the field regexes against tests/fixtures/ott-lead-sample.txt.
function firstEmail(s) { const m = String(s || "").match(/[\w.+-]+@[\w-]+\.[\w.-]+/); return m ? m[0] : ""; }
function fieldAfter(body, labels) {
  for (const label of labels) {
    const re = new RegExp(`${label}\\s*[:\\-]\\s*(.+)`, "i");
    const m = String(body || "").match(re);
    if (m && m[1].trim()) return m[1].trim();
  }
  return "";
}
function parseOttLeadEmail(message) {
  const h = message.headers || {};
  const body = message.textBody || "";
  const name = fieldAfter(body, ["Full Name", "Name", "Customer"]) || "OTT National Lead";
  const phone = (fieldAfter(body, ["Phone", "Phone Number", "Mobile"]) || "").replace(/[^\d+]/g, "");
  const email = fieldAfter(body, ["Email"]) || firstEmail(body);
  const vehicle = fieldAfter(body, ["Vehicle", "Car", "Truck"]);
  const replyTo = (h.replyTo || h.from || "").match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return {
    name, phone, email, vehicle, goals: "",
    channel: "ott-national", source: "ott-national:fb-ads",
    replyTo: replyTo ? replyTo[0] : "",
    threadId: message.threadId || "",
    messageIdHeader: h.messageId || "",
  };
}
module.exports = { parseOttLeadEmail, fieldAfter, firstEmail };
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --test tests/ott-email.test.js`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/lib/ott-email.js tests/ott-email.test.js tests/fixtures/ott-lead-sample.txt
git commit -m "feat(leads): parseOttLeadEmail (refine against real sample)"
```

---

## Task 6: `gmail-lead-poll` — scheduled ingest

**Files:**
- Create: `netlify/functions/gmail-lead-poll.js`
- Test: `tests/gmail-lead-poll.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/gmail-lead-poll.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runPoll } = require("../netlify/functions/gmail-lead-poll.js");

test("runPoll parses each new email, posts to lead-ingest, labels it", async () => {
  const posted = [], labeled = [];
  const gmail = {
    listMessages: async () => [{ id: "m1", threadId: "t1" }],
    getMessage: async () => ({ id: "m1", threadId: "t1",
      headers: { from: "OTT <info@overlandtailor.com>", replyTo: "", subject: "A New Lead From Facebook Ads", messageId: "<x@m>" },
      textBody: "Full Name: Jo\nPhone: 6125550147\nEmail: jo@x.com" }),
    addLabel: async (id, name) => { labeled.push([id, name]); },
  };
  const out = await runPoll({ env: { INTERNAL_TASK_SECRET: "sec", URL: "https://tunedyota.com" }, gmail,
    postImpl: async (url, opts) => { posted.push({ url, headers: opts.headers, body: JSON.parse(opts.body) });
      return { ok: true, json: async () => ({ status: "lead", recordId: "r1", deduped: false }) }; } });
  assert.equal(out.ingested, 1);
  assert.equal(posted[0].headers["x-ty-task"], "sec");
  assert.equal(posted[0].body.channel, "ott-national");
  assert.equal(posted[0].body.emailThread, "t1");
  assert.equal(posted[0].body.emailMessageId, "<x@m>");
  assert.deepEqual(labeled[0], ["m1", "ty-ingested"]);
});

test("runPoll labels a parse/ingest failure ty-ingest-failed and continues", async () => {
  const labeled = [];
  const gmail = {
    listMessages: async () => [{ id: "m1", threadId: "t1" }],
    getMessage: async () => ({ id: "m1", threadId: "t1", headers: { subject: "A New Lead From Facebook Ads" }, textBody: "x" }),
    addLabel: async (id, name) => { labeled.push([id, name]); },
  };
  const out = await runPoll({ env: { INTERNAL_TASK_SECRET: "sec" }, gmail,
    postImpl: async () => ({ ok: false, status: 400, json: async () => ({ status: "error", error: "missing-contact" }) }) });
  assert.equal(out.ingested, 0);
  assert.deepEqual(labeled[0], ["m1", "ty-ingest-failed"]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/gmail-lead-poll.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

```js
// netlify/functions/gmail-lead-poll.js
// Scheduled: find new OTT lead emails, parse, POST to /lead-ingest, label processed.
const gmailLib = require("./lib/gmail.js");
const { parseOttLeadEmail } = require("./lib/ott-email.js");

// 60-day lookback ("60 days in arrears") so first activation backfills recent leads.
const QUERY = 'subject:"A New Lead From Facebook Ads" -label:ty-ingested -label:ty-ingest-failed newer_than:60d';

async function runPoll(deps = {}) {
  const env = deps.env || process.env;
  if (!env.GMAIL_REFRESH_TOKEN && !deps.gmail) return { ingested: 0, skipped: "no-gmail-config" };
  const gmail = deps.gmail || gmailLib;
  const post = deps.postImpl || fetch;
  const base = env.LEAD_INGEST_URL || (env.URL ? `${env.URL}/.netlify/functions/lead-ingest` : "https://tunedyota.com/.netlify/functions/lead-ingest");
  const msgs = await gmail.listMessages(QUERY, { env });
  let ingested = 0;
  for (const { id } of msgs) {
    try {
      const full = await gmail.getMessage(id, { env });
      const lead = parseOttLeadEmail(full);
      const body = { name: lead.name, phone: lead.phone, email: lead.email, vehicle: lead.vehicle,
        channel: lead.channel, source: lead.source, emailThread: lead.threadId, emailMessageId: lead.messageIdHeader, replyTo: lead.replyTo };
      const res = await post(base, { method: "POST",
        headers: { "Content-Type": "application/json", "x-ty-task": env.INTERNAL_TASK_SECRET || "" }, body: JSON.stringify(body) });
      if (res.ok) { await gmail.addLabel(id, "ty-ingested", { env }); ingested++; }
      else { await gmail.addLabel(id, "ty-ingest-failed", { env }); }
    } catch (e) { try { await gmail.addLabel(id, "ty-ingest-failed", { env }); } catch (_) {} }
  }
  return { ingested, scanned: msgs.length };
}
async function handler() { const out = await runPoll({}); return { statusCode: 200, body: JSON.stringify(out) }; }
module.exports = { handler, runPoll };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/gmail-lead-poll.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/gmail-lead-poll.js tests/gmail-lead-poll.test.js
git commit -m "feat(leads): gmail-lead-poll ingest (parse → lead-ingest → label)"
```

---

## Task 7: `ott-reply-sweep` — completion reply + schedules

**Files:**
- Create: `netlify/functions/ott-reply-sweep.js`
- Modify: `netlify.toml`
- Test: `tests/ott-reply-sweep.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/ott-reply-sweep.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runReplySweep, buildReplyBody } = require("../netlify/functions/ott-reply-sweep.js");

const leadRec = (f) => ({ id: "L1", fields: Object.assign({ Name: "Jo", "Email Thread": "t1", "Email Message-Id": "<x@m>",
  "Reply-To": "info@overlandtailor.com", "Converted Booking": "recBk", "OTT Reply Sent": "" }, f) });

test("buildReplyBody fills vehicle/date/installer", () => {
  const b = buildReplyBody({ Vehicle: "2022 Tundra", Installer: "cody", "Calibration Date": "2026-07-20" });
  assert.match(b, /2022 Tundra/);
  assert.match(b, /completed/i);
});

test("runReplySweep replies for a Completed OTT booking and stamps the lead", async () => {
  let sent, stamped;
  const out = await runReplySweep({ today: "2026-07-21",
    listLeadsImpl: async () => [leadRec()],
    getBookingImpl: async () => ({ id: "recBk", fields: { Status: "Completed", Vehicle: "2022 Tundra", Installer: "cody" } }),
    gmail: { sendReply: async (m) => { sent = m; return { id: "s1" }; } },
    updateLeadImpl: async (a) => { stamped = a.fields; return { id: a.id }; }, env: {} });
  assert.equal(out.replied, 1);
  assert.equal(sent.threadId, "t1");
  assert.equal(sent.inReplyTo, "<x@m>");
  assert.equal(sent.to, "info@overlandtailor.com");
  assert.equal(stamped["OTT Reply Sent"], "2026-07-21");
});

test("runReplySweep skips a booking that is not Completed", async () => {
  const out = await runReplySweep({ today: "2026-07-21", listLeadsImpl: async () => [leadRec()],
    getBookingImpl: async () => ({ id: "recBk", fields: { Status: "Booked" } }),
    gmail: { sendReply: async () => { throw new Error("should not send"); } }, updateLeadImpl: async () => ({}), env: {} });
  assert.equal(out.replied, 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/ott-reply-sweep.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

```js
// netlify/functions/ott-reply-sweep.js
// Scheduled: for each OTT-national lead whose converted booking is Completed and whose
// OTT reply hasn't been sent, reply in the original email thread and stamp the lead.
const { cfg, listAllRecords, getRecord, updateTolerant, updateRecord } = require("./lib/airtable.js");
const gmailLib = require("./lib/gmail.js");

function buildReplyBody(bf) {
  const veh = bf.Vehicle || "vehicle"; const inst = bf.Installer || "our installer";
  const date = (bf["Calibration Date"] || bf["Event Date"] || "").slice(0, 10);
  return `Hi John — this lead has been completed. The customer's ${veh} was tuned${date ? " on " + date : ""} by ${inst} at Tuned Yota (an OTT retailer). Thanks!\n\n— Aaron, Tuned Yota`;
}

async function runReplySweep(deps = {}) {
  const env = deps.env || process.env;
  const today = deps.today || new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const c = cfg(env);
  const gmail = deps.gmail || gmailLib;
  const listLeads = deps.listLeadsImpl || ((a) => listAllRecords({ ...a }));
  const getBooking = deps.getBookingImpl || ((a) => getRecord({ ...a }));
  const updateLead = deps.updateLeadImpl || ((a) => updateRecord({ ...a }));
  let leads;
  try { leads = await listLeads({ token: c.token, baseId: c.baseId, table: c.priority }); }
  catch (e) { return { replied: 0, error: "store-unavailable" }; }
  let replied = 0;
  for (const l of leads) {
    const f = l.fields || {};
    if (!f["Email Thread"] || f["OTT Reply Sent"] || !f["Converted Booking"]) continue;
    let bk;
    try { bk = await getBooking({ token: c.token, baseId: c.baseId, table: c.bookings, id: f["Converted Booking"] }); }
    catch (e) { continue; }
    if (!bk || (bk.fields || {}).Status !== "Completed") continue;
    try {
      await gmail.sendReply({ threadId: f["Email Thread"], to: f["Reply-To"] || "",
        inReplyTo: f["Email Message-Id"] || "", references: f["Email Message-Id"] || "",
        subject: "Re: A New Lead From Facebook Ads", body: buildReplyBody(bk.fields || {}) }, { env });
      await updateTolerant(updateLead, { token: c.token, baseId: c.baseId, table: c.priority, id: l.id,
        fields: { "OTT Reply Sent": today } }, ["OTT Reply Sent"]);
      replied++;
    } catch (e) { /* leave unstamped → retried next run */ }
  }
  return { replied, scanned: leads.length };
}
async function handler() { const out = await runReplySweep({}); return { statusCode: 200, body: JSON.stringify(out) }; }
module.exports = { handler, runReplySweep, buildReplyBody };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/ott-reply-sweep.test.js`
Expected: PASS.

- [ ] **Step 5: Schedule both functions** — add to `netlify.toml` after the `lead-followups` block:

```toml
[functions."gmail-lead-poll"]
  schedule = "*/10 * * * *"

[functions."ott-reply-sweep"]
  schedule = "*/15 * * * *"
```

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/ott-reply-sweep.js netlify.toml tests/ott-reply-sweep.test.js
git commit -m "feat(leads): ott-reply-sweep auto-reply on completion + schedules"
```

---

## Task 8: Google OAuth setup (owner) + env

**Files:** none (Google Cloud + Netlify env).

- [ ] **Step 1 (owner):** In Google Cloud console for the account owning `info@tunedyota.com`: enable the **Gmail API**; create an **OAuth 2.0 Client ID** (type "Desktop app" is simplest); note the client id + secret.
- [ ] **Step 2 (controller):** Generate a consent URL for scopes `https://www.googleapis.com/auth/gmail.modify` + `https://www.googleapis.com/auth/gmail.send` (access_type=offline, prompt=consent). Owner opens it, approves as `info@tunedyota.com`, returns the auth code.
- [ ] **Step 3 (controller):** Exchange the code for a refresh token (one `curl` to Google's token endpoint). Set env without echoing secrets:
```bash
netlify env:set GMAIL_CLIENT_ID "<id>"
netlify env:set GMAIL_CLIENT_SECRET "<secret>"
netlify env:set GMAIL_REFRESH_TOKEN "<refresh>"
```
Client id/secret + refresh token captured via clipboard, never printed to chat.
- [ ] **Step 4:** Sanity-check live: `curl` the deployed `gmail-lead-poll` (or wait for the cron) and confirm it returns `{ingested:N}` without `no-gmail-config`.

---

## Task 9: Full suite + ship (inert-safe) + activation

**Files:** none.

- [ ] **Step 1:** `node --test` — all green (existing 610 + new gmail/ott/poll/sweep/leads tests).
- [ ] **Step 2: Ship** via the `ship` skill (no SEO inputs). Push `master`; confirm Netlify `ready`. The two scheduled functions deploy **inert** (poll no-ops with `no-gmail-config` until Task 8; sweep finds nothing until leads exist) — safe.
- [ ] **Step 3: Capture the real sample** (Task 5) and refine `parseOttLeadEmail` + its test against it; re-run + re-ship.
- [ ] **Step 4: Activate** once Tasks 1 + 8 are done: send yourself a test email with the exact subject, wait for the poll (or invoke it), confirm a lead appears tagged `ott-national` with thread refs; convert→close-out a test booking and confirm the in-thread reply sends + `OTT Reply Sent` stamps. Clean up test records.
- [ ] **Step 5: Update memory** — mark adapter #2 shipped + the activation gates in `[[lead-tracking-program]]`.

---

## Self-review notes

- **Spec coverage:** §4 columns → Task 1; §5 Gmail access → Task 4 (+ Task 8 env); §6.1 parser → Task 5; §6.2 poll → Task 6; §6.3 Core email-refs → Task 2; §6.4 sweep → Task 7; §6.5 template → Task 7 `buildReplyBody`; ott-national tag → Tasks 1,2,3; §8 error handling → poll try/label + sweep unstamped-retry + no-config no-op; §9 tests → Tasks 2,4,5,6,7.
- **Type consistency:** `parseOttLeadEmail` returns `{threadId, messageIdHeader, replyTo, channel, source, name, phone, email, vehicle}`; the poll maps `threadId→emailThread`, `messageIdHeader→emailMessageId` into the `/lead-ingest` body, which Task 2's `processLeadIngest` writes to `Email Thread`/`Email Message-Id`/`Reply-To`; the sweep reads those exact column names. Consistent end-to-end.
- **Placeholder note:** Task 5's concrete regexes/asserts are intentionally finalized against the real fixture — the parser contract + a working first implementation are provided; only the field patterns adapt to real data.
- **Inert-safe:** poll returns `no-gmail-config` without Gmail env; all writes tolerate the four columns being absent.
