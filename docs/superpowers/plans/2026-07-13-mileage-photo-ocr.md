# Mileage Photo + Odometer OCR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At close-out, read the odometer from a photo via Claude Haiku 4.5, pre-fill the Mileage field (installer overrides), and attach the photo to the booking row.

**Architecture:** A pure vision reader (`lib/odometer-vision.js`, raw-HTTP Messages call) + an auth-gated function (`read-odometer.js`) that sharp-resizes/strips EXIF, OCRs, and attaches the photo to Airtable's `Mileage Photo` field via the upload-attachment API. Optional and non-blocking — the installer confirms or overrides the read value.

**Tech Stack:** Node.js (CommonJS), `node --test` + `node:assert/strict`, Netlify Functions, `sharp` (already a dep), Anthropic Messages API (raw `fetch`), Airtable content API (raw `fetch`).

**Spec:** `docs/superpowers/specs/2026-07-13-mileage-photo-ocr-design.md`

**Conventions:** one test file `node --test tests/<f>.test.js`; full suite `npm test`. Commit per task. Confirm `git branch --show-current` before committing. Fresh-worktree-only pre-existing failure to ignore: `tests/magnuson-schema-image.test.js`. Reused: `cfg`/`getRecord` from `lib/airtable.js`; `resolveInstaller`/`isAdmin` from `lib/installer-auth.js`; multi-select `Installer` normalization (`Array.isArray(f.Installer)?f.Installer[0]:f.Installer`) as in `installer-closeout.js`.

---

## File Structure

**Create:**
- `netlify/functions/lib/odometer-vision.js` — pure Claude-vision odometer reader.
- `netlify/functions/read-odometer.js` — auth-gated resize + OCR + attach.
- Tests: `tests/odometer-vision.test.js`, `tests/read-odometer.test.js`.

**Modify:**
- `site/installer.html` — 📷 capture button, client resize, Mileage pre-fill/override.

---

## Task 1: `odometer-vision.js` — Claude-vision odometer reader

**Files:**
- Create: `netlify/functions/lib/odometer-vision.js`
- Test: `tests/odometer-vision.test.js`

- [ ] **Step 1: Write the failing test** — `tests/odometer-vision.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readOdometer } = require("../netlify/functions/lib/odometer-vision.js");

function fakeFetch(text, opts = {}) {
  return async () => ({ ok: opts.ok !== false, json: async () => ({ content: [{ type: "text", text }], stop_reason: opts.stop || "end_turn" }) });
}

test("parses a plain integer", async () => {
  const r = await readOdometer({ imageBase64: "x", apiKey: "k", fetchImpl: fakeFetch("48210") });
  assert.equal(r.mileage, 48210);
});
test("parses commas and units", async () => {
  const r = await readOdometer({ imageBase64: "x", apiKey: "k", fetchImpl: fakeFetch(" 48,210 mi ") });
  assert.equal(r.mileage, 48210);
});
test("NONE -> null", async () => {
  const r = await readOdometer({ imageBase64: "x", apiKey: "k", fetchImpl: fakeFetch("NONE") });
  assert.equal(r.mileage, null);
});
test("non-2xx -> null", async () => {
  const r = await readOdometer({ imageBase64: "x", apiKey: "k", fetchImpl: fakeFetch("48210", { ok: false }) });
  assert.equal(r.mileage, null);
});
test("refusal -> null", async () => {
  const r = await readOdometer({ imageBase64: "x", apiKey: "k", fetchImpl: fakeFetch("48210", { stop: "refusal" }) });
  assert.equal(r.mileage, null);
});
test("missing key or image -> null, no fetch", async () => {
  let called = false;
  const r = await readOdometer({ imageBase64: "", apiKey: "k", fetchImpl: async () => { called = true; return { ok: true, json: async () => ({}) }; } });
  assert.equal(r.mileage, null);
  assert.equal(called, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/odometer-vision.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation** — `netlify/functions/lib/odometer-vision.js`:

```js
// netlify/functions/lib/odometer-vision.js
// Pure: read a vehicle odometer's total mileage from a photo via Claude Haiku 4.5
// vision, using the raw-HTTP Messages API (the repo has no Anthropic SDK; all
// functions use fetch, matching lib/resend.js / lib/airtable.js). Returns the integer
// or null; never throws for a "couldn't read" outcome. Injectable fetch for tests.
const API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5";
const PROMPT = "This is a photo of a vehicle odometer. Reply with ONLY the total mileage as a plain integer (no commas, no units). Read the main odometer, not the trip meter. If you cannot read it, reply exactly NONE.";

