# Installer Dashboard: VIN Capture + IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make VIN capture bulletproof (barcode → photo+Claude‑OCR → always‑manual) and reorganize the installer Jobs view into location tabs + a Completed tab, so mobile close‑out stops bunching and no customer is dropped like Shannon.

**Architecture:** One new dependency‑free Netlify function (`vin-ocr`) proxies a photo to the Claude Messages API (Haiku 4.5, raw `fetch`) and returns a normalized 17‑char VIN, failing open to manual entry on any problem. All other changes are client‑side in `site/installer.html`: a Capture shutter + confirm step in the scan overlay, a Jobs sub‑tab strip (All / per‑location / ✓ Done), and a loud "not closed out" flag. VIN stays mandatory for close‑out; only the capture method gets easier.

**Tech Stack:** Node (CommonJS) Netlify Functions, `node --test` + `node:assert/strict`, raw `fetch` to `https://api.anthropic.com/v1/messages`, vanilla inline JS in `site/installer.html`.

**Reference spec:** `docs/superpowers/specs/2026-07-15-installer-dashboard-vin-and-ia-design.md`

---

## File structure

- **Create** `netlify/functions/lib/vin-ocr-core.js` — pure OCR core: `readVinFromImage({imageBase64, mediaType}, {fetchImpl, apiKey, model})` + `normalizeVin(raw)`. Injectable `fetchImpl` for tests; fails open.
- **Create** `netlify/functions/vin-ocr.js` — thin handler: `resolveInstaller` auth → call core with `process.env.ANTHROPIC_API_KEY`.
- **Create** `tests/vin-ocr.test.js` — unit tests for the core (stubbed `fetchImpl`).
- **Modify** `site/installer.html` — (Task 4) scan overlay Capture shutter + OCR + confirm; (Task 5) Jobs sub‑tabs + Done view; (Task 6) not‑closed‑out flag.
- **Owner/deploy** (Task 7) — set `ANTHROPIC_API_KEY`, recover Shannon, rotate `RESEND_API_KEY`, ship.

Model note: **`claude-haiku-4-5`** (owner‑approved for VIN OCR — cheap/fast, ample for reading a VIN). Raw HTTP, no SDK. Haiku 4.5 does not take `effort`/`thinking` params — send a plain vision request.

---

## Task 1: VIN OCR core (`lib/vin-ocr-core.js`)

**Files:**
- Create: `netlify/functions/lib/vin-ocr-core.js`
- Test: `tests/vin-ocr.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/vin-ocr.test.js`:

