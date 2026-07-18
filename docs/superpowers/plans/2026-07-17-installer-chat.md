# Installer Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Site-wide AI chat widget ("Chat with an OTT installer NOW") with NEPQ persona, guardrails, live-installer escalation over Twilio SMS with on-page relay, CRM lead creation, and an escalation improvement repository.

**Architecture:** Vanilla-JS widget → `netlify/functions/chat.js` → Claude Sonnet 4.6 (system prompt assembled from repo business data; `transfer_to_installer` tool triggers escalation). Sessions + escalation log in Airtable; installer notified via new `sendSms` + existing web push; installer SMS replies relayed into the session through `twilio-sms.js`. Spec: `docs/superpowers/specs/2026-07-17-installer-chat-design.md`.

**Tech Stack:** Netlify functions (CommonJS, injected deps), Airtable REST, Claude Messages API (raw fetch, per repo convention), Twilio REST, `node --test`, Playwright.

**Conventions that bind every task:** pure logic in `lib/` with injected `fetchImpl`/`env`/`log`; never throw across a customer-facing path (mirror `book-background.js` try/catch style); tests in `tests/*.test.js` with stubbed fetch; commit after each green test run.

---

### Task 1: Airtable schema — Chat Sessions + Chat Escalations

**Files:**
- Modify: `setup-airtable.mjs` (SCHEMA object, after the `"Events"` entry)

- [ ] **Step 1: Add the two tables to SCHEMA**

```js
  // Chat widget sessions (lib/chat-store.js). Transcript is a JSON array of
  // {role:"user"|"assistant"|"installer", text, at} kept in a long-text field.
  "Chat Sessions": [
    txt("Session ID"), sel("Status", ["ai", "escalated", "closed"]), txt("Page Context"),
    txt("Customer Name"), txt("Phone"), txt("Vehicle"), txt("City"),
    sel("Installer", INSTALLERS), txt("Transcript"), txt("Created"), txt("Last Activity"),
  ],
  // Questions the AI couldn't answer — the owner mines these to grow its knowledge.
  "Chat Escalations": [
    txt("Question"), sel("Reason", ["asked-for-human", "guardrail", "no-answer"]),
    txt("Page Context"), txt("Session ID"), txt("Date"), sel("Status", ["New", "Answer added"]),
  ],
```

Note: `txt`/`sel` helpers and `INSTALLERS` already exist at the top of the file. "Transcript" uses `txt` (singleLineText) in the Meta API create; Airtable accepts long values — but prefer `{ name: "Transcript", type: "multilineText" }` inline instead of `txt("Transcript")`.

- [ ] **Step 2: Run schema setup (needs temporary schema scopes)**

Ask the owner to temporarily add `schema.bases:read` + `schema.bases:write` to the Airtable token (`patkSWrl8cUzwehb3` at airtable.com/create/tokens — never regenerate), per `docs/operations/sop-data-security-secrets.md` §2. Then:

```bash
cd tunedyota
AIRTABLE_TOKEN=$(npx netlify env:get AIRTABLE_TOKEN | tr -d '\r\n') \
AIRTABLE_BASE_ID=$(npx netlify env:get AIRTABLE_BASE_ID | tr -d '\r\n') \
node setup-airtable.mjs
```

Expected: `✓ created table "Chat Sessions"` and `✓ created table "Chat Escalations"`. **Remind the owner to remove both schema scopes immediately after.**

- [ ] **Step 3: Commit**

```bash
git add setup-airtable.mjs
git commit -m "feat(chat): Airtable schema for Chat Sessions + Chat Escalations"
```

---

### Task 2: `lib/chat-store.js` — session persistence

**Files:**
- Create: `netlify/functions/lib/chat-store.js`
- Test: `tests/chat-store.test.js`

- [ ] **Step 1: Write the failing tests**

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadSession, saveSession, parseTranscript, isStale, STALE_AI_MS, STALE_ESCALATED_MS } = require("../netlify/functions/lib/chat-store.js");

const ENV = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };
const rec = (fields) => ({ id: "recX", fields });

test("parseTranscript tolerates blank and bad JSON", () => {
  assert.deepEqual(parseTranscript(""), []);
  assert.deepEqual(parseTranscript("not json"), []);
  assert.deepEqual(parseTranscript('[{"role":"user","text":"hi","at":1}]'), [{ role: "user", text: "hi", at: 1 }]);
});

test("isStale by status", () => {
  const now = Date.parse("2026-07-17T12:00:00Z");
  const old = new Date(now - STALE_AI_MS - 1000).toISOString();
  assert.equal(isStale({ status: "ai", lastActivity: old }, now), true);
  assert.equal(isStale({ status: "escalated", lastActivity: old }, now), false); // 2h window
  const veryOld = new Date(now - STALE_ESCALATED_MS - 1000).toISOString();
  assert.equal(isStale({ status: "escalated", lastActivity: veryOld }, now), true);
});

test("loadSession returns null when not found; maps fields when found", async () => {
  const empty = async () => ({ ok: true, json: async () => ({ records: [] }) });
  assert.equal(await loadSession("s1", { env: ENV, fetchImpl: empty }), null);
  const found = async () => ({ ok: true, json: async () => ({ records: [rec({
    "Session ID": "s1", Status: "ai", Transcript: '[{"role":"user","text":"hi","at":1}]',
    "Page Context": "default", "Last Activity": "2026-07-17T11:59:00Z" })] }) });
  const s = await loadSession("s1", { env: ENV, fetchImpl: found });
  assert.equal(s.recordId, "recX");
  assert.equal(s.status, "ai");
  assert.equal(s.turns.length, 1);
});

test("saveSession creates when no recordId, patches when present", async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => { calls.push({ url: String(url), method: opts.method }); return { ok: true, json: async () => ({ id: "recNew", fields: {} }) }; };
  await saveSession({ id: "s1", status: "ai", turns: [], pageContext: "default" }, { env: ENV, fetchImpl, now: () => 0 });
  await saveSession({ id: "s1", recordId: "recX", status: "ai", turns: [] }, { env: ENV, fetchImpl, now: () => 0 });
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[1].method, "PATCH");
  assert.ok(calls[1].url.includes("recX"));
});
```

- [ ] **Step 2: Run to verify failure** — `node --test tests/chat-store.test.js` → FAIL (module not found)

- [ ] **Step 3: Implement**

```js
// netlify/functions/lib/chat-store.js
// Chat session persistence in the Airtable "Chat Sessions" table. Pure I/O
// wrappers with injected fetch/env — the transcript lives as a JSON array in a
// long-text field; session identity is the widget-generated Session ID string.
const { cfg, escapeFormula, listRecords, createRecord, updateRecord } = require("./airtable.js");

