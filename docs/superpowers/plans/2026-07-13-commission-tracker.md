# Live Commission Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a live running-month OTT commission total in the installer console header (installer sees own, admin sees roll-up + last-month + due-by-7th), computed from the existing price-sheet engine.

**Architecture:** The roster resolves per-completed-booking commission server-side (existing `lib/ott-commission.js`), so privacy is enforced by the roster's existing scoping. A pure shared aggregator (`site/commission-tally.js`, browser + Node) sums it into month/last-month/lifetime/by-installer, and `renderTally` in `installer.html` renders it.

**Tech Stack:** Node.js (CommonJS), `node --test` + `node:assert/strict`, the existing OTT commission engine, vanilla-JS console page.

**Spec:** `docs/superpowers/specs/2026-07-13-commission-tracker-design.md`

**Conventions:** one test file `node --test tests/<f>.test.js`; full suite `npm test`. Commit per task. Confirm `git branch --show-current` before committing. Fresh-worktree-only pre-existing failure to ignore: `tests/magnuson-schema-image.test.js`. Reused: `deriveVehicle`/`resolveCommission` from `netlify/functions/lib/ott-commission.js`; `buildRoster` (injected `list`/`loadEvents`) from `installer-roster.js`; the dual browser/Node export pattern from `site/amsoil-referral.js`.

---

## File Structure

**Create:**
- `site/commission-tally.js` — pure shared aggregator (browser + Node).
- Test: `tests/commission-tally.test.js`.

**Modify:**
- `netlify/functions/installer-roster.js` — add `commission` per completed booking (+ test in `tests/installer-roster.test.js`).
- `site/installer.html` — include the script, add `money()`, render commission in `renderTally`.

---

## Task 1: `commission-tally.js` — pure aggregator

**Files:**
- Create: `site/commission-tally.js`
- Test: `tests/commission-tally.test.js`

- [ ] **Step 1: Write the failing test** — `tests/commission-tally.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { commissionTally, prevYm } = require("../site/commission-tally.js");

const bk = (o) => Object.assign({ status: "Completed", dateISO: "2026-07-10", installer: "aaron", commission: 100 }, o);

test("current-month total, tunes, pending, byInstaller", () => {
  const t = commissionTally([
    bk({ commission: 160 }),
    bk({ commission: 250, installer: "noah" }),
    bk({ commission: null }),                        // ambiguous -> pending
    bk({ dateISO: "2026-06-15", commission: 300 }),  // last month
    bk({ status: "Booked", commission: 999 }),       // not completed -> ignored
  ], "2026-07");
  assert.equal(t.month.total, 410);
  assert.equal(t.month.tunes, 3);
  assert.equal(t.month.pending, 1);
  assert.equal(t.lastMonth.total, 300);
  assert.equal(t.lifetime.total, 710);
  assert.equal(t.byInstaller.aaron, 160);
  assert.equal(t.byInstaller.noah, 250);
});

test("$0 counts as resolved, not pending", () => {
  const t = commissionTally([bk({ commission: 0 })], "2026-07");
  assert.equal(t.month.total, 0);
  assert.equal(t.month.tunes, 1);
  assert.equal(t.month.pending, 0);
});

test("prevYm: January rolls to prior December", () => {
  assert.equal(prevYm("2026-01"), "2025-12");
  const t = commissionTally([bk({ dateISO: "2025-12-20", commission: 100 })], "2026-01");
  assert.equal(t.lastMonth.total, 100);
});

test("empty -> zeros", () => {
  const t = commissionTally([], "2026-07");
  assert.equal(t.month.total, 0);
  assert.equal(t.lifetime.total, 0);
  assert.deepEqual(t.byInstaller, {});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/commission-tally.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation** — `site/commission-tally.js`:

```js
// site/commission-tally.js
/* TUNED YOTA — pure commission aggregation for the installer console header.
   Sums the per-booking `commission` the roster already resolved server-side (from the
   OTT price sheet). No price sheet here — just arithmetic. Loaded in the browser
   (window) and required by Node (tests), like site/amsoil-referral.js. */
