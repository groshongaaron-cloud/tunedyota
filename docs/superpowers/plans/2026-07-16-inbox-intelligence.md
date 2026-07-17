# Inbox Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Content-classified Gmail inbox sweep that ingests OTT leads (branded through close-out + OTT-report conversion math) and creates NEPQ-governed reply drafts reviewed at 8a/12p/7p CT.

**Architecture:** Two scheduled Netlify functions (`inbox-sweep` every 15 min replacing `gmail-lead-poll`; `inbox-digest` 3×/day) built on the existing Gmail lib + label state machine. Pure, injectable libs (`email-classify`, `email-draft`) carry all logic; Claude Haiku classifies/extracts, Sonnet drafts. Spec: `docs/superpowers/specs/2026-07-16-inbox-intelligence-design.md`.

**Tech Stack:** Node (CJS Netlify functions), `node --test`, raw fetch to Anthropic Messages API (pattern: `lib/vin-ocr-core.js`), Gmail REST via `lib/gmail.js`, Airtable via `lib/airtable.js`.

**Conventions (apply to every task):** run tests from repo root `C:\Users\grosh\Documents\tunedyota` with `node --test tests/<file>`; all new code follows the repo's injected-deps style (`deps = {}` param, every I/O overridable); commit after each green step; never log or store secrets.

---

### Task 1: "Qualified" phase gate

**Files:**
- Modify: `netlify/functions/lib/leads.js` (STAGES line 9, ACTIVE_STAGES line 10, ingest `Stage` at line ~119)
- Test: `tests/leads.test.js` (append)

- [ ] **Step 1: Write the failing tests** — append to `tests/leads.test.js`:

```javascript
test("Qualified is a valid stage, ordered after Contacted, and active", () => {
  const { STAGES, ACTIVE_STAGES } = require("../netlify/functions/lib/leads.js");
  assert.deepEqual(STAGES, ["New", "Contacted", "Qualified", "Following up", "Booked", "Not now"]);
  assert.ok(ACTIVE_STAGES.includes("Qualified"));
});

test("ingest auto-qualifies a lead arriving with a routable city AND a vehicle", async () => {
  const { processLeadIngest } = require("../netlify/functions/lib/leads.js");
  let created;
  const deps = { env: { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" },
    list: async () => [], create: async (a) => { created = a; return { id: "L1" }; }, update: async () => ({}) };
  await processLeadIngest({ name: "Quinn", phone: "9207375148", city: "Fargo", vehicle: "2006 Lexus GX470", channel: "ott-national" }, deps);
  assert.equal(created.fields.Stage, "Qualified");
});

test("ingest leaves stage New when city is unknown or vehicle is missing", async () => {
  const { processLeadIngest } = require("../netlify/functions/lib/leads.js");
  const mk = () => { const out = {}; return { out, deps: { env: { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" },
    list: async () => [], create: async (a) => { out.a = a; return { id: "L1" }; }, update: async () => ({}) } }; };
  const a = mk(); await processLeadIngest({ name: "A", phone: "1", city: "Nowhereville", vehicle: "Tundra" }, a.deps);
  assert.equal(a.out.a.fields.Stage, "New");
  const b = mk(); await processLeadIngest({ name: "B", phone: "1", city: "Fargo", vehicle: "" }, b.deps);
  assert.equal(b.out.a.fields.Stage, "New");
});
```

Check the top of `tests/leads.test.js` first: if `STAGES`/`ACTIVE_STAGES` are not already exported from the lib, the first test also drives adding them to `module.exports`.

- [ ] **Step 2: Run** `node --test tests/leads.test.js` — expect the 3 new tests FAIL (STAGES lacks "Qualified" / Stage is "New").

- [ ] **Step 3: Implement** in `netlify/functions/lib/leads.js`:

```javascript
// line 9-10 become:
const STAGES = ["New", "Contacted", "Qualified", "Following up", "Booked", "Not now"];
const ACTIVE_STAGES = ["New", "Contacted", "Qualified", "Following up"];
```

In `processLeadIngest`, the create-path `fields` (currently `Stage: "New"`) becomes:

```javascript
    // NEPQ Stage-2 bar: location routable + vehicle known = Qualified on arrival
    // (typical OTT lead). Airtable's Stage select gains the option via typecast:true.
    Source: source, Channel: channel,
    Stage: (market && String(d.vehicle || "").trim()) ? "Qualified" : "New",
```

Export `STAGES` and `ACTIVE_STAGES` from `module.exports` if not already there.

- [ ] **Step 4: Run** `node --test tests/leads.test.js tests/lead-endpoints.test.js` — expect ALL PASS (existing stage-validation tests must not regress).

- [ ] **Step 5: Commit** — `git add netlify/functions/lib/leads.js tests/leads.test.js && git commit -m "feat(crm): Qualified phase gate (location + vehicle known)"`

---

### Task 2: OTT parser — full label vocabulary + GHL Link

**Files:**
- Modify: `netlify/functions/lib/ott-email.js`
- Modify: `netlify/functions/lib/leads.js` (`processLeadIngest` stores `GHL Link`)
- Test: `tests/ott-email.test.js` (append; file exists — check name with `ls tests | grep ott`, it may be `ott-email.test.js` or covered in `gmail-lead-poll.test.js`; if absent create `tests/ott-email.test.js` requiring the lib directly)

- [ ] **Step 1: Write the failing tests:**

```javascript
const SAMPLE = [
  "Name: Quinn Coutley", "Email: qcoutley@gmail.com",
  "Phone: +19207375148 | (920) 737-5148", "Lead: Overland Tuning",
  "City: Green Bay", "State: WI", "Country: US",
  "Transmission Type: automatic_", "Vehicle Year: 2006", "Vehicle Make: Lexus",
  "Vehicle Model: Gx470", "Engine Size: 4.7", "Engine modifications: None",
  "Campaign name:", "Adset name:",
  "GHL Link: https://app.gohighlevel.com/v2/location/xyz/opportunities/list",
].join("\n");

test("parses the 2026-07 OTT label vocabulary incl. GHL link", () => {
  const { parseOttLeadEmail } = require("../netlify/functions/lib/ott-email.js");
  const out = parseOttLeadEmail({ headers: { from: "OTT <info@overlandtailor.com>" }, textBody: SAMPLE, threadId: "t1" });
  assert.equal(out.name, "Quinn Coutley");
  assert.equal(out.phone, "+19207375148");
  assert.equal(out.vehicle, "2006 Lexus Gx470");
  assert.equal(out.city, "Green Bay");
  assert.equal(out.ghlLink, "https://app.gohighlevel.com/v2/location/xyz/opportunities/list");
  assert.equal(out.channel, "ott-national");
});

test("ingest stores GHL Link on the lead (tolerant)", async () => {
  const { processLeadIngest } = require("../netlify/functions/lib/leads.js");
  let created;
  await processLeadIngest({ name: "Q", email: "q@x.com", ghlLink: "https://app.gohighlevel.com/x" },
    { env: { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" }, list: async () => [],
      create: async (a) => { created = a; return { id: "L1" }; }, update: async () => ({}) });
  assert.equal(created.fields["GHL Link"], "https://app.gohighlevel.com/x");
});
```

