# Event-Date Urgency (Funnel Spec B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a truthful event-date urgency line to the booking slot step, keyed to the real event date, above the existing spot-count scarcity.

**Architecture:** Frontend-only, all in `site/find-your-exact-tune.html`: a pure `eventUrgency()` helper (tiered by days-until-event), a `urgencyLine(a)` renderer reading the `availability` response, prepended into `renderSlots`, plus a `.tf-urgency` CSS class. No server, no new files, no dependency.

**Tech Stack:** Static HTML + inline JS, `node:test` (presence checks).

---

## File Structure

- `site/find-your-exact-tune.html` — add CSS (`.tf-urgency`), `eventUrgency()` + `urgencyLine()` helpers, and one render call in `renderSlots`.
- `tests/booking-ui.test.js` — presence test for the hooks + tier phrases.

**Branching:** `feat/event-date-urgency` off `master`.

---

### Task 0: Branch + docs

- [ ] **Step 1**

```bash
git checkout master
git checkout -b feat/event-date-urgency
git add docs/superpowers/specs/2026-06-25-event-date-urgency-design.md docs/superpowers/plans/2026-06-25-event-date-urgency.md
git commit -m "docs: spec + plan for event-date urgency (funnel Spec B)"
```

---

### Task 1: Urgency line on the slot step

**Files:**
- Modify: `site/find-your-exact-tune.html` (CSS near `.tf-scarcity` ~line 226; helpers near `scarcityLine` ~line 828; `renderSlots` ~line 848)
- Test: `tests/booking-ui.test.js`

- [ ] **Step 1: Write the failing test** (append to `tests/booking-ui.test.js`)

```js
test("event-date urgency: hooks + tier phrases present", () => {
  assert.ok(HTML.includes("tf-urgency"), "missing tf-urgency class");
  assert.ok(/function eventUrgency/.test(HTML), "missing eventUrgency() helper");
  assert.ok(/function urgencyLine/.test(HTML), "missing urgencyLine() renderer");
  for (const phrase of ["Lock in your spot", "days left", "event is in", "Tomorrow —"]) {
    assert.ok(HTML.includes(phrase), `missing tier phrase: ${phrase}`);
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/booking-ui.test.js`
Expected: FAIL — `tf-urgency` / helpers absent.

- [ ] **Step 3a: Add the CSS** — in `site/find-your-exact-tune.html`, immediately after the `.tf-scarcity.low::before { ... }` rule (the line ending `vertical-align:middle}`), add:

```css
.tf-urgency{text-align:center;font-family:'Lato';font-weight:800;font-size:13px;letter-spacing:.02em;color:var(--sage-d);margin:0 0 6px}
.tf-urgency.hot{color:#9b4a3a}
```

- [ ] **Step 3b: Add the helpers** — immediately after the `scarcityLine(...)` function (the line that closes it with `}` after the `return ...tf-scarcity...` block), add:

```js
function eventUrgency(o){
  const dateISO=o&&o.dateISO; if(!dateISO) return null;
  const label=(o&&o.label)||dateISO, city=(o&&o.city)||"", now=(o&&o.now)||new Date();
  const ev=new Date(dateISO+"T00:00:00"); if(isNaN(ev)) return null;
  const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const days=Math.round((ev-today)/86400000);
  if(days<0) return null;
  if(days===0) return {tier:"now",text:`⏱ Today — ${city}, ${label}. Lock in your spot.`};
  if(days===1) return {tier:"now",text:`⏱ Tomorrow — ${city}, ${label}. Lock in your spot.`};
  if(days<=3) return {tier:"soon",text:`⏱ Just ${days} days left — ${city}, ${label}.`};
  if(days<=14) return {tier:"approaching",text:`⏱ ${city} event is in ${days} days — ${label}. Lock in your spot.`};
  return {tier:"upcoming",text:`Next ${city} event · ${label} (in ${days} days)`};
}
function urgencyLine(a){
  const u=eventUrgency({dateISO:a&&a.eventDateISO,label:a&&a.eventLabel,city:a&&a.city,now:new Date()});
  return u?`<div class="tf-urgency${u.tier==="now"||u.tier==="soon"?" hot":""}">${u.text}</div>`:"";
}
```

- [ ] **Step 3c: Render it in `renderSlots`** — change the `box.innerHTML` assignment (currently begins `` box.innerHTML=`${sc}<div class="tf-slot-day"> ``) to prepend the urgency line:

```js
  box.innerHTML=`${urgencyLine(a)}${sc}<div class="tf-slot-day">${a.city} · ${day}</div><div class="tf-slotgrid">${open}${taken}</div>`;
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/booking-ui.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add site/find-your-exact-tune.html tests/booking-ui.test.js
git commit -m "feat(funnel): event-date urgency line on the slot step (Spec B)"
```

---

### Task 2: Verify + ship checkpoint

- [ ] **Step 1: Full suite** — Run: `npm test` — Expected: all pass.

- [ ] **Step 2: Behavior sanity** — confirm the tier math with a quick node check of the extracted logic:

```bash
node -e '
function eventUrgency(o){const dateISO=o&&o.dateISO; if(!dateISO) return null; const label=(o&&o.label)||dateISO, city=(o&&o.city)||"", now=(o&&o.now)||new Date(); const ev=new Date(dateISO+"T00:00:00"); if(isNaN(ev)) return null; const today=new Date(now.getFullYear(),now.getMonth(),now.getDate()); const days=Math.round((ev-today)/86400000); if(days<0) return null; if(days===0) return {tier:"now"}; if(days===1) return {tier:"now"}; if(days<=3) return {tier:"soon"}; if(days<=14) return {tier:"approaching"}; return {tier:"upcoming"};}
const now=new Date("2026-06-25T12:00:00");
for(const d of ["2026-06-20","2026-06-25","2026-06-26","2026-06-28","2026-07-03","2026-07-20"]){
  console.log(d, "->", JSON.stringify(eventUrgency({dateISO:d,city:"X",now})));
}
'
```
Expected: `2026-06-20 -> null` (past); `06-25 -> now`; `06-26 -> now`; `06-28 -> soon`; `07-03 -> approaching`; `07-20 -> upcoming`.

- [ ] **Step 3: SEO build idempotency** — Run: `npm run build:seo` then `git checkout -- site/` (drop LF churn); confirm only intended change committed.

- [ ] **Step 4: STOP — ship checkpoint.** Do NOT push. This branch is independent and has **no setup prerequisites** (pure frontend) — it could ship on its own immediately, or bundle with the held branches. Merge `feat/event-date-urgency` → `master` + push per `ship` skill when ready; verify on the live slot step that the urgency line shows with the correct countdown.

---

## Self-Review

**Spec coverage:** tiered `eventUrgency` with today/tomorrow/≤3/4–14/≥15/past (Task 1 Step 3b) ✓; slot-step placement above scarcity in `renderSlots` (Step 3c) ✓; `.tf-urgency` + `.hot` styling (Step 3a) ✓; truthful, no fake-deadline copy ✓; null on past/no-event ✓; frontend-only, no new files/deps ✓; presence tests (Step 1) + boundary sanity (Task 2 Step 2) ✓.

**Placeholder scan:** none — full code in every step.

**Type/name consistency:** `eventUrgency({dateISO,label,city,now})` → `{tier,text}|null` used by `urgencyLine(a)` which reads `a.eventDateISO/eventLabel/city` (the `availability` response shape from `availability.js`). `.tf-urgency`/`.hot` class names match CSS and renderer. `renderSlots` edit preserves the existing `${sc}` scarcity and slot grid.