(function (root) {
  function ymOf(iso) { return String(iso == null ? "" : iso).slice(0, 7); }
  function prevYm(ym) {
    var p = String(ym).split("-"), y = +p[0], m = +p[1];
    m -= 1; if (m < 1) { m = 12; y -= 1; }
    return y + "-" + String(m).padStart(2, "0");
  }
  function commissionTally(bookings, curYm) {
    var cur = String(curYm), last = prevYm(cur);
    var t = { month: { total: 0, tunes: 0, pending: 0 }, lastMonth: { total: 0 }, lifetime: { total: 0 }, byInstaller: {} };
    (bookings || []).forEach(function (b) {
      if (!b || b.status !== "Completed") return;
      var m = ymOf(b.dateISO), c = b.commission, resolved = typeof c === "number";
      if (resolved) t.lifetime.total += c;
      if (m === cur) {
        t.month.tunes += 1;
        if (resolved) { t.month.total += c; var k = b.installer || ""; if (k) t.byInstaller[k] = (t.byInstaller[k] || 0) + c; }
        else t.month.pending += 1;
      } else if (m === last && resolved) {
        t.lastMonth.total += c;
      }
    });
    return t;
  }
  var api = { commissionTally: commissionTally, prevYm: prevYm };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") { window.commissionTally = commissionTally; }
})(typeof globalThis !== "undefined" ? globalThis : this);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/commission-tally.test.js`
Expected: PASS (4 tests). Then `npm test` (no new failures).

- [ ] **Step 5: Commit**

```bash
git add site/commission-tally.js tests/commission-tally.test.js
git commit -m "feat(commission): pure shared tally aggregator (month/last/lifetime/by-installer)"
```

---

## Task 2: Resolve commission per booking in the roster

**Files:**
- Modify: `netlify/functions/installer-roster.js`
- Test: `tests/installer-roster.test.js`

- [ ] **Step 1: Add failing tests** to `tests/installer-roster.test.js`

READ `tests/ott-commission.test.js` first to find a vehicle + fields (`Vehicle`, `Model Year`, `Tuning Platform`, `Calibration Type`) that `resolveCommission` returns a NUMBER for. Use that real combo in the first test below (replace the `<...>` placeholders with the confirmed values). Match the file's existing `buildRoster` harness (injected `list`/`loadEvents`):

```js
test("roster resolves OTT commission for a completed booking", async () => {
  const out = await buildRoster({ key: "aaron",
    list: async () => ([{ id: "r1", fields: {
      Installer: "aaron", City: "X", "Event Date": "2026-07-16", Status: "Completed",
      Vehicle: "<resolvable vehicle string>", "Model Year": "<year>",
      "Tuning Platform": "<TP>", "Calibration Type": "<type>" } }]),
    loadEvents: async () => [] });
  assert.equal(typeof out.bookings[0].commission, "number");
});

test("non-completed booking has null commission", async () => {
  const out = await buildRoster({ key: "aaron",
    list: async () => ([{ id: "r2", fields: {
      Installer: "aaron", City: "X", "Event Date": "2026-07-16", Status: "Booked",
      Vehicle: "2021 Toyota Tundra" } }]),
    loadEvents: async () => [] });
  assert.equal(out.bookings[0].commission, null);
});
```

Run: `node --test tests/installer-roster.test.js` → FAIL (`commission` undefined).

- [ ] **Step 2: Implement**

In `netlify/functions/installer-roster.js`:
- Add the import near the top:
```js
const { deriveVehicle, resolveCommission } = require("./lib/ott-commission.js");
```
- Inside the `recs.map((r) => { ... })` callback (where `f = r.fields || {}` is available), before the `return {...}`, compute:
```js
    let commission = null;
    if (f.Status === "Completed") {
      const dv = deriveVehicle(f.Vehicle || "");
      commission = resolveCommission({
        vehicleType: dv.vehicleType, engine: dv.engine,
        year: f["Model Year"] || dv.year,
        tuningPlatform: f["Tuning Platform"], calibrationType: f["Calibration Type"],
      });
    }
