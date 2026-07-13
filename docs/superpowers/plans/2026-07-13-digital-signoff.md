# Digital Customer Sign-Off Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture a drawn customer satisfaction signature at close-out, store it on the booking (tolerant/inert until the owner adds one column), mark signed bookings in the feed, and let the owning installer/admin view a stored signature — never blocking completion or touching the certificate.

**Architecture:** Front-end signature-pad overlay wraps the existing `complete()` → `closeout()` path in `site/installer.html`; the signature rides through the close-out POST as an optional `signature` (data URL); `installer-closeout.js` tolerant-writes it to a new `Customer Signature` Bookings column; `installer-roster.js` exposes a `signed` boolean; a new authed `installer-signature.js` returns a stored signature scoped like the roster (own / admin-all).

**Tech Stack:** CommonJS Netlify Functions, `node:test` + `node:assert/strict`, dependency-injection test pattern, vanilla `<canvas>` (no library), Airtable via `lib/airtable.js` (`cfg`, `getRecord`, `updateTolerant`), `resolveInstaller`/`isAdmin` from `lib/installer-auth.js`.

**Spec:** `docs/superpowers/specs/2026-07-13-digital-signoff-design.md`

**Conventions:** one test file per run (`node --test tests/<f>.test.js`); full suite `npm test`. Commit per task. Confirm `git branch --show-current` before committing. Fresh-worktree-only pre-existing failure to IGNORE: `tests/magnuson-schema-image.test.js`.

---

## File Structure

**Create:** `netlify/functions/installer-signature.js`, `tests/installer-signature.test.js`.
**Modify:** `netlify/functions/installer-closeout.js` (+ `tests/installer-closeout.test.js`), `netlify/functions/installer-roster.js` (+ `tests/installer-roster.test.js`), `site/installer.html` (front-end, no unit test).

---

## Task 1: Store the signature at close-out

**Files:** Modify `netlify/functions/installer-closeout.js`; Test `tests/installer-closeout.test.js`

- [ ] **Step 1: Read the existing test harness.** Open `tests/installer-closeout.test.js` and find a passing `processCloseout` **complete** test — note exactly how it injects deps (`get` returning a record whose `Installer` matches `key`, `update` capturing the written `fields`, `send`, `now`, `env`, `key`, `admin`). Your new tests reuse that setup.

- [ ] **Step 2: Add failing tests** to `tests/installer-closeout.test.js`. Adapt the deps to the file's real harness; the intent (capture the fields passed to `update`):

```js
test("complete stores a valid PNG signature", async () => {
  let written;
  const deps = { /* ...the file's standard complete-path deps... */
    key: "aaron", admin: false,
    get: async () => ({ id: "r1", fields: { Installer: "aaron", Name: "Dana", Vehicle: "2021 Tundra", "Event Date": "2026-08-01" } }),
    update: async (a) => { written = a.fields; return {}; },
    send: async () => ({}), log: { error() {} } };
  const sig = "data:image/png;base64,AAAA";
  const out = await processCloseout({ recordId: "r1", action: "complete", calibration: "Spicy", vin: "1FTFW1E50MFA00001", signature: sig }, deps);
  assert.equal(out.status, "completed");
  assert.equal(written["Customer Signature"], sig);
});

test("complete without a signature omits the field (skip path)", async () => {
  let written;
  const deps = { /* same deps */ key: "aaron", admin: false,
    get: async () => ({ id: "r1", fields: { Installer: "aaron", Name: "Dana", Vehicle: "2021 Tundra", "Event Date": "2026-08-01" } }),
    update: async (a) => { written = a.fields; return {}; }, send: async () => ({}), log: { error() {} } };
  await processCloseout({ recordId: "r1", action: "complete", calibration: "Spicy", vin: "1FTFW1E50MFA00001" }, deps);
  assert.ok(!("Customer Signature" in written));
});

test("a malformed or oversized signature is ignored, completion still succeeds", async () => {
  let written;
  const deps = { /* same deps */ key: "aaron", admin: false,
    get: async () => ({ id: "r1", fields: { Installer: "aaron", Name: "Dana", Vehicle: "2021 Tundra", "Event Date": "2026-08-01" } }),
    update: async (a) => { written = a.fields; return {}; }, send: async () => ({}), log: { error() {} } };
  const bad = "data:text/html,<script>";
  const out = await processCloseout({ recordId: "r1", action: "complete", calibration: "Spicy", vin: "1FTFW1E50MFA00001", signature: bad }, deps);
  assert.equal(out.status, "completed");
  assert.ok(!("Customer Signature" in written));
});
```