```javascript
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readVinFromImage, normalizeVin } = require("../netlify/functions/lib/vin-ocr-core.js");

const IMG = "aGVsbG8="; // any non-empty base64
// Build a stub Anthropic fetch that returns the given assistant text.
const stubOk = (text) => async () => ({ ok: true, json: async () => ({ content: [{ type: "text", text }] }) });

test("normalizeVin accepts a clean 17-char VIN and rejects I/O/Q and wrong length", () => {
  assert.equal(normalizeVin("jtebu5jr4k5601234"), "JTEBU5JR4K5601234");
  assert.equal(normalizeVin("JTEBU5JR4K560123"), "");      // 16 chars
  assert.equal(normalizeVin("JTEBU5JR4K5601234X"), "");    // 18 chars
  assert.equal(normalizeVin("IOQEBU5JR4K5601234"), "");    // contains I/O/Q
});

test("returns unconfigured when no apiKey is present (feature degrades to manual)", async () => {
  const out = await readVinFromImage({ imageBase64: IMG, mediaType: "image/jpeg" }, { apiKey: "" });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "unconfigured");
});

test("returns no-image when the image is blank", async () => {
  const out = await readVinFromImage({ imageBase64: "", mediaType: "image/jpeg" }, { apiKey: "k", fetchImpl: stubOk("X") });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "no-image");
});

test("reads a VIN and normalizes surrounding whitespace/case", async () => {
  const out = await readVinFromImage({ imageBase64: IMG, mediaType: "image/jpeg" },
    { apiKey: "k", fetchImpl: stubOk("  jtebu5jr4k5601234 \n") });
  assert.equal(out.ok, true);
  assert.equal(out.vin, "JTEBU5JR4K5601234");
});

test("strips a data: URL prefix from the image before sending", async () => {
  let sentBody;
  const fetchImpl = async (_url, opts) => { sentBody = JSON.parse(opts.body); return { ok: true, json: async () => ({ content: [{ type: "text", text: "JTEBU5JR4K5601234" }] }) }; };
  await readVinFromImage({ imageBase64: "data:image/jpeg;base64,AAAA", mediaType: "image/jpeg" }, { apiKey: "k", fetchImpl });
  assert.equal(sentBody.messages[0].content[0].source.data, "AAAA");
});

test("treats a NONE / unreadable answer as no-vin", async () => {
  const out = await readVinFromImage({ imageBase64: IMG, mediaType: "image/jpeg" }, { apiKey: "k", fetchImpl: stubOk("NONE") });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "no-vin");
});

test("fails open (unavailable) on a non-200 from the API", async () => {
  const out = await readVinFromImage({ imageBase64: IMG, mediaType: "image/jpeg" }, { apiKey: "k", fetchImpl: async () => ({ ok: false, json: async () => ({}) }) });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "unavailable");
});

test("fails open (unavailable) when the fetch throws (timeout/network)", async () => {
  const out = await readVinFromImage({ imageBase64: IMG, mediaType: "image/jpeg" }, { apiKey: "k", fetchImpl: async () => { throw new Error("aborted"); } });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "unavailable");
});

test("sanitizes an unexpected media type to image/jpeg", async () => {
  let sentBody;
  const fetchImpl = async (_url, opts) => { sentBody = JSON.parse(opts.body); return { ok: true, json: async () => ({ content: [{ type: "text", text: "JTEBU5JR4K5601234" }] }) }; };
  await readVinFromImage({ imageBase64: IMG, mediaType: "image/tiff" }, { apiKey: "k", fetchImpl });
  assert.equal(sentBody.messages[0].content[0].source.media_type, "image/jpeg");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/vin-ocr.test.js`
Expected: FAIL — `Cannot find module '../netlify/functions/lib/vin-ocr-core.js'`.

- [ ] **Step 3: Write the implementation**

Create `netlify/functions/lib/vin-ocr-core.js`:

```javascript
// netlify/functions/lib/vin-ocr-core.js
// Read a 17-character VIN from a photo via the Claude Messages API (vision).
// Dependency-free (raw fetch). ADVISORY capture aid only: every non-success path
// returns { ok:false, reason } so the console falls back to manual VIN entry —
// the camera is never allowed to block a close-out. The image is used only for
// this request and is never stored.
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5"; // owner-approved: cheap/fast, ample to read a VIN

// Normalize an OCR'd candidate to a valid 17-char VIN or "" (VINs exclude I/O/Q).
function normalizeVin(raw) {
  const s = String(raw == null ? "" : raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(s) ? s : "";
}

async function readVinFromImage(input, deps) {
  const { imageBase64, mediaType } = input || {};
  const { fetchImpl = fetch, apiKey, model = MODEL } = deps || {};
  if (!apiKey) return { ok: false, reason: "unconfigured" };
  const b64 = String(imageBase64 == null ? "" : imageBase64).replace(/^data:[^,]*,/, "");
  if (!b64) return { ok: false, reason: "no-image" };
  const mt = /^image\/(jpeg|png|webp)$/.test(mediaType || "") ? mediaType : "image/jpeg";
  let res;
  try {
    const ctrl = new AbortController();
    // Haiku vision is fast; 15s bounds a stall well under our tolerance. Fails open.
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      res = await fetchImpl(ANTHROPIC_URL, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 40,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mt, data: b64 } },
              { type: "text", text: "This photo shows a vehicle VIN (door-jamb sticker, windshield plate, or dash). Read the 17-character VIN. A VIN uses only letters and digits and never the letters I, O, or Q. Respond with ONLY the 17 VIN characters and nothing else, or the single word NONE if you cannot read a full, confident VIN." },
            ],
          }],
        }),
      });
    } finally { clearTimeout(timer); }
  } catch (e) { return { ok: false, reason: "unavailable" }; }
  if (!res || !res.ok) return { ok: false, reason: "unavailable" };
  let json;
  try { json = await res.json(); } catch (e) { return { ok: false, reason: "unavailable" }; }
  const text = (json && json.content && json.content[0] && json.content[0].text) || "";
  const vin = normalizeVin(text);
  if (!vin) return { ok: false, reason: "no-vin" };
  return { ok: true, vin };
}

module.exports = { readVinFromImage, normalizeVin };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/vin-ocr.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/vin-ocr-core.js tests/vin-ocr.test.js
git commit -m "feat(vin-ocr): dependency-free Claude-vision VIN OCR core (fails open to manual)"
```