- [ ] **Step 2: Run** — expect FAIL (`ghlLink` undefined; `GHL Link` field absent).

- [ ] **Step 3: Implement.** In `parseOttLeadEmail` (after `mods`):

```javascript
  const ghlLink = fieldAfter(body, ["GHL Link"]);
```

and add to the return object: `ghlLink,`. In `processLeadIngest`, after `replyTo` is read add `const ghlLink = String(d.ghlLink || "").trim();`, add to the create-path fields `...(ghlLink ? { "GHL Link": ghlLink } : {}),` and add `"GHL Link"` to that create's tolerant-keys array.

- [ ] **Step 4: Run** the touched test files + `tests/gmail-lead-poll.test.js` — ALL PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(ott): parse full label vocabulary incl. GHL Link, store on lead"`

---

### Task 3: Lead conversion carries the channel

**Files:**
- Modify: `netlify/functions/lead-update.js:42`
- Test: `tests/lead-endpoints.test.js` (append; follow its existing handler-invocation harness)

- [ ] **Step 1: Failing test** — using the file's existing convert-action harness (find the current `action: "convert"` test and copy its deps shape):

```javascript
test("convert stamps the booking Source with the lead's channel", async () => {
  // deps/harness identical to the existing convert test, but the stubbed getImpl
  // returns a lead record whose fields include Channel: "ott-national"
  // ... assert on the captured create call:
  assert.equal(createdBooking.fields.Source, "lead:ott-national");
});

test("convert falls back to lead:convert when the lead has no channel", async () => {
  assert.equal(createdBooking.fields.Source, "lead:other"); // normalizeChannel default
});
```

Note: `toLeadView` always yields a channel (explicit `Channel` field, else `normalizeChannel(Source)` → `"other"` at worst), so the fallback literal is `lead:other`, not `lead:convert` — assert accordingly.

- [ ] **Step 2: Run** — FAIL (Source is `lead:convert`).
- [ ] **Step 3: Implement** — `lead-update.js` line 42 becomes:

```javascript
      Status: "Booked", Source: `lead:${lead.channel || "convert"}`, Installer: owner };
```

- [ ] **Step 4: Run** `node --test tests/lead-endpoints.test.js` — ALL PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(crm): converted bookings carry the lead channel in Source"`

---

### Task 4: Console OTT badges (lead card + booking row)

**Files:**
- Modify: `netlify/functions/installer-roster.js` (~line 38 where `const src = String(f.Source || "")` already exists — expose an `ott` flag on the booking row it builds: `ott: /(^|[:\s])ott/i.test(src),`)
- Modify: `site/installer.html` — (a) `leadCard(l)` (line ~781): inside the `sum.innerHTML` template, after the name span append `+(l.channel==='ott-national'?' <span class="tabbadge" style="background:#2f4f6f">OTT</span>':'')`; (b) the booking row template inside `eventCard` (search for where each booking `b` renders its name — add `+(b.ott?' <span class="tabbadge" style="background:#2f4f6f">OTT</span>':'')` after the customer-name markup)
- Test: `tests/installer-roster.test.js` (append) + a presence test in `tests/booking-ui.test.js`-style against `installer.html`

- [ ] **Step 1: Failing tests:**

```javascript
// tests/installer-roster.test.js — follow the file's existing harness for building rows
test("roster booking rows expose an ott flag from Source", () => {
  // feed a record with fields.Source = "lead:ott-national" through the row builder
  assert.equal(row.ott, true);
  // and Source "find-your-exact-tune" → false
});
```

```javascript
// append to tests/installer-search-scope.test.mjs? No — static presence, put in a new
// tests/installer-ott-badge.test.js reading site/installer.html:
const HTML = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "site", "installer.html"), "utf8");
test("console renders OTT badges for ott-national leads and ott bookings", () => {
  assert.ok(/ott-national'\s*\?/.test(HTML) || HTML.includes("l.channel==='ott-national'"), "lead card OTT chip");
  assert.ok(HTML.includes("b.ott?"), "booking row OTT chip");
});
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** per the file notes above (read the surrounding template code first; match its string-concat style exactly).
- [ ] **Step 4: Run** those tests + `node app/scripts/sync-web.mjs` + `node --test tests/app-sync-web.test.js` — ALL PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(console): OTT badges on lead cards and converted booking rows"`

---

### Task 5: Voice guide (`docs/email-voice.md`)

