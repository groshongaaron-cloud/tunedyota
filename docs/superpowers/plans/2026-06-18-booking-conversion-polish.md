# Booking-flow Conversion Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add truthful social proof + live scarcity + booking-moment craft to `site/find-your-exact-tune.html` to lift booking conversion, without restructuring the funnel.

**Architecture:** All changes are inside the page's existing inline `<style>` and inline `<script>` (the page is intentionally self-contained). New JS helpers (`REVIEWS`, `pickReview`, `proofCard`, `scarcityLine`) drive the additions; injection points are the existing `renderResult()`, `prepBooking()`, `renderSlots()`, `updateBookCta()`, and `bookSuccess()` functions plus the step-4/step-5 markup. A static guard test reads the HTML to assert truthfulness parity (real review text present) and that the CSS/markup hooks exist. No backend files change.

**Tech Stack:** Static HTML + inline CSS/JS, brand design tokens (CSS vars `--card`/`--line`/`--r`/`--sage`/`--blue`/`--sand`/`--brown`/`--ink`), `node:test` for the guard.

---

## File Structure

- `site/find-your-exact-tune.html` — **modified.** All UI/logic (CSS block, step-4/5 markup, inline JS helpers + injection).
- `tests/booking-ui.test.js` — **new.** Static guard: asserts the four real reviews' verbatim phrases are present and the `tf-proof` / `tf-scarcity` / `tf-success-check` / `proofResult` / `proofBook` hooks exist.

**Review data parity:** the `REVIEWS` array mirrors the four reviews in `index.html`'s `AutomotiveBusiness` schema. The text is faithfully trimmed (sentences removed, wording kept). The guard test pins one verbatim phrase per review so drift/fabrication fails CI.

---

### Task 1: Guard test (TDD target — fails red)

**Files:**
- Create: `tests/booking-ui.test.js`

- [ ] **Step 1: Write the guard test**