---

## Task 2: VIN OCR function endpoint (`vin-ocr.js`)

**Files:**
- Create: `netlify/functions/vin-ocr.js`
- Test: append to `tests/vin-ocr.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/vin-ocr.test.js`:

```javascript
const { handler } = require("../netlify/functions/vin-ocr.js");

test("handler rejects a request with no installer token (401)", async () => {
  const res = await handler({ headers: {}, body: JSON.stringify({ imageBase64: "AAAA" }) });
  assert.equal(res.statusCode, 401);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/vin-ocr.test.js`
Expected: FAIL — `Cannot find module '../netlify/functions/vin-ocr.js'`.

- [ ] **Step 3: Write the implementation**

Create `netlify/functions/vin-ocr.js` (mirrors `vin-decode.js`):

```javascript
// netlify/functions/vin-ocr.js
// Auth-gated Claude-vision proxy: read a VIN from a photo taken at close-out.
// Advisory capture aid — the console routes every non-success to manual entry,
// so the camera never blocks a close-out. The image is transient (OCR only,
// never stored). Degrades gracefully when ANTHROPIC_API_KEY is unset.
const { resolveInstaller } = require("./lib/installer-auth.js");
const { readVinFromImage } = require("./lib/vin-ocr-core.js");

async function handler(event) {
  const key = resolveInstaller(event.headers || {}, process.env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return { statusCode: 400, body: "bad json" }; }
  const out = await readVinFromImage(
    { imageBase64: body.imageBase64, mediaType: body.mediaType },
    { apiKey: process.env.ANTHROPIC_API_KEY }
  );
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}

module.exports = { handler };
```

**Note:** confirm the auth export name matches `vin-decode.js` (`resolveInstaller` from `./lib/installer-auth.js`). If `installer-auth.js` exports a different symbol, use that instead.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/vin-ocr.test.js`
Expected: PASS (9 tests total).

- [ ] **Step 5: Run the full suite (no regressions)**

Run: `npm test`
Expected: all existing tests still pass, plus the new ones.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/vin-ocr.js tests/vin-ocr.test.js
git commit -m "feat(vin-ocr): auth-gated Netlify endpoint for close-out VIN photo OCR"
```

---

## Task 3: Camera capture shutter + confirm in the scan overlay (`installer.html`)

**Files:**
- Modify: `site/installer.html` — `startScan()` overlay (≈ lines 831–838) and add a capture helper near `stopScan`/`onVin` (≈ lines 806–817).

Behavior: keep the existing barcode auto‑detect, add a **● Capture VIN** button that photographs the current frame, OCRs it via `/vin-ocr`, fills the (always‑editable) VIN field on success, and shows a plain message + keeps manual entry on any failure.

