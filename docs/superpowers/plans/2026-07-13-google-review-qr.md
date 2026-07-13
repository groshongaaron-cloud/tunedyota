# Google-Review QR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A one-tap "Ask for a review" in the installer console that shows a full-screen QR the customer scans to open the Tuned Yota Google review form.

**Architecture:** A public `review-qr` function renders `env.GOOGLE_REVIEW_URL` as an SVG QR via the existing `lib/qr.js`; the roster exposes `reviewUrl` so the console shows the button only when configured; `installer.html` renders the header link + a full-screen overlay.

**Tech Stack:** Node.js (CommonJS), `node --test` + `node:assert/strict`, Netlify Functions, the vendored `lib/qr.js` QR encoder, vanilla-JS console page.

**Spec:** `docs/superpowers/specs/2026-07-13-google-review-qr-design.md`

**Conventions:** one test file `node --test tests/<f>.test.js`; full suite `npm test`. Commit per task. Confirm `git branch --show-current` before committing. Fresh-worktree-only pre-existing failure to ignore: `tests/magnuson-schema-image.test.js`. Reused: `qrSvg` from `netlify/functions/lib/qr.js`; `buildRoster` (injected `list`/`loadEvents`, `env`) from `installer-roster.js`.

---

## File Structure

**Create:**
- `netlify/functions/review-qr.js` — public SVG-QR of the configured review URL.
- Test: `tests/review-qr.test.js`.

**Modify:**
- `netlify/functions/installer-roster.js` — add `reviewUrl` to the roster response (+ test).
- `site/installer.html` — header link + full-screen QR overlay.

---

## Task 1: `review-qr.js` — render the review URL as a QR

**Files:**
- Create: `netlify/functions/review-qr.js`
- Test: `tests/review-qr.test.js`

- [ ] **Step 1: Write the failing test** — `tests/review-qr.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildReviewQr } = require("../netlify/functions/review-qr.js");

test("renders an SVG QR when the review url is set", () => {
  const out = buildReviewQr({ GOOGLE_REVIEW_URL: "https://g.page/r/abc123/review" });
  assert.equal(out.ok, true);
  assert.match(out.svg, /^<svg /);
  assert.ok((out.svg.match(/<rect/g) || []).length > 10);
});

test("not ok when unset or blank", () => {
  assert.equal(buildReviewQr({}).ok, false);
  assert.equal(buildReviewQr({ GOOGLE_REVIEW_URL: "   " }).ok, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/review-qr.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation** — `netlify/functions/review-qr.js`:

```js
// netlify/functions/review-qr.js
// Public: render the configured Google review URL (env GOOGLE_REVIEW_URL) as an inline
// SVG QR for the installer console's "Ask for a review" overlay. Reuses lib/qr.js.
// Public on purpose — a review link is public info, so the console loads it via <img>.
const { qrSvg } = require("./lib/qr.js");

function buildReviewQr(env = process.env) {
  const url = String((env && env.GOOGLE_REVIEW_URL) || "").trim();
  if (!url) return { ok: false };
  return { ok: true, svg: qrSvg(url) };
}

