# Funnel Measurement (Funnel Spec C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** First-party funnel-step measurement — the tune-finder beacons each step transition to a `track` Netlify function that records it in a `Funnel Events` Airtable table, plus a pure tested `aggregateFunnel()` that turns rows into a drop-off funnel.

**Architecture:** Client `sendBeacon` from the `go(n)` chokepoint → `track.js` (writes a row, always 204, never breaks a session) → Airtable `Funnel Events`. Pure `lib/funnel.js` aggregates distinct-sessions-per-step. Capture-only; report wiring is a fast-follow.

**Tech Stack:** Static HTML + inline JS (`navigator.sendBeacon`), Netlify function, Airtable REST, `node:test`. No new dependency.

---

## File Structure

- `netlify/functions/lib/funnel.js` *(new, pure)* — `aggregateFunnel()` + `STEP_LABELS`.
- `netlify/functions/track.js` *(new)* — `processTrack()` + `handler` (writes a row, returns 204).
- `site/find-your-exact-tune.html` — anonymous `sid`, `track()` helper, beacon in `go(n)` + terminal outcomes.
- Tests: `tests/funnel.test.js` *(new)*, `tests/track.test.js` *(new)*, `tests/booking-ui.test.js`.

**Branching:** `feat/funnel-measurement` off `master`.

---

### Task 0: Branch + docs

- [ ] **Step 1**

```bash
git checkout master
git checkout -b feat/funnel-measurement
git add docs/superpowers/specs/2026-06-25-funnel-measurement-design.md docs/superpowers/plans/2026-06-25-funnel-measurement.md
git commit -m "docs: spec + plan for funnel measurement (Spec C)"
```

---

### Task 1: Aggregator (`lib/funnel.js`)

**Files:** Create `netlify/functions/lib/funnel.js`; Test `tests/funnel.test.js`.

- [ ] **Step 1: Write the failing test** (`tests/funnel.test.js`)

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { aggregateFunnel } = require("../netlify/functions/lib/funnel.js");

// s1 completes; s2 drops at config; s3 back-navigates (dedup); s4 bounces at make.
const events = [
  ...[0,1,2,3,4,5,6].map((Step) => ({ Session: "s1", Step })),
  ...[0,1,2].map((Step) => ({ Session: "s2", Step })),
  ...[0,1,1,2].map((Step) => ({ Session: "s3", Step })),
  { Session: "s4", Step: 0 },
];