- [ ] **Step 1: Add the Capture button to the overlay markup**

In `startScan(id)`, change the overlay `innerHTML` (currently ends with the Cancel button) to insert a Capture button before Cancel:

Find:
```javascript
    ov.innerHTML='<video id="scanvid_'+id+'" playsinline autoplay muted></video>'+
      '<div class="scanhint">Point at the VIN barcode — door jamb or windshield</div>'+
      '<div id="scanmsg_'+id+'" class="scanmsg"></div>'+
      '<button type="button" class="btn" id="scancx_'+id+'" style="width:100%;background:#8a2a2a">Cancel</button>';
```
Replace with:
```javascript
    ov.innerHTML='<video id="scanvid_'+id+'" playsinline autoplay muted></video>'+
      '<div class="scanhint">Point at the VIN — barcode auto-scans; or tap Capture to photograph a printed VIN</div>'+
      '<div id="scanmsg_'+id+'" class="scanmsg"></div>'+
      '<button type="button" class="btn" id="scancap_'+id+'" style="width:100%;margin-bottom:6px">● Capture VIN</button>'+
      '<button type="button" class="btn" id="scancx_'+id+'" style="width:100%;background:#8a2a2a">Cancel</button>';
```

- [ ] **Step 2: Wire the Capture button after the overlay is inserted**

Immediately after the existing line that wires Cancel:
```javascript
    document.getElementById('scancx_'+id).onclick=function(){ stopScan(id); };
```
add:
```javascript
    document.getElementById('scancap_'+id).onclick=function(){ captureVin(id); };
```

- [ ] **Step 3: Add the `captureVin` helper**

Add this function next to `onVin`/`stopScan` (anywhere in the same `<script>`, e.g. just after `stopScan`):

```javascript
  // Photograph the current camera frame and OCR the VIN via /vin-ocr. On a
  // confident read, fill the (always-editable) VIN field and run the NHTSA guard;
  // on ANY failure, show a plain message and leave the installer to type it.
  // The camera is a convenience — it never blocks close-out.
  async function captureVin(id){
    var video=document.getElementById('scanvid_'+id);
    var btn=document.getElementById('scancap_'+id);
    if(!video || !video.videoWidth){ setScanMsg(id,'Hold steady and try again.'); return; }
    if(btn){ btn.disabled=true; btn.textContent='Reading…'; }
    setScanMsg(id,'Reading the VIN…');
    try{
      var maxEdge=1024, w=video.videoWidth, h=video.videoHeight, scale=Math.min(1, maxEdge/Math.max(w,h));
      var cv=document.createElement('canvas'); cv.width=Math.round(w*scale); cv.height=Math.round(h*scale);
      cv.getContext('2d').drawImage(video,0,0,cv.width,cv.height);
      var dataUrl=cv.toDataURL('image/jpeg',0.7);
      var res=await fetch('/.netlify/functions/vin-ocr',{method:'POST',headers:{'Content-Type':'application/json','x-installer-token':tok()},body:JSON.stringify({imageBase64:dataUrl,mediaType:'image/jpeg'})});
      var out=await res.json().catch(function(){ return {ok:false}; });
      if(out && out.ok && out.vin){ onVin(id,out.vin); return; }  // fills field, stops scan, runs checkVin
    }catch(e){}
    // Any failure → keep the camera open, tell them to retry or type it.
    if(btn){ btn.disabled=false; btn.textContent='● Capture VIN'; }
    setScanMsg(id,"Couldn't read it — retake, or Cancel and type the VIN.");
  }
```

`onVin` already sets the field value, stops the scanner, and calls `checkVin` (the NHTSA guard). The VIN `<input>` remains editable, so the installer can correct an OCR misread before Mark complete. Manual typing is unchanged and always available.

- [ ] **Step 4: Verify in a real browser (camera + OCR)**

