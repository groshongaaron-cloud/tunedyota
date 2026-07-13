# VIN Decode + Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At close-out, decode the entered VIN via NHTSA and warn the installer (with an acknowledge-to-override gate) when it doesn't match the booking's vehicle/year, before it prints on the certificate and OTT report.

**Architecture:** A pure comparator (`lib/vin-guard.js`) + an auth-gated NHTSA proxy (`vin-decode.js`) that fails open on any outage; the console calls it on a valid 17-char VIN and gates Mark-complete behind a confirmation checkbox when there are warnings. Advisory only — nothing is stored, no Airtable/env change.

**Tech Stack:** Node.js (CommonJS), `node --test` + `node:assert/strict`, Netlify Functions, NHTSA vPIC API (no key), the installer-token auth already in `lib/installer-auth.js`.

**Spec:** `docs/superpowers/specs/2026-07-13-vin-decode-guard-design.md`

**Conventions:** one test file `node --test tests/<f>.test.js`; full suite `npm test`. Commit per task. Confirm `git branch --show-current` before committing. Fresh-worktree-only pre-existing failure to ignore: `tests/magnuson-schema-image.test.js`.

---

## File Structure

**Create:**
- `netlify/functions/lib/vin-guard.js` — pure comparator.
- `netlify/functions/vin-decode.js` — auth-gated NHTSA proxy + compare.
- Tests: `tests/vin-guard.test.js`, `tests/vin-decode.test.js`.

**Modify:**
- `netlify/functions/installer-roster.js` — add `modelYear` to the booking payload (+ test).
- `site/installer.html` — VIN-decode call, inline warning, acknowledge-to-override gate.

---

## Task 1: `vin-guard.js` — pure comparator

**Files:**
- Create: `netlify/functions/lib/vin-guard.js`
- Test: `tests/vin-guard.test.js`

- [ ] **Step 1: Write the failing test** — `tests/vin-guard.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { compareVin } = require("../netlify/functions/lib/vin-guard.js");

test("check-digit failure → typo warning", () => {
  const r = compareVin({ modelYear: "2021", make: "TOYOTA", model: "Tundra", errorCode: "1,3,14" },
    { vehicle: "2021 Toyota Tundra", modelYear: "2021" });
  assert.equal(r.ok, false);
  assert.ok(r.warnings.some((w) => /mistyped/i.test(w)));
});

test("year mismatch warns with both years", () => {
  const r = compareVin({ modelYear: "2021", make: "TOYOTA", model: "Tundra", errorCode: "0" },
    { vehicle: "2024 Toyota Tundra", modelYear: "2024" });
  assert.ok(r.warnings.some((w) => /2021/.test(w) && /2024/.test(w)));
});

test("make/model mismatch warns", () => {
  const r = compareVin({ modelYear: "2021", make: "TOYOTA", model: "Tundra", errorCode: "0" },
    { vehicle: "2021 Toyota Tacoma 3.5L V6", modelYear: "2021" });
  assert.ok(r.warnings.some((w) => /Tundra/.test(w)));
});

test("clean match → ok, no warnings", () => {
  const r = compareVin({ modelYear: "2021", make: "TOYOTA", model: "Tundra", errorCode: "0" },
    { vehicle: "2021 Toyota Tundra 5.7L V8", modelYear: "2021" });
  assert.equal(r.ok, true);
  assert.equal(r.warnings.length, 0);
});

test("blank booking model year → year check skipped", () => {
  const r = compareVin({ modelYear: "2021", make: "TOYOTA", model: "Tundra", errorCode: "0" },
    { vehicle: "Toyota Tundra", modelYear: "" });
  assert.equal(r.ok, true);
});

test("missing decoded fields → no false warnings", () => {
  const r = compareVin({ modelYear: "", make: "", model: "", errorCode: "0" },
    { vehicle: "2021 Toyota Tundra", modelYear: "2021" });
  assert.equal(r.ok, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/vin-guard.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation** — `netlify/functions/lib/vin-guard.js`:

```js
// netlify/functions/lib/vin-guard.js
// Pure: compare a decoded VIN against the booking; return plain-English warnings.
// Advisory only — feeds the close-out guard. No I/O. Each check is skipped when its
// data is absent, so absent data never produces a false warning.
function norm(s) { return String(s == null ? "" : s).toLowerCase().replace(/\s+/g, ""); }