const TABLE = (env) => env.AIRTABLE_CHAT_TABLE || "Chat Sessions";
const STALE_AI_MS = 30 * 60 * 1000;         // ai sessions close after 30 min idle
const STALE_ESCALATED_MS = 2 * 60 * 60 * 1000; // escalated sessions get 2 h

function parseTranscript(s) { try { const v = JSON.parse(s || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } }
function isStale(sess, nowMs) {
  const last = Date.parse(sess.lastActivity || "") || 0;
  const limit = sess.status === "escalated" ? STALE_ESCALATED_MS : STALE_AI_MS;
  return nowMs - last > limit;
}

function fromRecord(r) {
  const f = r.fields || {};
  return {
    id: f["Session ID"] || "", recordId: r.id, status: f.Status || "ai",
    pageContext: f["Page Context"] || "", customerName: f["Customer Name"] || "",
    phone: f.Phone || "", vehicle: f.Vehicle || "", city: f.City || "",
    installer: f.Installer || "", turns: parseTranscript(f.Transcript),
    lastActivity: f["Last Activity"] || "",
  };
}

async function loadSession(id, { env = process.env, fetchImpl = fetch } = {}) {
  const c = cfg(env);
  const recs = await listRecords({ fetchImpl, token: c.token, baseId: c.baseId, table: TABLE(env),
    filterByFormula: `{Session ID}="${escapeFormula(id)}"` });
  return recs.length ? fromRecord(recs[0]) : null;
}

// Load the most recently active escalated session for an installer key (SMS relay).
async function loadEscalatedForInstaller(key, { env = process.env, fetchImpl = fetch } = {}) {
  const c = cfg(env);
  const recs = await listRecords({ fetchImpl, token: c.token, baseId: c.baseId, table: TABLE(env),
    filterByFormula: `AND({Installer}="${escapeFormula(key)}",{Status}="escalated")` });
  const sessions = recs.map(fromRecord).filter((s) => !isStale(s, Date.now()));
  sessions.sort((a, b) => String(b.lastActivity).localeCompare(String(a.lastActivity)));
  return sessions[0] || null;
}

async function saveSession(sess, { env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  const c = cfg(env);
  const fields = {
    "Session ID": sess.id, Status: sess.status, "Page Context": sess.pageContext || "",
    "Customer Name": sess.customerName || "", Phone: sess.phone || "", Vehicle: sess.vehicle || "",
    City: sess.city || "", Installer: sess.installer || "",
    Transcript: JSON.stringify(sess.turns || []), "Last Activity": new Date(now()).toISOString(),
  };
  if (!sess.recordId) {
    fields.Created = new Date(now()).toISOString();
    const r = await createRecord({ fetchImpl, token: c.token, baseId: c.baseId, table: TABLE(env), fields });
    sess.recordId = r.id;
    return sess;
  }
  await updateRecord({ fetchImpl, token: c.token, baseId: c.baseId, table: TABLE(env), id: sess.recordId, fields });
  return sess;
}

module.exports = { loadSession, loadEscalatedForInstaller, saveSession, parseTranscript, isStale, STALE_AI_MS, STALE_ESCALATED_MS, TABLE };
```

Note: `escapeFormula` is exported by `lib/airtable.js` (used the same way in `push-subscribe.js`).

- [ ] **Step 4: Run tests** — `node --test tests/chat-store.test.js` → PASS
- [ ] **Step 5: Commit** — `git add netlify/functions/lib/chat-store.js tests/chat-store.test.js && git commit -m "feat(chat): session store over Airtable Chat Sessions"`

---

### Task 3: `lib/chat-agent.js` — persona, guardrails, Claude call with escalation tool

**Files:**
- Create: `netlify/functions/lib/chat-agent.js`
- Test: `tests/chat-agent.test.js`

- [ ] **Step 1: Write the failing tests**

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildSystemPrompt, labelForPage, runChat, TRANSFER_TOOL } = require("../netlify/functions/lib/chat-agent.js");

test("labelForPage maps page context to persona line", () => {
  assert.match(labelForPage("amsoil"), /AMSOIL Fluid Specialist/);
  assert.match(labelForPage("magnuson"), /Magnuson Supercharger Specialist/);
  assert.match(labelForPage("default"), /OTT installer/);
});

test("system prompt carries greeting, guardrails, and NEPQ material", () => {
  const p = buildSystemPrompt("default");
  assert.match(p, /Thank you for using Tuned Yota's chat agent\./);
  assert.match(p, /never quote custom/i);
  assert.match(p, /never guarantee fitment/i);
  assert.match(p, /never make warranty/i);
  assert.match(p, /never book, move, or cancel/i);
  assert.match(p, /NEPQ/);
});

test("runChat returns text reply from a text response", async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ content: [{ type: "text", text: "Great question — ..." }] }) });
  const out = await runChat({ turns: [{ role: "user", text: "hi" }], pageContext: "default" },
    { env: { ANTHROPIC_API_KEY: "k" }, fetchImpl });
  assert.equal(out.reply, "Great question — ...");
  assert.equal(out.transfer, null);
});

test("runChat surfaces transfer_to_installer tool call", async () => {
  const input = { customerName: "Ty", contactMethod: "phone", contactValue: "5075550100",
    vehicleMake: "Toyota", vehicleModel: "Tacoma", modelYear: "2019", city: "Rochester", state: "MN",
    questionSummary: "supercharger fitment", reason: "no-answer" };
  const fetchImpl = async () => ({ ok: true, json: async () => ({ content: [
    { type: "text", text: "Connecting you now." },
    { type: "tool_use", id: "tu1", name: "transfer_to_installer", input }] }) });
  const out = await runChat({ turns: [{ role: "user", text: "get me a person" }], pageContext: "default" },
    { env: { ANTHROPIC_API_KEY: "k" }, fetchImpl });
  assert.deepEqual(out.transfer, input);
});

test("runChat sends installer turns as user-role context", async () => {
  let body;
  const fetchImpl = async (url, opts) => { body = JSON.parse(opts.body); return { ok: true, json: async () => ({ content: [{ type: "text", text: "ok" }] }) }; };
  await runChat({ turns: [
    { role: "user", text: "q" }, { role: "assistant", text: "a" },
    { role: "installer", text: "Aaron here" }, { role: "user", text: "thanks" }],
    pageContext: "default" }, { env: { ANTHROPIC_API_KEY: "k" }, fetchImpl });
  assert.equal(body.messages.length, 4);
  assert.equal(body.messages[2].role, "user");
  assert.match(body.messages[2].content, /^\[Live installer/);
  assert.equal(body.max_tokens, 500);
  assert.equal(body.model, "claude-sonnet-4-6");
  assert.equal(body.tools[0].name, "transfer_to_installer");
});
```

- [ ] **Step 2: Run to verify failure** — `node --test tests/chat-agent.test.js` → FAIL

- [ ] **Step 3: Implement**

```js
// netlify/functions/lib/chat-agent.js
// The website chat agent: NEPQ persona + business grounding + hard guardrails,
// with escalation modeled as a Claude tool call. Pure prompt assembly + one
// injected fetch to the Messages API. System prompt is FROZEN per page context
// (cache_control) — volatile data must go in messages, never in the prompt.
const fs = require("node:fs");
const path = require("node:path");
const { MARKETS } = require("./markets.js");
const { INSTALLERS } = require("./routing.js");

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const read = (p) => { try { return fs.readFileSync(path.join(__dirname, p), "utf8"); } catch { return ""; } };
const PLAYBOOK = read("../../../docs/sales/nepq-playbook.md");
const VOICE = read("../../../docs/email-voice.md");
const VEHICLES = (() => { try { return require("./vehicles.json"); } catch { return {}; } })();

function labelForPage(ctx) {
  if (ctx === "amsoil") return "an AMSOIL Fluid Specialist assistant — lead with fluid/maintenance expertise";
  if (ctx === "magnuson") return "a Magnuson Supercharger Specialist assistant — lead with supercharger expertise";
  return "an OTT installer assistant — lead with OTT tune expertise";
}

function pricingSummary() {
  const lines = [];
  for (const make of Object.keys(VEHICLES)) for (const model of Object.keys(VEHICLES[make])) {
    lines.push(`${make} ${model}: ` + VEHICLES[make][model].map((c) => `${c.y} ${c.e} from $${c.base}`).join(" · "));
  }
  return lines.join("\n");
}

const TRANSFER_TOOL = {
  name: "transfer_to_installer",
  description: "Transfer the customer to their nearest live OTT installer. Call ONLY after you have conversationally collected every required field, telling the customer you're asking so you can connect them with their NEAREST installer.",
  input_schema: {
    type: "object",
    properties: {
      customerName: { type: "string" },
      contactMethod: { type: "string", enum: ["phone", "email"] },
      contactValue: { type: "string", description: "The phone number or email address" },
      vehicleMake: { type: "string" }, vehicleModel: { type: "string" }, modelYear: { type: "string" },
      city: { type: "string" }, state: { type: "string" },
      questionSummary: { type: "string", description: "One-sentence summary of what they need" },
      reason: { type: "string", enum: ["asked-for-human", "guardrail", "no-answer"] },
    },
    required: ["customerName", "contactMethod", "contactValue", "vehicleMake", "vehicleModel", "modelYear", "city", "state", "questionSummary", "reason"],
  },
};

function buildSystemPrompt(pageContext) {
  return [
    `You are Tuned Yota's website chat agent — ${labelForPage(pageContext)}. Tuned Yota is a Toyota/Lexus performance-tuning business (OTT tunes, Magnuson superchargers, AMSOIL fluids) serving the upper Midwest via scheduled events.`,
    "Your FIRST message in every conversation begins exactly: \"Thank you for using Tuned Yota's chat agent.\"",
    "Style: chat, not email. 1-3 short sentences per reply. Follow the NEPQ method below — mirror the customer's words, ask one question at a time, advance toward either the booking page (https://tunedyota.com/find-your-exact-tune) or a live-installer transfer. Never hard-sell.",
    "",
    "== HARD GUARDRAILS (no exceptions — offer a live installer transfer instead) ==",
    "1. NEVER quote custom, negotiated, or bundle pricing. Published per-vehicle base prices below are OK to state.",
    "2. NEVER guarantee fitment or that a specific mod combo is safe/supported. Typical compatibility is OK to discuss; specifics go to the installer.",
    "3. NEVER book, move, or cancel appointments. Link to the booking page instead.",
    "4. NEVER make warranty, legal, or emissions-compliance claims.",
    "When a guardrail applies OR the customer asks for a live person OR you cannot answer properly: collect name, best contact (phone preferred), vehicle make/model/year, and city/state — explain you're asking so you can connect them with their NEAREST OTT installer — then call transfer_to_installer.",
    "",
    "== NEPQ PLAYBOOK ==", PLAYBOOK.slice(0, 12000),
    "== VOICE ==", VOICE.slice(0, 3000),
    "== MARKETS (city → installer) ==",
    MARKETS.map((m) => `${m.city}, ${m.state} → ${(INSTALLERS[m.inst] || INSTALLERS.aaron).name}`).join("\n"),
    "== PUBLISHED PRICING ==", pricingSummary().slice(0, 4000),
  ].join("\n");
}