Note: `CAL_OPTIONS` must include the calibration you use ("Spicy" is valid). Match the VIN/field expectations the existing tests use. If the existing harness captures `update` differently (e.g. through `updateTolerant`), keep the same approach — the first tolerant write is where `completeFields` lands.

- [ ] **Step 3: Run to confirm failure** — `node --test tests/installer-closeout.test.js` → the 3 new tests FAIL (field missing).

- [ ] **Step 4: Implement.** In `processCloseout`, after the block that builds `completeFields` and sets the certificate metadata (`completeFields["Cert Delivery"] = ...`), and BEFORE the `updateTolerant` call, add:

```js
  // Customer sign-off signature (satisfaction/acceptance proof). Optional, additive,
  // record-only — never printed on the certificate. Accept only a PNG data URL under a
  // sane cap; anything else is ignored so a bad signature never blocks completion.
  const signature = String(d.signature || "");
  if (/^data:image\/png;base64,/.test(signature) && signature.length <= 200000) {
    completeFields["Customer Signature"] = signature;
  }
```

Then add `"Customer Signature"` to the `updateTolerant` drop-list array (the second argument that currently lists `["VIN", "Tuning Platform", ... "Cert Delivery"]`):

```js
      ["VIN", "Tuning Platform", "Calibration Type", "ECU ID", "Gear Size", "Mileage", "Email", "Certificate Issued", "Certificate Recipient", "Cert Delivery", "Customer Signature"]);
```

- [ ] **Step 5: Run tests** — `node --test tests/installer-closeout.test.js` (all pass). Then `npm test` (only `magnuson-schema-image` may fail in a worktree).

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/installer-closeout.js tests/installer-closeout.test.js
git commit -m "feat(signoff): store customer signature at close-out (tolerant, record-only)"
```

---

## Task 2: Expose a `signed` flag on the roster

**Files:** Modify `netlify/functions/installer-roster.js`; Test `tests/installer-roster.test.js`

- [ ] **Step 1: Add failing tests** to `tests/installer-roster.test.js` (match the file's `buildRoster` harness — it injects `key`, `env`, `list`, `loadEvents`):

```js
test("a booking with a stored signature is marked signed", async () => {
  const out = await buildRoster({ key: "aaron", env: {}, loadEvents: async () => [],
    list: async () => ([{ id: "r1", fields: { Installer: "aaron", Status: "Completed", "Customer Signature": "data:image/png;base64,AAAA" } }]) });
  assert.equal(out.bookings[0].signed, true);
});
test("a booking without a signature is not signed, and the roster never ships the image", async () => {
  const out = await buildRoster({ key: "aaron", env: {}, loadEvents: async () => [],
    list: async () => ([{ id: "r2", fields: { Installer: "aaron", Status: "Completed" } }]) });
  assert.equal(out.bookings[0].signed, false);
  assert.ok(!("Customer Signature" in out.bookings[0]));
  assert.ok(!("signature" in out.bookings[0]));
});
```

Run: `node --test tests/installer-roster.test.js` → FAIL.

- [ ] **Step 2: Implement.** In the `recs.map((r) => {...})` booking object (the `return { id: r.id, ... commission, };` literal), add a `signed` field:

```js
      signed: !!(f["Customer Signature"] && String(f["Customer Signature"]).trim()),
```

Do NOT add the signature data itself to the returned object.

- [ ] **Step 3: Run tests** — `node --test tests/installer-roster.test.js` (pass). Then `npm test`.

- [ ] **Step 4: Commit**

```bash
git add netlify/functions/installer-roster.js tests/installer-roster.test.js
git commit -m "feat(signoff): roster exposes a signed flag (no image in the feed)"
```

---

## Task 3: `installer-signature.js` — on-demand view endpoint

**Files:** Create `netlify/functions/installer-signature.js`, `tests/installer-signature.test.js`

- [ ] **Step 1: Write failing test** — `tests/installer-signature.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getSignature } = require("../netlify/functions/installer-signature.js");