async function readOdometer({ imageBase64, mediaType = "image/jpeg", apiKey, fetchImpl = fetch } = {}) {
  if (!imageBase64 || !apiKey) return { mileage: null, raw: "" };
  const body = {
    model: MODEL, max_tokens: 64,
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
      { type: "text", text: PROMPT },
    ] }],
  };
  let raw = "";
  try {
    const res = await fetchImpl(API, { method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(body) });
    if (!res.ok) return { mileage: null, raw: "" };
    const json = await res.json();
    if (json.stop_reason === "refusal") return { mileage: null, raw: "" };
    const block = (json.content || []).find((b) => b.type === "text");
    raw = (block && block.text) || "";
  } catch (e) { return { mileage: null, raw: "" }; }
  const digits = String(raw).replace(/[^0-9]/g, "");
  if (!digits) return { mileage: null, raw };
  const n = parseInt(digits, 10);
  return { mileage: n > 0 ? n : null, raw };
}
module.exports = { readOdometer };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/odometer-vision.test.js`
Expected: PASS (6 tests). Then `npm test` (no new failures).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/odometer-vision.js tests/odometer-vision.test.js
git commit -m "feat(mileage): Claude-vision odometer reader (raw HTTP, fails to null)"
```

---

## Task 2: `read-odometer.js` — resize + OCR + attach

**Files:**
- Create: `netlify/functions/read-odometer.js`
- Test: `tests/read-odometer.test.js`

- [ ] **Step 1: Write the failing test** — `tests/read-odometer.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processReadOdometer } = require("../netlify/functions/read-odometer.js");

const rec = { id: "recX", fields: { Installer: "aaron" } };
function deps(over = {}) {
  const sent = [];
  return { sent, d: {
    key: "aaron", admin: false, env: { ANTHROPIC_API_KEY: "k" },
    get: async () => rec,
    resize: async () => "RESIZEDB64",
    ocr: async () => ({ mileage: 48210 }),
    fetchImpl: async (url, opt) => { sent.push({ url, opt }); return { ok: true, json: async () => ({}) }; },
    ...over,
  } };
}

test("happy path: reads mileage + attaches the photo", async () => {
  const { sent, d } = deps();
  const out = await processReadOdometer({ recordId: "recX", imageBase64: "raw" }, d);
  assert.equal(out.status, "ok");
  assert.equal(out.mileage, 48210);
  assert.equal(out.attached, true);
  assert.match(sent[0].url, /uploadAttachment/);
});
test("rejects a booking you don't own", async () => {
  const { d } = deps({ get: async () => ({ id: "recX", fields: { Installer: "noah" } }) });
  const out = await processReadOdometer({ recordId: "recX", imageBase64: "raw" }, d);
  assert.equal(out.error, "not-yours");
});
test("admin may read any booking", async () => {
  const { d } = deps({ admin: true, get: async () => ({ id: "recX", fields: { Installer: "noah" } }) });
  const out = await processReadOdometer({ recordId: "recX", imageBase64: "raw" }, d);
  assert.equal(out.status, "ok");
});
test("OCR null still attaches the photo", async () => {
  const { d } = deps({ ocr: async () => ({ mileage: null }) });
  const out = await processReadOdometer({ recordId: "recX", imageBase64: "raw" }, d);
  assert.equal(out.mileage, null);
  assert.equal(out.attached, true);
});
test("attach failure still returns the mileage", async () => {
  const { d } = deps({ fetchImpl: async () => ({ ok: false, json: async () => ({}) }) });
  const out = await processReadOdometer({ recordId: "recX", imageBase64: "raw" }, d);
  assert.equal(out.mileage, 48210);
  assert.equal(out.attached, false);
});
test("missing input -> error", async () => {
  const { d } = deps();
  const out = await processReadOdometer({ recordId: "recX" }, d);
  assert.equal(out.error, "missing-input");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/read-odometer.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation** — `netlify/functions/read-odometer.js`:

```js
// netlify/functions/read-odometer.js
// Auth-gated: resize + EXIF-strip an odometer photo, OCR the mileage via Claude
// vision (lib/odometer-vision), attach the photo to the booking's "Mileage Photo"
// Airtable field (upload-attachment API), and return the read mileage. Optional /
// advisory — the installer confirms or overrides. Ownership re-checked server-side.
const sharp = require("sharp");
const { cfg, getRecord } = require("./lib/airtable.js");
const { resolveInstaller, isAdmin } = require("./lib/installer-auth.js");
const { readOdometer } = require("./lib/odometer-vision.js");