test("distinct sessions per step + drop-off, dedup back-nav", () => {
  const f = aggregateFunnel(events);
  assert.equal(f.totalSessions, 4);
  const by = Object.fromEntries(f.steps.map((s) => [s.step, s.sessions]));
  assert.deepEqual([by[0], by[1], by[2], by[3], by[4], by[5], by[6]], [4, 3, 3, 1, 1, 1, 1]);
  const step1 = f.steps.find((s) => s.step === 1);
  assert.equal(step1.name, "model");
  assert.equal(step1.dropPct, 25);     // 4 -> 3
  assert.equal(step1.overallPct, 75);  // 3 / 4
  const step2 = f.steps.find((s) => s.step === 2);
  assert.equal(step2.dropPct, 0);      // 3 -> 3
});
test("empty input → zeros, no throw", () => {
  const f = aggregateFunnel([]);
  assert.equal(f.totalSessions, 0);
  assert.equal(f.steps[0].sessions, 0);
  assert.equal(f.steps[0].dropPct, 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/funnel.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (`netlify/functions/lib/funnel.js`)

```js
// Pure: turn Funnel Events rows into a distinct-sessions-per-step drop-off funnel.
const STEP_LABELS = { 0: "make", 1: "model", 2: "config", 3: "goals", 4: "result", 5: "book", 6: "outcome" };

function aggregateFunnel(events) {
  const perStep = {};            // step -> Set of session ids that reached it
  for (let s = 0; s <= 6; s++) perStep[s] = new Set();
  for (const e of events || []) {
    const step = Number(e.Step);
    if (!Number.isInteger(step) || step < 0 || step > 6) continue;
    if (e.Session) perStep[step].add(String(e.Session));
  }
  const base = perStep[0].size;
  const steps = [];
  let prev = null;
  for (let s = 0; s <= 6; s++) {
    const sessions = perStep[s].size;
    const dropPct = prev && prev > 0 ? Math.round(((prev - sessions) / prev) * 100) : 0;
    const overallPct = base > 0 ? Math.round((sessions / base) * 100) : 0;
    steps.push({ step: s, name: STEP_LABELS[s], sessions, dropPct, overallPct });
    prev = sessions;
  }
  return { steps, totalSessions: base };
}
module.exports = { aggregateFunnel, STEP_LABELS };
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/funnel.test.js`
Expected: PASS (2).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/funnel.js tests/funnel.test.js
git commit -m "feat(funnel): pure aggregateFunnel (distinct sessions per step + drop-off)"
```

---

### Task 2: Track function (`track.js`)

**Files:** Create `netlify/functions/track.js`; Test `tests/track.test.js`.

- [ ] **Step 1: Write the failing test** (`tests/track.test.js`)

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processTrack } = require("../netlify/functions/track.js");

function deps(overrides = {}) {
  const creates = [];
  return {
    env: { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" },
    create: async (a) => { creates.push(a); return { id: "r1" }; },
    log: { error() {} },
    _creates: creates,
    ...overrides,
  };
}

test("valid payload writes a mapped Funnel Events row", async () => {
  const d = deps();
  const r = await processTrack({ sid: "s_x", step: 2, name: "config", utm_source: "ig" }, d);
  assert.equal(r.stored, true);
  assert.equal(d._creates.length, 1);
  assert.equal(d._creates[0].table, "Funnel Events");
  assert.equal(d._creates[0].fields.Session, "s_x");
  assert.equal(d._creates[0].fields.Step, 2);
  assert.equal(d._creates[0].fields["Step Name"], "config");
  assert.equal(d._creates[0].fields["UTM Source"], "ig");
});
test("invalid / honeypot payloads do not write", async () => {
  const d = deps();
  assert.equal((await processTrack({ step: 2 }, d)).stored, false);              // no sid
  assert.equal((await processTrack({ sid: "s", step: "2" }, d)).stored, false);  // step not a number
  assert.equal((await processTrack({ sid: "s", step: 1, bot_field: "x" }, d)).stored, false); // honeypot
  assert.equal(d._creates.length, 0);
});
test("a store error is swallowed (never throws)", async () => {
  const d = deps({ create: async () => { throw new Error("airtable 429"); } });
  const r = await processTrack({ sid: "s", step: 0, name: "make" }, d);
  assert.equal(r.stored, false);
  assert.equal(r.reason, "store");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/track.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (`netlify/functions/track.js`)

```js
// First-party funnel-step beacon sink. Writes one Funnel Events row per step.
// Always 204 (beacons ignore the response); never throws into the request.
const { cfg, createRecord } = require("./lib/airtable.js");

async function processTrack(body, deps) {
  const { fetchImpl = fetch, create = (a) => createRecord({ fetchImpl, ...a }), env = process.env, log = console } = deps;
  const d = body || {};
  if (d.bot_field) return { stored: false, reason: "bot" };
  if (!d.sid || typeof d.step !== "number") return { stored: false, reason: "invalid" };
  const c = cfg(env);
  const table = env.AIRTABLE_FUNNEL_TABLE || "Funnel Events";
  try {
    await create({ token: c.token, baseId: c.baseId, table, fields: {
      Session: String(d.sid), Step: d.step, "Step Name": d.name || "",
      "UTM Source": d.utm_source || "", "UTM Medium": d.utm_medium || "", "UTM Campaign": d.utm_campaign || "",
    } });
    return { stored: true };
  } catch (e) { if (log.error) log.error("track", e.message); return { stored: false, reason: "store" }; }
}

async function handler(event) {
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { /* ignore */ }
  await processTrack(body, { fetchImpl: fetch });
  return { statusCode: 204, body: "" };
}
module.exports = { handler, processTrack };
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/track.test.js`
Expected: PASS (3).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/track.js tests/track.test.js
git commit -m "feat(track): funnel-step beacon sink -> Funnel Events (always 204)"
```

---

### Task 3: Client instrumentation

**Files:**
- Modify: `site/find-your-exact-tune.html` (sid + `track()` near the `ATTR` block ~line 630; beacon in `go(n)` ~line 636; terminal outcomes in the submit handler ~line 925 and `showSuccess` ~line 970)
- Test: `tests/booking-ui.test.js`

- [ ] **Step 1: Add the failing test** (append to `tests/booking-ui.test.js`)

```js
test("funnel measurement: sid + beacon hooks present", () => {
  assert.ok(/function track\(/.test(HTML), "missing track() helper");
  assert.ok(HTML.includes("sendBeacon"), "missing sendBeacon");
  assert.ok(HTML.includes("ty_sid"), "missing session id key");
  assert.ok(HTML.includes("STEP_NAMES"), "missing STEP_NAMES");
  assert.ok(/track\(6,\s*["']booked["']\)/.test(HTML), "missing terminal booked beacon");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/booking-ui.test.js`
Expected: FAIL.

- [ ] **Step 3a: Add the sid + track() helper** — immediately after the `ATTR` IIFE block and the `const $=...,$$=...` line (around line 631), add:

```js
const SID=(function(){ let s=""; try{ s=sessionStorage.getItem("ty_sid")||""; }catch(e){} if(!s){ s="s_"+Math.random().toString(36).slice(2)+Date.now().toString(36); try{ sessionStorage.setItem("ty_sid",s); }catch(e){} } return s; })();
const STEP_NAMES=["make","model","config","goals","result","book"];
function track(step,name){ try{ const p=JSON.stringify({sid:SID,step,name:name||STEP_NAMES[step]||"",utm_source:ATTR.utm_source||"",utm_medium:ATTR.utm_medium||"",utm_campaign:ATTR.utm_campaign||""}); if(navigator.sendBeacon){ navigator.sendBeacon("/.netlify/functions/track",p); } else { fetch("/.netlify/functions/track",{method:"POST",body:p,keepalive:true}); } }catch(e){} }
```

- [ ] **Step 3b: Beacon each step** — in `go(n)`, add `track(n);` as the last statement before the closing brace:

```js
function go(n){
  $$(".tf-step").forEach(el=>el.classList.toggle("active",+el.dataset.step===n));
  [...prog.children].forEach((d,i)=>d.className=i<n?"done":(i===n?"on":""));
  renderCrumb(n);
  $("#tf").scrollIntoView({behavior:"smooth",block:"start"});
  track(n);
}
```

- [ ] **Step 3c: Terminal outcome beacons** — in the `$("#fSubmit")` result handler, add a beacon in the booked and priority branches:

booked branch — after the existing `fbq('track','Schedule'...)` try/catch, before `bookSuccess(...)`:
```js
    if(out.status==="booked"){ try{if(window.fbq)fbq('track','Schedule',{content_name:'Tune Booking'});}catch(e){} track(6,"booked"); bookSuccess("You're booked.",`You're set for ${out.eventLabel||out.eventDateISO} at ${out.slot}. Check your email for a calendar invite.`); }
```
priority branch — likewise add `track(6,"priority");`:
```js
    else if(out.status==="priority"){ try{if(window.fbq)fbq('track','Lead',{content_name:'Priority Wait List'});}catch(e){} track(6,"priority"); bookSuccess("You're on the Priority Wait List.",`We'll reach out the moment a slot opens in ${(a&&a.city)||S.marketCity}${BOOK.slot?` for your preferred time, ${BOOK.slot}`:""}.`); }
```

- [ ] **Step 3d: Lead outcome beacon** — at the top of `showSuccess(viaMail)` (the legacy lead success), add `track(6,"lead");`:

```js
function showSuccess(viaMail){
  track(6,"lead");
  try{ if(window.fbq) fbq('track','Lead',{content_name:'Tune Finder'}); }catch(e){}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/booking-ui.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add site/find-your-exact-tune.html tests/booking-ui.test.js
git commit -m "feat(funnel): client step + outcome beacons (anonymous sid)"
```

---

### Task 4: Verify + ship checkpoint

- [ ] **Step 1: Full suite** — Run: `npm test` — Expected: all pass.

- [ ] **Step 2: SEO build idempotency** — Run: `npm run build:seo` then `git checkout -- site/`; confirm only intended changes committed.

- [ ] **Step 3: STOP — ship checkpoint.** Do NOT push without owner go. Prerequisite: create the `Funnel Events` Airtable table (schema in the spec) — without it, beacons no-op gracefully (writes fail → 204, no data captured). This branch is otherwise frontend+function only (no DNS/email dependency), so it can ship standalone once the table exists, or bundle with the held batch. Fast-follow (separate): add a drop-off section to the weekly report via `aggregateFunnel`.

---

## Self-Review

**Spec coverage:** anonymous `sid` in sessionStorage (Task 3a) ✓; `track()` via sendBeacon with keepalive fallback (3a) ✓; beacon in `go(n)` chokepoint (3b) ✓; terminal booked/priority/lead beacons (3c/3d) ✓; utm attribution in payload (3a) ✓; `track.js` writes Funnel Events row, honeypot + invalid guards, always 204, swallow store errors (Task 2) ✓; `AIRTABLE_FUNNEL_TABLE` override (Task 2) ✓; pure `aggregateFunnel` distinct-session counts + drop-off, dedup back-nav, empty→zeros (Task 1) ✓; tests for all three (Tasks 1–3) ✓; Funnel Events table prerequisite + graceful degradation (Task 4) ✓; capture-only / report fast-follow noted ✓.

**Placeholder scan:** none — full code in every step.

**Type/name consistency:** `processTrack(body, deps)` with `create/env/log/fetchImpl` injection matches tests; payload keys (`sid`, `step`, `name`, `utm_*`) consistent client↔server; Airtable field names (`Session`, `Step`, `Step Name`, `UTM *`) consistent across `track.js` + spec table + `aggregateFunnel` reads (`Session`/`Step`); `STEP_NAMES` (client 0–5) and `STEP_LABELS` (server 0–6) consistent; `aggregateFunnel` returns `{steps:[{step,name,sessions,dropPct,overallPct}],totalSessions}`.