const rec = (fields) => ({ id: "r1", fields });
const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };

test("missing id -> error", async () => {
  const out = await getSignature("", { env, key: "aaron", admin: false, get: async () => rec({}) });
  assert.equal(out.status, "error");
  assert.equal(out.error, "missing-id");
});

test("owner installer gets their signature", async () => {
  const out = await getSignature("r1", { env, key: "aaron", admin: false,
    get: async () => rec({ Installer: "aaron", "Customer Signature": "data:image/png;base64,AAAA" }) });
  assert.equal(out.status, "ok");
  assert.equal(out.signature, "data:image/png;base64,AAAA");
});

test("a different installer is refused", async () => {
  const out = await getSignature("r1", { env, key: "noah", admin: false,
    get: async () => rec({ Installer: "aaron", "Customer Signature": "data:image/png;base64,AAAA" }) });
  assert.equal(out.status, "error");
  assert.equal(out.error, "not-yours");
});

test("admin can view any installer's signature", async () => {
  const out = await getSignature("r1", { env, key: "aaron", admin: true,
    get: async () => rec({ Installer: "noah", "Customer Signature": "data:image/png;base64,BBBB" }) });
  assert.equal(out.status, "ok");
  assert.equal(out.signature, "data:image/png;base64,BBBB");
});

test("no signature on the record -> none", async () => {
  const out = await getSignature("r1", { env, key: "aaron", admin: false,
    get: async () => rec({ Installer: "aaron" }) });
  assert.equal(out.status, "none");
});
```

- [ ] **Step 2: Run to confirm failure** — `node --test tests/installer-signature.test.js` → FAIL (module not found).

- [ ] **Step 3: Implement** — `netlify/functions/installer-signature.js`:

```js
// netlify/functions/installer-signature.js
// Installer-token authed: return a stored customer sign-off signature (PNG data URL)
// for one booking, scoped like the roster — the owning installer, or any booking for
// an admin. View-only proof of acceptance; the image is never in the roster payload.
const { cfg, getRecord } = require("./lib/airtable.js");
const { resolveInstaller, isAdmin } = require("./lib/installer-auth.js");

async function getSignature(id, deps) {
  const { env = process.env, fetchImpl = fetch, key, admin = false, log = console,
          get = (a) => getRecord({ fetchImpl, ...a }) } = deps;
  if (!id) return { status: "error", error: "missing-id" };
  const c = cfg(env);
  let rec;
  try { rec = await get({ token: c.token, baseId: c.baseId, table: c.bookings, id }); }
  catch (e) { if (log.error) log.error("signature get", e.message); return { status: "error", error: "store-unavailable" }; }
  const f = (rec && rec.fields) || {};
  const owner = Array.isArray(f.Installer) ? f.Installer[0] : f.Installer;
  if (!admin && owner !== key) return { status: "error", error: "not-yours" };
  const sig = String(f["Customer Signature"] || "").trim();
  if (!sig) return { status: "none" };
  return { status: "ok", signature: sig };
}