function compareVin(decoded, booking) {
  const d = decoded || {}, b = booking || {};
  const warnings = [];
  // Typo / validity: NHTSA ErrorCode is a comma list; code "1" = check-digit failure.
  const codes = String(d.errorCode == null ? "" : d.errorCode).split(",").map((x) => x.trim());
  if (codes.includes("1")) warnings.push("This VIN may be mistyped — it fails its check digit.");
  // Year mismatch (both present).
  const dy = String(d.modelYear == null ? "" : d.modelYear).trim();
  const by = String(b.modelYear == null ? "" : b.modelYear).trim();
  if (dy && by && dy !== by) warnings.push(`VIN decodes as a ${dy}; booking says ${by}.`);
  // Make/model mismatch: the booking vehicle string should contain the decoded make + model.
  const veh = String(b.vehicle || "");
  const make = String(d.make || "").trim(), model = String(d.model || "").trim();
  const makeBad = make && veh.toLowerCase().indexOf(make.toLowerCase()) < 0;
  const modelBad = model && norm(veh).indexOf(norm(model)) < 0;
  if (make && model && (makeBad || modelBad)) {
    warnings.push(`VIN decodes as ${make} ${model}; booking vehicle is "${veh}".`);
  }
  return { ok: warnings.length === 0, warnings };
}
module.exports = { compareVin };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/vin-guard.test.js`
Expected: PASS (6 tests). Then `npm test` (no new failures).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/vin-guard.js tests/vin-guard.test.js
git commit -m "feat(vin): pure VIN-vs-booking comparator (typo/year/make-model warnings)"
```

---

## Task 2: `vin-decode.js` — auth-gated NHTSA proxy

**Files:**
- Create: `netlify/functions/vin-decode.js`
- Test: `tests/vin-decode.test.js`

- [ ] **Step 1: Write the failing test** — `tests/vin-decode.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processVinDecode } = require("../netlify/functions/vin-decode.js");

const VIN = "5TFDW5F17MX000000"; // 17 chars
function fakeFetch(results) { return async () => ({ ok: true, json: async () => ({ Results: [results] }) }); }

test("year mismatch → not ok, both years in a warning", async () => {
  const out = await processVinDecode(
    { vin: VIN, vehicle: "2024 Toyota Tacoma", modelYear: "2024" },
    { fetchImpl: fakeFetch({ ModelYear: 2021, Make: "TOYOTA", Model: "Tundra", ErrorCode: "0" }) });
  assert.equal(out.ok, false);
  assert.equal(out.unavailable, false);
  assert.ok(out.warnings.some((w) => /2021/.test(w) && /2024/.test(w)));
});

test("clean match → ok, no warnings", async () => {
  const out = await processVinDecode(
    { vin: VIN, vehicle: "2021 Toyota Tundra 5.7L V8", modelYear: "2021" },
    { fetchImpl: fakeFetch({ ModelYear: 2021, Make: "TOYOTA", Model: "Tundra", ErrorCode: "0" }) });
  assert.equal(out.ok, true);
  assert.equal(out.warnings.length, 0);
});

test("NHTSA error → unavailable, non-blocking", async () => {
  const out = await processVinDecode(
    { vin: VIN, vehicle: "2024 Toyota Tacoma", modelYear: "2024" },
    { fetchImpl: async () => { throw new Error("network"); } });
  assert.equal(out.ok, true);
  assert.equal(out.unavailable, true);
});

test("non-17-char VIN → unavailable, fetch not called", async () => {
  let called = false;
  const out = await processVinDecode({ vin: "SHORT", vehicle: "x", modelYear: "" },
    { fetchImpl: async () => { called = true; return { ok: true, json: async () => ({}) }; } });
  assert.equal(out.unavailable, true);
  assert.equal(called, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/vin-decode.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation** — `netlify/functions/vin-decode.js`:

```js
// netlify/functions/vin-decode.js
// Auth-gated proxy over the free NHTSA vPIC VIN decoder. Decodes the entered VIN and
// compares it to the booking (lib/vin-guard) so the close-out console can warn the
// installer before completion. Advisory only — fails OPEN (unavailable, non-blocking)
// on any NHTSA/network problem so a close-out is never trapped. No Airtable.
const { resolveInstaller } = require("./lib/installer-auth.js");
const { compareVin } = require("./lib/vin-guard.js");