This is UI in an inline script — verify manually (or via the existing Playwright harness under `tests/`/`scripts/`). On a deploy preview with a token + `ANTHROPIC_API_KEY` set:
1. Open an open booking's close‑out card → tap **📷 Scan VIN** → camera opens.
2. Tap **● Capture VIN** while pointed at a VIN (printed or barcode) → the VIN field fills; the NHTSA guard runs.
3. Cover the camera / point at nothing → tap Capture → message "Couldn't read it — retake, or Cancel and type the VIN"; typing a VIN still closes out.
Expected: capture fills the field on a good read; failures never block manual entry.

- [ ] **Step 5: Commit**

```bash
git add site/installer.html
git commit -m "feat(installer): VIN capture shutter + Claude-OCR in scan overlay (manual entry always available)"
```

---

## Task 4: Jobs sub-tabs — All / per-location / ✓ Done (`installer.html`)

**Files:**
- Modify: `site/installer.html` — `STATE` init, `renderTabs()` (≈ 472–480), `renderFeed()` (≈ 506–544), `eventCard()` (≈ 549–570); add `renderDone()`.

Goal: under **Jobs**, a horizontally‑scrollable sub‑tab strip `[All] [<city> …] [✓ Done]`. Active tabs show only open/no‑show work (completed pulled out); the Done tab lists completed jobs grouped by event, newest first.

- [ ] **Step 1: Add sub-tab + done-filter state**

Find the `STATE` initializer (search for `STATE={` / `var STATE`) and add these fields alongside the existing ones (`tab`, `q`, `eventOpen`, …):
```javascript
    jobTab: 'all',      // 'all' | '<city>' | 'done'
    doneCity: '',       // optional city filter applied inside the Done view
```

- [ ] **Step 2: Render the Jobs sub-tab strip**

Add a `renderSubTabs()` function and call it from `renderFeed()`. Add near `renderTabs`:

```javascript
  // The Jobs sub-tab strip: All + one tab per city with work + a Done tab.
  // Horizontally scrollable on mobile; a red dot marks a city needing close-out.
  function renderSubTabs(events){
    var host=document.getElementById('subtabs');
    if(!host){ host=document.createElement('div'); host.id='subtabs';
      host.style.cssText='display:flex;gap:8px;overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 0 10px;padding-bottom:2px';
      var feed=document.getElementById('feed'); feed.parentNode.insertBefore(host, feed); }
    var t=STATE.today;
    var cities={};
    events.forEach(function(e){
      var c=(cities[e.city]=cities[e.city]||{city:e.city,open:0,overdue:false});
      c.open+=e.open; if(e.dateISO<t && e.hasOpen) c.overdue=true;
    });
    var list=Object.keys(cities).map(function(k){return cities[k];}).sort(function(a,b){return a.city.localeCompare(b.city);});
    function tab(id,label,dot,badge){ return '<button class="tabbtn'+(STATE.jobTab===id?' on':'')+'" data-sub="'+esc(id)+'" style="white-space:nowrap">'+(dot?'<span style="color:#c0392b">●</span> ':'')+esc(label)+(badge?' <span class="tabbadge">'+badge+'</span>':'')+'</button>'; }
    var html=tab('all','All','',''); 
    list.forEach(function(c){ html+=tab(c.city, c.city, c.overdue, c.open?String(c.open):''); });
    html+=tab('done','✓ Done','','');
    host.innerHTML=html;
    Array.prototype.forEach.call(host.querySelectorAll('.tabbtn'),function(b){ b.onclick=function(){ STATE.jobTab=b.getAttribute('data-sub'); if(STATE.jobTab!=='done') STATE.doneCity=''; renderFeed(); }; });
  }
```

- [ ] **Step 3: Branch `renderFeed()` on the sub-tab**

In `renderFeed()`, right after `var events=buildEvents();`, insert the sub‑tab render + Done/location branching. Replace the existing body from `host.appendChild(anydayWalkForm());` down to the end of the function with:

```javascript
    renderSubTabs(events);

    // Done tab: completed jobs only, grouped by event, newest first.
    if(STATE.jobTab==='done'){ renderDone(events, host); return; }

    host.appendChild(anydayWalkForm());   // everyday walk-in — always available

    // Search mode (unchanged): flat, all-history, event-grouped results.
    if(STATE.q.trim()){
      var hits=events.map(function(e){ return { e:e, bs:e.bookings.filter(matchesQ) }; })
        .filter(function(x){ return x.bs.length; })
        .sort(function(a,b){ return b.e.dateISO.localeCompare(a.e.dateISO); });
      var n=hits.reduce(function(s,x){ return s+x.bs.length; },0);
      host.appendChild(secHead('Search results ('+n+')',''));
      if(!n){ host.innerHTML+='<div class="empty">No matches.</div>'; return; }
      hits.forEach(function(x){ host.appendChild(eventCard(x.e, x.bs, true, false, true)); });
      return;
    }

    var t=STATE.today;
    var scoped = STATE.jobTab==='all' ? events : events.filter(function(e){ return e.city===STATE.jobTab; });
    var needs=scoped.filter(function(e){ return e.dateISO<t && e.hasOpen; }).sort(function(a,b){ return b.dateISO.localeCompare(a.dateISO); });
    var today=scoped.filter(function(e){ return e.dateISO===t; }).sort(function(a,b){ return a.city.localeCompare(b.city); });
    var upcoming=scoped.filter(function(e){ return e.dateISO>t; }).sort(function(a,b){ return a.dateISO.localeCompare(b.dateISO); });

    if(!needs.length && !today.length && !upcoming.length){
      var em=document.createElement('div'); em.className='empty';
      em.textContent = STATE.jobTab==='all' ? 'No open jobs. Use “Log a walk-in / call-in” above; completed work is under ✓ Done.' : 'No open jobs in '+STATE.jobTab+'. Completed work is under ✓ Done.';
      host.appendChild(em); return;
    }
    // Active views hide completed rows (showDone=false) so they don't crowd the close-out UI.
    if(needs.length){ host.appendChild(secHead('Needs close-out','warn')); needs.forEach(function(e){ host.appendChild(eventCard(e,e.bookings,true,true,false)); }); }
    if(today.length){ host.appendChild(secHead('Today','')); today.forEach(function(e){ host.appendChild(eventCard(e,e.bookings,true,true,false)); }); }
    if(upcoming.length){ host.appendChild(secHead('Upcoming','')); upcoming.forEach(function(e,i){ host.appendChild(eventCard(e,e.bookings,i===0,true,false)); }); }
```

(The old "Recent" section is removed from active views — recent/completed jobs now live under ✓ Done.)

- [ ] **Step 4: Add a `showDone` param to `eventCard()`**

Change the signature and the completed‑rows block so active views can suppress completed rows and instead show a deep‑link to Done.

Find:
```javascript
  function eventCard(e, bookings, defaultOpen, canAdd){
```
Replace with:
```javascript
  function eventCard(e, bookings, defaultOpen, canAdd, showDone){
```

Find the completed‑rows block:
```javascript
    var doneB=bookings.filter(function(b){return b.status==='Completed';}).sort(bySlot);
    if(doneB.length){ var h=document.createElement('div'); h.className='donehdr'; h.textContent='✓ Done ('+doneB.length+')'; body.appendChild(h); doneB.forEach(function(b){ body.appendChild(rowCard(b)); }); }
```
Replace with:
```javascript
    var doneB=bookings.filter(function(b){return b.status==='Completed';}).sort(bySlot);
    if(doneB.length){
      if(showDone){ var h=document.createElement('div'); h.className='donehdr'; h.textContent='✓ Done ('+doneB.length+')'; body.appendChild(h); doneB.forEach(function(b){ body.appendChild(rowCard(b)); }); }
      else { var lk=document.createElement('a'); lk.href='#'; lk.className='link'; lk.textContent='✓ '+doneB.length+' done — view ›';
        lk.onclick=function(ev){ ev.preventDefault(); STATE.jobTab='done'; STATE.doneCity=e.city; renderFeed(); }; body.appendChild(lk); }
    }
```