// turns: [{role:"user"|"assistant"|"installer", text}] → Messages API messages.
// Installer turns become user-role context blocks so the model knows what the
// live installer already told the customer.
function toMessages(turns) {
  return (turns || []).map((t) => t.role === "installer"
    ? { role: "user", content: `[Live installer message to the customer]: ${t.text}` }
    : { role: t.role, content: t.text });
}

async function runChat({ turns, pageContext }, { env = process.env, fetchImpl = fetch } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetchImpl(ANTHROPIC_URL, {
      method: "POST", signal: ctrl.signal,
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL, max_tokens: 500,
        system: [{ type: "text", text: buildSystemPrompt(pageContext), cache_control: { type: "ephemeral" } }],
        tools: [TRANSFER_TOOL],
        messages: toMessages(turns),
      }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}`);
    const j = await res.json();
    const textBlocks = (j.content || []).filter((c) => c.type === "text").map((c) => c.text);
    const tool = (j.content || []).find((c) => c.type === "tool_use" && c.name === "transfer_to_installer");
    return { reply: textBlocks.join(" ").trim(), transfer: tool ? tool.input : null };
  } finally { clearTimeout(timer); }
}

module.exports = { buildSystemPrompt, labelForPage, runChat, toMessages, TRANSFER_TOOL, MODEL };
```

- [ ] **Step 4: Run tests** — `node --test tests/chat-agent.test.js` → PASS
- [ ] **Step 5: Commit** — `git add netlify/functions/lib/chat-agent.js tests/chat-agent.test.js && git commit -m "feat(chat): NEPQ chat agent with guardrails and transfer tool"`

---

### Task 4: `sendSms` in `lib/twilio.js`

**Files:**
- Modify: `netlify/functions/lib/twilio.js` (append before `module.exports`; add `sendSms` to exports)
- Test: `tests/twilio-send.test.js`

- [ ] **Step 1: Write the failing tests**

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { sendSms } = require("../netlify/functions/lib/twilio.js");

const ENV = { TWILIO_ACCOUNT_SID: "AC123", TWILIO_AUTH_TOKEN: "tok", TWILIO_FROM_NUMBER: "+16125550100" };

test("sendSms posts form-encoded message with basic auth", async () => {
  let got;
  const fetchImpl = async (url, opts) => { got = { url: String(url), opts }; return { ok: true, json: async () => ({ sid: "SM1" }) }; };
  const r = await sendSms({ to: "+15075550101", body: "hello" }, { env: ENV, fetchImpl });
  assert.equal(r.ok, true);
  assert.ok(got.url.includes("/Accounts/AC123/Messages.json"));
  assert.match(got.opts.headers.Authorization, /^Basic /);
  const params = new URLSearchParams(got.opts.body);
  assert.equal(params.get("To"), "+15075550101");
  assert.equal(params.get("From"), "+16125550100");
  assert.equal(params.get("Body"), "hello");
});

test("sendSms is a counted no-op without config and never throws", async () => {
  const r1 = await sendSms({ to: "+1", body: "x" }, { env: {}, fetchImpl: async () => { throw new Error("no"); } });
  assert.equal(r1.ok, false);
  const r2 = await sendSms({ to: "+1", body: "x" }, { env: ENV, fetchImpl: async () => { throw new Error("net down"); } });
  assert.equal(r2.ok, false);
});
```

- [ ] **Step 2: Run to verify failure** — `node --test tests/twilio-send.test.js` → FAIL (`sendSms` not exported)

- [ ] **Step 3: Implement** (append to `lib/twilio.js`; add `sendSms` to the `module.exports` list)

```js
// Outbound SMS via the Twilio REST API. Best-effort: returns {ok:false} on any
// missing config or network error — callers must never break on notify failure.
async function sendSms({ to, body }, deps = {}) {
  const { env = process.env, fetchImpl = fetch, log = console } = deps;
  const sid = env.TWILIO_ACCOUNT_SID, token = env.TWILIO_AUTH_TOKEN, from = env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from || !to) return { ok: false, skipped: true };
  try {
    const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: to, From: from, Body: String(body || "").slice(0, 1500) }).toString(),
    });
    if (!res.ok) { if (log.error) log.error("sendSms", res.status); return { ok: false }; }
    return { ok: true };
  } catch (e) { if (log.error) log.error("sendSms", e.message); return { ok: false }; }
}
```

- [ ] **Step 4: Run** — `node --test tests/twilio-send.test.js` → PASS; also `node --test tests/twilio*.test.js` to prove existing twilio tests still pass.
- [ ] **Step 5: Commit** — `git add netlify/functions/lib/twilio.js tests/twilio-send.test.js && git commit -m "feat(twilio): outbound sendSms helper"`

---

### Task 5: `chat` channel in the CRM

**Files:**
- Modify: `netlify/functions/lib/leads.js:8` (CHANNELS) and `:17-25` (normalizeChannel)
- Test: extend `tests/leads.test.js` (or `tests/lead-tracker.test.js` — locate with `grep -rln "normalizeChannel" tests/`)

- [ ] **Step 1: Write the failing test** (add to the existing leads test file)

```js
test("chat is a first-class channel", () => {
  assert.equal(validChannel("chat"), true);
  assert.equal(normalizeChannel("chat:widget"), "chat");
});
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: Implement** — in `lib/leads.js` add `"chat"` to `CHANNELS` and add `chat` to the loop list in `normalizeChannel` (before `"walk-in"` so `"chat:widget"` matches):

