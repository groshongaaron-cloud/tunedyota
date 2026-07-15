# Twilio SMS + Voice Lead Adapter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn inbound texts and calls to the Tuned Yota business line into tracked leads (and forward calls to installer cells with voicemail+transcription on no-answer), via signature-validated Twilio webhooks.

**Architecture:** Dependency-free Netlify webhook receivers. A pure `lib/twilio.js` (signature validation, TwiML builders, param parsers, lead POST) plus three thin handlers (`twilio-sms`, `twilio-voice`, `twilio-voice-transcription`). Each webhook validates `X-Twilio-Signature` (fail-closed), normalizes the payload, and POSTs to the existing `/lead-ingest` with `x-ty-task` — exactly like the Gmail adapter. No new npm deps.

**Tech Stack:** Node.js (CommonJS), Netlify Functions, Node built-in `crypto` (HMAC-SHA1), `node --test` + `node:assert/strict`, dependency injection for tests.

**Spec:** `docs/superpowers/specs/2026-07-15-twilio-sms-voice-lead-adapter-design.md`

**Conventions (match existing code):**
- Tests: `const { test } = require("node:test"); const assert = require("node:assert/strict");`
- Handlers: `async function handler(event, ctx = {})` with injectable deps on `ctx` (mirrors `lead-ingest.js`).
- Netlify function headers arrive **lowercased** (`event.headers["x-twilio-signature"]`).
- Twilio POSTs `application/x-www-form-urlencoded`; Netlify may base64-encode (`event.isBase64Encoded`).
- Run the whole suite with `npm test` (i.e. `node --test`).

**No `netlify.toml` change:** these are request-triggered webhook functions, not scheduled.

---

## File Structure

| File | Responsibility |
|---|---|
| `netlify/functions/lib/twilio.js` | Pure: `validateTwilioSignature`, `decodeBody`, `webhookUrl`, `formatPhone`, `displayName`, `parseForwardNumbers`, `escapeXml`, TwiML builders (`smsReplyTwiml`/`dialTwiml`/`voicemailTwiml`/`hangupTwiml`), `GREETING`, `parseInboundSms`/`parseInboundCall`/`parseTranscription`, `ingestLead`. |
| `netlify/functions/twilio-sms.js` | Inbound SMS webhook → lead + auto-reply TwiML. |
| `netlify/functions/twilio-voice.js` | Inbound call webhook + its own `<Dial>` action callback (branched on `DialCallStatus`). |
| `netlify/functions/twilio-voice-transcription.js` | Async voicemail transcription callback → lead update. |
| `tests/twilio.test.js` | Unit tests for `lib/twilio.js`. |
| `tests/twilio-sms.test.js` | Handler tests for `twilio-sms.js`. |
| `tests/twilio-voice.test.js` | Handler tests for `twilio-voice.js`. |
| `tests/twilio-voice-transcription.test.js` | Handler tests for `twilio-voice-transcription.js`. |
| `docs/operations/twilio-adapter-activation.md` | Owner activation runbook (temp number, env, webhook wiring, live checks). |

---

## Task 1: Signature validation (`lib/twilio.js`)

**Files:**
- Create: `netlify/functions/lib/twilio.js`
- Test: `tests/twilio.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/twilio.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const T = require("../netlify/functions/lib/twilio.js");

// Official twilio-node documented test vector.
const VEC_URL = "https://mycompany.com/myapp.php?foo=1&bar=2";
const VEC_PARAMS = { CallSid: "CA1234567890ABCDE", Caller: "+14158675309", Digits: "1234", From: "+14158675309", To: "+18005551212" };
const VEC_TOKEN = "12345";
const VEC_SIG = "RSOYDt4T1cUTdK1PDd93/VVr8B8=";

test("validateTwilioSignature accepts Twilio's documented vector", () => {
  assert.equal(T.validateTwilioSignature(VEC_TOKEN, VEC_URL, VEC_PARAMS, VEC_SIG), true);
});

test("validateTwilioSignature rejects a tampered param", () => {
  const tampered = { ...VEC_PARAMS, Digits: "9999" };
  assert.equal(T.validateTwilioSignature(VEC_TOKEN, VEC_URL, tampered, VEC_SIG), false);
});

test("validateTwilioSignature fail-closed on missing token or signature", () => {
  assert.equal(T.validateTwilioSignature("", VEC_URL, VEC_PARAMS, VEC_SIG), false);
  assert.equal(T.validateTwilioSignature(VEC_TOKEN, VEC_URL, VEC_PARAMS, ""), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/twilio.test.js`