- [ ] **Step 5: Add `renderDone()`**

Add near `renderFeed`:

```javascript
  // The ✓ Done view: completed jobs across markets, grouped by event (city|date),
  // newest first, honoring the search box and an optional city filter (set by the
  // per-event "done — view ›" deep-link). Completed rows never crowd active work.
  function renderDone(events, host){
    if(STATE.doneCity){
      var chip=document.createElement('div'); chip.className='sec';
      chip.innerHTML='<span class="lbl">Completed · '+esc(STATE.doneCity)+'</span> <a href="#" class="link" id="doneall">show all markets ›</a>';
      host.appendChild(chip);
      chip.querySelector('#doneall').onclick=function(ev){ ev.preventDefault(); STATE.doneCity=''; renderFeed(); };
    }
    var done=events.map(function(e){
        var bs=e.bookings.filter(function(b){ return b.status==='Completed' && matchesQ(b) && (!STATE.doneCity || e.city===STATE.doneCity); });
        return { e:e, bs:bs };
      }).filter(function(x){ return x.bs.length; })
      .sort(function(a,b){ return b.e.dateISO.localeCompare(a.e.dateISO); });
    var n=done.reduce(function(s,x){ return s+x.bs.length; },0);
    host.appendChild(secHead('Completed ('+n+')',''));
    if(!n){ host.innerHTML+='<div class="empty">No completed jobs'+(STATE.q.trim()?' match your search':'')+' yet.</div>'; return; }
    done.forEach(function(x){ host.appendChild(eventCard(x.e, x.bs, false, false, true)); });
  }
```

- [ ] **Step 6: Hide the sub-tab strip on the Leads tab**

`renderSubTabs` inserts `#subtabs` above `#feed`; it must be hidden when the top tab is Leads (otherwise it lingers). Update `renderAll()`:

Find:
```javascript
  function renderAll(){ renderTally(); renderTabs(); if(STATE.tab==='leads'){ renderLeads(); } else { renderFeed(); } }
```
Replace with:
```javascript
  function renderAll(){ renderTally(); renderTabs();
    var st=document.getElementById('subtabs'); if(st) st.style.display = STATE.tab==='leads' ? 'none' : 'flex';
    if(STATE.tab==='leads'){ renderLeads(); } else { renderFeed(); } }
```
(`renderSubTabs` sets `display:flex` when it (re)builds on the Jobs tab, so switching back restores it.)

- [ ] **Step 7: Verify in a real browser**

On a deploy preview (admin token shows all markets):
1. Jobs shows a sub‑tab row: `All`, each city with work, `✓ Done`.
2. `All` and a city tab show only open/no‑show jobs; each event with completed work shows `✓ N done — view ›`.
3. Tapping a city tab scopes to that market; a red ● marks a market needing close‑out.
4. `✓ Done` lists completed jobs grouped by date/location, newest first; the search box filters it; the per‑event deep‑link pre‑filters Done to that city with a "show all markets ›" reset.
Expected: completed work no longer appears inside active close‑out cards.

- [ ] **Step 8: Commit**

```bash
git add site/installer.html
git commit -m "feat(installer): Jobs location sub-tabs + dedicated Completed view (mobile de-clutter)"
```

---

## Task 5: Loud "not closed out" flag (`installer.html`)

**Files:**
- Modify: `site/installer.html` — `rowCard()` open‑booking branch (the `head` built ≈ lines 897–899).

Goal: an open booking whose event day is in the past is clearly flagged so no walk‑in is silently left as `Booked` (the Shannon failure). No VIN bypass — purely a visibility cue that composes with the existing "Needs close‑out" section and the location‑tab red dot.