```js
const CHANNELS = ["email", "facebook", "instagram", "sms", "phone", "walk-in", "chat", "other", "ott-national"];
// in normalizeChannel:
for (const ch of ["email", "facebook", "instagram", "sms", "phone", "walk-in", "chat"]) {
```

- [ ] **Step 4: Run the full suite** — `npm test` → all pass (proves the new channel breaks nothing downstream, e.g. app filters).
- [ ] **Step 5: Commit** — `git commit -am "feat(leads): chat channel"`

---

### Task 6: `netlify/functions/chat.js` — the chat endpoint + escalation pipeline

**Files:**
- Create: `netlify/functions/chat.js`
- Test: `tests/chat-handler.test.js`

- [ ] **Step 1: Write the failing tests**

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processChat, escalate, MAX_MESSAGES, MAX_CHARS } = require("../netlify/functions/chat.js");

const ENV = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", ANTHROPIC_API_KEY: "k" };
const baseDeps = (over = {}) => ({
  env: ENV, log: { error: () => {} },
  load: async () => null,
  save: async (s) => s,
  ai: async () => ({ reply: "hello there", transfer: null }),
  doEscalate: async () => ({ installer: { name: "Aaron Groshong", phone: "(612) 406-7117" } }),
  ...over,
});

test("new session: creates, appends turns, returns reply", async () => {
  const saved = [];
  const out = await processChat({ session: "s1", message: "hi", page: "default" },
    baseDeps({ save: async (s) => { saved.push(JSON.parse(JSON.stringify(s))); return s; } }));
  assert.equal(out.status, 200);
  assert.equal(out.body.reply, "hello there");
  assert.equal(saved[0].turns.length, 2); // user + assistant
});

test("caps: message too long → 400; session over MAX_MESSAGES → polite refusal, no AI call", async () => {
  const long = await processChat({ session: "s1", message: "x".repeat(MAX_CHARS + 1), page: "default" }, baseDeps());
  assert.equal(long.status, 400);
  let aiCalled = false;
  const turns = Array.from({ length: MAX_MESSAGES + 1 }, (_, i) => ({ role: "user", text: "m" + i, at: i }));
  const full = await processChat({ session: "s1", message: "one more", page: "default" },
    baseDeps({ load: async () => ({ id: "s1", recordId: "r", status: "ai", turns, lastActivity: new Date().toISOString() }),
               ai: async () => { aiCalled = true; return { reply: "", transfer: null }; } }));
  assert.equal(full.status, 200);
  assert.match(full.body.reply, /find-your-exact-tune/);
  assert.equal(aiCalled, false);
});

test("closed/stale session rejects with fresh-start flag", async () => {
  const out = await processChat({ session: "s1", message: "hi", page: "default" },
    baseDeps({ load: async () => ({ id: "s1", recordId: "r", status: "ai", turns: [], lastActivity: "2020-01-01T00:00:00Z" }) }));
  assert.equal(out.body.expired, true);
});

test("transfer path: escalates and tells customer the installer contact", async () => {
  const transfer = { customerName: "Ty", contactMethod: "phone", contactValue: "5075550101", vehicleMake: "Toyota",
    vehicleModel: "Tacoma", modelYear: "2019", city: "Rochester", state: "MN", questionSummary: "fitment", reason: "no-answer" };
  let escArgs;
  const out = await processChat({ session: "s1", message: "person please", page: "default" },
    baseDeps({ ai: async () => ({ reply: "Connecting you.", transfer }),
               doEscalate: async (a) => { escArgs = a; return { installer: { name: "Aaron Groshong", phone: "(612) 406-7117" } }; } }));
  assert.equal(escArgs.transfer.city, "Rochester");
  assert.match(out.body.reply, /Aaron Groshong/);
  assert.match(out.body.reply, /\(612\) 406-7117/);
  assert.equal(out.body.escalated, true);
});