Expected: FAIL — `Cannot find module '../netlify/functions/lib/twilio.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
// netlify/functions/lib/twilio.js
// Pure helpers for the Twilio SMS+Voice lead adapter. No I/O except the injected
// `post` in ingestLead. See docs/superpowers/specs/2026-07-15-twilio-sms-voice-lead-adapter-design.md
const crypto = require("crypto");

// Twilio request signature: HMAC-SHA1 of (URL + each POST param, sorted by key,
// concatenated as key+value), base64, compared constant-time to X-Twilio-Signature.
function validateTwilioSignature(authToken, url, params, signature) {
  if (!authToken || !signature) return false;
  const data = Object.keys(params || {}).sort().reduce((acc, k) => acc + k + params[k], String(url || ""));
  const expected = crypto.createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
  const a = Buffer.from(expected), b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { validateTwilioSignature };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/twilio.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/twilio.js tests/twilio.test.js
git commit -m "feat(twilio): request signature validation (HMAC-SHA1)"
```

---

## Task 2: Request decode + URL + phone/name/number helpers

**Files:**
- Modify: `netlify/functions/lib/twilio.js`
- Test: `tests/twilio.test.js`

- [ ] **Step 1: Write the failing tests** (append to `tests/twilio.test.js`)

```js
test("decodeBody parses urlencoded form params", () => {
  const p = T.decodeBody({ body: "From=%2B16125551234&Body=Need+a+tune" });
  assert.equal(p.From, "+16125551234");
  assert.equal(p.Body, "Need a tune");
});

test("decodeBody handles base64-encoded bodies", () => {
  const raw = "From=%2B16125551234&Body=hi";
  const p = T.decodeBody({ body: Buffer.from(raw, "utf-8").toString("base64"), isBase64Encoded: true });
  assert.equal(p.From, "+16125551234");
  assert.equal(p.Body, "hi");
});

test("formatPhone renders a US 10-digit number, passes odd input through", () => {
  assert.equal(T.formatPhone("+16125551234"), "612-555-1234");
  assert.equal(T.formatPhone("weird"), "weird");
});

test("displayName prefixes the formatted number", () => {
  assert.equal(T.displayName("Text", "+16125551234"), "Text 612-555-1234");
});

test("parseForwardNumbers splits CSV, trims, drops blanks", () => {
  assert.deepEqual(T.parseForwardNumbers({ TWILIO_FORWARD_NUMBERS: " +1612, ,+1651 " }), ["+1612", "+1651"]);
  assert.deepEqual(T.parseForwardNumbers({}), []);
});

test("webhookUrl uses rawUrl, or TWILIO_PUBLIC_BASE override", () => {
  assert.equal(T.webhookUrl({ rawUrl: "https://x/.netlify/functions/twilio-sms" }, {}, "twilio-sms"),
    "https://x/.netlify/functions/twilio-sms");
  assert.equal(T.webhookUrl({ rawUrl: "ignored" }, { TWILIO_PUBLIC_BASE: "https://p/" }, "twilio-voice"),
    "https://p/.netlify/functions/twilio-voice");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/twilio.test.js`
Expected: FAIL — `T.decodeBody is not a function`.

- [ ] **Step 3: Write minimal implementation** (add to `lib/twilio.js`, before `module.exports`)

```js
function decodeBody(event) {
  const raw = event && event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf-8")
    : (event && event.body) || "";
  const params = {};
  for (const [k, v] of new URLSearchParams(raw)) params[k] = v;
  return params;
}

function webhookUrl(event, env, fnName) {
  const base = env && env.TWILIO_PUBLIC_BASE;
  if (base) return `${String(base).replace(/\/$/, "")}/.netlify/functions/${fnName}`;
  return (event && event.rawUrl) || "";
}

function formatPhone(e164) {
  const d = String(e164 == null ? "" : e164).replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : String(e164 == null ? "" : e164);
}

function displayName(prefix, e164) { return `${prefix} ${formatPhone(e164)}`.trim(); }

function parseForwardNumbers(env) {
  return String((env && env.TWILIO_FORWARD_NUMBERS) || "").split(",").map((s) => s.trim()).filter(Boolean);
}
```

Update `module.exports` to:

```js
module.exports = { validateTwilioSignature, decodeBody, webhookUrl, formatPhone, displayName, parseForwardNumbers };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/twilio.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/twilio.js tests/twilio.test.js
git commit -m "feat(twilio): request decode + url/phone/number helpers"
```