async function handler() {
  const out = buildReviewQr(process.env);
  if (!out.ok) return { statusCode: 404, headers: { "Content-Type": "text/plain" }, body: "review url not configured" };
  return { statusCode: 200, headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=300" }, body: out.svg };
}
module.exports = { handler, buildReviewQr };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/review-qr.test.js`
Expected: PASS (2 tests). Then `npm test` (no new failures).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/review-qr.js tests/review-qr.test.js
git commit -m "feat(review): public review-qr function (SVG QR of GOOGLE_REVIEW_URL)"
```

---

## Task 2: Expose `reviewUrl` on the roster

**Files:**
- Modify: `netlify/functions/installer-roster.js`
- Test: `tests/installer-roster.test.js`

- [ ] **Step 1: Add failing tests** to `tests/installer-roster.test.js` (match the file's existing `buildRoster` harness):

```js
test("roster exposes reviewUrl from env", async () => {
  const out = await buildRoster({ key: "aaron",
    env: { GOOGLE_REVIEW_URL: "https://g.page/r/x/review" },
    list: async () => [], loadEvents: async () => [] });
  assert.equal(out.reviewUrl, "https://g.page/r/x/review");
});

test("roster reviewUrl is empty when unset", async () => {
  const out = await buildRoster({ key: "aaron",
    env: {}, list: async () => [], loadEvents: async () => [] });
  assert.equal(out.reviewUrl, "");
});
```

Run: `node --test tests/installer-roster.test.js` → FAIL (`reviewUrl` undefined).

- [ ] **Step 2: Implement**

In `netlify/functions/installer-roster.js`, in the object `buildRoster` returns (currently `return { installer: key, admin: !!admin, today, bookings, events };`), add `reviewUrl`:

```js
  return { installer: key, admin: !!admin, today, bookings, events,
    reviewUrl: String((env.GOOGLE_REVIEW_URL || "")).trim() };
```
(`env` is already destructured in `buildRoster`'s deps.)

- [ ] **Step 3: Run tests to verify they pass**

Run: `node --test tests/installer-roster.test.js` → PASS. Then `npm test` (only the known magnuson failure may remain).

- [ ] **Step 4: Commit**

```bash
git add netlify/functions/installer-roster.js tests/installer-roster.test.js
git commit -m "feat(roster): expose reviewUrl so the console can show the review button"
```

---

## Task 3: Console — "Ask for a review" link + QR overlay

**Files:**
- Modify: `site/installer.html`

No unit test (static page). Match the file's vanilla-JS style. READ THE FILE FIRST.

- [ ] **Step 1: State + CSS**

- In the `STATE` initializer, add `reviewUrl:''`:
```js
var STATE = { today:'', bookings:[], events:[], admin:false, installerFilter:'', q:'', showAllPast:false, eventOpen:{}, walkOpen:{}, vinBlocked:{}, reviewUrl:'' };
```
(If `vinBlocked` isn't present because B2 shape differs, just append `reviewUrl:''` to the existing object.)
- Add CSS near the other overlay/rules in `<style>`:
```css
  .reviewov{display:none;position:fixed;inset:0;background:rgba(25,28,30,.75);z-index:50;align-items:center;justify-content:center;padding:20px;}
  .reviewbox{background:#fff;border-radius:14px;padding:22px;max-width:360px;width:100%;text-align:center;}
  .reviewh{font-weight:800;color:var(--accent);font-size:16px;margin-bottom:14px;}
  .reviewqr{width:70vw;max-width:300px;height:auto;display:block;margin:0 auto 12px;border:1px solid var(--line);border-radius:8px;}
```

- [ ] **Step 2: Header link**

In the `#app` block, next to the existing `Calibration reference` / `Log out` links, add a hidden review link:
```html
    <a class="link" href="#" id="reviewlink" style="display:none;margin-left:14px">★ Ask for a review</a>
```

- [ ] **Step 3: Overlay open/close (module scope)**

Add near the other helpers:
```js
function openReviewOverlay(){
  var ov = document.getElementById('reviewov');
  if(!ov){
    ov = document.createElement('div'); ov.id = 'reviewov'; ov.className = 'reviewov';
    ov.innerHTML = '<div class="reviewbox">'+
      '<div class="reviewh">Scan to review us on Google ★★★★★</div>'+
      '<img class="reviewqr" src="/.netlify/functions/review-qr" alt="Scan to review Tuned Yota on Google">'+
      '<a class="link" href="'+esc(STATE.reviewUrl)+'" target="_blank" rel="noopener">or tap here to review →</a>'+
      '<div style="height:8px"></div><button class="btn" id="reviewclose" style="width:100%">Close</button>'+
    '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function(e){ if(e.target === ov) closeReviewOverlay(); });
    document.getElementById('reviewclose').onclick = closeReviewOverlay;
  }
  ov.style.display = 'flex';
}
function closeReviewOverlay(){ var ov = document.getElementById('reviewov'); if(ov) ov.style.display = 'none'; }
```

- [ ] **Step 4: Wire it in `load()`**

In `load()`, after `STATE.bookings`/`STATE.events`/`STATE.admin` are set from `data`, add:
```js
    STATE.reviewUrl = data.reviewUrl || '';
    var rl = document.getElementById('reviewlink');
    if(rl){
      if(STATE.reviewUrl){ rl.style.display = ''; rl.onclick = function(e){ e.preventDefault(); openReviewOverlay(); }; }
      else { rl.style.display = 'none'; }
    }
```

- [ ] **Step 5: Verify**

- `npm test` (unchanged — no new failures).
- Re-read the edited regions to confirm balanced quotes/parens and valid JS.
- Load `/site/installer.html` locally; confirm the passcode gate renders and there are no console errors (the QR `<img>` will 404 locally since functions aren't served — that's expected; the overlay layout + tappable link still render).

- [ ] **Step 6: Commit**

```bash
git add site/installer.html
git commit -m "feat(console): Ask-for-a-review header link + full-screen Google review QR overlay"
```

---

## Task 4: Full suite + ship

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: all pass (existing + the ~4 new tests).

- [ ] **Step 2: Ship**

Use the `ship` skill: no SEO inputs changed (a function + `noindex` console page), so `build:seo` not required; run `npm test`, confirm branch is `master`, push, confirm Netlify `ready`.

- [ ] **Step 3: Owner setup (enables the feature)**

Set **`GOOGLE_REVIEW_URL`** in Netlify env — the Google Business Profile "Ask for reviews" share link. Until set, `review-qr` returns 404 and the button self-hides (no broken UI).

- [ ] **Step 4: Post-ship verification**

- Before the env is set: confirm the console has **no** "Ask for a review" link (self-hidden).
- After the owner sets `GOOGLE_REVIEW_URL` (+ redeploy/env refresh): confirm the link appears, tapping it opens the overlay with a scannable QR, and scanning it opens the Tuned Yota Google review form. Also confirm `curl https://tunedyota.com/.netlify/functions/review-qr` returns an SVG.

---

## Owner inputs
**One:** `GOOGLE_REVIEW_URL` (Netlify env) — the Google review share link. Absent it, the feature is invisible (self-hides).