test("AI failure → fallback message with owner phone, not a 500", async () => {
  const out = await processChat({ session: "s1", message: "hi", page: "default" },
    baseDeps({ ai: async () => { throw new Error("anthropic 529"); } }));
  assert.equal(out.status, 200);
  assert.match(out.body.reply, /\(612\) 406-7117/);
});

test("poll returns turns after since index", async () => {
  const turns = [{ role: "user", text: "a", at: 1 }, { role: "installer", text: "b", at: 2 }];
  const out = await processChat({ session: "s1", poll: true, since: 1 },
    baseDeps({ load: async () => ({ id: "s1", recordId: "r", status: "escalated", turns, lastActivity: new Date().toISOString() }) }));
  assert.equal(out.body.turns.length, 1);
  assert.equal(out.body.turns[0].text, "b");
});

test("escalate: routes by city, creates lead, notifies, logs escalation — best-effort", async () => {
  const calls = [];
  const r = await escalate({ transfer: { customerName: "Ty", contactMethod: "phone", contactValue: "5075550101",
      vehicleMake: "Toyota", vehicleModel: "Tacoma", modelYear: "2019", city: "Rochester", state: "MN",
      questionSummary: "fitment", reason: "no-answer" },
    sess: { id: "s1", turns: [], pageContext: "default" } }, {
    env: ENV, log: { error: () => {} },
    ingest: async (b) => { calls.push(["lead", b]); return { ok: true }; },
    sms: async (a) => { calls.push(["sms", a]); return { ok: true }; },
    push: async (k) => { calls.push(["push", k]); return { sent: 1 }; },
    logEscalation: async (f) => { calls.push(["esc", f]); },
  });
  assert.equal(r.installer.key, "aaron"); // Rochester routes to aaron
  assert.deepEqual(calls.map((c) => c[0]).sort(), ["esc", "lead", "push", "sms"]);
  const lead = calls.find((c) => c[0] === "lead")[1];
  assert.equal(lead.channel, "chat");
  assert.match(lead.vehicle, /2019 Toyota Tacoma/);
});

test("escalate: notify failures never throw; customer still gets installer info", async () => {
  const r = await escalate({ transfer: { customerName: "T", contactMethod: "phone", contactValue: "1", vehicleMake: "T",
      vehicleModel: "T", modelYear: "1", city: "Nowhere", state: "ZZ", questionSummary: "q", reason: "guardrail" },
    sess: { id: "s1", turns: [], pageContext: "default" } }, {
    env: ENV, log: { error: () => {} },
    ingest: async () => { throw new Error("down"); }, sms: async () => { throw new Error("down"); },
    push: async () => { throw new Error("down"); }, logEscalation: async () => { throw new Error("down"); },
  });
  assert.equal(r.installer.key, "aaron"); // unknown city → fallback installer
});
```

- [ ] **Step 2: Run to verify failure** — `node --test tests/chat-handler.test.js` → FAIL

- [ ] **Step 3: Implement**

```js
// netlify/functions/chat.js
// Website chat endpoint. POST {session, message, page} → AI reply (or escalation);
// POST {session, poll:true, since} → new turns (installer relay polling).
// Never throws at the customer: AI/storage failures degrade to a contact-info
// fallback message. Escalation fan-out mirrors book-background.js best-effort style.
const { loadSession, saveSession, isStale } = require("./lib/chat-store.js");
const { runChat } = require("./lib/chat-agent.js");
const { getMarket } = require("./lib/markets.js");
const { keyToInstaller, FALLBACK_KEY } = require("./lib/routing.js");
const { ingestLead, sendSms } = require("./lib/twilio.js");
const { sendWebPush } = require("./lib/webpush.js");
const { cfg, createRecord } = require("./lib/airtable.js");

const MAX_MESSAGES = 40;
const MAX_CHARS = 1000;
const OWNER_FALLBACK = "Sorry — I'm having trouble right now. Text or call us directly at (612) 406-7117 and a team member will help you out.";
const ESC_TABLE = (env) => env.AIRTABLE_ESCALATIONS_TABLE || "Chat Escalations";

async function defaultLogEscalation(fields, { env, fetchImpl = fetch }) {
  const c = cfg(env);
  await createRecord({ fetchImpl, token: c.token, baseId: c.baseId, table: ESC_TABLE(env), fields });
}

// Route + fan-out. Every side effect individually guarded; always returns installer.
async function escalate({ transfer, sess }, deps) {
  const { env = process.env, log = console,
    ingest = (b) => ingestLead(b, { env }),
    sms = (a) => sendSms(a, { env, log }),
    push = (k, m) => sendWebPush(k, m, { env, log }),
    logEscalation = (f) => defaultLogEscalation(f, { env }) } = deps || {};
  const market = getMarket(transfer.city);
  const inst = keyToInstaller(market ? market.inst : FALLBACK_KEY);
  const vehicle = `${transfer.modelYear} ${transfer.vehicleMake} ${transfer.vehicleModel}`;
  const contact = `${transfer.contactMethod}: ${transfer.contactValue}`;
  const transcriptTail = (sess.turns || []).slice(-12).map((t) => `${t.role}: ${t.text}`).join("\n");
  try {
    await ingest({ name: transfer.customerName, phone: transfer.contactMethod === "phone" ? transfer.contactValue : "",
      email: transfer.contactMethod === "email" ? transfer.contactValue : "",
      channel: "chat", source: "chat:widget", city: transfer.city,
      vehicle, goals: transfer.questionSummary,
      message: `Chat escalation (${transfer.reason}). ${contact}\n--- transcript ---\n${transcriptTail}` });
  } catch (e) { if (log.error) log.error("chat lead", e.message); }
  const digits = String(inst.phone || "").replace(/\D/g, "");
  try {
    await sms({ to: digits.length === 10 ? `+1${digits}` : inst.phone,
      body: `Tuned Yota chat: ${transfer.customerName} (${contact}) — ${vehicle}, ${transfer.city} ${transfer.state}. Q: ${transfer.questionSummary}. Reply to this text and it appears in their chat window.` });
  } catch (e) { if (log.error) log.error("chat sms", e.message); }
  try { await push(inst.key, { title: "Live chat transfer", body: `${transfer.customerName} — ${vehicle}`, url: "/installer.html" }); }
  catch (e) { if (log.error) log.error("chat push", e.message); }
  try {
    await logEscalation({ Question: transfer.questionSummary, Reason: transfer.reason,
      "Page Context": sess.pageContext || "", "Session ID": sess.id,
      Date: new Date().toISOString(), Status: "New" });
  } catch (e) { if (log.error) log.error("chat esc log", e.message); }
  return { installer: inst };
}