async function handler(event) {
  const key = resolveInstaller(event.headers || {}, process.env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  const id = (event.queryStringParameters && event.queryStringParameters.id) || "";
  const out = await getSignature(id, { key, admin: isAdmin(key, process.env) });
  const code = (out.status === "ok" || out.status === "none") ? 200
    : out.error === "not-yours" ? 403
    : out.error === "missing-id" ? 400 : 502;
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, getSignature };
```

- [ ] **Step 4: Run tests** — `node --test tests/installer-signature.test.js` (5 pass). Then `npm test`.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/installer-signature.js tests/installer-signature.test.js
git commit -m "feat(signoff): authed on-demand signature view endpoint (own/admin-all)"
```

---

## Task 4: Console — signature pad, sign overlay, ✍ marker, view overlay

**Files:** Modify `site/installer.html` (no unit test). READ THE FILE FIRST.

- [ ] **Step 1: Read the file** and locate: (a) `complete(id)` (~line 624) — it validates then calls `closeout(id, {action:'complete', ...})`; (b) `closeout(id, extra)` (~line 639) which spreads `extra` into the POST body and, on `out.status==='completed'`, updates the local booking `b`; (c) the **completed-booking card branch** in `bookingCard` (the block that renders a completed/`✓ Done` booking and `return c;` around line 595 — ABOVE the `No-show` early return) — this is where the ✍ marker goes; (d) the existing **review-QR overlay** markup + `closeReviewOverlay()` (mirror its full-screen overlay pattern + `esc()` usage); (e) helpers `tok()`, `fail()`, `succeed()`, `clearMsg()`, `esc()`, `val()`, `renderAll()`, and the `STATE.bookings` shape (each booking now has `signed` from the roster).

- [ ] **Step 2: Rewire `complete(id)` to open the sign overlay instead of completing directly.** Change its final two lines (the `extra` build + `closeout(...)` call) so that after all validation passes it builds `extra` and calls `openSignOverlay(id, extra)`:

```js
    var extra={action:'complete',calibration:cal,vin:vin,tuningPlatform:tp,calibrationType:ct,ecuId:ecu,gearSize:gear,mileage:mi,customerEmail:cem};
    openSignOverlay(id, extra);
```

- [ ] **Step 3: Add the signature pad + sign overlay** at module scope (mirror the review overlay's full-screen markup/close pattern). The overlay: a header + one-line summary, a canvas, **Clear**, **✓ Done & complete**, a quiet **"Customer unavailable — skip →"** link, and a close (✕) that cancels (no completion).

```js
  var SIGPAD = null; // { canvas, ctx, dirty }
  function openSignOverlay(id, extra){
    var b = STATE.bookings.filter(function(x){return x.id===id;})[0] || {};
    var summary = esc(((b.modelYear?b.modelYear+' ':'')+(b.vehicle||'')).trim()+(extra.calibration?' · '+extra.calibration:''));
    var ov = document.createElement('div');
    ov.className = 'overlay'; ov.id = 'signov';
    ov.innerHTML =
      '<div class="overlay-card">'+
        '<button class="overlay-x" id="signx" aria-label="Cancel">✕</button>'+
        '<h2>Confirm the tune</h2>'+
        '<p class="muted">'+summary+'</p>'+
        '<p class="muted">Ask the customer to sign below confirming the work is complete.</p>'+
        '<canvas id="sigpad" width="600" height="180" style="width:100%;height:180px;border:2px dashed #b9c0ad;border-radius:10px;background:#fff;touch-action:none"></canvas>'+
        '<div class="row-actions" style="margin-top:10px">'+
          '<button class="btn ghost" id="sigclear">Clear</button>'+
          '<button class="btn" id="sigdone">✓ Done &amp; complete</button>'+
        '</div>'+
        '<button class="link" id="sigskip" style="margin-top:10px">Customer unavailable — skip →</button>'+
      '</div>';
    document.body.appendChild(ov);
    var canvas = ov.querySelector('#sigpad'), ctx = canvas.getContext('2d');
    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1c1c1c';
    SIGPAD = { canvas: canvas, ctx: ctx, dirty: false };
    var drawing = false;
    function pos(e){ var r = canvas.getBoundingClientRect(); var t = (e.touches && e.touches[0]) || e; return { x: (t.clientX - r.left) * (canvas.width / r.width), y: (t.clientY - r.top) * (canvas.height / r.height) }; }
    function down(e){ e.preventDefault(); drawing = true; var p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
    function move(e){ if(!drawing) return; e.preventDefault(); var p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); SIGPAD.dirty = true; }
    function up(){ drawing = false; }
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    ov.querySelector('#sigclear').onclick = function(){ ctx.clearRect(0,0,canvas.width,canvas.height); SIGPAD.dirty = false; };
    ov.querySelector('#sigdone').onclick = function(){ if(SIGPAD.dirty){ extra.signature = canvas.toDataURL('image/png'); } closeSignOverlay(); closeout(id, extra); };
    ov.querySelector('#sigskip').onclick = function(){ closeSignOverlay(); closeout(id, extra); };
    ov.querySelector('#signx').onclick = function(){ closeSignOverlay(); }; // cancel — no completion
  }
  function closeSignOverlay(){ var ov = document.getElementById('signov'); if(ov) ov.remove(); SIGPAD = null; }
```

Match the real overlay CSS class names the review overlay uses (e.g. if it's `overlay`/`overlay-card`/`overlay-x` vs other names — mirror whatever exists). If the file has no `.ghost`/`.link` button styles, reuse the classes the review overlay's buttons use.

- [ ] **Step 4: On successful completion, reflect the signed state locally.** In `closeout(...)`, inside the `if(out.status==='completed'){ ... }` branch where it updates `b`, add:

```js
        if(extra.signature) b.signed=true;
```

(so the ✍ marker appears immediately without a reload).

- [ ] **Step 5: Add the ✍ Signed marker to the completed-booking card.** In the completed-card branch of `bookingCard` (the one that renders a `✓ Done`/completed booking), when `b.signed` is truthy, append a small marker that opens the view overlay, e.g.:

```js
      + (b.signed ? '<button class="link sigview" id="sig_'+b.id+'">✍ Signed — view</button>' : '')
```

and after the card HTML is set, wire it:

```js
      var sv=c.querySelector('#sig_'+b.id); if(sv) sv.onclick=function(){ viewSignature(b.id); };
```

Match the completed branch's actual construction (string concat vs innerHTML) — insert the marker where the done summary is built and wire the click where its other handlers are wired.

- [ ] **Step 6: Add the view overlay + fetch:**

```js
  async function viewSignature(id){
    clearMsg();
    try{
      var res = await fetch('/.netlify/functions/installer-signature?id='+encodeURIComponent(id), { headers:{ 'x-installer-token':tok() } });
      if(res.status===401){ localStorage.removeItem('ty_installer_token'); location.reload(); return; }
      var out = await res.json().catch(function(){return{};});
      if(out.status!=='ok' || !out.signature){ succeed('No signature on file for this tune.'); return; }
      var ov = document.createElement('div'); ov.className='overlay'; ov.id='sigviewov';
      ov.innerHTML = '<div class="overlay-card"><button class="overlay-x" id="sigviewx" aria-label="Close">✕</button>'+
        '<h2>Customer sign-off</h2>'+
        '<img alt="Customer signature" src="'+out.signature+'" style="width:100%;background:#fff;border:1px solid #d8dcc9;border-radius:10px">'+
        '</div>';
      document.body.appendChild(ov);
      ov.querySelector('#sigviewx').onclick=function(){ ov.remove(); };
    }catch(e){ fail('Could not load the signature.'); }
  }
```

(Use `out.signature` only as an `<img src>` — it is a `data:image/png` URL the caller is authorized for.)

- [ ] **Step 7: Verify.** Re-read each edit for balanced quotes/parens/braces. Extract the inline `<script>` and run `node --check` on it (as done for prior console edits). Run `npm test` — unaffected (only `magnuson-schema-image` may fail in a worktree). Optionally open `site/installer.html` locally to confirm no console errors and the gate renders.

- [ ] **Step 8: Commit**

```bash
git add site/installer.html
git commit -m "feat(console): customer sign-off pad + signed marker + view overlay"
```

---

## Task 5: Full suite + ship

- [ ] **Step 1:** `npm test` — all pass (existing + ~10 new: 3 closeout, 2 roster, 5 signature).
- [ ] **Step 2: Ship** via the `ship` skill: no SEO inputs changed (`installer.html` isn't an indexed page), so `build:seo` is not required — but `npm test` must be green (it guards SEO drift). Confirm branch `master`; push; confirm the Netlify deploy shows `ready`.
- [ ] **Step 3: Owner setup (enables the feature):** add one Airtable **Bookings** column — **`Customer Signature`** (Long text). Until it exists, a captured signature is silently dropped by the tolerant write and no ✍ marker appears (zero risk to close-out).
- [ ] **Step 4: Post-ship verification:** on the live console, close out a test booking → **sign → ✓ Done & complete** → confirm the certificate still issues and the completed card shows **✍ Signed — view** rendering the drawn image. Then close out another with **Customer unavailable — skip** → confirm it completes + issues the certificate with no marker. (Admin: confirm you can view another installer's signature.)

---

## Owner inputs
1. Add Airtable **Bookings** column **`Customer Signature`** (Long text). No env vars. Feature is inert (captured-then-dropped, no marker) until it exists.