**Files:** Create: `docs/email-voice.md` (no test — grounding content; Task 8's tests assert it loads)

- [ ] **Step 1: Write the file:**

```markdown
# Tuned Yota — Email Voice Guide (owner-editable)

Strategy lives in docs/sales/nepq-playbook.md. This file is TONE only.

## Rules
- Short. 3-6 sentences for most replies. Short paragraphs, no walls of text.
- Overlander-to-overlander: plain talk, platform names, no corporate polish.
- Zero AI-speak. Banned: "I hope this email finds you well", "As an AI",
  "delve", "furthermore", "I understand your concern", "please do not hesitate".
- Sign-off: "— Aaron @ Tuned Yota" with the phone number (612) 406-7117.
- Every reply ends with exactly ONE question or one micro-commitment.

## Sounds like us
Q: "Will a tune mess up my 3rd gen 4Runner?"
A: "Short answer — no. Everything we flash is emissions-intact and built per
platform by a licensed VFTuner PRO tuner; factory safety margins stay in place.
What's yours doing right now that made you ask — hesitation, shifting, towing?
— Aaron @ Tuned Yota · (612) 406-7117"

Q: "How much for a tune?"
A: "Happy to get you an exact number — it depends on what you're running and
what you want out of it. What year/model, and what's it doing now that you
want changed? — Aaron @ Tuned Yota · (612) 406-7117"

Q: "I'm in Fargo with a 2019 Tundra, it falls on its face towing. What can you do?"
A: "That towing flat spot is exactly what the OTT calibration fixes on the 5.7 —
throttle mapping and shift logic are the culprits, not the engine. You're in luck
on location too: we run Fargo events regularly. How long has it been doing that,
and is the truck otherwise stock? — Aaron @ Tuned Yota · (612) 406-7117"
```

- [ ] **Step 2: Commit** — `git add docs/email-voice.md && git commit -m "docs: owner-editable email voice guide"`

---

### Task 6: `lib/gmail.js` — createDraft + listDrafts

**Files:**
- Modify: `netlify/functions/lib/gmail.js`
- Test: Create `tests/gmail-drafts.test.js`

- [ ] **Step 1: Failing tests:**

```javascript
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createDraft, listDrafts, b64urlDecode } = require("../netlify/functions/lib/gmail.js");

const deps = (impl) => ({ tokenImpl: async () => "tok", fetchImpl: impl });

test("createDraft POSTs a threaded RFC822 draft", async () => {
  let seen;
  const impl = async (url, opts) => { seen = { url, body: JSON.parse(opts.body) }; return { ok: true, json: async () => ({ id: "d1" }) }; };
  await createDraft({ threadId: "t1", to: "jo@x.com", subject: "Re: your towing question",
    inReplyTo: "<m1@x>", references: "<m1@x>", body: "hey Jo" }, deps(impl));
  assert.ok(seen.url.endsWith("/drafts"));
  assert.equal(seen.body.message.threadId, "t1");
  const raw = b64urlDecode(seen.body.message.raw);
  assert.match(raw, /To: jo@x.com/);
  assert.match(raw, /In-Reply-To: <m1@x>/);
  assert.match(raw, /hey Jo/);
});

test("listDrafts returns id + message ids", async () => {
  const impl = async () => ({ ok: true, json: async () => ({ drafts: [{ id: "d1", message: { id: "m1", threadId: "t1" } }] }) });
  const out = await listDrafts(deps(impl));
  assert.deepEqual(out, [{ id: "d1", messageId: "m1", threadId: "t1" }]);
});
```

- [ ] **Step 2: Run** `node --test tests/gmail-drafts.test.js` — FAIL (not exported).
- [ ] **Step 3: Implement** in `lib/gmail.js` (mirror `sendReply`'s MIME builder):

```javascript
// A reply DRAFT in the thread — created, never sent (Aaron reviews in Gmail).
async function createDraft({ threadId, to, inReplyTo, references, subject, body }, deps) {
  const lines = [`To: ${to}`, `Subject: ${subject}`,
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : null, references ? `References: ${references}` : null,
    "Content-Type: text/plain; charset=UTF-8", "", body].filter((x) => x !== null).join("\r\n");
  return authFetch(`/drafts`, { method: "POST", body: JSON.stringify({ message: { raw: b64url(lines), threadId } }) }, deps);
}
async function listDrafts(deps) {
  const j = await authFetch(`/drafts`, {}, deps);
  return (j.drafts || []).map((d) => ({ id: d.id, messageId: d.message && d.message.id, threadId: d.message && d.message.threadId }));
}
```

Add both to `module.exports`.

- [ ] **Step 4: Run** — PASS. **Step 5: Commit** — `git commit -m "feat(gmail): createDraft + listDrafts"`

---

### Task 7: `lib/email-classify.js` — classification + OTT field extraction

**Files:**
- Create: `netlify/functions/lib/email-classify.js`
- Test: Create `tests/email-classify.test.js`

Buckets: `ott-lead | inquiry | thread-reply | automated | spam | sensitive`. Anything unparseable/low-confidence → `sensitive` (fail toward a human). Model: `claude-haiku-4-5`, raw fetch, 15s abort — copy the request/timeout scaffolding style from `lib/vin-ocr-core.js`.

- [ ] **Step 1: Failing tests:**

```javascript
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { classifyEmail, extractLeadFields, BUCKETS } = require("../netlify/functions/lib/email-classify.js");

const stubText = (text) => async () => ({ ok: true, json: async () => ({ content: [{ type: "text", text }] }) });
const MSG = { headers: { from: "OTT <info@overlandtailor.com>", subject: "OTT" }, textBody: "Name: Q\nPhone: 555\nCity: Fargo" };

test("classifyEmail parses a clean JSON verdict", async () => {
  const out = await classifyEmail(MSG, { apiKey: "k", fetchImpl: stubText('{"bucket":"ott-lead","stage":"situation","confidence":0.97,"summary":"OTT lead: Q, Fargo"}') });
  assert.equal(out.bucket, "ott-lead");
  assert.equal(out.summary, "OTT lead: Q, Fargo");
});
test("garbage / low-confidence / unknown bucket all fall to sensitive", async () => {
  for (const raw of ["not json", '{"bucket":"weird"}', '{"bucket":"inquiry","confidence":0.2}']) {
    const out = await classifyEmail(MSG, { apiKey: "k", fetchImpl: stubText(raw) });
    assert.equal(out.bucket, "sensitive", raw);
  }
});
test("no api key classifies as sensitive (degrade to human)", async () => {
  const out = await classifyEmail(MSG, { apiKey: "" });
  assert.equal(out.bucket, "sensitive");
});
test("extractLeadFields maps LLM JSON to the lead-ingest shape", async () => {
  const out = await extractLeadFields(MSG, { apiKey: "k",
    fetchImpl: stubText('{"name":"Quinn","phone":"+1920","email":"q@x.com","city":"Green Bay","state":"WI","vehicle":"2006 Lexus GX470","mods":"None","ghlLink":""}') });
  assert.equal(out.name, "Quinn");
  assert.equal(out.channel, "ott-national");
});
test("extraction without phone AND email returns null (flag, don't ingest junk)", async () => {
  const out = await extractLeadFields(MSG, { apiKey: "k", fetchImpl: stubText('{"name":"Quinn"}') });
  assert.equal(out, null);
});
```

- [ ] **Step 2: Run** — FAIL (module missing).
- [ ] **Step 3: Implement `lib/email-classify.js`:**

```javascript
// netlify/functions/lib/email-classify.js
// Content-based inbox classification + OTT lead field extraction (Claude Haiku, raw
// fetch — pattern: lib/vin-ocr-core.js). Fails toward humans: anything unparseable,
// low-confidence, or unconfigured classifies as "sensitive".
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5";
const BUCKETS = ["ott-lead", "inquiry", "thread-reply", "automated", "spam", "sensitive"];

async function askClaude(prompt, { fetchImpl = fetch, apiKey, model = MODEL, maxTokens = 400 }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetchImpl(ANTHROPIC_URL, { method: "POST", signal: ctrl.signal,
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }) });
    if (!res.ok) throw new Error(`anthropic ${res.status}`);
    const j = await res.json();
    return ((j.content || []).find((c) => c.type === "text") || {}).text || "";
  } finally { clearTimeout(timer); }
}

function parseJson(text) {
  const m = String(text || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function classifyPrompt(msg) {
  return [
    "You triage the inbox of Tuned Yota, a Toyota/Lexus performance-tuning business.",
    "Classify the email below into exactly one bucket:",
    '- "ott-lead": a customer lead forwarded by Overland Tailor Tuning (OTT) or their systems (info@overlandtailor.com); usually labeled fields (Name/Phone/City/Vehicle...) or an OTT retailer referral note.',
    '- "inquiry": a customer asking about tuning, pricing, events, their vehicle, booking, or post-tune support (new thread).',
    '- "thread-reply": a customer replying within an existing conversation.',
    '- "automated": machine-generated (receipts, alerts, notifications, newsletters, calendars).',
    '- "spam": unsolicited marketing/scam/link-farm.',
    '- "sensitive": angry customer, refund/warranty dispute, legal threat, or anything you are unsure about.',
    "Also estimate the NEPQ conversation stage: one of connect|situation|problem|solution|consequence|qualifying|transition|commit (best guess; \"connect\" for cold).",
    'Respond ONLY with JSON: {"bucket":"...","stage":"...","confidence":0.0-1.0,"summary":"<one line: who + what they want>"}',
    "", `From: ${msg.headers.from}`, `Subject: ${msg.headers.subject}`, "", String(msg.textBody || "").slice(0, 6000),
  ].join("\n");
}

async function classifyEmail(msg, deps = {}) {
  const sensitive = (why) => ({ bucket: "sensitive", stage: "connect", confidence: 0, summary: why });
  if (!deps.apiKey) return sensitive("classifier unconfigured");
  let text;
  try { text = await askClaude(classifyPrompt(msg), deps); } catch (e) { return sensitive(`classifier error: ${e.message}`); }
  const j = parseJson(text);
  if (!j || !BUCKETS.includes(j.bucket)) return sensitive("unparseable classification");
  if (Number(j.confidence || 0) < 0.6) return sensitive(`low confidence (${j.confidence}): ${j.summary || ""}`);
  return { bucket: j.bucket, stage: String(j.stage || "connect"), confidence: Number(j.confidence), summary: String(j.summary || "") };
}

function extractPrompt(msg) {
  return [
    "Extract the customer lead from this email (a lead forwarded to a tuning shop).",
    'Respond ONLY with JSON: {"name":"","phone":"","email":"","city":"","state":"","vehicle":"<year make model>","goals":"","mods":"","ghlLink":""} — empty string for anything absent. Never invent values.',
    "", `From: ${msg.headers.from}`, `Subject: ${msg.headers.subject}`, "", String(msg.textBody || "").slice(0, 6000),
  ].join("\n");
}

async function extractLeadFields(msg, deps = {}) {
  if (!deps.apiKey) return null;
  let text;
  try { text = await askClaude(extractPrompt(msg), deps); } catch { return null; }
  const j = parseJson(text);
  if (!j || (!String(j.phone || "").trim() && !String(j.email || "").trim())) return null;
  return { name: String(j.name || "OTT National Lead"), phone: String(j.phone || ""), email: String(j.email || ""),
    city: String(j.city || ""), vehicle: String(j.vehicle || ""),
    goals: [String(j.city || ""), String(j.state || "")].filter(Boolean).join(", ") + (j.mods && !/^none?$/i.test(j.mods) ? ` · Mods ${j.mods}` : ""),
    ghlLink: String(j.ghlLink || ""), channel: "ott-national", source: "ott-national:email",
    message: "OTT lead (LLM-extracted)", threadId: msg.threadId || "", messageIdHeader: (msg.headers || {}).messageId || "",
    replyTo: ((String((msg.headers || {}).replyTo || (msg.headers || {}).from || "").match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [])[0]) || "" };
}

module.exports = { classifyEmail, extractLeadFields, BUCKETS, parseJson };
```

- [ ] **Step 4: Run** `node --test tests/email-classify.test.js` — ALL PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(inbox): content classifier + OTT lead extraction (Haiku)"`

---

### Task 8: `lib/email-draft.js` — NEPQ-governed draft generation

**Files:**
- Create: `netlify/functions/lib/email-draft.js`
- Test: Create `tests/email-draft.test.js`

Pure grounding-assembly + shape-checking; the Anthropic call is the same `askClaude` pattern (model `claude-sonnet-4-6`, maxTokens 700). Grounding files are read ONCE at module load with `fs.readFileSync` guarded by try/catch (missing file → empty string, never a crash).

- [ ] **Step 1: Failing tests:**

```javascript
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildDraftPrompt, checkDraftShape, groundingFor } = require("../netlify/functions/lib/email-draft.js");

test("groundingFor matches a known market city and pulls pricing for the named model", () => {
  const g = groundingFor({ city: "Fargo", text: "I have a 2019 Tundra that falls on its face towing" });
  assert.equal(g.market && g.market.city, "Fargo");
  assert.ok(g.installerName, "installer name resolved");
  assert.ok(g.pricing && /Tundra/.test(g.pricing), "Tundra pricing block found");
});
test("groundingFor with unknown city yields no market (draft must ask)", () => {
  const g = groundingFor({ city: "", text: "how much for a tune?" });
  assert.equal(g.market, null);
});
test("buildDraftPrompt embeds playbook rules, voice, stage, and grounding", () => {
  const p = buildDraftPrompt({ message: { headers: { from: "jo@x.com", subject: "tune?" }, textBody: "how much for a tune" },
    classification: { bucket: "inquiry", stage: "connect", summary: "cold price ask" },
    grounding: { market: null, installerName: "", pricing: "", nextEvent: "" }, threadContext: "" });
  assert.match(p, /NEPQ/i);
  assert.match(p, /exactly ONE question/i);
  assert.match(p, /never.*bare (price|number)/i);
});
test("checkDraftShape enforces the one-question ending and banned phrases", () => {
  assert.equal(checkDraftShape("Happy to help. What year is your Tundra?\n— Aaron @ Tuned Yota · (612) 406-7117").ok, true);
  assert.equal(checkDraftShape("Here is all the info. Thanks!").ok, false, "no question");
  assert.equal(checkDraftShape("Act now! What year? A? B? C? D?").ok, false, "pressure + too many questions");
  assert.equal(checkDraftShape("I hope this email finds you well. What year?").ok, false, "AI-speak");
});
```

- [ ] **Step 2: Run** — FAIL (module missing).
- [ ] **Step 3: Implement `lib/email-draft.js`:**

```javascript
// netlify/functions/lib/email-draft.js
// NEPQ-governed reply drafting. Strategy: docs/sales/nepq-playbook.md. Tone:
// docs/email-voice.md. Grounding: markets.js (nearest installer), vehicles.json
// (pricing), events (next date). Pure prompt-assembly + shape checks; the model
// call is injected/overridable. NOTHING here sends email — drafts only.
const fs = require("node:fs");
const path = require("node:path");
const { getMarket, MARKETS } = require("./markets.js");
const { keyToInstaller } = require("./routing.js");

const read = (p) => { try { return fs.readFileSync(path.join(__dirname, p), "utf8"); } catch { return ""; } };
const PLAYBOOK = read("../../../docs/sales/nepq-playbook.md");
const VOICE = read("../../../docs/email-voice.md");
const VEHICLES = (() => { try { return require("./vehicles.json"); } catch { return {}; } })();

const BANNED = [/act now/i, /best on the market/i, /make an informed decision/i,
  /i hope this (email )?finds you well/i, /as an ai/i, /do not hesitate/i, /delve/i];

// Find the model the customer named and return its pricing block as compact text.
function pricingFor(text) {
  const t = String(text || "").toLowerCase();
  for (const make of Object.keys(VEHICLES)) {
    for (const model of Object.keys(VEHICLES[make])) {
      if (t.includes(model.toLowerCase())) {
        return `${make} ${model}: ` + VEHICLES[make][model]
          .map((c) => `${c.y} ${c.e} from $${c.base}`).join(" · ");
      }
    }
  }
  return "";
}

function groundingFor({ city, state, text }) {
  const market = getMarket(city) || null;
  const installerName = market ? keyToInstaller(market.inst).name : "";
  const stateCities = !market && state
    ? MARKETS.filter((m) => m.state === String(state).toUpperCase()).map((m) => m.city).join(", ") : "";
  return { market, installerName, stateCities, pricing: pricingFor(text), nextEvent: "" };
}

function buildDraftPrompt({ message, classification, grounding, threadContext }) {
  const g = grounding || {};
  return [
    "Draft a reply email for Aaron at Tuned Yota (Toyota/Lexus performance tuning).",
    "Follow the NEPQ playbook below EXACTLY. Non-negotiables:",
    "- End with exactly ONE question or one micro-commitment. Never zero, never several.",
    "- NEVER give a bare price/number to a cold price ask — deflect-with-purpose per the playbook.",
    "- If the customer shows explicit booking intent, go straight to calm, low-friction scheduling.",
    "- Mirror the customer's exact words. Neutral language. 3-6 sentences.",
    "- Sign off: — Aaron @ Tuned Yota · (612) 406-7117",
    "Output ONLY the email body text (no subject, no commentary).",
    "", "== NEPQ PLAYBOOK ==", PLAYBOOK.slice(0, 14000),
    "", "== VOICE ==", VOICE.slice(0, 4000),
    "", "== FACTS YOU MAY USE ==",
    g.market ? `Their market: ${g.market.city} — installer ${g.installerName}.` : "Their location is unknown — the reply must ask where they're located.",
    g.stateCities ? `Cities we serve in their state: ${g.stateCities}.` : "",
    g.pricing ? `Pricing (use ONLY per the playbook's proposal rules): ${g.pricing}` : "",
    "Booking: https://tunedyota.com/find-your-exact-tune · Phone/text: (612) 406-7117",
    "", `== CLASSIFICATION == bucket=${classification.bucket} stage=${classification.stage} summary=${classification.summary}`,
    threadContext ? `== EARLIER IN THIS THREAD ==\n${String(threadContext).slice(0, 3000)}` : "",
    "", "== CUSTOMER EMAIL ==", `From: ${message.headers.from}`, `Subject: ${message.headers.subject}`,
    "", String(message.textBody || "").slice(0, 5000),
  ].filter((x) => x !== "").join("\n");
}

function checkDraftShape(text) {
  const t = String(text || "").trim();
  const problems = [];
  const questions = (t.match(/\?/g) || []).length;
  if (questions < 1) problems.push("no question");
  if (questions > 3) problems.push("too many questions");
  for (const re of BANNED) if (re.test(t)) problems.push(`banned phrase: ${re}`);
  if (t.length < 40) problems.push("too short");
  return { ok: problems.length === 0, problems };
}

module.exports = { groundingFor, buildDraftPrompt, checkDraftShape, pricingFor };
```

Check `lib/markets.js` exports `MARKETS` (it does — `installer-roster` uses it); adjust the import if the shape differs.

- [ ] **Step 4: Run** `node --test tests/email-draft.test.js` — ALL PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(inbox): NEPQ-governed draft grounding + shape checks"`

---

### Task 9: `inbox-sweep.js` — the orchestrator (replaces gmail-lead-poll)

**Files:**
- Create: `netlify/functions/inbox-sweep.js`
- Delete: `netlify/functions/gmail-lead-poll.js`
- Rename test: `tests/gmail-lead-poll.test.js` → `tests/inbox-sweep.test.js` (its runPoll tests become sweep OTT-path tests)
- Modify: `netlify.toml` (swap schedule), `tests/scheduled-guardrails.test.js` (list update)

- [ ] **Step 1: Failing tests** (`tests/inbox-sweep.test.js`) — keep the two migrated OTT tests (adapted to `runSweep`), plus:

```javascript
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runSweep } = require("../netlify/functions/inbox-sweep.js");

function harness(msgs, classifications) {
  const labeled = [], posted = [], drafts = [], notifies = [];
  let ci = 0;
  return { labeled, posted, drafts, notifies, deps: {
    env: { GMAIL_REFRESH_TOKEN: "r", ANTHROPIC_API_KEY: "k", INTERNAL_TASK_SECRET: "s", URL: "https://tunedyota.com", SLACK_WEBHOOK_URL: "https://x" },
    gmail: { listMessages: async () => msgs.map((m) => ({ id: m.id, threadId: m.threadId })),
      getMessage: async (id) => msgs.find((m) => m.id === id),
      addLabel: async (id, name) => { labeled.push([id, name]); },
      createDraft: async (a) => { drafts.push(a); return { id: "d" + drafts.length }; } },
    classify: async () => classifications[ci++],
    draft: async () => "Happy to help — what year is it?\n— Aaron @ Tuned Yota · (612) 406-7117",
    postImpl: async (url, opts) => { posted.push(JSON.parse(opts.body)); return { ok: true, json: async () => ({ status: "lead" }) }; },
    notify: async (a) => { notifies.push(a); return { ok: true }; },
    log: { error() {} },
  } };
}
const MSG = (id, over = {}) => ({ id, threadId: "t" + id, headers: { from: "jo@x.com", subject: "s", messageId: "<" + id + "@x>", replyTo: "" }, textBody: "Name: Q\nPhone: 555\nCity: Fargo\nVehicle Year: 2019\nVehicle Make: Toyota\nVehicle Model: Tundra", ...over });

test("ott-lead routes to lead-ingest and labels ty-ingested", async () => {
  const h = harness([MSG("m1")], [{ bucket: "ott-lead", stage: "situation", confidence: 0.95, summary: "" }]);
  const out = await runSweep(h.deps);
  assert.equal(out.ingested, 1);
  assert.equal(h.posted[0].channel, "ott-national");
  assert.deepEqual(h.labeled[0], ["m1", "ty-ingested"]);
});
test("inquiry gets a draft (never a send) and labels ty-drafted", async () => {
  const h = harness([MSG("m2", { textBody: "how much for a tune?" })], [{ bucket: "inquiry", stage: "connect", confidence: 0.9, summary: "price ask" }]);
  const out = await runSweep(h.deps);
  assert.equal(out.drafted, 1);
  assert.equal(h.drafts[0].threadId, "tm2");
  assert.deepEqual(h.labeled[0], ["m2", "ty-drafted"]);
});
test("sensitive drafts AND flags Slack, labels both", async () => {
  const h = harness([MSG("m3", { textBody: "this is unacceptable, I want a refund" })], [{ bucket: "sensitive", stage: "connect", confidence: 0.9, summary: "refund demand" }]);
  await runSweep(h.deps);
  assert.equal(h.notifies.length, 1);
  assert.ok(h.labeled.some((l) => l[1] === "ty-flagged"));
});
test("automated and spam are skipped with a label, no draft, no ingest", async () => {
  const h = harness([MSG("m4")], [{ bucket: "automated", stage: "connect", confidence: 0.9, summary: "" }]);
  const out = await runSweep(h.deps);
  assert.equal(out.drafted + out.ingested, 0);
  assert.deepEqual(h.labeled[0], ["m4", "ty-skipped"]);
});
test("a draft failing the shape check is retried once, then flagged not sent", async () => {
  const h = harness([MSG("m5", { textBody: "question" })], [{ bucket: "inquiry", stage: "connect", confidence: 0.9, summary: "" }]);
  h.deps.draft = async () => "No question here at all, just statements padding length.";
  await runSweep(h.deps);
  assert.equal(h.drafts.length, 0, "bad-shape draft must not be created");
  assert.ok(h.labeled.some((l) => l[1] === "ty-flagged"));
});
test("one throwing message never kills the sweep", async () => {
  const h = harness([MSG("m6"), MSG("m7", { textBody: "how much" })],
    [{ bucket: "ott-lead", stage: "situation", confidence: 0.95, summary: "" }, { bucket: "inquiry", stage: "connect", confidence: 0.9, summary: "" }]);
  h.deps.postImpl = async () => { throw new Error("ingest down"); };
  const out = await runSweep(h.deps);
  assert.equal(out.drafted, 1, "second message still processed");
});
```

- [ ] **Step 2: Run** — FAIL (module missing).
- [ ] **Step 3: Implement `netlify/functions/inbox-sweep.js`:**

```javascript
// netlify/functions/inbox-sweep.js
// Scheduled every 15 min. Reads unprocessed info@ mail, classifies by CONTENT
// (subjects vary — never hardcode them), and routes: OTT leads → lead tracker;
// customer email → NEPQ-governed reply DRAFT (never auto-sent); sensitive →
// draft + Slack flag; automated/spam → label & skip. Gmail labels are the
// idempotent state machine (a crash simply retries next tick). Absorbs the old
// gmail-lead-poll (2026-06/07) — see docs/superpowers/specs/2026-07-16-inbox-intelligence-design.md.
const gmailLib = require("./lib/gmail.js");
const { parseOttLeadEmail } = require("./lib/ott-email.js");
const { classifyEmail, extractLeadFields } = require("./lib/email-classify.js");
const { groundingFor, buildDraftPrompt, checkDraftShape } = require("./lib/email-draft.js");
const { notifyOwner } = require("./lib/alert.js");

const QUERY = "in:inbox -label:ty-ingested -label:ty-drafted -label:ty-skipped -label:ty-flagged -from:me";
const CAP = 20; // per-sweep bound on cost + rate limits

// Default drafting call — injectable. Lives here (not email-draft) so the pure lib
// stays I/O-free. Uses the same raw-fetch pattern as email-classify.
async function defaultDraft(prompt, env) {
  const { parseJson } = require("./lib/email-classify.js"); // reuse askClaude? No — small local call:
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", signal: ctrl.signal,
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 700, messages: [{ role: "user", content: prompt }] }) });
    if (!res.ok) throw new Error(`anthropic ${res.status}`);
    const j = await res.json();
    return ((j.content || []).find((c) => c.type === "text") || {}).text || "";
  } finally { clearTimeout(timer); }
}

async function runSweep(deps = {}) {
  const env = deps.env || process.env;
  if (!env.GMAIL_REFRESH_TOKEN && !deps.gmail) return { scanned: 0, skipped: "no-gmail-config" };
  const gmail = deps.gmail || gmailLib;
  const classify = deps.classify || ((m) => classifyEmail(m, { apiKey: env.ANTHROPIC_API_KEY }));
  const draft = deps.draft || ((prompt) => defaultDraft(prompt, env));
  const extract = deps.extract || ((m) => extractLeadFields(m, { apiKey: env.ANTHROPIC_API_KEY }));
  const post = deps.postImpl || fetch;
  const notify = deps.notify || notifyOwner;
  const log = deps.log || console;
  const ingestUrl = env.LEAD_INGEST_URL || (env.URL ? `${env.URL}/.netlify/functions/lead-ingest` : "https://tunedyota.com/.netlify/functions/lead-ingest");

  let msgs;
  try { msgs = (await gmail.listMessages(QUERY, { env })).slice(0, CAP); }
  catch (e) { return { scanned: 0, error: e.message }; }

  const out = { scanned: msgs.length, ingested: 0, drafted: 0, flagged: 0, skipped: 0 };
  for (const { id } of msgs) {
    try {
      const msg = await gmail.getMessage(id, { env });
      const cls = await classify(msg);

      if (cls.bucket === "ott-lead") {
        let lead = parseOttLeadEmail(msg);
        if (!lead.phone && !lead.email) lead = await extract(msg); // labels drifted → LLM
        if (!lead) {
          await notify({ webhookUrl: env.SLACK_WEBHOOK_URL, text: `⚠️ OTT-looking email couldn't be parsed — review manually: "${msg.headers.subject}" from ${msg.headers.from}`, log });
          await gmail.addLabel(id, "ty-flagged", { env }); out.flagged++; continue;
        }
        const res = await post(ingestUrl, { method: "POST",
          headers: { "Content-Type": "application/json", "x-ty-task": env.INTERNAL_TASK_SECRET || "" }, body: JSON.stringify(lead) });
        if (res.ok) { await gmail.addLabel(id, "ty-ingested", { env }); out.ingested++; }
        else { await gmail.addLabel(id, "ty-flagged", { env }); out.flagged++; }
        continue;
      }

      if (cls.bucket === "inquiry" || cls.bucket === "thread-reply" || cls.bucket === "sensitive") {
        const body = String(msg.textBody || "");
        const grounding = groundingFor({ city: "", state: "", text: body }); // city unknown until stated; pricingFor scans text
        const prompt = buildDraftPrompt({ message: msg, classification: cls, grounding, threadContext: "" });
        let text = await draft(prompt);
        let shape = checkDraftShape(text);
        if (!shape.ok) { text = await draft(prompt + `\n\nYour previous attempt failed checks: ${shape.problems.join(", ")}. Rewrite it.`); shape = checkDraftShape(text); }
        if (shape.ok) {
          const to = (msg.headers.replyTo || msg.headers.from).match(/[\w.+-]+@[\w-]+\.[\w.-]+/)[0];
          await gmail.createDraft({ threadId: msg.threadId, to, inReplyTo: msg.headers.messageId,
            references: msg.headers.messageId, subject: /^re:/i.test(msg.headers.subject) ? msg.headers.subject : `Re: ${msg.headers.subject}`, body: text }, { env });
          await gmail.addLabel(id, "ty-drafted", { env }); out.drafted++;
        } else {
          await gmail.addLabel(id, "ty-flagged", { env }); out.flagged++;
        }
        if (cls.bucket === "sensitive") {
          await notify({ webhookUrl: env.SLACK_WEBHOOK_URL, text: `🚩 Sensitive email needs Aaron: ${cls.summary || msg.headers.subject} (from ${msg.headers.from})${shape.ok ? " — cautious draft waiting in Gmail" : ""}`, log });
          await gmail.addLabel(id, "ty-flagged", { env }); out.flagged++;
        }
        continue;
      }

      await gmail.addLabel(id, "ty-skipped", { env }); out.skipped++; // automated | spam
    } catch (e) { if (log.error) log.error("inbox-sweep", id, e.message); /* retried next tick — no label */ }
  }
  return out;
}