async function processChat(body, deps) {
  const { env = process.env, log = console,
    load = (id) => loadSession(id, { env }),
    save = (s) => saveSession(s, { env }),
    ai = (s) => runChat(s, { env }),
    doEscalate = (a) => escalate(a, { env, log }) } = deps || {};
  const id = String(body.session || "").slice(0, 64);
  if (!id) return { status: 400, body: { error: "missing session" } };

  let sess = null;
  try { sess = await load(id); } catch (e) { if (log.error) log.error("chat load", e.message); }
  if (sess && (sess.status === "closed" || isStale(sess, Date.now()))) {
    return { status: 200, body: { expired: true, reply: "" } };
  }

  // Poll mode: return turns the widget hasn't seen (installer relay).
  if (body.poll) {
    const turns = sess ? (sess.turns || []).slice(Number(body.since) || 0) : [];
    return { status: 200, body: { turns, escalated: !!sess && sess.status === "escalated" } };
  }

  const message = String(body.message || "").trim();
  if (!message) return { status: 400, body: { error: "missing message" } };
  if (message.length > MAX_CHARS) return { status: 400, body: { error: "message too long" } };

  if (!sess) sess = { id, status: "ai", turns: [], pageContext: String(body.page || "default").slice(0, 32) };
  if ((sess.turns || []).filter((t) => t.role === "user").length >= MAX_MESSAGES) {
    return { status: 200, body: { reply: "We've covered a lot! For the fastest next step, grab a spot at https://tunedyota.com/find-your-exact-tune or text (612) 406-7117.", capped: true } };
  }
  sess.turns.push({ role: "user", text: message, at: Date.now() });

  let out;
  try { out = await ai({ turns: sess.turns, pageContext: sess.pageContext }); }
  catch (e) {
    if (log.error) log.error("chat ai", e.message);
    try { await save(sess); } catch {}
    return { status: 200, body: { reply: OWNER_FALLBACK, degraded: true } };
  }

  let reply = out.reply, escalated = false;
  if (out.transfer) {
    const { installer } = await doEscalate({ transfer: out.transfer, sess });
    sess.status = "escalated";
    sess.customerName = out.transfer.customerName;
    sess.phone = out.transfer.contactMethod === "phone" ? out.transfer.contactValue : "";
    sess.vehicle = `${out.transfer.modelYear} ${out.transfer.vehicleMake} ${out.transfer.vehicleModel}`;
    sess.city = out.transfer.city;
    sess.installer = installer.key;
    escalated = true;
    reply = `${out.reply ? out.reply + " " : ""}You're set — I've sent your question to ${installer.name}, your nearest OTT installer. Their direct line is ${installer.phone}. If they reply while you're here, it'll appear right in this chat.`;
  }
  if (reply) sess.turns.push({ role: "assistant", text: reply, at: Date.now() });
  try { await save(sess); } catch (e) { if (log.error) log.error("chat save", e.message); }
  return { status: 200, body: { reply, escalated, turnCount: sess.turns.length } };
}

async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "method not allowed" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  const out = await processChat(body, {});
  return { statusCode: out.status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out.body) };
}

module.exports = { handler, processChat, escalate, MAX_MESSAGES, MAX_CHARS };
```

Design note: polling uses POST `{poll:true}` (same endpoint, same CORS posture as every other function; the widget always POSTs).

- [ ] **Step 4: Run** — `node --test tests/chat-handler.test.js` → PASS, then `npm test` → all green.
- [ ] **Step 5: Commit** — `git add netlify/functions/chat.js tests/chat-handler.test.js && git commit -m "feat(chat): chat endpoint with escalation pipeline"`

---

### Task 7: SMS relay in `twilio-sms.js`

**Files:**
- Modify: `netlify/functions/twilio-sms.js`
- Test: `tests/twilio-relay.test.js`

- [ ] **Step 1: Write the failing tests**

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handler, relayInstallerReply } = require("../netlify/functions/twilio-sms.js");

test("relayInstallerReply appends installer turn to active escalated session", async () => {
  let saved;
  const r = await relayInstallerReply({ from: "+16124067117", text: "Aaron here — yes it fits." }, {
    findSession: async (key) => key === "aaron" ? { id: "s1", recordId: "r", status: "escalated", turns: [], lastActivity: new Date().toISOString() } : null,
    save: async (s) => { saved = s; return s; },
  });
  assert.equal(r.relayed, true);
  assert.equal(saved.turns[0].role, "installer");
  assert.match(saved.turns[0].text, /yes it fits/);
});

test("relayInstallerReply passes through non-installer numbers and installers with no session", async () => {
  const r1 = await relayInstallerReply({ from: "+15079999999", text: "hi" }, { findSession: async () => null, save: async () => {} });
  assert.equal(r1.relayed, false);
  const r2 = await relayInstallerReply({ from: "+16124067117", text: "hi" }, { findSession: async () => null, save: async () => {} });
  assert.equal(r2.relayed, false);
});

test("handler: installer relay returns empty TwiML (no auto-reply, no lead)", async () => {
  let ingested = false;
  const res = await handler({ httpMethod: "POST", headers: { "x-twilio-signature": "sig" },
    body: "From=%2B16124067117&Body=on+my+way", rawUrl: "https://x/.netlify/functions/twilio-sms" }, {
    env: { TWILIO_AUTH_TOKEN: "t" }, verify: () => true,
    ingest: async () => { ingested = true; },
    relay: async () => ({ relayed: true }),
  });
  assert.equal(ingested, false);
  assert.ok(!res.body.includes("<Message>"));
});

test("handler: normal SMS unchanged — ingests lead and auto-replies", async () => {
  let ingested = false;
  const res = await handler({ httpMethod: "POST", headers: { "x-twilio-signature": "sig" },
    body: "From=%2B15075550123&Body=price%3F", rawUrl: "https://x/.netlify/functions/twilio-sms" }, {
    env: { TWILIO_AUTH_TOKEN: "t" }, verify: () => true,
    ingest: async () => { ingested = true; },
    relay: async () => ({ relayed: false }),
  });
  assert.equal(ingested, true);
  assert.ok(res.body.includes("<Message>"));
});
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: Implement** — replace `twilio-sms.js` with:

```js
// netlify/functions/twilio-sms.js
// Inbound SMS webhook: validate Twilio signature, then either (a) relay an
// installer's reply into their active escalated chat session — no lead, no
// auto-reply — or (b) the original behavior: ingest a tracked lead + auto-reply.
const { validateTwilioSignature, decodeBody, webhookUrl, parseInboundSms, smsReplyTwiml, ingestLead } = require("./lib/twilio.js");
const { INSTALLERS } = require("./lib/routing.js");
const { loadEscalatedForInstaller, saveSession } = require("./lib/chat-store.js");

const REPLY = "Thanks for texting Tuned Yota! We got your message and a team member will reach out shortly. " +
  "For the fastest help, reply with your vehicle + what you're after (OTT tune, supercharger, build, or a question).";
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

