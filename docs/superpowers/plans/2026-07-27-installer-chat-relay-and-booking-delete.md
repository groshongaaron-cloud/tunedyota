# Installer Chat Relay + AI Pause + Booking Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dispatcher-first two-way SMS chat relay to installers' personal phones, a 72-hour AI auto-reply pause with a per-thread manual toggle, installer booking soft-delete with Undo and 30-day auto-purge, and a visible reschedule-editor affordance.

**Architecture:** All chat channels (Twilio SMS, web widget, Meta DMs) already converge on `processChat()` in `netlify/functions/chat.js`, so one relay hook there covers every channel. New `Last Relayed At` / `AI Mode` fields on the Airtable "Chat Sessions" table drive reply routing and the AI toggle; new `Cancelled At` / `Cancelled By` fields on "Bookings" drive soft-delete + purge. Everything follows the repo's deps-injection pattern (every function takes an injectable deps object so tests never touch the network).

**Tech Stack:** Netlify functions (CommonJS), Airtable REST via `lib/airtable.js`, Twilio via `lib/twilio.js`, `node --test` + `node:assert/strict` for tests, vanilla inline JS in `site/installer.html`.

**Spec:** `docs/superpowers/specs/2026-07-27-installer-chat-relay-and-booking-delete-design.md`

**Repo conventions that bind every task:**
- Tests run with `npm test` (runs `node --test`, which picks up `tests/*.test.js`). Run a single file with `node --test tests/<file>.test.js`.
- Every lib function accepts a `deps = {}` object with injectable `env`, `fetchImpl`, `now`, and collaborator functions — copy the style of `relayInstallerReply` in `netlify/functions/twilio-sms.js:33`.
- Awaited side-effects only: Lambda freezes the container on handler return, so a fire-and-forget send silently never executes (commit 252428c). Every SMS/Graph send must be `await`ed.
- Airtable writes to possibly-missing columns use `updateTolerant`/`createTolerant` OR the column is guaranteed by Task 1 before deploy.
- Commit after every task; **push after commit** (standing repo rule, tests green first).

---

### Task 1: Create the four new Airtable columns (run FIRST — code in later tasks writes these fields non-tolerantly)

`chat-store.js`'s `saveSession()` writes its whole field set with a plain `updateRecord` — a missing column would 422 **every chat save**. Create columns before any code deploys.

**Files:** none (Airtable metadata via existing script `scripts/airtable/ensure-field.mjs`)

- [ ] **Step 1: Create the columns (idempotent — safe to re-run)**

Run from the repo root (Git Bash):

```bash
export AIRTABLE_TOKEN=$(npx netlify env:get AIRTABLE_TOKEN)
export AIRTABLE_BASE_ID=$(npx netlify env:get AIRTABLE_BASE_ID)
node scripts/airtable/ensure-field.mjs "Chat Sessions" "Last Relayed At" singleLineText "ISO ts of the last client msg forwarded to an installer phone (reply routing)"
node scripts/airtable/ensure-field.mjs "Chat Sessions" "AI Mode" singleLineText "auto|on|off — manual AI toggle; auto = 72h pause after installer reply"
node scripts/airtable/ensure-field.mjs "Bookings" "Cancelled At" singleLineText "ISO ts when soft-cancelled; purge deletes 30d after this"
node scripts/airtable/ensure-field.mjs "Bookings" "Cancelled By" singleLineText "installer key who cancelled"
```

Expected: four lines each saying `created: ...` (or `ok: ... already exists` on re-run).

- [ ] **Step 2: Set the dispatcher env var and verify Aaron's cell is in the SMS overrides**

```bash
npx netlify env:set CHAT_DISPATCHER aaron
npx netlify env:get INSTALLER_SMS_NUMBERS
```

Expected: the second command prints a JSON map containing `"aaron":"+16126557611"`. If aaron's entry is missing or different, STOP and confirm with the owner before setting it — this is where every escalation will land.

---

### Task 2: `chat-store.js` — round-trip the new fields, add `aiPaused()`, extend escalated staleness to 72 h

**Files:**
- Modify: `netlify/functions/lib/chat-store.js`
- Test: `tests/chat-ai-pause.test.js` (create), `tests/chat-store.test.js` (existing — may need staleness expectations updated)

- [ ] **Step 1: Write the failing tests**

Create `tests/chat-ai-pause.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { aiPaused, AI_PAUSE_MS, isStale, STALE_ESCALATED_MS } = require("../netlify/functions/lib/chat-store.js");

const HOUR = 60 * 60 * 1000;

test("aiPaused auto: paused within 72h of last installer turn, live after", () => {
  const now = Date.now();
  const sess = (at) => ({ aiMode: "auto", turns: [{ role: "user", text: "hi", at: now - 100 * HOUR }, { role: "installer", text: "yo", at }] });
  assert.equal(aiPaused(sess(now - 1 * HOUR), now), true);
  assert.equal(aiPaused(sess(now - 71 * HOUR), now), true);
  assert.equal(aiPaused(sess(now - 73 * HOUR), now), false);
});

test("aiPaused auto: no installer turn -> AI keeps covering", () => {
  const now = Date.now();
  assert.equal(aiPaused({ aiMode: "auto", turns: [{ role: "user", text: "hi", at: now }] }, now), false);
  assert.equal(aiPaused({ turns: [] }, now), false); // missing aiMode = auto
});

test("aiPaused manual overrides beat the clock", () => {
  const now = Date.now();
  assert.equal(aiPaused({ aiMode: "off", turns: [] }, now), true);
  assert.equal(aiPaused({ aiMode: "on", turns: [{ role: "installer", text: "x", at: now - 1000 }] }, now), false);
});

test("escalated staleness window is 72h", () => {
  assert.equal(STALE_ESCALATED_MS, 72 * HOUR);
  assert.equal(AI_PAUSE_MS, 72 * HOUR);
  const sess = { status: "escalated", lastActivity: new Date(Date.now() - 3 * HOUR).toISOString() };
  assert.equal(isStale(sess, Date.now()), false); // 3h idle used to be dead — now alive
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/chat-ai-pause.test.js`
Expected: FAIL — `aiPaused is not a function` / `AI_PAUSE_MS` undefined.

- [ ] **Step 3: Implement in `chat-store.js`**

Change the staleness constant (line 9):

```js
const STALE_ESCALATED_MS = 72 * 60 * 60 * 1000; // escalated sessions live 72 h (matches AI pause)
```

Add below `isStale` (after line 16):

```js
// 72-hour human-takeover pause. "auto" (default): the AI goes quiet for 72 h
// after the installer's LATEST reply, rolling. Manual "on"/"off" (console
// toggle) beat the clock in both directions.
const AI_PAUSE_MS = 72 * 60 * 60 * 1000;
function aiPaused(sess, nowMs) {
  if (sess.aiMode === "off") return true;
  if (sess.aiMode === "on") return false;
  let lastInstallerAt = 0;
  for (const t of sess.turns || []) {
    if (t.role === "installer" && (t.at || 0) > lastInstallerAt) lastInstallerAt = t.at;
  }
  return !!lastInstallerAt && nowMs - lastInstallerAt < AI_PAUSE_MS;
}
```

In `fromRecord` (line 18) add two mappings inside the returned object:

```js
    lastActivity: f["Last Activity"] || "",
    lastRelayedAt: f["Last Relayed At"] || "",
    aiMode: ["on", "off"].includes(f["AI Mode"]) ? f["AI Mode"] : "auto",
```

In `saveSession` (line 47) add to `fields`:

```js
    Transcript: JSON.stringify(sess.turns || []), "Last Activity": new Date(now()).toISOString(),
    "Last Relayed At": sess.lastRelayedAt || "", "AI Mode": sess.aiMode || "auto",
```

In `loadActiveByPrefix`'s explicit `fields:` array (line 74) append `"Last Relayed At", "AI Mode"`.

Export the new names (line 82):

```js
module.exports = { loadSession, loadEscalatedForInstaller, loadActiveByPrefix, saveSession, parseTranscript, isStale, aiPaused, AI_PAUSE_MS, STALE_AI_MS, STALE_ESCALATED_MS, TABLE };
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/chat-ai-pause.test.js tests/chat-store.test.js tests/chat-store-prefix.test.js`
Expected: new file PASSES. If an existing test asserted the 2 h window, update its expectation to 72 h (the new constant is the spec'd behavior).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/chat-store.js tests/chat-ai-pause.test.js tests/chat-store.test.js tests/chat-store-prefix.test.js
git commit -m "feat(chat): AI Mode + Last Relayed At round-trip, aiPaused(), 72h escalated window"
git push
```

---

### Task 3: `routing.js` — `dispatcherKey()`

**Files:**
- Modify: `netlify/functions/lib/routing.js`
- Test: `tests/chat-dispatch.test.js` (create — this file grows in Task 6)

- [ ] **Step 1: Write the failing test**

Create `tests/chat-dispatch.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { dispatcherKey } = require("../netlify/functions/lib/routing.js");

test("dispatcherKey: env override, default aaron, garbage falls back", () => {
  assert.equal(dispatcherKey({ CHAT_DISPATCHER: "cody" }), "cody");
  assert.equal(dispatcherKey({}), "aaron");
  assert.equal(dispatcherKey({ CHAT_DISPATCHER: "nobody" }), "aaron");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/chat-dispatch.test.js`
Expected: FAIL — `dispatcherKey is not a function`.

- [ ] **Step 3: Implement in `routing.js`**

Add above `module.exports`:

```js
// Centralized chat intake (owner decision 2026-07-27): every escalated chat
// relays to this person first; they dispatch via "@key" SMS or the console.
function dispatcherKey(env) {
  const k = normalizeInstallerKey((env || {}).CHAT_DISPATCHER);
  return k || FALLBACK_KEY;
}
```

Add `dispatcherKey` to `module.exports`.

- [ ] **Step 4: Run test — expect PASS.** `node --test tests/chat-dispatch.test.js`

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/routing.js tests/chat-dispatch.test.js
git commit -m "feat(chat): dispatcherKey() — CHAT_DISPATCHER env, default aaron"
git push
```

---

### Task 4: New lib `installer-relay.js` — label builder + client-turn relay

**Files:**
- Create: `netlify/functions/lib/installer-relay.js`
- Test: `tests/installer-relay.test.js` (create)

- [ ] **Step 1: Write the failing tests**

Create `tests/installer-relay.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { relayClientTurn, relayTargetKey, relayLabel } = require("../netlify/functions/lib/installer-relay.js");

const ENV = { CHAT_DISPATCHER: "aaron", INSTALLER_SMS_NUMBERS: '{"aaron":"+16126557611","cody":"+16052141335"}' };

test("relayTargetKey: assigned installer, else dispatcher", () => {
  assert.equal(relayTargetKey({ installer: "cody" }, ENV), "cody");
  assert.equal(relayTargetKey({ installer: "" }, ENV), "aaron");
});

test("relayLabel: head line with NEW/RETURNING tag, warning at 2+, dispatch hint on unassigned first relay", () => {
  const sess = { customerName: "Cody Smith", vehicle: "2021 Toyota Tundra", installer: "" };
  const l1 = relayLabel(sess, { returning: false, activeCount: 1, firstRelay: true, env: ENV });
  assert.match(l1[0], /^TY · Cody Smith · 2021 Toyota Tundra · NEW$/);
  assert.ok(l1.some((x) => /@cody/.test(x) && /@noah/.test(x)), "dispatch hint lists other installers");
  const l2 = relayLabel({ ...sess, installer: "cody" }, { returning: true, activeCount: 3, firstRelay: false, env: ENV });
  assert.match(l2[0], /RETURNING$/);
  assert.ok(l2.some((x) => /3 active chats/.test(x)));
  assert.ok(!l2.some((x) => /dispatch/.test(x)), "no hint once assigned");
  const l3 = relayLabel(sess, { returning: null, activeCount: 1, firstRelay: false, env: ENV });
  assert.ok(!/NEW|RETURNING/.test(l3[0]), "unknown history -> no tag");
});

test("relayClientTurn: SMS to target's number, stamps lastRelayedAt, survives lookup failures", async () => {
  const sent = [];
  const sess = { id: "sms:+15075550123", installer: "", customerName: "Mark", vehicle: "2019 4Runner", phone: "+15075550123", turns: [] };
  await relayClientTurn(sess, "What oil did you use?", {
    env: ENV,
    sms: async (a) => { sent.push(a); return { ok: true }; },
    returningLookup: async () => { throw new Error("airtable down"); },
    activeFor: async () => 1,
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "+16126557611"); // dispatcher's cell — unassigned intake
  assert.match(sent[0].body, /TY · Mark · 2019 4Runner/);
  assert.match(sent[0].body, /What oil did you use\?/);
  assert.ok(sess.lastRelayedAt, "stamped for reply routing");
});

test("relayClientTurn: send failure propagates (caller logs; turn already safe)", async () => {
  const sess = { installer: "cody", customerName: "M", vehicle: "", phone: "", turns: [] };
  await assert.rejects(() => relayClientTurn(sess, "hi", {
    env: ENV, sms: async () => { throw new Error("twilio 500"); },
    returningLookup: async () => null, activeFor: async () => 1,
  }));
  assert.ok(!sess.lastRelayedAt, "no stamp when nothing reached the phone");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/installer-relay.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `netlify/functions/lib/installer-relay.js`**

```js
// netlify/functions/lib/installer-relay.js
// Forwards a client's message in an escalated session to the phone of whoever
// is working it: the assigned installer, else the dispatcher (centralized
// intake — CHAT_DISPATCHER, owner decision 2026-07-27). Labeled single chain:
// every SMS leads with "TY · name · vehicle · NEW/RETURNING" so multiple
// clients stay tellable-apart in one thread. Stamps sess.lastRelayedAt (caller
// saves) — reply routing picks the thread whose message most recently hit the
// phone. Deps-injected like every lib here.
const { cfg, escapeFormula, listRecords } = require("./airtable.js");
const { sendSms } = require("./twilio.js");
const { smsNumberFor, dispatcherKey, INSTALLERS } = require("./routing.js");
const { isStale, TABLE } = require("./chat-store.js");

const MAX_RELAY_CHARS = 320;

function relayTargetKey(sess, env) { return sess.installer || dispatcherKey(env); }

// Prior COMPLETED booking with this phone -> returning client. null = unknown
// (no phone, or lookup failed) -> the tag is simply omitted; never blocks relay.
async function isReturningClient(sess, { env = process.env, fetchImpl = fetch } = {}) {
  const digits = String(sess.phone || "").replace(/\D/g, "").slice(-10);
  if (digits.length !== 10) return null;
  const c = cfg(env);
  const recs = await listRecords({ fetchImpl, token: c.token, baseId: c.baseId, table: c.bookings,
    filterByFormula: `AND({Status}="Completed", FIND("${digits}", {Phone}&"")>0)`, fields: ["Name"] });
  return recs.length > 0;
}

// How many live escalated threads currently relay to this person. For the
// dispatcher that includes every unassigned thread.
async function countActiveFor(key, { env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  const c = cfg(env);
  const k = escapeFormula(key);
  const filter = key === dispatcherKey(env)
    ? `AND({Status}="escalated", OR({Installer}="${k}", {Installer}=""))`
    : `AND({Status}="escalated", {Installer}="${k}")`;
  const recs = await listRecords({ fetchImpl, token: c.token, baseId: c.baseId, table: TABLE(env),
    filterByFormula: filter, fields: ["Session ID", "Last Activity"] });
  return recs.filter((r) => !isStale({ status: "escalated", lastActivity: (r.fields || {})["Last Activity"] || "" }, now())).length;
}

// Returns the label lines (head first). Kept pure for testability.
function relayLabel(sess, { returning = null, activeCount = 1, firstRelay = false, env = process.env } = {}) {
  const tag = returning === true ? "RETURNING" : returning === false ? "NEW" : "";
  const head = ["TY", sess.customerName || "Customer", sess.vehicle || "", tag].filter(Boolean).join(" · ");
  const lines = [head];
  if (activeCount > 1) lines.push(`⚠ ${activeCount} active chats — reply goes to ${sess.customerName || "this customer"}; switch in console.`);
  if (firstRelay && !sess.installer) {
    const others = Object.keys(INSTALLERS).filter((k) => k !== dispatcherKey(env));
    lines.push(`Reply to answer, or ${others.map((k) => "@" + k).join(" / ")} to dispatch.`);
  }
  return lines;
}

async function relayClientTurn(sess, message, deps = {}) {
  const { env = process.env, log = console, now = Date.now,
    sms = (a) => sendSms(a, { env, log }),
    returningLookup = (s) => isReturningClient(s, { env }),
    activeFor = (k) => countActiveFor(k, { env }) } = deps;
  const target = relayTargetKey(sess, env);
  const firstRelay = !sess.lastRelayedAt;
  let returning = null;
  try { returning = await returningLookup(sess); } catch (e) { /* tag omitted */ }
  let activeCount = 1;
  try { activeCount = await activeFor(target); } catch (e) { /* warning omitted */ }
  const lines = relayLabel(sess, { returning, activeCount, firstRelay, env });
  const text = String(message || "").slice(0, MAX_RELAY_CHARS);
  const body = lines[0] + "\n“" + text + "”" + (lines.length > 1 ? "\n" + lines.slice(1).join("\n") : "");
  await sms({ to: smsNumberFor(target, env), body });
  sess.lastRelayedAt = new Date(now()).toISOString();
  return { target };
}

module.exports = { relayClientTurn, relayTargetKey, relayLabel, isReturningClient, countActiveFor, MAX_RELAY_CHARS };
```

- [ ] **Step 4: Run tests — expect PASS.** `node --test tests/installer-relay.test.js`

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/installer-relay.js tests/installer-relay.test.js
git commit -m "feat(chat): installer-relay lib — labeled client-turn SMS to assignee/dispatcher"
git push
```

---

### Task 5: `chat.js` — dispatcher-first escalation, relay hook, AI-pause gate

**Files:**
- Modify: `netlify/functions/chat.js`
- Test: `tests/chat-relay-hook.test.js` (create); existing `tests/chat-handler.test.js` will need routing expectations updated

- [ ] **Step 1: Write the failing tests**

Create `tests/chat-relay-hook.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processChat, escalate } = require("../netlify/functions/chat.js");

const ENV = { CHAT_DISPATCHER: "aaron", INSTALLER_SMS_NUMBERS: '{"aaron":"+16126557611"}' };
const NOW = Date.now();
const baseSess = (over) => ({ id: "sms:+15075550123", recordId: "r1", status: "escalated", installer: "cody",
  customerName: "Mark", vehicle: "2019 4Runner", phone: "+15075550123", pageContext: "sms", aiMode: "auto",
  turns: [{ role: "user", text: "hi", at: NOW - 1000 }], lastActivity: new Date(NOW).toISOString(), ...over });

test("client turn on an escalated session is relayed (awaited) before returning", async () => {
  let relayed = false, saved = null;
  await processChat({ session: "sms:+15075550123", message: "Saturday work?" }, {
    env: ENV, load: async () => baseSess(),
    relay: async (s, m) => { await new Promise((r) => setTimeout(r, 20)); relayed = { text: m }; },
    save: async (s) => { saved = s; },
    ai: async () => ({ reply: "AI answer" }),
  });
  assert.equal(relayed.text, "Saturday work?"); // frozen mid-air if not awaited
  assert.ok(saved);
});

test("relay failure never blocks the turn", async () => {
  let saved = null;
  const out = await processChat({ session: "sms:+15075550123", message: "hello?" }, {
    env: ENV, load: async () => baseSess(),
    relay: async () => { throw new Error("twilio down"); },
    save: async (s) => { saved = s; },
    ai: async () => ({ reply: "AI answer" }),
  });
  assert.equal(out.status, 200);
  assert.equal(saved.turns[saved.turns.length - 2].text, "hello?"); // user turn stored (AI turn after)
});

test("AI pause: installer replied 1h ago -> no AI reply, turn saved + relayed", async () => {
  let aiRan = false, relayed = false;
  const sess = baseSess({ turns: [{ role: "user", text: "hi", at: NOW - 7200000 }, { role: "installer", text: "on it", at: NOW - 3600000 }] });
  const out = await processChat({ session: sess.id, message: "thanks!" }, {
    env: ENV, load: async () => sess, relay: async () => { relayed = true; }, save: async () => {},
    ai: async () => { aiRan = true; return { reply: "should not happen" }; },
  });
  assert.equal(aiRan, false);
  assert.equal(relayed, true);
  assert.equal(out.body.reply, "");
  assert.equal(out.body.escalated, true);
});

test("AI toggle off silences AI; on overrides the pause", async () => {
  let aiRan = false;
  await processChat({ session: "s", message: "q" }, {
    env: ENV, load: async () => baseSess({ aiMode: "off", turns: [] }), relay: async () => {}, save: async () => {},
    ai: async () => { aiRan = true; return { reply: "x" }; },
  });
  assert.equal(aiRan, false);
  await processChat({ session: "s", message: "q" }, {
    env: ENV, load: async () => baseSess({ aiMode: "on", turns: [{ role: "installer", text: "x", at: NOW - 1000 }] }),
    relay: async () => {}, save: async () => {},
    ai: async () => { aiRan = true; return { reply: "x" }; },
  });
  assert.equal(aiRan, true);
});

test("escalate routes SMS to the dispatcher and appends the dispatch hint", async () => {
  const sms = [];
  const transfer = { customerName: "Cody Smith", contactMethod: "phone", contactValue: "+15074449999",
    modelYear: "2021", vehicleMake: "Toyota", vehicleModel: "Tundra", city: "Omaha", state: "NE",
    questionSummary: "supercharger fitment", reason: "asked-for-human" };
  const { installer } = await escalate({ transfer, sess: { id: "s", turns: [], pageContext: "sms" } }, {
    env: ENV, ingest: async () => {}, push: async () => {}, logEscalation: async () => {},
    sms: async (a) => { sms.push(a); },
  });
  assert.equal(installer.key, "aaron"); // dispatcher, NOT Omaha's market installer (cody)
  assert.equal(sms[0].to, "+16126557611");
  assert.match(sms[0].body, /@cody|@noah/);
});

test("new escalation leaves the session unassigned and stamps lastRelayedAt", async () => {
  let saved = null;
  await processChat({ session: "web-1", message: "help", page: "default" }, {
    env: ENV, load: async () => null, relay: async () => {}, save: async (s) => { saved = s; },
    ai: async () => ({ reply: "connecting you", transfer: { customerName: "C", contactMethod: "phone", contactValue: "+15074449999",
      modelYear: "2021", vehicleMake: "Toyota", vehicleModel: "Tundra", city: "Omaha", state: "NE",
      questionSummary: "q", reason: "asked-for-human" } }),
    doEscalate: async () => ({ installer: { key: "aaron", name: "Aaron Groshong", phone: "(612) 406-7117" } }),
  });
  assert.equal(saved.installer, ""); // dispatcher-first: dispatch assigns, not escalation
  assert.ok(saved.lastRelayedAt, "escalation SMS counts as the first relay");
  assert.equal(saved.status, "escalated");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/chat-relay-hook.test.js`
Expected: FAIL (no `relay` dep, escalate routes by market, installer gets assigned).

- [ ] **Step 3: Implement in `chat.js`**

3a. Imports — three line edits at the top of `chat.js`:

- Line 6 becomes: `const { loadSession, saveSession, isStale, aiPaused } = require("./lib/chat-store.js");`
- Delete line 8 (`getMarket` — no longer used once escalation stops market-routing).
- Line 9 becomes: `const { keyToInstaller, dispatcherKey, INSTALLERS, smsNumberFor } = require("./lib/routing.js");` (`smsNumberFor` stays — `escalate()`'s SMS uses it; `FALLBACK_KEY` goes — `dispatcherKey` owns the fallback now.)
- Add: `const { relayClientTurn } = require("./lib/installer-relay.js");`

3b. `escalate()` (line 27): route to the dispatcher and add the hint. Replace

```js
  const market = getMarket(transfer.city);
  const inst = keyToInstaller(market ? market.inst : FALLBACK_KEY);
```

with

```js
  // Centralized intake: every escalation lands on the dispatcher's phone; they
  // answer or dispatch (@key SMS / console Assign). Market routing no longer
  // picks the chat owner — the dispatcher does.
  const inst = keyToInstaller(dispatcherKey(env));
  const others = Object.keys(INSTALLERS).filter((k) => k !== inst.key).map((k) => "@" + k).join(" / ");
```

and extend the SMS body (line 50):

```js
      body: `Tuned Yota chat: ${transfer.customerName} (${contact}) — ${vehicle}, ${transfer.city} ${transfer.state}. Q: ${transfer.questionSummary}. Reply to this text and it appears in their chat window, or send ${others} to dispatch.` });
```

3c. `processChat()` deps (line 63): add the relay dep:

```js
    doEscalate = (a) => escalate(a, { env, log }),
    relay = (s, m) => relayClientTurn(s, m, { env, log }),
```

3d. Replace the notify block (lines 94-98) with relay + push:

```js
  // Escalated thread: forward the customer's message to the phone of whoever is
  // working it (assigned installer, else the dispatcher). MUST be awaited —
  // Lambda freezes un-awaited work (252428c). A relay failure never blocks the
  // turn: it's saved below and the console still shows it.
  if (sess.status === "escalated") {
    try { await relay(sess, message); } catch (e) { if (log.error) log.error("chat relay", e.message); }
    if (sess.installer) { try { notify(sess, message).catch(function () {}); } catch (e) {} }
  }
```

3e. AI-pause gate — insert AFTER the `sms-direct` block (after line 106), BEFORE `let out;`:

```js
  // Human-takeover pause: manual off, or auto within 72 h of the installer's
  // latest reply. The client's turn is already saved+relayed; the AI stays quiet.
  if (aiPaused(sess, Date.now())) {
    try { await save(sess); } catch (e) { if (log.error) log.error("chat save", e.message); }
    return { status: 200, body: { reply: "", escalated: sess.status === "escalated", turnCount: sess.turns.length } };
  }
```

3f. Escalation assignment (lines 118-127): leave unassigned + stamp first relay. Replace `sess.installer = installer.key;` with:

```js
    sess.installer = "";                                   // dispatcher-first: dispatch assigns
    sess.lastRelayedAt = new Date().toISOString();          // escalation SMS = first relay
```

(The customer-facing reply on line 127 keeps `${installer.name}` / `${installer.phone}` — that's now the dispatcher, the business's primary point of contact.)

- [ ] **Step 4: Run tests, fix stale expectations**

Run: `node --test tests/chat-relay-hook.test.js tests/chat-handler.test.js tests/chat-admin.test.js`
Expected: `chat-relay-hook` PASSES. Any `chat-handler.test.js` assertion that expected market-routed escalation (installer assigned = market installer, SMS to market installer) must be updated to the new behavior: SMS to `dispatcherKey` number, `sess.installer === ""`, hint text present. Do not weaken unrelated assertions.

- [ ] **Step 5: Run the full suite** — `npm test` — expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/chat.js tests/chat-relay-hook.test.js tests/chat-handler.test.js
git commit -m "feat(chat): dispatcher-first intake, per-message relay to phone, 72h AI pause gate"
git push
```

---### Task 6: Reply routing by `Last Relayed At` + `@key` dispatch command

**Files:**
- Modify: `netlify/functions/lib/chat-store.js` (add `loadRelayTargetSession`)
- Modify: `netlify/functions/twilio-sms.js`
- Test: `tests/chat-dispatch.test.js` (extend), `tests/twilio-relay.test.js` (existing — findSession default changes)

- [ ] **Step 1: Write the failing tests** (append to `tests/chat-dispatch.test.js`)

```js
const { relayInstallerReply } = require("../netlify/functions/twilio-sms.js");
const ENV = { CHAT_DISPATCHER: "aaron", INSTALLER_SMS_NUMBERS: '{"aaron":"+16126557611","cody":"+16052141335","noah":"+19208607050"}' };
const mkSess = (over) => ({ id: "sms:+15075550123", recordId: "r1", status: "escalated", installer: "",
  customerName: "Mark", vehicle: "2019 4Runner", phone: "+15075550123",
  turns: [{ role: "user", text: "what oil?", at: Date.now() }],
  lastActivity: new Date().toISOString(), lastRelayedAt: new Date().toISOString(), ...over });

test("@cody from dispatcher assigns thread + handoff SMS to cody + confirm to aaron", async () => {
  const sent = []; let saved = null;
  const r = await relayInstallerReply({ from: "+16126557611", text: "@cody" }, {
    env: ENV, findSession: async () => mkSess(), save: async (s) => { saved = s; },
    sms: async (a) => { sent.push(a); },
  });
  assert.equal(r.relayed, true);
  assert.equal(saved.installer, "cody");
  const handoff = sent.find((a) => a.to === "+16052141335");
  assert.match(handoff.body, /Mark/); assert.match(handoff.body, /what oil\?/);
  assert.ok(sent.find((a) => a.to === "+16126557611" && /✓/.test(a.body)), "confirmation back to dispatcher");
});

test("@cody from a NON-dispatcher non-admin is not a command (falls through as reply text)", async () => {
  let saved = null;
  const r = await relayInstallerReply({ from: "+19208607050", text: "@cody" }, {
    env: ENV, findSession: async () => mkSess({ installer: "noah" }), save: async (s) => { saved = s; },
    sms: async () => {}, onInstallerTurn: async () => {},
  });
  assert.equal(r.relayed, true);
  assert.equal(saved.installer, "noah", "no reassignment");
  assert.equal(saved.turns[saved.turns.length - 1].text, "@cody");
});

test("dispatch with no active thread -> polite SMS back, consumed (no lead)", async () => {
  const sent = [];
  const r = await relayInstallerReply({ from: "+16126557611", text: "@cody" }, {
    env: ENV, findSession: async () => null, save: async () => {}, sms: async (a) => { sent.push(a); },
  });
  assert.equal(r.relayed, true);
  assert.match(sent[0].body, /no active chat/i);
});

test("plain dispatcher reply on unassigned thread claims it", async () => {
  let saved = null;
  await relayInstallerReply({ from: "+16126557611", text: "Yes that fits your truck." }, {
    env: ENV, findSession: async () => mkSess(), save: async (s) => { saved = s; }, sms: async () => {},
    onInstallerTurn: async () => {},
  });
  assert.equal(saved.installer, "aaron");
  assert.equal(saved.turns[saved.turns.length - 1].role, "installer");
});
```

And a routing test for the store (same file):

```js
const { loadRelayTargetSession } = require("../netlify/functions/lib/chat-store.js");

test("loadRelayTargetSession picks greatest Last Relayed At; dispatcher also sees unassigned", async () => {
  const now = new Date().toISOString();
  const rec = (id, installer, relayedAt) => ({ id: "rec" + id, fields: { "Session ID": id, Status: "escalated",
    Installer: installer, Transcript: "[]", "Last Activity": now, "Last Relayed At": relayedAt } });
  const fetchImpl = async (url) => ({ ok: true, status: 200, json: async () => ({ records:
    decodeURIComponent(String(url)).includes('{Installer}=""')
      ? [rec("A", "", "2026-07-27T10:00:00.000Z"), rec("B", "aaron", "2026-07-27T12:00:00.000Z")]
      : [rec("B", "aaron", "2026-07-27T12:00:00.000Z")] }) });
  const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", CHAT_DISPATCHER: "aaron" };
  const s = await loadRelayTargetSession("aaron", { env, fetchImpl });
  assert.equal(s.id, "B"); // most recently relayed wins, unassigned included in the pool
});
```

- [ ] **Step 2: Run to verify failure** — `node --test tests/chat-dispatch.test.js` — expected FAIL (`loadRelayTargetSession` missing; `sms` dep unused; no command parsing).

- [ ] **Step 3: Implement `loadRelayTargetSession` in `chat-store.js`** (below `loadEscalatedForInstaller`; keep the old function — other tests use it):

```js
// Reply routing (labeled single chain): the thread whose client message most
// recently hit this person's phone. The dispatcher's pool includes every
// unassigned thread — those relay to them by definition.
async function loadRelayTargetSession(key, { env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  const { dispatcherKey } = require("./routing.js");
  const c = cfg(env);
  const k = escapeFormula(key);
  const filter = key === dispatcherKey(env)
    ? `AND({Status}="escalated", OR({Installer}="${k}", {Installer}=""))`
    : `AND({Installer}="${k}",{Status}="escalated")`;
  const recs = await listRecords({ fetchImpl, token: c.token, baseId: c.baseId, table: TABLE(env), filterByFormula: filter });
  const sessions = recs.map(fromRecord).filter((s) => !isStale(s, now()));
  const stamp = (s) => s.lastRelayedAt || s.lastActivity || "";
  sessions.sort((a, b) => (stamp(a) < stamp(b) ? 1 : -1));
  return sessions[0] || null;
}
```

Add `loadRelayTargetSession` to the exports.

- [ ] **Step 4: Implement command + claim in `twilio-sms.js`**

Imports (top of file):

```js
const { INSTALLERS, parseSmsOverrides, normalizeInstallerKey, dispatcherKey, smsNumberFor, keyToInstaller } = require("./lib/routing.js");
const { loadRelayTargetSession, saveSession, loadActiveByPrefix } = require("./lib/chat-store.js");
const { isAdmin } = require("./lib/installer-auth.js");
```

(also add `sendSms` to the existing `require("./lib/twilio.js")` destructure.)

Replace `relayInstallerReply` (lines 33-52) with:

```js
// If `from` is an installer: either a dispatch command ("@cody" — dispatcher/
// admin only) or a reply into the thread that most recently relayed to their
// phone. Returns {relayed} — false means: treat as a normal lead.
async function relayInstallerReply({ from, text }, deps = {}) {
  const { env = process.env, log = console,
    findSession = (k) => loadRelayTargetSession(k, { env }),
    save = (s) => saveSession(s, { env }),
    sms = (a) => sendSms(a, { env, log }),
    onInstallerTurn = deliverInstallerTurn } = deps;
  const inst = installerForNumber(from, env);
  if (!inst) return { relayed: false };
  const clean = String(text || "").trim();
  if (!clean) return { relayed: false }; // blank/media-only texts fall through

  // Dispatch command: a bare installer key ("@cody" or "cody"), sent by the
  // dispatcher or an admin. Consumed — never forwarded to a client. NOTE: this
  // means the dispatcher cannot send a one-word message that IS an installer
  // key as chat text; use the console for that edge.
  const cmd = /^@?([a-zA-Z]+)$/.exec(clean);
  const target = cmd ? normalizeInstallerKey(cmd[1]) : "";
  const mayDispatch = inst.key === dispatcherKey(env) || isAdmin(inst.key, env);
  if (target && target !== inst.key && mayDispatch) {
    let sess = null;
    try { sess = await findSession(inst.key); } catch (e) { if (log.error) log.error("dispatch find", e.message); }
    if (!sess) {
      try { await sms({ to: smsNumberFor(inst.key, env), body: "TY: no active chat to dispatch right now." }); } catch (e) {}
      return { relayed: true };
    }
    sess.installer = target;
    sess.lastRelayedAt = new Date().toISOString(); // target's replies route here
    try { await save(sess); } catch (e) { if (log.error) log.error("dispatch save", e.message); return { relayed: false }; }
    const lastClient = (sess.turns || []).slice().reverse().find((t) => t.role === "user");
    const handoff = `TY handoff: ${sess.customerName || "Customer"}${sess.vehicle ? " · " + sess.vehicle : ""}${sess.phone ? " · " + sess.phone : ""}. ` +
      (lastClient ? `Latest: “${String(lastClient.text).slice(0, 200)}” ` : "") +
      "This thread is yours — reply to this text and it goes to the client.";
    try { await sms({ to: smsNumberFor(target, env), body: handoff }); } catch (e) { if (log.error) log.error("dispatch handoff", e.message); }
    try { await sms({ to: smsNumberFor(inst.key, env), body: `✓ ${sess.customerName || "Chat"} → ${keyToInstaller(target).name}` }); } catch (e) {}
    return { relayed: true };
  }

  let sess = null;
  try { sess = await findSession(inst.key); } catch (e) { if (log.error) log.error("relay find", e.message); }
  if (!sess) return { relayed: false };
  if (!sess.installer) sess.installer = inst.key; // dispatcher answered → thread is theirs
  sess.turns.push({ role: "installer", text: clean, at: Date.now() });
  try { await save(sess); } catch (e) { if (log.error) log.error("relay save", e.message); return { relayed: false }; }
  const turn = sess.turns[sess.turns.length - 1];
  // MUST be awaited: Lambda freezes the container when the handler returns (252428c).
  try { await onInstallerTurn(sess, turn, deps); } catch (e) {}
  return { relayed: true };
}
```

- [ ] **Step 5: Run tests** — `node --test tests/chat-dispatch.test.js tests/twilio-relay.test.js tests/twilio-sms.test.js`
Expected: chat-dispatch PASSES. In `twilio-relay.test.js`, tests inject `findSession` so most pass unchanged; any that texts a bare word from an installer number (e.g. "hi") still falls through correctly (`normalizeInstallerKey("hi") === ""`). Fix only assertions that break because of the new `sms` dep default (inject `sms: async () => {}` where needed).

- [ ] **Step 6: Full suite** — `npm test` — all pass.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/lib/chat-store.js netlify/functions/twilio-sms.js tests/chat-dispatch.test.js tests/twilio-relay.test.js
git commit -m "feat(chat): reply routing by Last Relayed At + @key SMS dispatch with handoff"
git push
```

---

### Task 7: `chat-admin.js` + `chat.js` — `aiMode` op, transcript exposes AI state

**Files:**
- Modify: `netlify/functions/lib/chat-admin.js`
- Modify: `netlify/functions/chat.js` (installerOp)
- Test: `tests/chat-aimode.test.js` (create)

- [ ] **Step 1: Write the failing tests**

Create `tests/chat-aimode.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { setAiMode, getTranscript } = require("../netlify/functions/lib/chat-admin.js");
const { installerOp } = require("../netlify/functions/chat.js");

const sess = (over) => ({ id: "s1", recordId: "r1", status: "escalated", installer: "aaron", customerName: "M",
  phone: "", vehicle: "", city: "", aiMode: "auto", turns: [{ role: "installer", text: "hi", at: Date.now() - 1000 }], ...over });

test("setAiMode validates and persists", async () => {
  let saved = null;
  const r = await setAiMode("s1", "off", { loadFn: async () => sess(), saveFn: async (s) => { saved = s; } });
  assert.equal(r.status, "ok");
  assert.equal(saved.aiMode, "off");
  const bad = await setAiMode("s1", "sideways", { loadFn: async () => sess(), saveFn: async () => {} });
  assert.equal(bad.error, "bad-mode");
});

test("getTranscript reports aiMode + effective aiActive", async () => {
  const t = await getTranscript("s1", { loadFn: async () => sess() }); // auto + fresh installer turn -> paused
  assert.equal(t.aiMode, "auto");
  assert.equal(t.aiActive, false);
  const t2 = await getTranscript("s1", { loadFn: async () => sess({ aiMode: "on" }) });
  assert.equal(t2.aiActive, true);
});

test("installerOp routes op:aiMode", async () => {
  const out = await installerOp({ op: "aiMode", session: "s1", mode: "off" }, "aaron",
    { setAi: async (id, mode) => ({ status: "ok", aiMode: mode }) });
  assert.equal(out.status, 200);
  assert.equal(out.body.aiMode, "off");
});
```

- [ ] **Step 2: Run to verify failure** — `node --test tests/chat-aimode.test.js` — FAIL (`setAiMode` not exported).

- [ ] **Step 3: Implement**

In `chat-admin.js`: import `aiPaused` (extend the line-6 require from `./chat-store.js`). Extend `getTranscript`'s return:

```js
  return { id: sess.id, status: sess.status, customerName: sess.customerName, phone: sess.phone, vehicle: sess.vehicle, city: sess.city, installer: sess.installer || "",
    aiMode: sess.aiMode || "auto", aiActive: !aiPaused(sess, Date.now()), turns: sess.turns };
```

Add before `module.exports`:

```js
// Console AI toggle: "on"/"off" are manual overrides; "auto" restores the
// 72h-pause-after-installer-reply default. Takes effect on the next client message.
async function setAiMode(sessionId, mode, deps = {}) {
  const { loadFn = loadSession, saveFn = saveSession } = deps;
  const m = String(mode || "").toLowerCase();
  if (["auto", "on", "off"].indexOf(m) < 0) return { status: "error", error: "bad-mode" };
  const sess = await loadFn(sessionId, deps);
  if (!sess) return { status: "error", error: "not-found" };
  sess.aiMode = m;
  await saveFn(sess, deps);
  return { status: "ok", aiMode: m };
}
```

Export it. In `chat.js` `installerOp` (before the final `bad-op` return):

```js
  if (body.op === "aiMode") {
    const r = await (deps.setAi || chatAdmin.setAiMode)(String(body.session || ""), body.mode, deps);
    return { status: r.status === "ok" ? 200 : (r.error === "not-found" ? 404 : 400), body: r };
  }
```

- [ ] **Step 4: Run** — `node --test tests/chat-aimode.test.js tests/chat-admin.test.js` — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/chat-admin.js netlify/functions/chat.js tests/chat-aimode.test.js
git commit -m "feat(chat): aiMode console op + transcript exposes AI on/off state"
git push
```

---

### Task 8: Console UI — AI toggle in the chat thread header

**Files:**
- Modify: `site/installer.html` (renderChatThread, ~lines 1006-1010 header + handlers ~1040)

No unit harness for this inline JS; the change is verified by the full suite (browser tests) + manual check.

- [ ] **Step 1: Implement**

In the header template (the `var html =` block at line 1006), after `assignHtml +` insert:

```js
      ' · AI <a href="#" id="chatai" title="Toggle AI auto-replies for this chat">'+(j.aiActive?'on':'off')+'</a>'+
      (j.aiMode && j.aiMode!=='auto' ? ' <a href="#" id="chataiauto" style="color:var(--muted,#8a8a8e);font-size:12px" title="Back to automatic — AI pauses 72h after you reply">auto</a>' : '')+
```

Next to the other handlers (after the `claim` handler at line 1044) add:

```js
    async function setAi(mode){
      try{
        var r=await chatApi({op:'aiMode', session:openId, mode:mode});
        if(r && r.status==='ok'){ host.__chatHtml=''; renderChatThread(host); }
        else fail('Could not change AI mode.');
      }catch(e){ fail('Could not change AI mode.'); }
    }
    var aiBtn=document.getElementById('chatai');
    if(aiBtn) aiBtn.onclick=function(e){ e.preventDefault(); setAi(j.aiActive?'off':'on'); };
    var aiAuto=document.getElementById('chataiauto');
    if(aiAuto) aiAuto.onclick=function(e){ e.preventDefault(); setAi('auto'); };
```

(`host.__chatHtml=''` busts the render-skip cache at line 1017 so the toggle repaints immediately.)

- [ ] **Step 2: Full suite** — `npm test` — all pass (fix any browser-test snapshot of the thread header if one asserts exact markup).

- [ ] **Step 3: Commit**

```bash
git add site/installer.html
git commit -m "feat(console): per-thread AI on/off toggle with auto reset"
git push
```

---

### Task 9: `installer-closeout.js` — `cancel` / `uncancel` actions

**Files:**
- Modify: `netlify/functions/installer-closeout.js`
- Test: `tests/installer-cancel.test.js` (create)

- [ ] **Step 1: Write the failing tests**

Create `tests/installer-cancel.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processCloseout } = require("../netlify/functions/installer-closeout.js");

const ENV = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };
const deps = (fields, over) => ({ env: ENV, key: "cody", admin: false,
  get: async () => ({ id: "rec1", fields }), update: async (a) => { deps.updated = a; return {}; },
  create: async () => ({}), send: async () => {}, ...over });

test("cancel: sets Cancelled + stamps who/when", async () => {
  const d = deps({ Installer: "cody", Status: "Booked", Name: "M" });
  const out = await processCloseout({ recordId: "rec1", action: "cancel" }, d);
  assert.equal(out.status, "cancelled");
  assert.equal(deps.updated.fields.Status, "Cancelled");
  assert.ok(deps.updated.fields["Cancelled At"]);
  assert.equal(deps.updated.fields["Cancelled By"], "cody");
});

test("cancel: not-yours and locked statuses refused", async () => {
  const notMine = await processCloseout({ recordId: "r", action: "cancel" }, deps({ Installer: "noah", Status: "Booked" }));
  assert.equal(notMine.error, "not-yours");
  const done = await processCloseout({ recordId: "r", action: "cancel" }, deps({ Installer: "cody", Status: "Completed" }));
  assert.equal(done.error, "not-open");
  const twice = await processCloseout({ recordId: "r", action: "cancel" }, deps({ Installer: "cody", Status: "Cancelled" }));
  assert.equal(twice.error, "not-open");
});

test("uncancel: restores Booked and clears the stamps; only from Cancelled", async () => {
  const d = deps({ Installer: "cody", Status: "Cancelled", "Cancelled At": "2026-07-27T00:00:00Z", "Cancelled By": "cody" });
  const out = await processCloseout({ recordId: "rec1", action: "uncancel" }, d);
  assert.equal(out.status, "uncancelled");
  assert.equal(deps.updated.fields.Status, "Booked");
  assert.equal(deps.updated.fields["Cancelled At"], "");
  assert.equal(deps.updated.fields["Cancelled By"], "");
  const nope = await processCloseout({ recordId: "r", action: "uncancel" }, deps({ Installer: "cody", Status: "Booked" }));
  assert.equal(nope.error, "not-cancelled");
});

test("admin may cancel another installer's booking", async () => {
  const d = deps({ Installer: "noah", Status: "Booked" }, { admin: true });
  const out = await processCloseout({ recordId: "rec1", action: "cancel" }, d);
  assert.equal(out.status, "cancelled");
});
```

- [ ] **Step 2: Run to verify failure** — `node --test tests/installer-cancel.test.js` — FAIL (falls into the complete branch, `bad-calibration`).

- [ ] **Step 3: Implement in `processCloseout`** — insert after the ownership check (line 39), BEFORE the `noshow` branch:

```js
  // Soft-delete (owner decision 2026-07-27): Cancelled vanishes from roster +
  // calendar (both filter it) but stays in Airtable; purge-cancelled.js hard-
  // deletes 30 days after "Cancelled At". uncancel = the console's Undo.
  if (d.action === "cancel") {
    if (f.Status === "Completed" || f.Status === "Cancelled") return { status: "error", error: "not-open" };
    try {
      await updateTolerant(update, { token: c.token, baseId: c.baseId, table: c.bookings, id: d.recordId,
        fields: { Status: "Cancelled", "Cancelled At": now.toISOString(), "Cancelled By": key } },
        ["Cancelled At", "Cancelled By"]);
    } catch (e) { if (log.error) log.error("closeout cancel", e.message); return { status: "error", error: "store-unavailable" }; }
    return { status: "cancelled" };
  }
  if (d.action === "uncancel") {
    if (f.Status !== "Cancelled") return { status: "error", error: "not-cancelled" };
    try {
      await updateTolerant(update, { token: c.token, baseId: c.baseId, table: c.bookings, id: d.recordId,
        fields: { Status: "Booked", "Cancelled At": "", "Cancelled By": "" } },
        ["Cancelled At", "Cancelled By"]);
    } catch (e) { if (log.error) log.error("closeout uncancel", e.message); return { status: "error", error: "store-unavailable" }; }
    return { status: "uncancelled" };
  }
```

(`updateTolerant` and `log` are already in scope; `now` is already a `Date` in deps.)

- [ ] **Step 4: Run** — `node --test tests/installer-cancel.test.js tests/installer-closeout.test.js` — expect PASS, existing closeout tests untouched.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/installer-closeout.js tests/installer-cancel.test.js
git commit -m "feat(bookings): cancel/uncancel actions — soft-delete with ownership guard"
git push
```

---

### Task 10: Console UI — Delete button + Undo toast

**Files:**
- Modify: `site/installer.html` (rowCard details block ~line 2041; new `cancelBooking()` near `reschedule()` ~line 2086)

- [ ] **Step 1: Implement**

In `rowCard`'s details block (line 2041), extend the Save row:

```js
      '<button class="btn" id="rs_'+b.id+'">Save</button>'+
      '<button type="button" class="btn ns" id="del_'+b.id+'" title="Remove this booking (wrong entry / duplicate). Undo available for 10s.">🗑 Delete booking</button></div></details>'+
```

Wire it next to the reschedule handler (after line 2057):

```js
    c.querySelector('#del_'+b.id).onclick=function(){ cancelBooking(b.id); };
```

Add `cancelBooking` after `reschedule()` (line 2100):

```js
  // Soft-delete with Undo (owner decision 2026-07-27): no blocking confirm —
  // the card vanishes instantly and a 10s Undo toast is the safety net. Undo
  // restores and jumps-and-flashes the booking (console rule: no silent outcomes).
  async function cancelBooking(id){
    clearMsg();
    var idx=-1, b=null;
    STATE.bookings.forEach(function(x,i){ if(x.id===id){ idx=i; b=x; } });
    try{
      var res=await fetch('/.netlify/functions/installer-closeout',{method:'POST',headers:{'Content-Type':'application/json','x-installer-token':tok()},body:JSON.stringify({recordId:id,action:'cancel'})});
      if(res.status===401){ localStorage.removeItem('ty_installer_token'); location.reload(); return; }
      var out=await res.json().catch(function(){return{};});
      if(!(res.ok && out.status==='cancelled')){ fail('Could not delete: '+(out.error||res.status)); return; }
    }catch(e){ fail('Network error — try again.'); return; }
    if(idx>=0) STATE.bookings.splice(idx,1);
    renderAll();
    var el=document.getElementById('msg'); el.className='msg ok';
    el.innerHTML='✓ Booking deleted'+(b&&b.name?' — '+esc(b.name):'')+'. <a href="#" id="undodel"><b>Undo</b></a>';
    el.scrollIntoView({block:'nearest'});
    var t=setTimeout(clearMsg, 10000);
    var u=document.getElementById('undodel');
    if(u) u.onclick=async function(e){
      e.preventDefault(); clearTimeout(t);
      try{
        var r=await fetch('/.netlify/functions/installer-closeout',{method:'POST',headers:{'Content-Type':'application/json','x-installer-token':tok()},body:JSON.stringify({recordId:id,action:'uncancel'})});
        var o=await r.json().catch(function(){return{};});
        if(r.ok && o.status==='uncancelled'){
          if(b) STATE.bookings.splice(idx>=0?idx:STATE.bookings.length, 0, b);
          succeed('✓ Booking restored.');
          if(b) jumpToBooking(b);
        } else { fail('Could not restore: '+(o.error||r.status)); }
      }catch(e2){ fail('Network error — the booking is still deleted; Undo again or restore in Airtable.'); }
    };
  }
```

- [ ] **Step 2: Full suite** — `npm test` — all pass (`roster-render.test.js` may assert card markup; update its expected HTML if the new button breaks a snapshot-style assertion).

- [ ] **Step 3: Commit**

```bash
git add site/installer.html
git commit -m "feat(console): booking Delete with 10s Undo toast (soft-cancel)"
git push
```

---

### Task 11: `purge-cancelled.js` scheduled function + schedule entry

**Files:**
- Create: `netlify/functions/purge-cancelled.js`
- Modify: `netlify.toml`
- Test: `tests/purge-cancelled.test.js` (create)

- [ ] **Step 1: Write the failing tests**

Create `tests/purge-cancelled.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { purgeCancelled, PURGE_AFTER_MS } = require("../netlify/functions/purge-cancelled.js");

const DAY = 24 * 60 * 60 * 1000;
const ENV = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };

test("purges only Cancelled records stamped >30 days ago; unstamped never touched", async () => {
  const now = Date.now();
  const deleted = [];
  const out = await purgeCancelled({
    env: ENV, now: () => now,
    list: async () => [
      { id: "old", fields: { "Cancelled At": new Date(now - 31 * DAY).toISOString() } },
      { id: "fresh", fields: { "Cancelled At": new Date(now - 5 * DAY).toISOString() } },
      { id: "legacy-unstamped", fields: {} },
      { id: "garbage-stamp", fields: { "Cancelled At": "not a date" } },
    ],
    del: async (a) => { deleted.push(a.id); },
  });
  assert.deepEqual(deleted, ["old"]);
  assert.equal(out.purged, 1);
  assert.equal(out.considered, 4);
  assert.equal(PURGE_AFTER_MS, 30 * DAY);
});

test("one failed delete doesn't stop the sweep", async () => {
  const now = Date.now();
  const deleted = [];
  const out = await purgeCancelled({
    env: ENV, now: () => now, log: { error: () => {}, log: () => {} },
    list: async () => [
      { id: "a", fields: { "Cancelled At": new Date(now - 40 * DAY).toISOString() } },
      { id: "b", fields: { "Cancelled At": new Date(now - 40 * DAY).toISOString() } },
    ],
    del: async (a) => { if (a.id === "a") throw new Error("422"); deleted.push(a.id); },
  });
  assert.deepEqual(deleted, ["b"]);
  assert.equal(out.purged, 1);
});
```

- [ ] **Step 2: Run to verify failure** — `node --test tests/purge-cancelled.test.js` — FAIL (module not found).

- [ ] **Step 3: Create `netlify/functions/purge-cancelled.js`**

```js
// netlify/functions/purge-cancelled.js
// Daily sweep (netlify.toml @daily): permanently delete bookings that have sat
// in Status="Cancelled" for 30+ days (owner decision 2026-07-27 — soft-delete
// with a 30-day trash window). Only records STAMPED by the console's cancel
// action ("Cancelled At") are eligible — legacy/unstamped Cancelled rows are
// never touched, so nothing historical gets swept.
const { cfg, listAllRecords, deleteRecord } = require("./lib/airtable.js");

const PURGE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

async function purgeCancelled(deps = {}) {
  const { env = process.env, fetchImpl = fetch, now = Date.now, log = console,
    list = (a) => listAllRecords({ fetchImpl, ...a }),
    del = (a) => deleteRecord({ fetchImpl, ...a }) } = deps;
  const c = cfg(env);
  const recs = await list({ token: c.token, baseId: c.baseId, table: c.bookings,
    filterByFormula: `{Status}="Cancelled"`, fields: ["Cancelled At", "Name"] });
  let purged = 0;
  for (const r of recs) {
    const at = Date.parse(((r.fields || {})["Cancelled At"]) || "");
    if (!at || now() - at < PURGE_AFTER_MS) continue;
    try { await del({ token: c.token, baseId: c.baseId, table: c.bookings, id: r.id }); purged++; }
    catch (e) { if (log.error) log.error("purge-cancelled", r.id, e.message); }
  }
  if (log.log) log.log(`purge-cancelled: ${purged} purged of ${recs.length} cancelled`);
  return { purged, considered: recs.length };
}

async function handler() {
  try { const out = await purgeCancelled({}); return { statusCode: 200, body: JSON.stringify(out) }; }
  catch (e) { console.error("purge-cancelled", e.message); return { statusCode: 502, body: JSON.stringify({ error: e.message }) }; }
}

module.exports = { handler, purgeCancelled, PURGE_AFTER_MS };
```

- [ ] **Step 4: Add the schedule to `netlify.toml`** (next to the other `[functions."..."]` blocks):

```toml
# Daily purge of bookings soft-cancelled 30+ days ago (netlify/functions/purge-cancelled.js).
# Only records stamped "Cancelled At" by the console delete are eligible.
[functions."purge-cancelled"]
  schedule = "@daily"
```

- [ ] **Step 5: Run** — `node --test tests/purge-cancelled.test.js` — expect PASS.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/purge-cancelled.js netlify.toml tests/purge-cancelled.test.js
git commit -m "feat(bookings): daily purge of bookings cancelled 30+ days ago"
git push
```

---

### Task 12: Reschedule editor discoverability

**Files:**
- Modify: `site/installer.html` (rowCard details summary, line 2036)

- [ ] **Step 1: Implement** — replace the subtle summary line:

```js
      '<details style="margin:6px 0"><summary class="link" style="cursor:pointer">🕓 '+(b.scheduledTime?'Time: '+esc(b.scheduledTime)+' — change':'Set time / date / address')+'</summary>'+
```

with a button-styled, always-obvious affordance:

```js
      '<details style="margin:6px 0"><summary class="btn" style="display:inline-block;cursor:pointer;list-style:none">✏️ Edit'+(b.scheduledTime?' — '+esc(b.scheduledTime):' date / time / address')+'</summary>'+
```

- [ ] **Step 2: Full suite** — `npm test` — fix `roster-render.test.js` expectations if they matched the old `🕓` summary text.

- [ ] **Step 3: Commit**

```bash
git add site/installer.html
git commit -m "fix(console): make the booking date/time/address editor visibly discoverable"
git push
```

---

### Task 13: Final verification + deploy checks

- [ ] **Step 1: Full suite green** — `npm test` — every test passes.

- [ ] **Step 2: Confirm the Airtable columns exist** (Task 1 may have run days earlier):

```bash
export AIRTABLE_TOKEN=$(npx netlify env:get AIRTABLE_TOKEN)
export AIRTABLE_BASE_ID=$(npx netlify env:get AIRTABLE_BASE_ID)
node scripts/airtable/ensure-field.mjs "Chat Sessions" "Last Relayed At" singleLineText
node scripts/airtable/ensure-field.mjs "Chat Sessions" "AI Mode" singleLineText
node scripts/airtable/ensure-field.mjs "Bookings" "Cancelled At" singleLineText
node scripts/airtable/ensure-field.mjs "Bookings" "Cancelled By" singleLineText
npx netlify env:get CHAT_DISPATCHER
```

Expected: four `ok: ... already exists` lines and `aaron`.

- [ ] **Step 3: Post-deploy smoke (with the owner, real traffic)**
  1. Text the TY number from a non-installer phone → AI replies → ask for a human → escalation SMS lands on 612-655-7611 with the dispatch hint.
  2. From Aaron's phone reply `@cody` → Cody gets the handoff SMS; client's next message lands on Cody's phone with the `TY · name · vehicle` label.
  3. Cody replies from his phone → client receives it; console thread shows all turns; AI shows `off` (paused) in the thread header.
  4. Console: flip AI to `on`, client message → AI answers again; set back to `auto`.
  5. Console: delete a test booking → card vanishes → Undo → card returns highlighted. Cancel one for real and verify it's stamped `Cancelled At` in Airtable.

- [ ] **Step 4: Watch item** — installer phones now get one SMS per client message; keep an eye on Twilio A2P volume the first week.

---

## Self-Review Notes (already applied)

- **Spec coverage:** intake/dispatch (T3-T6), label + NEW/RETURNING + multi-chat warning + hint (T4), reply routing + 72 h staleness (T2, T6), AI pause + toggle (T2, T5, T7, T8), cancel/uncancel + Undo (T9, T10), 30-day purge (T11), editor discoverability (T12), schema/env rollout (T1, T13). Meta channels need no extra work — they flow through `processChat` (relay) and `deliverInstallerTurn` (client delivery) unchanged.
- **Known accepted edges (documented in code comments):** a dispatcher one-word text that IS an installer key always dispatches (use console to send such a word as chat text); `@{own-key}` falls through as normal reply text; customer-facing escalation copy now names the dispatcher (the business's primary contact) rather than the market installer.