async function handler() { const r = await runSweep({}); return { statusCode: 200, body: JSON.stringify(r) }; }
module.exports = { handler, runSweep };
```

- [ ] **Step 4:** Delete `netlify/functions/gmail-lead-poll.js` (`git rm`). Migrate its two tests into `tests/inbox-sweep.test.js` adapted to `runSweep` (the OTT-parse fixtures already live in the harness above); `git rm tests/gmail-lead-poll.test.js`.
- [ ] **Step 5:** `netlify.toml`: replace the `[functions."gmail-lead-poll"]` block with:

```toml
# Inbox sweep: classify info@ mail, ingest OTT leads, create NEPQ reply drafts.
[functions."inbox-sweep"]
  schedule = "*/15 * * * *"
```

Update `tests/scheduled-guardrails.test.js` `UNGATED_SIDE_EFFECTING`: remove `"gmail-lead-poll"`, add `"inbox-sweep"`.

- [ ] **Step 6: Run** `node --test tests/inbox-sweep.test.js tests/scheduled-guardrails.test.js` — ALL PASS. Then full suite `npm test` — ALL PASS.
- [ ] **Step 7: Commit** — `git commit -m "feat(inbox): classify-and-route sweep replaces gmail-lead-poll (drafts, never sends)"`

---

### Task 10: `inbox-digest.js` — 8a/12p/7p review batches

**Files:**
- Create: `netlify/functions/inbox-digest.js`
- Modify: `netlify.toml`, `tests/scheduled-guardrails.test.js`
- Test: Create `tests/inbox-digest.test.js`

- [ ] **Step 1: Failing tests:**

```javascript
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runDigest } = require("../netlify/functions/inbox-digest.js");