---

## Task 3: TwiML builders + greeting

**Files:**
- Modify: `netlify/functions/lib/twilio.js`
- Test: `tests/twilio.test.js`

- [ ] **Step 1: Write the failing tests** (append)

```js
test("escapeXml escapes the five XML entities", () => {
  assert.equal(T.escapeXml(`a&b<c>"d'`), "a&amp;b&lt;c&gt;&quot;d&apos;");
});

test("smsReplyTwiml wraps an escaped Message", () => {
  const x = T.smsReplyTwiml("Thanks & welcome");
  assert.match(x, /^<\?xml/);
  assert.match(x, /<Response><Message>Thanks &amp; welcome<\/Message><\/Response>/);
});

test("dialTwiml rings every number with timeout + action + callerId", () => {
  const x = T.dialTwiml(["+1612", "+1651"], { timeout: 20, action: "https://a/x", callerId: "+1999" });
  assert.match(x, /timeout="20"/);
  assert.match(x, /action="https:\/\/a\/x"/);
  assert.match(x, /callerId="\+1999"/);
  assert.match(x, /<Number>\+1612<\/Number><Number>\+1651<\/Number>/);
});

test("voicemailTwiml says the greeting in a Polly voice then records with transcription", () => {
  const x = T.voicemailTwiml({ greeting: T.GREETING, transcribeCallback: "https://a/t" });
  assert.match(x, /<Say voice="Polly\.Matthew-Neural">/);
  assert.match(x, /Tuned Yota/);
  assert.match(x, /<Record transcribe="true" transcribeCallback="https:\/\/a\/t" maxLength="120" playBeep="true"\/>/);
});

test("hangupTwiml returns a bare Hangup", () => {
  assert.match(T.hangupTwiml(), /<Response><Hangup\/><\/Response>/);
});