```js
// tests/booking-ui.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const HTML = fs.readFileSync(path.join(__dirname, "..", "site", "find-your-exact-tune.html"), "utf8");

test("real review phrases are present (truthfulness parity with schema)", () => {
  for (const phrase of [
    "smoothest it's ever been",                 // S. Berry
    "throttle control and smoother gear shifts", // H. Aguirre
    "feels like a v8 now",                       // C. Vang
    "classy operation",                          // J. Mayer
  ]) {
    assert.ok(HTML.includes(phrase), `missing review phrase: ${phrase}`);
  }
});

test("conversion-polish hooks exist", () => {
  for (const hook of ["tf-proof", "tf-scarcity", "tf-success-check", 'id="proofResult"', 'id="proofBook"']) {
    assert.ok(HTML.includes(hook), `missing hook: ${hook}`);
  }
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `node --test tests/booking-ui.test.js`
Expected: FAIL — none of the phrases/hooks exist yet.

- [ ] **Step 3: Commit the red target**

```bash
git add tests/booking-ui.test.js
git commit -m "test(booking): guard for review parity + conversion-polish hooks (red)"
```

---

### Task 2: Social proof

**Files:**
- Modify: `site/find-your-exact-tune.html`

- [ ] **Step 1: Add the `.tf-proof` CSS.** Insert immediately after the `.tf-slot-day{...}` rule (search for `.tf-slot-day{text-align:center`):

```css
.tf-proof{background:var(--card);border:1.5px solid var(--line);border-radius:var(--r);padding:16px 18px;box-shadow:var(--shadow-sm);margin:14px 0}
.tf-proof .stars{color:#E3B341;font-size:14px;letter-spacing:2px;margin-bottom:6px}
.tf-proof blockquote{font-family:'Spectral',serif;font-size:15.5px;line-height:1.5;color:var(--ink);margin:0 0 10px}
.tf-proof figcaption{display:flex;align-items:center;gap:9px;font-size:13px;font-weight:700;color:var(--brown)}
.tf-proof .av{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:var(--sage);color:#fff;font-size:12px;font-weight:900}
.tf-proof .vf{margin-left:auto;font-family:'Lato';font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--sage-d)}
```

- [ ] **Step 2: Add the data + builders.** Insert right after the line `const BOOK={avail:null,slot:null,reason:null};`:

```js
/* verified reviews — mirrors index.html AutomotiveBusiness schema; keep in sync */
const REVIEWS=[
  {name:"S. Berry",make:"toyota",text:"Dropped in to a scheduled local tuning event for the latest OTT calibration on my Tacoma — trans up/down shifts and power delivery is the smoothest it's ever been."},
  {name:"H. Aguirre",make:"toyota",text:"We recently had our Toyota Tacoma TRD Pro tuned, and the difference is fantastic. You'll notice improvements in throttle control and smoother gear shifts."},
  {name:"C. Vang",make:"lexus",text:"Had my 2020 Lexus GX 460 tuned by Noah — knowledgeable, professional, and it actually feels like a v8 now. Should have done it sooner."},
  {name:"J. Mayer",make:"any",text:"Very classy operation. Had my OTT tune without issues for years, with free support and updates."}
];
let proofResultName="";
function pickReview(make,used){
  const m=String(make||"").toLowerCase();
  const pool=REVIEWS.filter(r=>!used||used.indexOf(r.name)<0);
  return pool.find(r=>r.make===m)||pool.find(r=>r.make==="any")||pool[0]||REVIEWS[0];
}
function proofCard(r){
  const init=r.name.replace(/[^A-Za-z]/g,"").slice(0,1).toUpperCase();
  return `<figure class="tf-proof"><div class="stars" aria-hidden="true">★★★★★</div>`+
    `<blockquote>"${r.text}"</blockquote>`+
    `<figcaption><span class="av">${init}</span>${r.name}<span class="vf">5.0 ★ verified</span></figcaption></figure>`;
}
```

- [ ] **Step 3: Add the markup hooks.** Two edits in the step markup.

Step 4 — insert a proof container between the trust block and the CTA row. Replace:
```html
    <div class="tf-cta-row">
      <button class="btn primary" id="toBook">Book at an Event →</button>
```
with:
```html
    <div id="proofResult"></div>
    <div class="tf-cta-row">
      <button class="btn primary" id="toBook">Book at an Event →</button>
```

Step 5 — insert a proof container above the form. Replace:
```html
    <div class="tf-or">or send a request</div>

    <div id="leadForm">
```
with:
```html
    <div class="tf-or">or send a request</div>

    <div id="proofBook"></div>

    <div id="leadForm">
```

- [ ] **Step 4: Populate the containers.**

In `renderResult()`, immediately after the `cards.innerHTML=` block ends (after the `</div>`; line that closes the recommended-calibration card assignment) and before the `if(S.cfg.fi){` block, add:
```js
  const rr=pickReview(S.make,[]); proofResultName=rr.name;
  $("#proofResult").innerHTML=proofCard(rr);
```

In `prepBooking()`, after the line `$("#fVeh").value=...;`, add:
```js
  $("#proofBook").innerHTML=proofCard(pickReview(S.make,[proofResultName]));
```

- [ ] **Step 5: Verify review parity test passes + flow intact**

Run: `node --test tests/booking-ui.test.js 2>&1 | grep -E "review phrases|pass|fail"`
Expected: the "real review phrases" test PASSES (the hooks test still partially fails until Task 3/4).
Run: `node --test tests/booking.test.js 2>&1 | grep -E "pass|fail"` is N/A — instead run full suite to confirm no regressions: `npm test 2>&1 | tail -3` → all prior tests still pass.

- [ ] **Step 6: Commit**

```bash
git add site/find-your-exact-tune.html
git commit -m "feat(booking): social proof from verified reviews at result + booking steps"
```

---

### Task 3: Live scarcity

**Files:**
- Modify: `site/find-your-exact-tune.html`

- [ ] **Step 1: Add `.tf-scarcity` CSS.** Insert after the `.tf-proof .vf{...}` rule added in Task 2:

```css
.tf-scarcity{text-align:center;font-family:'Lato';font-weight:800;font-size:13px;letter-spacing:.02em;color:var(--sage-d);margin:0 0 10px}
.tf-scarcity.low{color:#9b4a3a}
.tf-scarcity.low::before{content:"●";margin-right:7px;color:#c2603f;font-size:10px;vertical-align:middle}
```

- [ ] **Step 2: Add the `scarcityLine` helper.** Insert right after the `proofCard` function from Task 2:

```js
function scarcityLine(openCount,total,city,label){
  if(!openCount) return "";
  const low=openCount<=4;
  const txt=low?`Only ${openCount} spot${openCount===1?"":"s"} left`:`${openCount} of ${total} times open`;
  return `<div class="tf-scarcity${low?" low":""}">${txt} — ${city}, ${label}</div>`;
}
```

- [ ] **Step 3: Render it in `renderSlots`.** Replace:
```js
  box.innerHTML=`<div class="tf-slot-day">${a.city} · ${day}</div><div class="tf-slotgrid">${open}${taken}</div>`;
```
with:
```js
  const sc=scarcityLine((a.openSlots||[]).length, Object.keys(a.slotLabels||{}).length||12, a.city, day);
  box.innerHTML=`${sc}<div class="tf-slot-day">${a.city} · ${day}</div><div class="tf-slotgrid">${open}${taken}</div>`;
```

- [ ] **Step 4: Verify**

Run: `node --test tests/booking-ui.test.js 2>&1 | grep -E "hooks|pass|fail"`
Expected: the "hooks" test now finds `tf-scarcity` (still fails on `tf-success-check` until Task 4).
Sanity-check the copy logic without a browser:
```bash
node -e "const f=s=>s; const openCount=3,total=12,city='Sioux Falls',label='Jul 12'; const low=openCount<=4; console.log(low?('Only '+openCount+' spots left — '+city+', '+label):'')"
```
Expected: `Only 3 spots left — Sioux Falls, Jul 12`

- [ ] **Step 5: Commit**

```bash
git add site/find-your-exact-tune.html
git commit -m "feat(booking): live 'only N spots left' scarcity on the slot grid"
```

---

### Task 4: Booking-moment craft

**Files:**
- Modify: `site/find-your-exact-tune.html`

- [ ] **Step 1: Add craft CSS.** Insert after the `.tf-scarcity` rules:

```css
.tf-slot.sel{position:relative}
.tf-slot.sel::after{content:"✓";position:absolute;top:4px;right:6px;font-size:11px;font-weight:900;color:#fff;opacity:.9}
.btn.ready{animation:ctaPulse 1.6s var(--ease-out) 2}
@keyframes ctaPulse{0%,100%{box-shadow:var(--shadow-sm)}50%{box-shadow:0 0 0 4px var(--ring)}}
.tf-success-check{width:54px;height:54px;border-radius:50%;background:var(--sage);color:#fff;display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 12px;animation:popCheck .45s var(--ease-out) both}
@keyframes popCheck{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}
@media (prefers-reduced-motion:reduce){.btn.ready{animation:none}.tf-success-check{animation:none}}
```

- [ ] **Step 2: Emphasize the confirm CTA.** Replace the whole `updateBookCta` function:
```js
function updateBookCta(){
  const btn=$("#fSubmit"), a=BOOK.avail;
  if(a && a.hasEvent && !a.full && !a.error) btn.textContent=BOOK.slot?"Confirm Booking →":"Pick a time above";
  else btn.textContent="Join the Priority Wait List →";
}
```
with:
```js
function updateBookCta(){
  const btn=$("#fSubmit"), a=BOOK.avail;
  const ready=!!(a && a.hasEvent && !a.full && !a.error);
  if(ready) btn.textContent=BOOK.slot?"Confirm Booking →":"Pick a time above";
  else btn.textContent="Join the Priority Wait List →";
  btn.classList.toggle("ready", ready && !!BOOK.slot);
}
```

- [ ] **Step 3: Add the success check element.** In the step-5 success container, replace the opening tag:
```html
    <div class="tf-success" id="leadSuccess">
```
with:
```html
    <div class="tf-success" id="leadSuccess">
      <div class="tf-success-check" aria-hidden="true">✓</div>
```

- [ ] **Step 4: Verify guard test fully passes**

Run: `node --test tests/booking-ui.test.js 2>&1 | tail -4`
Expected: both tests PASS (all phrases + all hooks present).
Run: `npm test 2>&1 | tail -3`
Expected: full suite green.

- [ ] **Step 5: Commit**

```bash
git add site/find-your-exact-tune.html
git commit -m "feat(booking): selected-slot check, confirm-CTA emphasis, success animation"
```

---

### Task 5: Verify + deploy

- [ ] **Step 1: Full suite**

Run: `npm test 2>&1 | tail -3`
Expected: all pass (existing + `booking-ui` 2).

- [ ] **Step 2: Serve for visual review**

Run: `npx netlify dev --offline` (background). Owner opens `http://localhost:8888/find-your-exact-tune`, walks the wizard to the **result** step (proof card visible) and the **booking** step (proof card above the form). Scarcity needs live availability — verify against production after deploy, or temporarily stub the `availability` fetch response in `loadAvailability` during local review (e.g. hardcode `a={hasEvent:true,full:false,city:"Sioux Falls",eventLabel:"Jul 12",openSlots:["9:00","9:20","9:40"],takenSlots:[],slotLabels:{"9:00":"9:00 AM"}}` and call `renderSlots(a)` from the console). Revert any stub before committing.

- [ ] **Step 3: Functional check**

Confirm the booking flow still completes: the existing `tests/book.test.js` (backend) is untouched and green; the page's `#fSubmit` path is unchanged except CTA class toggling. Manually click through select → Confirm Booking on the served site (will hit the offline function; verify no JS console errors and the success state renders).

- [ ] **Step 4: Deploy**

Use **superpowers:finishing-a-development-branch** to merge to `master` and push (triggers Netlify production deploy). After deploy `ready`, verify live: `curl -s https://tunedyota.com/find-your-exact-tune | grep -c 'tf-proof'` → ≥1.

- [ ] **Step 5: Owner confirms scarcity on production**

On a city with a live event, confirm the "Only N spots left" line renders above the slot grid.

---

## Self-Review

**Spec coverage:**
- Social proof (real reviews, result + booking, contextual by make, "5.0 ★ verified", no count) → Task 2. ✓
- Live scarcity (≤4 emphasized, neutral otherwise, from `openSlots`) → Task 3. ✓
- Booking-moment craft (slot check, confirm emphasis, success animation, reduced-motion) → Task 4. ✓
- Truthfulness (verbatim phrases pinned) → Task 1 guard + Task 2 data. ✓
- Light guard test → Task 1. ✓
- Visual + functional verification, deploy → Task 5. ✓
- No backend changes → confirmed (only `find-your-exact-tune.html` + new test). ✓

**Placeholder scan:** No TBD/TODO; every step shows exact code and anchors; commands have expected output.

**Type/name consistency:** `REVIEWS`, `pickReview(make, used)`, `proofCard(r)`, `proofResultName`, `scarcityLine(openCount, total, city, label)`, hooks `#proofResult`/`#proofBook`/`.tf-proof`/`.tf-scarcity`/`.tf-success-check`/`.btn.ready` are used identically across the plan and the guard test. Injection sites (`renderResult`, `prepBooking`, `renderSlots`, `updateBookCta`, `#leadSuccess`) match the current file.