- [ ] **Step 1: Add the overdue flag to open rows**

In `rowCard(b)`, immediately after `var head=...` is assembled and before the `if(b.status==='Completed')` branch, insert:

```javascript
    var overdue = isOpen(b) && b.dateISO < STATE.today;
    if(overdue){ head += '<div class="ffnote">⚠ Not closed out — this customer has no certificate yet. Close it out (VIN + calibration) to send it.</div>'; }
```

(`isOpen` and `STATE.today` already exist. `.ffnote` is the existing warning style used for flex‑fuel notes.)

- [ ] **Step 2: Verify in a real browser**

On a preview, a past‑dated open booking (e.g. Shannon before recovery, or any past open row) shows the amber "Not closed out — no certificate yet" line; a same‑day or completed booking does not.

- [ ] **Step 3: Commit**

```bash
git add site/installer.html
git commit -m "feat(installer): flag past-dated open bookings as 'not closed out — no cert yet'"
```

---

## Task 6: Ship + owner setup + Shannon recovery

**Files:** none (deploy + data ops). Use the `ship` skill for the deploy order.

- [ ] **Step 1: Full test suite green**

Run: `npm test`
Expected: all tests pass (existing + 9 new vin‑ocr tests).

- [ ] **Step 2: Set `ANTHROPIC_API_KEY` (owner secret via clipboard — never in chat)**

Have the owner create an Anthropic Console API key and copy it. Then, without echoing the value:
```bash
ANTHROPIC_API_KEY=$(powershell.exe -NoProfile -Command Get-Clipboard | tr -d '\r') \
  netlify env:set ANTHROPIC_API_KEY "$ANTHROPIC_API_KEY" >/dev/null && echo "set (value not shown)"
```
Then have the owner clear the clipboard. Until this is set, `vin-ocr` returns `{ok:false, reason:"unconfigured"}` and the console silently falls back to manual VIN entry — so Tasks 3–5 are safe to ship first.

- [ ] **Step 3: Ship**

Invoke the `ship` skill (regenerate if needed → `npm test` → push to `master` → verify live). Confirm on the branch guard first: `git branch --show-current` must be `master` (this repo folder is shared with a separate AMSOIL session — see the shared-folder memory).

- [ ] **Step 4: Live-verify the OCR endpoint**

With a valid installer token, POST a small test image to the live `/.netlify/functions/vin-ocr` and confirm a JSON `{ok:...}` response (200). Then in the console UI, open a booking, tap Scan → Capture, and confirm a real VIN reads back.

- [ ] **Step 5: Recover Shannon's certificate**

Her record `reciytsQ4mMdJxBWy` is `Booked` with `OTT Calibration` + `VIN` blank. It needs Aaron's tune details (VIN, OTT calibration, ECU ID, gear ratio, mileage). Once obtained, close her out through the console (or set the fields in Airtable so `certificate-dispatch` sends). Verify `Certificate Sent` becomes true and the email reaches `shannonconroy2003@yahoo.com`. **Do not fabricate her VIN/calibration** — block this step on Aaron's data.

- [ ] **Step 6: Rotate `RESEND_API_KEY` (hygiene follow-up)**

Its value was printed to a session transcript during design. Rotate it in the Resend dashboard, `netlify env:set RESEND_API_KEY` (via clipboard, not chat), redeploy, and send a test cert to confirm email still works.

---

## Task 7 (OPTIONAL — owner may defer): End-of-day open-jobs push reminder

Only build if the owner wants it in the first cut (spec §9 default is to defer). Adds an end‑of‑day web‑push to each installer listing bookings still open on/after their event day, reusing the live C3 push infra (`web-push` dep + "Web Push Subs" table + the existing push helper). Scheduled via `netlify.toml` cron. Follow the existing push‑trigger pattern in the roster/dispatch functions; add unit coverage for the "which bookings are still open" selector with an injected `list`. Defer unless requested.