test("GREETING includes the leave-a-message cue and the text-in alternative", () => {
  assert.match(T.GREETING, /after the tone/i);
  assert.match(T.GREETING, /612-406-7117/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/twilio.test.js`
Expected: FAIL — `T.escapeXml is not a function`.

- [ ] **Step 3: Write minimal implementation** (add to `lib/twilio.js`)

```js
const XML = '<?xml version="1.0" encoding="UTF-8"?>';

// Owner-authored no-answer greeting (spec). Edit here to change what callers hear.
const GREETING = "Hi this is Tuned Yota — I saw we missed your call, sorry about that! " +
  "I wanted to make sure I got back to you personally. Whether you're looking for the OTT tune, " +
  "a Magnuson Supercharger, a build for your vehicle, or a maintenance issue needing a fix, or just " +
  "have a few questions, I'd love to help you get it dialed in. You can also shoot a quick text to the " +
  "same line, 612-406-7117, and a team member can begin a live chat with you. So we can call you right " +
  "back, please leave your name and a short message after the tone. Thanks, and talk soon!";

function escapeXml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function smsReplyTwiml(text) {
  return `${XML}<Response><Message>${escapeXml(text)}</Message></Response>`;
}

function dialTwiml(numbers, opts = {}) {
  const { timeout = 20, action = "", callerId = "" } = opts;
  const attrs = [
    `timeout="${timeout}"`,
    `answerOnBridge="true"`,
    action ? `action="${escapeXml(action)}"` : "",
    callerId ? `callerId="${escapeXml(callerId)}"` : "",
  ].filter(Boolean).join(" ");
  const nums = (numbers || []).map((n) => `<Number>${escapeXml(n)}</Number>`).join("");
  return `${XML}<Response><Dial ${attrs}>${nums}</Dial></Response>`;
}

function voicemailTwiml(opts = {}) {
  const { greeting = GREETING, voice = "Polly.Matthew-Neural", transcribeCallback = "", maxLength = 120 } = opts;
  const cb = transcribeCallback ? ` transcribeCallback="${escapeXml(transcribeCallback)}"` : "";
  const rec = `<Record transcribe="true"${cb} maxLength="${maxLength}" playBeep="true"/>`;
  return `${XML}<Response><Say voice="${escapeXml(voice)}">${escapeXml(greeting)}</Say>${rec}</Response>`;
}

function hangupTwiml() { return `${XML}<Response><Hangup/></Response>`; }
```

Update `module.exports` to add: `escapeXml, smsReplyTwiml, dialTwiml, voicemailTwiml, hangupTwiml, GREETING`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/twilio.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/twilio.js tests/twilio.test.js
git commit -m "feat(twilio): TwiML builders + owner voicemail greeting"
```

---

## Task 4: Payload parsers + lead ingest

**Files:**
- Modify: `netlify/functions/lib/twilio.js`
- Test: `tests/twilio.test.js`

- [ ] **Step 1: Write the failing tests** (append)

```js
test("parseInboundSms maps From/Body to an sms lead", () => {
  const lead = T.parseInboundSms({ From: "+16125551234", Body: "  Want an OTT tune  " });
  assert.deepEqual(lead, { name: "Text 612-555-1234", phone: "+16125551234", channel: "sms",
    source: "twilio:sms", goals: "Want an OTT tune", message: "Want an OTT tune" });
});

test("parseInboundSms falls back to a message note when Body is empty", () => {
  const lead = T.parseInboundSms({ From: "+16125551234", Body: "" });
  assert.equal(lead.message, "inbound text");
});

test("parseInboundCall maps From to a phone lead with the given note", () => {
  const lead = T.parseInboundCall({ From: "+16125551234" }, "call answered by installer");
  assert.deepEqual(lead, { name: "Caller 612-555-1234", phone: "+16125551234", channel: "phone",
    source: "twilio:call", message: "call answered by installer" });
});

test("parseInboundCall defaults the note to 'inbound call'", () => {
  assert.equal(T.parseInboundCall({ From: "+16125551234" }).message, "inbound call");
});

test("parseTranscription folds transcript + recording url into the message", () => {
  const lead = T.parseTranscription({ From: "+16125551234", TranscriptionText: "hi it's Sam about my Tundra", RecordingUrl: "https://rec/1" });
  assert.equal(lead.channel, "phone");
  assert.equal(lead.phone, "+16125551234");
  assert.equal(lead.goals, "hi it's Sam about my Tundra");
  assert.match(lead.message, /^voicemail: hi it's Sam about my Tundra — https:\/\/rec\/1$/);
});

test("ingestLead posts to lead-ingest with the task secret and returns ok", async () => {
  const calls = [];
  const post = async (url, opts) => { calls.push({ url, opts }); return { ok: true }; };
  const out = await T.ingestLead({ name: "Text 612-555-1234", phone: "+16125551234", channel: "sms" },
    { env: { INTERNAL_TASK_SECRET: "sekret", LEAD_INGEST_URL: "https://x/lead-ingest" }, post });
  assert.deepEqual(out, { ok: true });
  assert.equal(calls[0].url, "https://x/lead-ingest");
  assert.equal(calls[0].opts.headers["x-ty-task"], "sekret");
  assert.equal(JSON.parse(calls[0].opts.body).phone, "+16125551234");
});

test("ingestLead swallows a thrown post error -> ok:false", async () => {
  const out = await T.ingestLead({ phone: "x" }, { env: {}, post: async () => { throw new Error("down"); } });
  assert.equal(out.ok, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/twilio.test.js`
Expected: FAIL — `T.parseInboundSms is not a function`.

- [ ] **Step 3: Write minimal implementation** (add to `lib/twilio.js`)

```js
function parseInboundSms(params) {
  const from = params.From || "";
  const body = String(params.Body || "").trim();
  return { name: displayName("Text", from), phone: from, channel: "sms", source: "twilio:sms",
    goals: body, message: body || "inbound text" };
}

function parseInboundCall(params, note) {
  const from = params.From || "";
  return { name: displayName("Caller", from), phone: from, channel: "phone", source: "twilio:call",
    message: note || "inbound call" };
}

function parseTranscription(params) {
  const from = params.From || "";
  const text = String(params.TranscriptionText || "").trim();
  const rec = params.RecordingUrl || "";
  const base = text ? `voicemail: ${text}` : "voicemail (no transcription)";
  return { name: displayName("Caller", from), phone: from, channel: "phone", source: "twilio:call",
    goals: text, message: rec ? `${base} — ${rec}` : base };
}

// POST a normalized lead to the Core ingest endpoint (mirrors gmail-lead-poll.js).
async function ingestLead(body, deps = {}) {
  const env = deps.env || process.env;
  const post = deps.post || fetch;
  const base = env.LEAD_INGEST_URL
    || (env.URL ? `${env.URL}/.netlify/functions/lead-ingest` : "https://tunedyota.com/.netlify/functions/lead-ingest");
  try {
    const res = await post(base, { method: "POST",
      headers: { "Content-Type": "application/json", "x-ty-task": env.INTERNAL_TASK_SECRET || "" },
      body: JSON.stringify(body) });
    return { ok: !!(res && res.ok) };
  } catch (e) { return { ok: false, error: e.message }; }
}
```

Update `module.exports` to add: `parseInboundSms, parseInboundCall, parseTranscription, ingestLead`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/twilio.test.js`
Expected: PASS (all `lib/twilio.js` tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/twilio.js tests/twilio.test.js
git commit -m "feat(twilio): payload parsers + lead ingest POST"
```

---

## Task 5: SMS webhook handler (`twilio-sms.js`)

**Files:**
- Create: `netlify/functions/twilio-sms.js`
- Test: `tests/twilio-sms.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/twilio-sms.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/twilio-sms.js");

const evt = (over = {}) => ({ headers: { "x-twilio-signature": "sig" },
  body: "From=%2B16125551234&Body=Interested+in+a+tune",
  rawUrl: "https://tunedyota.com/.netlify/functions/twilio-sms", ...over });

test("valid signature -> ingests an sms lead + returns Message TwiML", async () => {
  const ingested = [];
  const res = await handler(evt(), { env: { TWILIO_AUTH_TOKEN: "t" }, verify: () => true,
    ingest: async (b) => { ingested.push(b); return { ok: true }; } });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["Content-Type"], /xml/);
  assert.match(res.body, /<Message>/);
  assert.equal(ingested.length, 1);
  assert.equal(ingested[0].channel, "sms");
  assert.equal(ingested[0].phone, "+16125551234");
  assert.equal(ingested[0].goals, "Interested in a tune");
});

test("bad signature -> 403 and no ingest", async () => {
  const ingested = [];
  const res = await handler(evt(), { env: {}, verify: () => false, ingest: async (b) => { ingested.push(b); } });
  assert.equal(res.statusCode, 403);
  assert.equal(ingested.length, 0);
});

test("ingest failure still returns 200 TwiML (never break the texter)", async () => {
  const res = await handler(evt(), { env: {}, verify: () => true, ingest: async () => { throw new Error("down"); } });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /<Message>/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/twilio-sms.test.js`
Expected: FAIL — cannot find module `twilio-sms.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// netlify/functions/twilio-sms.js
// Inbound SMS webhook: validate Twilio signature, ingest a tracked lead, auto-reply.
const { validateTwilioSignature, decodeBody, webhookUrl, parseInboundSms, smsReplyTwiml, ingestLead } = require("./lib/twilio.js");

const REPLY = "Thanks for texting Tuned Yota! We got your message and a team member will reach out shortly. " +
  "For the fastest help, reply with your vehicle + what you're after (OTT tune, supercharger, build, or a question).";

async function handler(event, ctx = {}) {
  const env = ctx.env || process.env;
  const verify = ctx.verify || validateTwilioSignature;
  const ingest = ctx.ingest || ((b) => ingestLead(b, { env }));
  const params = decodeBody(event);
  const url = webhookUrl(event, env, "twilio-sms");
  const sig = (event.headers && (event.headers["x-twilio-signature"] || event.headers["X-Twilio-Signature"])) || "";
  if (!verify(env.TWILIO_AUTH_TOKEN, url, params, sig)) return { statusCode: 403, body: "invalid signature" };
  try { await ingest(parseInboundSms(params)); } catch (e) { /* best-effort; never break the texter */ }
  return { statusCode: 200, headers: { "Content-Type": "text/xml; charset=utf-8" }, body: smsReplyTwiml(REPLY) };
}

module.exports = { handler, REPLY };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/twilio-sms.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/twilio-sms.js tests/twilio-sms.test.js
git commit -m "feat(twilio): inbound SMS webhook -> lead + auto-reply"
```

---

## Task 6: Voice webhook — inbound leg + dial

**Files:**
- Create: `netlify/functions/twilio-voice.js`
- Test: `tests/twilio-voice.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/twilio-voice.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/twilio-voice.js");

const evt = (body, over = {}) => ({ headers: { "x-twilio-signature": "sig" }, body,
  rawUrl: "https://tunedyota.com/.netlify/functions/twilio-voice", ...over });

test("inbound call (no DialCallStatus) -> ingests + dials all forward numbers", async () => {
  const ingested = [];
  const res = await handler(evt("From=%2B16125551234&To=%2B16124067117"),
    { env: { TWILIO_FORWARD_NUMBERS: "+1611,+1622,+1633" }, verify: () => true,
      ingest: async (b) => { ingested.push(b); return { ok: true }; } });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /<Dial [^>]*timeout="20"/);
  assert.match(res.body, /callerId="\+16124067117"/);
  assert.match(res.body, /<Number>\+1611<\/Number><Number>\+1622<\/Number><Number>\+1633<\/Number>/);
  assert.equal(ingested[0].channel, "phone");
  assert.equal(ingested[0].message, "inbound call");
});

test("inbound call with NO forward numbers -> straight to voicemail", async () => {
  const res = await handler(evt("From=%2B16125551234&To=%2B16124067117"),
    { env: {}, verify: () => true, ingest: async () => ({ ok: true }) });
  assert.match(res.body, /<Record transcribe="true"/);
});

test("bad signature -> 403", async () => {
  const res = await handler(evt("From=x"), { env: {}, verify: () => false, ingest: async () => {} });
  assert.equal(res.statusCode, 403);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/twilio-voice.test.js`
Expected: FAIL — cannot find module `twilio-voice.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// netlify/functions/twilio-voice.js
// Inbound call webhook AND its own <Dial> action callback (branched on DialCallStatus).
// Initial leg: log the call as a lead, ring all installer cells at once. Action leg:
// answered -> note + hang up; unanswered -> greeting + record voicemail (transcribed).
const { validateTwilioSignature, decodeBody, webhookUrl, parseInboundCall, parseForwardNumbers,
        dialTwiml, voicemailTwiml, hangupTwiml, GREETING, ingestLead } = require("./lib/twilio.js");

async function handler(event, ctx = {}) {
  const env = ctx.env || process.env;
  const verify = ctx.verify || validateTwilioSignature;
  const ingest = ctx.ingest || ((b) => ingestLead(b, { env }));
  const params = decodeBody(event);
  const url = webhookUrl(event, env, "twilio-voice");
  const sig = (event.headers && (event.headers["x-twilio-signature"] || event.headers["X-Twilio-Signature"])) || "";
  if (!verify(env.TWILIO_AUTH_TOKEN, url, params, sig)) return { statusCode: 403, body: "invalid signature" };

  const xml = (body) => ({ statusCode: 200, headers: { "Content-Type": "text/xml; charset=utf-8" }, body });
  const voicemail = () => xml(voicemailTwiml({ greeting: GREETING, transcribeCallback: webhookUrl(event, env, "twilio-voice-transcription") }));

  // Dial-action leg is handled in Task 7. Initial inbound leg:
  try { await ingest(parseInboundCall(params, "inbound call")); } catch (e) { /* best-effort */ }
  const numbers = parseForwardNumbers(env);
  if (!numbers.length) return voicemail();
  return xml(dialTwiml(numbers, { timeout: 20, action: url, callerId: params.To || "" }));
}

module.exports = { handler };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/twilio-voice.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/twilio-voice.js tests/twilio-voice.test.js
git commit -m "feat(twilio): inbound call webhook -> log lead + dial installers"
```

---

## Task 7: Voice webhook — dial-action leg (answered / no-answer)

**Files:**
- Modify: `netlify/functions/twilio-voice.js`
- Test: `tests/twilio-voice.test.js`

- [ ] **Step 1: Write the failing tests** (append to `tests/twilio-voice.test.js`)

```js
test("dial action completed -> notes 'answered' + hangs up", async () => {
  const ingested = [];
  const res = await handler(evt("From=%2B16125551234&DialCallStatus=completed"),
    { env: {}, verify: () => true, ingest: async (b) => { ingested.push(b); return { ok: true }; } });
  assert.match(res.body, /<Hangup\/>/);
  assert.equal(ingested[0].message, "call answered by installer");
});

test("dial action no-answer -> voicemail with transcription callback", async () => {
  const res = await handler(evt("From=%2B16125551234&DialCallStatus=no-answer"),
    { env: {}, verify: () => true, ingest: async () => ({ ok: true }) });
  assert.match(res.body, /<Say voice="Polly\.Matthew-Neural">/);
  assert.match(res.body, /<Record transcribe="true" transcribeCallback="[^"]*twilio-voice-transcription"/);
});

test("dial action busy -> voicemail (any non-completed status)", async () => {
  const res = await handler(evt("From=%2B16125551234&DialCallStatus=busy"),
    { env: {}, verify: () => true, ingest: async () => ({ ok: true }) });
  assert.match(res.body, /<Record transcribe="true"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/twilio-voice.test.js`
Expected: FAIL — the completed case currently falls through to the dial/voicemail path, so `<Hangup/>` is missing.

- [ ] **Step 3: Write minimal implementation** — insert the dial-action branch immediately after the `voicemail` helper definition and before the "Initial inbound leg" comment in `twilio-voice.js`:

```js
  // Dial-action leg: Twilio re-POSTs the action URL with DialCallStatus once the dial ends.
  if (params.DialCallStatus) {
    if (params.DialCallStatus === "completed") {
      try { await ingest(parseInboundCall(params, "call answered by installer")); } catch (e) { /* best-effort */ }
      return xml(hangupTwiml());
    }
    return voicemail(); // no-answer / busy / failed / canceled
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/twilio-voice.test.js`
Expected: PASS (6 tests — the 3 from Task 6 still green).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/twilio-voice.js tests/twilio-voice.test.js
git commit -m "feat(twilio): dial-action leg — answered hangup vs voicemail"
```

---

## Task 8: Transcription callback (`twilio-voice-transcription.js`)

**Files:**
- Create: `netlify/functions/twilio-voice-transcription.js`
- Test: `tests/twilio-voice-transcription.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/twilio-voice-transcription.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/twilio-voice-transcription.js");

const evt = (body) => ({ headers: { "x-twilio-signature": "sig" }, body,
  rawUrl: "https://tunedyota.com/.netlify/functions/twilio-voice-transcription" });

test("valid signature -> ingests the transcript update + returns 200", async () => {
  const ingested = [];
  const res = await handler(evt("From=%2B16125551234&TranscriptionText=Call+me+about+my+Tacoma&RecordingUrl=https%3A%2F%2Frec%2F1"),
    { env: {}, verify: () => true, ingest: async (b) => { ingested.push(b); return { ok: true }; } });
  assert.equal(res.statusCode, 200);
  assert.equal(ingested[0].phone, "+16125551234");
  assert.match(ingested[0].message, /voicemail: Call me about my Tacoma — https:\/\/rec\/1/);
});

test("bad signature -> 403 and no ingest", async () => {
  const ingested = [];
  const res = await handler(evt("From=x"), { env: {}, verify: () => false, ingest: async (b) => { ingested.push(b); } });
  assert.equal(res.statusCode, 403);
  assert.equal(ingested.length, 0);
});

test("empty transcription still returns 200 (best-effort)", async () => {
  const res = await handler(evt("From=%2B16125551234&TranscriptionText="),
    { env: {}, verify: () => true, ingest: async () => { throw new Error("down"); } });
  assert.equal(res.statusCode, 200);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/twilio-voice-transcription.test.js`
Expected: FAIL — cannot find module `twilio-voice-transcription.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// netlify/functions/twilio-voice-transcription.js
// Async voicemail transcription callback: validate signature, fold the transcript +
// recording URL into the caller's lead (deduped by phone in the Core). Returns plain 200.
const { validateTwilioSignature, decodeBody, webhookUrl, parseTranscription, ingestLead } = require("./lib/twilio.js");

async function handler(event, ctx = {}) {
  const env = ctx.env || process.env;
  const verify = ctx.verify || validateTwilioSignature;
  const ingest = ctx.ingest || ((b) => ingestLead(b, { env }));
  const params = decodeBody(event);
  const url = webhookUrl(event, env, "twilio-voice-transcription");
  const sig = (event.headers && (event.headers["x-twilio-signature"] || event.headers["X-Twilio-Signature"])) || "";
  if (!verify(env.TWILIO_AUTH_TOKEN, url, params, sig)) return { statusCode: 403, body: "invalid signature" };
  try { await ingest(parseTranscription(params)); } catch (e) { /* best-effort */ }
  return { statusCode: 200, headers: { "Content-Type": "text/plain" }, body: "ok" };
}

module.exports = { handler };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/twilio-voice-transcription.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/twilio-voice-transcription.js tests/twilio-voice-transcription.test.js
git commit -m "feat(twilio): voicemail transcription callback -> lead update"
```

---

## Task 9: Full-suite green + activation runbook + memory

**Files:**
- Create: `docs/operations/twilio-adapter-activation.md`
- Modify: `.claude/memory/lead-tracking-program.md`

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: PASS — all prior tests plus the new `twilio*` files (no regressions).

- [ ] **Step 2: Write the activation runbook** — create `docs/operations/twilio-adapter-activation.md`:

```markdown
# Twilio SMS + Voice Adapter — Activation Runbook

Built + unit-tested. Inert until the steps below. Real business line (612-406-7117)
is untouched — this is verified against a TEMPORARY Twilio number first, then cut
over at port time.

## 1. Netlify env (via clipboard; never commit)
- `TWILIO_AUTH_TOKEN` — from the Twilio Console (Account → API keys & tokens).
- `TWILIO_FORWARD_NUMBERS` — installer cells, E.164, comma-separated, e.g.
  `+1XXXXXXXXXX,+1YYYYYYYYYY,+1ZZZZZZZZZZ`.
- `INTERNAL_TASK_SECRET` — already set (gates the ingest hop). Confirm present.
- (Optional) `TWILIO_PUBLIC_BASE` — only if `event.rawUrl` ever differs from the
  URL Twilio is configured to call. Normally leave unset.
Set for all contexts, then trigger a redeploy (env changes need a deploy).

## 2. Temporary Twilio number + webhooks
Buy a $1/mo number in the Twilio Console (or provision via API). Configure:
- **A CALL COMES IN** (Voice) → Webhook, HTTP POST →
  `https://tunedyota.com/.netlify/functions/twilio-voice`
- **A MESSAGE COMES IN** (Messaging) → Webhook, HTTP POST →
  `https://tunedyota.com/.netlify/functions/twilio-sms`
The `<Dial>` action + transcription callbacks are self-wired (relative to the same
host), so no extra config.

## 3. Live verification (against the temp number)
- Text the temp number → expect an auto-reply SMS + a new `sms` lead in the console
  Unassigned bucket (Channel sms, name "Text <number>", body in the activity log).
- Call the temp number, answer on a forward cell → call bridges; lead notes
  "call answered by installer".
- Call again, let it ring out → hear the greeting, leave a message → within a minute
  the lead's activity log shows `voicemail: <transcript> — <recording url>`.
- Confirm a bad/unsigned POST to either endpoint returns HTTP 403.

## 4. Cutover (later, at port time)
Once 612-406-7117 is ported into the Twilio account, move the two webhooks onto the
ported number and release the temp number. No code change.
```

- [ ] **Step 3: Update the program memory** — in `.claude/memory/lead-tracking-program.md`, update the adapter status line to record: "Adapter #3 (Twilio SMS+Voice) BUILT + unit-tested on master (dependency-free webhooks: `lib/twilio.js` + `twilio-sms`/`twilio-voice`/`twilio-voice-transcription`; signature-validated; POSTs `/lead-ingest` via `x-ty-task`). INERT pending activation — see `docs/operations/twilio-adapter-activation.md` (owner: `TWILIO_AUTH_TOKEN` + `TWILIO_FORWARD_NUMBERS` + a temp Twilio number wired to the two webhooks). Real-line cutover deferred to port time. Adapter #4 Meta still pending."

- [ ] **Step 4: Commit**

```bash
git add docs/operations/twilio-adapter-activation.md .claude/memory/lead-tracking-program.md
git commit -m "docs(twilio): activation runbook + adapter status in memory"
```

- [ ] **Step 5: Push to master**

```bash
git push origin master
```

Expected: push succeeds; the adapter is live-inert (no webhooks pointed at it yet).

---

## Self-Review Notes (author)

- **Spec coverage:** signature validation (T1), decode/url/helpers (T2), TwiML + greeting incl. leave-a-message cue (T3), parsers + ingest (T4), SMS handler (T5), voice inbound+dial (T6), dial-action answered/voicemail (T7), transcription callback (T8), suite+runbook+memory (T9). All spec sections mapped.
- **Signature vector** is the verified `twilio-node` documented value `RSOYDt4T1cUTdK1PDd93/VVr8B8=`.
- **Type consistency:** helper names (`validateTwilioSignature`, `decodeBody`, `webhookUrl`, `parseForwardNumbers`, `parseInbound*`, `ingestLead`, `dialTwiml`, `voicemailTwiml`, `hangupTwiml`, `GREETING`) are used identically across handlers and tests.
- **No Core change:** every ingest body carries a non-empty `name` (synthesized) + `phone`, satisfying `processLeadIngest`; city omitted → Unassigned.
- **Fail-closed:** each handler 403s on bad/missing signature before any side effect; ingest failures never change the 200-TwiML caller/texter experience.
```