function harness(drafts, threadMsgs) {
  const sent = [], notifies = [];
  return { sent, notifies, deps: {
    env: { GMAIL_REFRESH_TOKEN: "r", RESEND_API_KEY: "k", SLACK_WEBHOOK_URL: "https://x" },
    gmail: { listDrafts: async () => drafts,
      getMessage: async (id) => threadMsgs[id] },
    send: async (m) => { sent.push(m); return { id: "e" }; },
    notify: async (a) => { notifies.push(a); return { ok: true }; },
    log: { error() {} } } };
}

test("digest emails Aaron a summary of waiting drafts + slacks a one-liner", async () => {
  const h = harness([{ id: "d1", messageId: "dm1", threadId: "t1" }],
    { dm1: { headers: { to: "jo@x.com", subject: "Re: tune?" }, textBody: "draft body" } });
  const out = await runDigest(h.deps);
  assert.equal(out.count, 1);
  assert.equal(h.sent[0].to, "info@tunedyota.com");
  assert.match(h.sent[0].subject, /1 reply draft/);
  assert.match(h.sent[0].text, /jo@x.com/);
  assert.equal(h.notifies.length, 1);
});
test("zero drafts -> no email, quiet slack skip", async () => {
  const h = harness([], {});
  const out = await runDigest(h.deps);
  assert.equal(out.count, 0);
  assert.equal(h.sent.length, 0);
  assert.equal(h.notifies.length, 0);
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement:**

```javascript
// netlify/functions/inbox-digest.js
// 8am / noon / 7pm CT: tell Aaron how many reply drafts are waiting in Gmail and
// who they're for, so inbox review happens in 3 predictable batches. Reads Gmail
// drafts (created by inbox-sweep); zero drafts = zero noise.
const gmailLib = require("./lib/gmail.js");
const { sendEmail } = require("./lib/resend.js");
const { notifyOwner } = require("./lib/alert.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";

async function runDigest(deps = {}) {
  const env = deps.env || process.env;
  if (!env.GMAIL_REFRESH_TOKEN && !deps.gmail) return { count: 0, skipped: "no-gmail-config" };
  const gmail = deps.gmail || gmailLib;
  const send = deps.send || sendEmail;
  const notify = deps.notify || notifyOwner;
  const log = deps.log || console;

  let drafts;
  try { drafts = await gmail.listDrafts({ env }); } catch (e) { return { count: 0, error: e.message }; }
  if (!drafts.length) return { count: 0 };

  const rows = [];
  for (const d of drafts) {
    try { const m = await gmail.getMessage(d.messageId, { env });
      rows.push(`• ${m.headers.to || "?"} — "${m.headers.subject || "(no subject)"}"`); }
    catch (e) { rows.push(`• draft ${d.id} (couldn't load detail)`); }
  }
  const n = rows.length;
  const text = `${n} reply draft${n === 1 ? "" : "s"} waiting for your review in Gmail:\n\n${rows.join("\n")}\n\nOpen Gmail → Drafts, review, and hit send on each. Nothing sends without you.`;
  try { await send({ fetchImpl: deps.fetchImpl || fetch, apiKey: env.RESEND_API_KEY, from: FROM, to: OWNER, replyTo: OWNER,
    subject: `Inbox review — ${n} reply draft${n === 1 ? "" : "s"} waiting`, text }); }
  catch (e) { if (log.error) log.error("inbox-digest send", e.message); }
  try { await notify({ fetchImpl: deps.fetchImpl || fetch, webhookUrl: env.SLACK_WEBHOOK_URL, text: `📥 ${n} reply draft${n === 1 ? "" : "s"} waiting in Gmail for review`, log }); }
  catch (e) { if (log.error) log.error("inbox-digest slack", e.message); }
  return { count: n };
}

async function handler() { const r = await runDigest({}); return { statusCode: 200, body: JSON.stringify(r) }; }
module.exports = { handler, runDigest };
```

`netlify.toml` addition (UTC crons for 8am/12pm/7pm **CDT**; note in the comment that CST winter shifts these an hour — acceptable):

```toml
# Inbox draft review digest — 8am / noon / 7pm Central (CDT): 13:00, 17:00, 00:00 UTC.
[functions."inbox-digest"]
  schedule = "0 0,13,17 * * *"
```

Add `"inbox-digest"` to the guardrail list.

- [ ] **Step 4: Run** `node --test tests/inbox-digest.test.js tests/scheduled-guardrails.test.js` — ALL PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(inbox): 3x-daily draft review digest"`

---

### Task 11: OTT report conversion section

**Files:**
- Modify: `netlify/functions/lib/ott-report.js` (new pure `leadConversion`; `renderOwnerDraftHtml(subRows, month, approveUrl, conversion)` and `renderOttEmailHtml(subRows, month, conversion)` gain an optional 4th/3rd arg appending a small table)
- Modify: `netlify/functions/ott-report.js` (fetch Priority List, compute, pass through) and `netlify/functions/ott-report-send.js` (same conversion line in the OTT email text)
- Test: `tests/ott-report.test.js` (append — check exact filename with `ls tests | grep ott`)

- [ ] **Step 1: Failing tests:**

```javascript
test("leadConversion counts month OTT leads received / booked / completed", () => {
  const { leadConversion } = require("../netlify/functions/lib/ott-report.js");
  const month = { key: "2026-06", label: "June 2026" }; // match priorMonth() shape used by the lib
  const leads = [
    { Channel: "ott-national", "Created Time": "2026-06-03", Stage: "Booked", "Converted Booking": "b1" },
    { Channel: "ott-national", "Created Time": "2026-06-10", Stage: "Contacted" },
    { Channel: "email", "Created Time": "2026-06-11", Stage: "Booked" },          // not OTT
    { Channel: "ott-national", "Created Time": "2026-05-30", Stage: "Booked" },   // prior month
  ];
  const bookings = [{ id: "b1", Status: "Completed" }];
  const c = leadConversion(leads, bookings, month);
  assert.deepEqual(c, { received: 2, booked: 1, completed: 1 });
});

test("owner draft html includes the OTT conversion section when provided", () => {
  const { renderOwnerDraftHtml } = require("../netlify/functions/lib/ott-report.js");
  const html = renderOwnerDraftHtml([], { key: "2026-06", label: "June 2026" }, "https://x", { received: 12, booked: 4, completed: 3 });
  assert.match(html, /OTT leads/i);
  assert.match(html, /12/);
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** in `lib/ott-report.js`:

```javascript
// OTT lead → booking → completed conversion for the month (leads = flattened
// Priority rows, bookings = flattened Bookings rows). "Received" is by lead
// Created Time within the month; "completed" via the Converted Booking's Status.
function leadConversion(leads, bookings, month) {
  const inMonth = (d) => String(d || "").slice(0, 7) === month.key;
  const ott = (leads || []).filter((l) => (l.Channel === "ott-national" || /ott/i.test(l.Source || "")) && inMonth(l["Created Time"]));
  const byId = new Map((bookings || []).map((b) => [b.id, b]));
  const booked = ott.filter((l) => l.Stage === "Booked" || l["Converted Booking"]);
  const completed = booked.filter((l) => { const b = byId.get(l["Converted Booking"]); return b && b.Status === "Completed"; });
  return { received: ott.length, booked: booked.length, completed: completed.length };
}

function conversionHtml(c) {
  if (!c) return "";
  return `<h3>OTT leads — ${c.received} received · ${c.booked} booked · ${c.completed} completed</h3>`;
}
```

Append `conversionHtml(conversion)` inside both renderers (extra trailing param, default `undefined` → renders nothing, so existing calls/tests are untouched). Export `leadConversion`.

In `ott-report.js` `runOttReport`, alongside the bookings fetch:

```javascript
  const pRecs = await listAll({ token: c.token, baseId: c.baseId, table: c.priority });
  const conversion = leadConversion(flattenRecords(pRecs), flattenRecords(bRecs).map((b) => ({ ...b })), month);
```

(Note: `flattenRecords` must keep `id` on rows for the `Converted Booking` join — verify in `lib/report-sources.js`; if it drops `id`, map `bRecs` directly: `bRecs.map(r => ({ id: r.id, Status: (r.fields||{}).Status }))`.) Pass `conversion` into `renderOwnerDraftHtml(...)`, add a line to the Slack summary (`· OTT: ${conversion.received}→${conversion.booked}→${conversion.completed}`), and thread the same into `ott-report-send.js`'s email text. Also: the zero-calibrations early-return should STILL include conversion in its Slack line when `conversion.received > 0`.

- [ ] **Step 4: Run** the ott-report test files — ALL PASS. **Step 5: Commit** — `git commit -m "feat(ott): lead conversion section on the monthly report"`

---

### Task 12: Full suite, deploy, live verification

**Files:** none new — verification + docs.

- [ ] **Step 1:** `npm test` — ALL PASS (expect ~740+; zero fail).
- [ ] **Step 2:** Merge to master, push (Netlify auto-deploys), `npx netlify watch`.
- [ ] **Step 3: Live checks (in order):**
  1. `inbox-sweep` first run: `npx netlify functions:invoke` is NOT available for scheduled fns in prod — instead check Netlify function logs after the next quarter-hour tick, or temporarily trigger via the Netlify UI "Run now".
  2. **Gmail scope check:** confirm a draft appears in Gmail's Drafts folder for a test inquiry (send one from a personal address: "how much for a tune for my 2019 Tundra?"). If drafts.create returns 403, the refresh token lacks compose scope → owner re-consents (documented in `docs/n8n/SETUP.md`-style runbook note; add to `docs/operations/`).
  3. Verify the draft: NEPQ shape (no bare price, ends with one question, Aaron sign-off).
  4. Send a fixture OTT lead email from a test account (paste the Quinn sample) → confirm lead appears in console with OTT badge + Qualified stage + GHL link populated in Airtable.
  5. At the next digest tick, confirm the review email + Slack line arrive.
- [ ] **Step 4:** Update `.claude/memory/` program note + mem0 backlog (email feeder DONE; FB/IG + Twilio + backfill remain).
- [ ] **Step 5: Commit** docs/memory updates.

---

## Self-review notes

- **Spec coverage:** Qualified gate (T1) · parser vocabulary + GHL (T2) · Source carry (T3) · console badges (T4) · voice guide (T5) · drafts infra (T6) · classifier + extraction fallback (T7) · NEPQ drafting + shape checks (T8) · sweep + labels + cap + fail-toward-human + poll replacement (T9) · digest crons (T10) · OTT report conversion (T11) · rollout + scope prerequisite (T12). Subject-line-referencing-their-situation applies only to NEW threads — sweep replies use `Re: <their subject>` (drafts are replies; new-thread outreach is out of scope).
- **Known judgment calls for the executor:** thread-context fetch for `thread-reply` is a fast-follow (first cut drafts from the single message; the field exists in `buildDraftPrompt`); `groundingFor` city comes from the email text via the model's own reading — the code path passes `city: ""` and relies on `pricingFor` text-scan + the prompt's ask-for-location rule. If a task's surrounding code differs from the line numbers here, trust the file, keep the intent.