const last10 = (p) => String(p || "").replace(/\D/g, "").slice(-10);

function installerForNumber(from) {
  const d = last10(from);
  return Object.values(INSTALLERS).find((i) => d && last10(i.phone) === d) || null;
}

// If `from` is an installer with an active escalated session, append their text
// as an installer turn. Returns {relayed} — false means: treat as a normal lead.
async function relayInstallerReply({ from, text }, deps = {}) {
  const { env = process.env, log = console,
    findSession = (k) => loadEscalatedForInstaller(k, { env }),
    save = (s) => saveSession(s, { env }) } = deps;
  const inst = installerForNumber(from);
  if (!inst) return { relayed: false };
  let sess = null;
  try { sess = await findSession(inst.key); } catch (e) { if (log.error) log.error("relay find", e.message); }
  if (!sess) return { relayed: false };
  sess.turns.push({ role: "installer", text: String(text || "").trim(), at: Date.now() });
  try { await save(sess); } catch (e) { if (log.error) log.error("relay save", e.message); return { relayed: false }; }
  return { relayed: true };
}

async function handler(event, ctx = {}) {
  const env = ctx.env || process.env;
  const verify = ctx.verify || validateTwilioSignature;
  const ingest = ctx.ingest || ((b) => ingestLead(b, { env }));
  const relay = ctx.relay || ((m) => relayInstallerReply(m, { env }));
  const params = decodeBody(event);
  const url = webhookUrl(event, env, "twilio-sms");
  const sig = (event.headers && (event.headers["x-twilio-signature"] || event.headers["X-Twilio-Signature"])) || "";
  if (!verify(env.TWILIO_AUTH_TOKEN, url, params, sig)) return { statusCode: 403, body: "invalid signature" };
  try {
    const r = await relay({ from: params.From || "", text: params.Body || "" });
    if (r && r.relayed) return { statusCode: 200, headers: { "Content-Type": "text/xml; charset=utf-8" }, body: EMPTY_TWIML };
  } catch (e) { console.error("twilio-sms relay failed", e && e.message); /* fall through to lead path */ }
  try { await ingest(parseInboundSms(params)); } catch (e) { console.error("twilio-sms ingest failed", e && e.message); }
  return { statusCode: 200, headers: { "Content-Type": "text/xml; charset=utf-8" }, body: smsReplyTwiml(REPLY) };
}