const AIRTABLE_CONTENT = "https://content.airtable.com/v0";

async function defaultResize(imageBase64) {
  const buf = Buffer.from(String(imageBase64), "base64");
  const out = await sharp(buf).rotate().resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  return out.toString("base64");
}

async function processReadOdometer(body, deps) {
  const { env = process.env, fetchImpl = fetch, key, admin = false,
          get = (a) => getRecord({ fetchImpl, ...a }),
          resize = defaultResize, ocr = readOdometer } = deps;
  const d = body || {};
  if (!d.recordId || !d.imageBase64) return { status: "error", error: "missing-input" };
  const c = cfg(env);
  let rec;
  try { rec = await get({ token: c.token, baseId: c.baseId, table: c.bookings, id: d.recordId }); }
  catch { return { status: "error", error: "store-unavailable" }; }
  const f = (rec && rec.fields) || {};
  const owner = Array.isArray(f.Installer) ? f.Installer[0] : f.Installer;
  if (!admin && owner !== key) return { status: "error", error: "not-yours" };

  let jpegB64;
  try { jpegB64 = await resize(d.imageBase64); }
  catch { return { status: "error", error: "bad-image" }; }

  const { mileage } = await ocr({ imageBase64: jpegB64, mediaType: "image/jpeg", apiKey: env.ANTHROPIC_API_KEY, fetchImpl });

  let attached = false;
  try {
    const url = `${AIRTABLE_CONTENT}/${c.baseId}/${d.recordId}/${encodeURIComponent("Mileage Photo")}/uploadAttachment`;
    const res = await fetchImpl(url, { method: "POST",
      headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ contentType: "image/jpeg", file: jpegB64, filename: `odometer-${d.recordId}.jpg` }) });
    attached = !!(res && res.ok);
  } catch { attached = false; }

  return { status: "ok", mileage: mileage == null ? null : mileage, attached };
}