const NHTSA = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/";

async function processVinDecode(body, deps) {
  const { fetchImpl = fetch } = deps || {};
  const d = body || {};
  const vin = String(d.vin || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (vin.length !== 17) return { ok: true, unavailable: true, warnings: [] };
  let decoded;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    let res;
    try { res = await fetchImpl(`${NHTSA}${vin}?format=json`, { signal: ctrl.signal }); }
    finally { clearTimeout(timer); }
    if (!res || !res.ok) return { ok: true, unavailable: true, warnings: [] };
    const json = await res.json();
    const r = (json.Results && json.Results[0]) || {};
    decoded = { modelYear: r.ModelYear || "", make: r.Make || "", model: r.Model || "",
      fuel: r.FuelTypePrimary || "", errorCode: r.ErrorCode || "" };
  } catch (e) { return { ok: true, unavailable: true, warnings: [] }; }
  const { ok, warnings } = compareVin(decoded, { vehicle: d.vehicle, modelYear: d.modelYear });
  return { ok, warnings, decoded, unavailable: false };
}

async function handler(event) {
  const key = resolveInstaller(event.headers || {}, process.env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  const out = await processVinDecode(body, {});
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, processVinDecode };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/vin-decode.test.js`
Expected: PASS (4 tests). Then `npm test` (no new failures).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/vin-decode.js tests/vin-decode.test.js
git commit -m "feat(vin): auth-gated NHTSA decode proxy (fails open, non-blocking)"
```

---

## Task 3: Add `modelYear` to the roster payload

**Files:**
- Modify: `netlify/functions/installer-roster.js`
- Test: `tests/installer-roster.test.js`

- [ ] **Step 1: Add a failing test** to `tests/installer-roster.test.js`

Find an existing test that builds a fake record with fields and asserts the mapped booking shape; add an assertion (or a new test in the same style) that the mapped booking includes `modelYear` sourced from `f["Model Year"]`. Example (adapt to the file's existing harness/`list` injection):

```js
test("roster booking exposes modelYear for the VIN guard", async () => {
  const out = await buildRoster({ key: "aaron",
    list: async () => ([{ id: "r1", fields: { Installer: "aaron", City: "X", "Event Date": "2026-07-16",
      Vehicle: "2024 Toyota Tacoma", "Model Year": "2024", Status: "Booked" } }]),
    loadEvents: async () => [] });
  assert.equal(out.bookings[0].modelYear, "2024");
});
```

Run: `node --test tests/installer-roster.test.js` → FAIL (`modelYear` undefined).

- [ ] **Step 2: Implement**

In `netlify/functions/installer-roster.js`, in the object literal that maps each record to a booking (the `recs.map(...)` return), add:

```js
    modelYear: f["Model Year"] || "",
```

(Place it near `vehicle`/`mods`.)

- [ ] **Step 3: Run test to verify it passes**

Run: `node --test tests/installer-roster.test.js` → PASS. Then `npm test`.

- [ ] **Step 4: Commit**

```bash
git add netlify/functions/installer-roster.js tests/installer-roster.test.js
git commit -m "feat(roster): expose modelYear on bookings for the VIN guard"
```

---

## Task 4: Console — VIN decode call, warning, acknowledge-to-override gate

**Files:**
- Modify: `site/installer.html`

No unit test (static page). Match the file's existing vanilla-JS style (`var`, `val`, `esc`, `tok`, `fail`, `STATE`, `document.getElementById`). READ THE FILE FIRST.

- [ ] **Step 1: State + CSS**

- In the `STATE` initializer object, add `vinBlocked:{}`:
```js
var STATE = { today:'', bookings:[], events:[], admin:false, installerFilter:'', q:'', showAllPast:false, eventOpen:{}, walkOpen:{}, vinBlocked:{} };
```
- Add CSS near `.ffnote` in the `<style>` block:
```css
  .vinwarn{background:#fdf0dd;border:1px solid #e6c99a;color:#8a5a12;border-radius:7px;padding:8px 10px;font-size:12.5px;line-height:1.35;margin:2px 0 8px;}
  .vinwarn-h{font-weight:700;margin-bottom:2px;} .vinwarn ul{margin:2px 0 4px;padding-left:18px;}
```

- [ ] **Step 2: Warning container in the card**

In `rowCard(b)` open-booking branch, immediately AFTER the `vin_<id>` input string (and the optional scan button), add a warning container to the `innerHTML`:
```js
'<div id="vinwarn_'+b.id+'" class="vinwarn hidden"></div>'+
```

- [ ] **Step 3: The decode call (module-level functions)**

Add these near the other close-out helpers (module scope):
```js
var vinTimers = {};
function scheduleVinCheck(id){ clearTimeout(vinTimers[id]); vinTimers[id]=setTimeout(function(){ checkVin(id); }, 500); }
async function checkVin(id){
  var b = STATE.bookings.filter(function(x){ return x.id===id; })[0];
  var box = document.getElementById('vinwarn_'+id);
  if(!b || !box) return;
  var vin = val('vin_'+id).toUpperCase().replace(/[^A-Z0-9]/g,'');
  var clear = function(){ box.className='vinwarn hidden'; box.innerHTML=''; STATE.vinBlocked[id]=false; };
  if(vin.length!==17){ clear(); return; }
  try{
    var res = await fetch('/.netlify/functions/vin-decode',{method:'POST',headers:{'Content-Type':'application/json','x-installer-token':tok()},body:JSON.stringify({vin:vin,vehicle:b.vehicle,modelYear:b.modelYear})});
    var out = await res.json().catch(function(){ return {ok:true,warnings:[]}; });
    if(out.ok || !(out.warnings && out.warnings.length)){ clear(); return; }
    STATE.vinBlocked[id]=true;
    box.className='vinwarn';
    box.innerHTML='<div class="vinwarn-h">⚠ Check this VIN</div><ul>'+
      out.warnings.map(function(w){ return '<li>'+esc(w)+'</li>'; }).join('')+'</ul>'+
      '<label class="nsconfirm"><input type="checkbox" id="ackvin_'+id+'"> I’ve verified this VIN is correct</label>';
  }catch(e){ clear(); }   // never block on our own failure
}
```

- [ ] **Step 4: Wire the triggers**

- In `rowCard(b)`, after `c.innerHTML = ...` for the open branch (where the other `c.querySelector(...).onclick` handlers are wired), add:
```js
var vinEl = c.querySelector('#vin_'+b.id);
if(vinEl) vinEl.oninput = function(){ scheduleVinCheck(b.id); };
```
- In `onVin(id, vin)` (the scan-success callback), after it sets `i.value=vin;` and `stopScan(id);`, add an immediate check:
```js
checkVin(id);
```

- [ ] **Step 5: Gate `complete(id)`**

In `async function complete(id)`, AFTER the existing field validations (after the mileage check, just before the `closeout(id, {...})` call), add:
```js
if(STATE.vinBlocked[id]){ var ack=document.getElementById('ackvin_'+id); if(!(ack && ack.checked)){ fail("Double-check the VIN, or tick ‘I’ve verified this VIN is correct’."); return; } }
```

- [ ] **Step 6: Verify**

- Re-read the edited regions to confirm balanced quotes/parens and valid JS.
- Load `/site/installer.html` locally; confirm the passcode gate still renders and the console has no console errors (a syntax error would blank the page). (Full auth flow verifies post-ship.)

- [ ] **Step 7: Commit**

```bash
git add site/installer.html
git commit -m "feat(console): VIN decode guard — inline warning + acknowledge-to-override"
```

---

## Task 5: Full suite + ship

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: all pass (existing + the ~11 new tests).

- [ ] **Step 2: Ship**

Use the `ship` skill: no SEO inputs changed (functions + one static page's JS), so `build:seo` not required; run `npm test`, confirm branch is `master`, push, confirm Netlify `ready`. **No owner setup** — NHTSA needs no key; `INSTALLER_TOKENS` already gates the proxy; nothing new in Airtable/env.

- [ ] **Step 3: Post-ship verification**

- In the live console (with a passcode), open a booking, type a VIN whose year/make deliberately disagrees with the booking → confirm the amber warning lists the mismatch and **Mark complete** is blocked until the "I've verified this VIN is correct" box is ticked.
- Type a matching valid VIN → no warning, completes normally.
- Confirm an unresolvable/garbage VIN or NHTSA hiccup never traps completion.

---

## Owner inputs
**None.** No Airtable columns, no env, no keys.