module.exports = { handler, relayInstallerReply, REPLY };
```

- [ ] **Step 4: Run** — `node --test tests/twilio-relay.test.js` → PASS, then `npm test` (the existing `tests/twilio*.test.js` must stay green — the signature and lead paths are unchanged).
- [ ] **Step 5: Commit** — `git add netlify/functions/twilio-sms.js tests/twilio-relay.test.js && git commit -m "feat(chat): relay installer SMS replies into escalated chat sessions"`

---

### Task 8: Widget — `site/chat.js` + `site/chat.css` + page includes

**Files:**
- Create: `site/chat.js`, `site/chat.css`
- Modify: every `site/*.html` (script include), `scripts/build-amsoil-pages.mjs` (template include)
- Test: `tests/chat-widget.test.mjs` (Playwright, mirrors `tests/book-page.test.mjs` serving pattern)

- [ ] **Step 1: Create `site/chat.css`**

```css
/* Tuned Yota chat widget */
#ty-chat-btn{position:fixed;bottom:16px;right:16px;z-index:9999;background:#5B4B42;color:#fff;border:0;border-radius:999px;padding:13px 19px;font:700 14px/1 Arial,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.28);cursor:pointer}
#ty-chat-btn:hover{background:#3A2E26}
#ty-chat-panel{position:fixed;bottom:16px;right:16px;z-index:9999;width:min(360px,calc(100vw - 24px));height:min(520px,calc(100vh - 40px));background:#fff;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.35);display:flex;flex-direction:column;overflow:hidden;font:14px/1.45 Arial,sans-serif;color:#3A2E26}
#ty-chat-head{background:#5B4B42;color:#fff;padding:11px 14px;font-weight:700;display:flex;justify-content:space-between;align-items:center}
#ty-chat-head button{background:none;border:0;color:#fff;font-size:18px;cursor:pointer}
#ty-chat-log{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:6px}
.ty-msg{border-radius:10px;padding:8px 12px;max-width:85%;white-space:pre-wrap;overflow-wrap:break-word}
.ty-msg.ai{background:#f0ede8;align-self:flex-start}
.ty-msg.user{background:#dbe4f0;align-self:flex-end}
.ty-msg.installer{background:#dbe7db;align-self:flex-start}
.ty-msg.installer b{color:#5B4B42}
#ty-chat-form{display:flex;border-top:1px solid #ddd}
#ty-chat-input{flex:1;border:0;padding:12px;font:inherit;outline:none}
#ty-chat-send{background:#5B4B42;color:#fff;border:0;padding:0 18px;font-weight:700;cursor:pointer}
@media (max-width:480px){#ty-chat-panel{width:100vw;height:75vh;bottom:0;right:0;border-radius:14px 14px 0 0}}
```

- [ ] **Step 2: Create `site/chat.js`**

```js
// Tuned Yota chat widget. Context-aware label, session in sessionStorage,
// POSTs to /.netlify/functions/chat; polls for installer replies while escalated.
(function () {
  var path = location.pathname.toLowerCase();
  var CTX = path.indexOf("amsoil") >= 0 ? "amsoil" : (path.indexOf("magnuson") >= 0 ? "magnuson" : "default");
  var LABEL = CTX === "amsoil" ? "💬 Chat with a AMSOIL Fluid Specialist"
    : CTX === "magnuson" ? "💬 Chat with a Magnuson Supercharger Specialist"
    : "💬 Chat with an OTT installer NOW";
  var FN = "/.netlify/functions/chat";
  var sid = sessionStorage.getItem("ty-chat-sid");
  if (!sid) { sid = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()); sessionStorage.setItem("ty-chat-sid", sid); }
  var seen = 0, escalated = false, pollTimer = null, open = false;

  var css = document.createElement("link"); css.rel = "stylesheet"; css.href = "/chat.css"; document.head.appendChild(css);
  var btn = document.createElement("button"); btn.id = "ty-chat-btn"; btn.textContent = LABEL; document.body.appendChild(btn);
  var panel = null, log = null, input = null;

  function el(tag, attrs, text) { var e = document.createElement(tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (text) e.textContent = text; return e; }
  function addMsg(role, text, name) {
    var m = el("div", { class: "ty-msg " + role });
    if (role === "installer") { var b = document.createElement("b"); b.textContent = (name || "OTT Installer") + ": "; m.appendChild(b); m.appendChild(document.createTextNode(text)); }
    else m.textContent = text;
    log.appendChild(m); log.scrollTop = log.scrollHeight;
  }

  function poll() {
    fetch(FN, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session: sid, poll: true, since: seen }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        (j.turns || []).forEach(function (t) { seen++; if (t.role === "installer") addMsg("installer", t.text); });
      }).catch(function () {});
  }
  function startPolling() { if (!pollTimer) pollTimer = setInterval(poll, 3000); }

  function send(text) {
    addMsg("user", text); seen += 1;
    var typing = el("div", { class: "ty-msg ai", id: "ty-typing" }, "…"); log.appendChild(typing);
    fetch(FN, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session: sid, message: text, page: CTX }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        typing.remove();
        if (j.expired) { sessionStorage.removeItem("ty-chat-sid"); addMsg("ai", "That chat expired — refresh the page to start a new one."); return; }
        if (j.reply) { addMsg("ai", j.reply); seen += 1; }
        if (j.escalated) { escalated = true; startPolling(); }
      })
      .catch(function () { typing.remove(); addMsg("ai", "Connection hiccup — text us at 612-406-7117 and we'll take care of you."); });
  }

  function openPanel() {
    if (open) return; open = true; btn.style.display = "none";
    panel = el("div", { id: "ty-chat-panel" });
    var head = el("div", { id: "ty-chat-head" }, "Tuned Yota");
    var close = el("button", { type: "button", "aria-label": "Close" }, "—"); head.appendChild(close);
    log = el("div", { id: "ty-chat-log" });
    var form = el("form", { id: "ty-chat-form" });
    input = el("input", { id: "ty-chat-input", placeholder: "Type a message…", maxlength: "1000" });
    var sendBtn = el("button", { id: "ty-chat-send", type: "submit" }, "Send");
    form.appendChild(input); form.appendChild(sendBtn);
    panel.appendChild(head); panel.appendChild(log); panel.appendChild(form);
    document.body.appendChild(panel);
    addMsg("ai", "Thank you for using Tuned Yota's chat agent. What can I help you with — your truck, a tune, or an upcoming event?");
    close.addEventListener("click", function () { panel.remove(); open = false; btn.style.display = ""; });
    form.addEventListener("submit", function (ev) { ev.preventDefault(); var t = input.value.trim(); if (t) { input.value = ""; send(t); } });
    if (escalated) startPolling();
    input.focus();
  }
  btn.addEventListener("click", openPanel);
})();
```

Note: the widget's canned greeting is shown instantly on open (turn 0 client-side); the server's system prompt independently enforces the greeting rule for the model's first reply path, so the transcript stays consistent even if a user's first message races the greeting.

- [ ] **Step 3: Include on every page**

Codemod for the checked-in pages (idempotent — skips files already including it):

```bash
cd tunedyota
node -e "
const fs=require('fs'),path=require('path');
for(const f of fs.readdirSync('site').filter(f=>f.endsWith('.html'))){
  const p=path.join('site',f); let h=fs.readFileSync(p,'utf8');
  if(h.includes('/chat.js')||!h.includes('</body>')) continue;
  h=h.replace('</body>','<script src=\"/chat.js\" defer></script>\n</body>');
  fs.writeFileSync(p,h);
  console.log('added',f);
}"
```

Then open `scripts/build-amsoil-pages.mjs`, find the HTML template's closing `</body>`, and add `<script src="/chat.js" defer></script>` before it so regenerated AMSOIL pages keep the include. Run `npm run build:amsoil` and confirm `git diff --stat` shows only the script-tag line changing in the generated pages.

- [ ] **Step 4: Playwright test** — `tests/chat-widget.test.mjs` (copy the static-serving harness from `tests/book-page.test.mjs`, then):

```js
// Assertions (adapt harness from book-page.test.mjs):
// 1. index.html → button text contains "Chat with an OTT installer NOW"
// 2. an amsoil-*.html page → button text contains "AMSOIL Fluid Specialist"
// 3. click button → panel opens, greeting message starts with
//    "Thank you for using Tuned Yota's chat agent."
// 4. stub window.fetch before clicking send → typed message renders as .ty-msg.user
//    and the stubbed reply renders as .ty-msg.ai
```

- [ ] **Step 5: Run** — `node --test tests/chat-widget.test.mjs` → PASS
- [ ] **Step 6: Commit** — `git add site scripts/build-amsoil-pages.mjs tests/chat-widget.test.mjs && git commit -m "feat(chat): site-wide chat widget with context-aware labels"`

---

### Task 9: Env, deploy, live verification

**Files:** none (ops)

- [ ] **Step 1: Set the outbound SMS number** — confirm with the owner that the business Twilio number is the 612-406-7117 line, then:

```bash
cd tunedyota && npx netlify env:set TWILIO_FROM_NUMBER "+16124067117"
```

- [ ] **Step 2: Full suite green** — `npm test` → 0 fail.
- [ ] **Step 3: Push and wait for deploy** — `git push origin master && npx netlify watch`
- [ ] **Step 4: Live smoke test (owner in the loop):**
  1. Open tunedyota.com — button reads "Chat with an OTT installer NOW"; an `amsoil-*` page reads "Chat with a AMSOIL Fluid Specialist".
  2. Ask "what does the OTT tune do for a 2019 Tacoma?" → grounded NEPQ-style answer, no guardrail breach.
  3. Ask "can you guarantee my supercharger + tune combo is safe?" → AI moves to collect name/contact/vehicle/city (explaining why) → escalation: owner receives SMS + web push; Priority List gains a `chat` lead with transcript; Chat Escalations gains a row; widget shows installer name + phone.
  4. Owner replies to the SMS → reply appears in the open widget within ~5 s.
  5. Verify a plain customer text to the Twilio number still gets the auto-reply and creates a lead (existing behavior intact).
- [ ] **Step 5: Update `docs/operations/sop-data-security-secrets.md`** env table with `TWILIO_FROM_NUMBER` (one row) and commit: `git commit -am "docs(sop): TWILIO_FROM_NUMBER env var"`.

---

## Self-review notes

- Spec §2–§9 each map to Tasks 8, 6, 6, 5+6, 7, 1, 6 (caps), 6 (error handling), and 2–8 (tests) respectively; §10 out-of-scope items have no tasks by design.
- Names cross-checked: `loadSession`/`saveSession`/`loadEscalatedForInstaller`/`isStale` (Task 2) match usage in Tasks 6–7; `runChat`/`TRANSFER_TOOL` (Task 3) match Task 6; `sendSms` (Task 4) matches Task 6; `relayInstallerReply` handler deps (`ctx.relay`) match Task 7 tests.
- Escalation lead goes through the existing `lead-ingest` pipeline via `ingestLead` (same path the Twilio adapter uses), which owns dedupe + Activity Log formatting — verify field mapping against `processLeadIngest` in `lib/leads.js:65` during Task 6 and adjust the body keys if it expects different names.