async function handler(event) {
  const key = resolveInstaller(event.headers || {}, process.env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  const out = await processReadOdometer(body, { key, admin: isAdmin(key, process.env) });
  const code = out.status === "ok" ? 200
    : out.error === "not-yours" ? 403
    : out.error === "missing-input" ? 400 : 502;
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, processReadOdometer, defaultResize };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/read-odometer.test.js`
Expected: PASS (6 tests). Then `npm test` (no new failures).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/read-odometer.js tests/read-odometer.test.js
git commit -m "feat(mileage): auth-gated read-odometer (resize/EXIF-strip, OCR, Airtable attach)"
```

---

## Task 3: Console — 📷 capture, client resize, Mileage pre-fill/override

**Files:**
- Modify: `site/installer.html`

No unit test (static page). Match the file's vanilla-JS style (`var`, `tok`, `esc`, `document.getElementById`). READ THE FILE FIRST.

- [ ] **Step 1: Add the client-side resize helper (module scope)**

Near the other helpers, add:
```js
function resizeImage(file, maxDim, quality){
  return new Promise(function(resolve, reject){
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function(){
      URL.revokeObjectURL(url);
      var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      var cw = Math.round(img.width * scale), ch = Math.round(img.height * scale);
      var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
      cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
      resolve(cv.toDataURL('image/jpeg', quality).split(',')[1]); // base64 only (drops EXIF)
    };
    img.onerror = function(){ URL.revokeObjectURL(url); reject(new Error('image load failed')); };
    img.src = url;
  });
}
async function handleMileagePhoto(id, file){
  var msg = document.getElementById('odomsg_' + id);
  if(msg){ msg.className = 'msg'; msg.textContent = 'Reading odometer…'; }
  try{
    var b64 = await resizeImage(file, 1600, 0.8);
    var res = await fetch('/.netlify/functions/read-odometer', { method:'POST', headers:{ 'Content-Type':'application/json', 'x-installer-token':tok() }, body: JSON.stringify({ recordId:id, imageBase64:b64, mediaType:'image/jpeg' }) });
    var out = await res.json().catch(function(){ return {}; });
    if(out.status === 'ok'){
      if(out.mileage){ var mi = document.getElementById('mi_' + id); if(mi) mi.value = out.mileage; if(msg){ msg.className='msg ok'; msg.textContent = '✓ Photo attached · read ' + out.mileage + ' mi — edit if wrong'; } }
      else if(msg){ msg.className='msg'; msg.textContent = (out.attached ? '✓ Photo attached' : 'Photo saved') + ' — couldn’t read the number, enter mileage manually'; }
    } else if(msg){ msg.className='msg err'; msg.textContent = 'Couldn’t upload the photo — enter mileage manually'; }
  }catch(e){ if(msg){ msg.className='msg err'; msg.textContent = 'Couldn’t process the photo — enter mileage manually'; } }
}
```

- [ ] **Step 2: Add the button + file input to the card**

In `rowCard(b)` open-booking branch, immediately AFTER the mileage input string (`mi_<id>`), add to `innerHTML`:
```js
'<div class="row-actions"><button type="button" class="btn" id="odo_'+b.id+'" style="background:#5B4B42">📷 Photo mileage</button></div>'+
'<input type="file" accept="image/*" capture="environment" id="odofile_'+b.id+'" style="display:none">'+
'<div id="odomsg_'+b.id+'" class="msg"></div>'+
```

- [ ] **Step 3: Wire the handlers**

After `c.innerHTML = ...` for the open branch (where other handlers are wired), add:
```js
var odoBtn = c.querySelector('#odo_'+b.id), odoFile = c.querySelector('#odofile_'+b.id);
if(odoBtn && odoFile){
  odoBtn.onclick = function(){ odoFile.click(); };
  odoFile.onchange = function(){ if(odoFile.files && odoFile.files[0]) handleMileagePhoto(b.id, odoFile.files[0]); };
}
```

- [ ] **Step 4: Verify**

- `npm test` (unchanged — no new failures).
- Re-read the edited regions to confirm balanced quotes/parens and valid JS.
- Load `/site/installer.html` locally; confirm the passcode gate still renders and there are no console errors (a syntax error would blank the page).

- [ ] **Step 5: Commit**

```bash
git add site/installer.html
git commit -m "feat(console): odometer photo capture — client resize, OCR pre-fill, override"
```

---

## Task 4: Full suite + ship

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: all pass (existing + the 12 new tests).

- [ ] **Step 2: Owner setup (before enabling)**

- Netlify env **`ANTHROPIC_API_KEY`** (Anthropic Console key).
- Airtable **Bookings** column **`Mileage Photo`** (Attachment).
(Until both exist: OCR returns null and attach fails — the feature degrades to "enter mileage manually" and never blocks close-out.)

- [ ] **Step 3: Ship**

Use the `ship` skill: no SEO inputs changed (functions + one static page), so `build:seo` not required; run `npm test`, confirm branch is `master`, push, confirm Netlify `ready`.

- [ ] **Step 4: Post-ship verification**

- Validate the Airtable upload-attachment call end-to-end against a **transient test record** (per the `testing-airtable-backed-emails` pattern): create a Completed booking you own, POST a real odometer photo to `read-odometer` (with your installer token), confirm the response mileage + that the photo appears on the record's `Mileage Photo` field, then delete the test record.
- In the live console: 📷 a real odometer → confirm the Mileage field pre-fills and the photo attaches; 📷 a garbage image → confirm it degrades to manual entry without blocking Mark-complete.

---

## Owner inputs (tracked)
1. `ANTHROPIC_API_KEY` (Netlify env).
2. `Mileage Photo` (Attachment) column on Bookings.
Both required before the feature does anything useful; absent them it fails open (manual entry).