```
- Add `commission,` to the returned booking object (near `mileage`).

- [ ] **Step 3: Run tests to verify they pass**

Run: `node --test tests/installer-roster.test.js` → PASS. Then `npm test` (only the known magnuson failure may remain).

- [ ] **Step 4: Commit**

```bash
git add netlify/functions/installer-roster.js tests/installer-roster.test.js
git commit -m "feat(roster): resolve per-completed-booking OTT commission for the tracker"
```

---

## Task 3: Render the commission tracker in the console header

**Files:**
- Modify: `site/installer.html`

No unit test (static page). Match the file's vanilla-JS style. READ THE FILE FIRST (esp. `renderTally`, `esc`, `cap`, `ym`, `money`-absence, `STATE`).

- [ ] **Step 1: Include the aggregator + add `money()`**

- In `<head>`, add: `<script src="/commission-tally.js"></script>`
- Near the other small helpers (`val`, `esc`, `ym`, `cap`), add:
```js
function money(n){ return '$' + Math.round(n || 0).toLocaleString('en-US'); }
```

- [ ] **Step 2: Render commission in `renderTally()`**

In `renderTally()`, after the existing `mDone/mOpen/mNo/life` loop and the `next` computation, REPLACE the final `host.innerHTML = ...` assignment with:
```js
    var ct = (window.commissionTally
      ? window.commissionTally(visibleBookings(), mo)
      : { month:{total:0,tunes:0,pending:0}, lastMonth:{total:0}, lifetime:{total:0}, byInstaller:{} });
    var adminLines = '';
    if(STATE.admin && !STATE.installerFilter){
      var keys = Object.keys(ct.byInstaller).sort();
      if(keys.length) adminLines += '<span>'+keys.map(function(k){ return esc(cap(k))+' '+money(ct.byInstaller[k]); }).join(' · ')+'</span>';
      adminLines += '<span>Last month · est. <b>'+money(ct.lastMonth.total)+'</b> — report due by the 7th</span>';
    }
    host.innerHTML=
      '<span>This month <b class="g">'+mDone+'</b> done · <b class="o">'+mOpen+'</b> open'+(mNo?' · <b class="r">'+mNo+'</b> no-show':'')+'</span>'+
      '<span>This month · est. <b>'+money(ct.month.total)+'</b> · '+ct.month.tunes+' tunes'+(ct.month.pending?' · '+ct.month.pending+' pending':'')+'</span>'+
      '<span>Lifetime <b>'+life+'</b> tunes ✓ · <b>'+money(ct.lifetime.total)+'</b> commission</span>'+
      adminLines+
      (next?'<span class="next">Next: '+esc(next.city)+' · '+esc(relDate(next.dateISO))+'</span>':'');
```
(Keep the `var who = ...` installer-dropdown block at the top of `renderTally` exactly as it is — this only replaces the final `host.innerHTML` assignment.)

- [ ] **Step 3: Verify**

- `npm test` (unchanged — no new failures).
- Re-read the edited region to confirm balanced quotes/parens and valid JS.
- Load `/site/installer.html` locally; confirm the passcode gate renders and there are no console errors.

- [ ] **Step 4: Commit**

```bash
git add site/installer.html
git commit -m "feat(console): live commission tracker in the header (est. month + lifetime + admin roll-up)"
```

---

## Task 4: Full suite + ship

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: all pass (existing + the ~6 new tests).

- [ ] **Step 2: Ship**

Use the `ship` skill: no SEO inputs changed (a JS asset + `installer.html`, which is `noindex`), so `build:seo` not required; run `npm test`, confirm branch is `master`, push, confirm Netlify `ready`. **No owner setup** — no Airtable columns, no env.

- [ ] **Step 3: Post-ship verification**

- Log into the live console as an installer → confirm the header shows *"This month · est. $X · N tunes"* (+ pending if any) and lifetime commission, and that it's **only that installer's** number.
- Log in as admin (Aaron) → confirm the per-installer breakdown + *"Last month · est. $Y — report due by the 7th"*; use the installer-filter dropdown → confirm the figure narrows to the selected installer.

---

## Owner inputs
**None.** No Airtable columns, no env — reads existing bookings through the existing commission engine.
