# Installer VIN Barcode Scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 📷 Scan button to the `/installer.html` close-out card that reads the vehicle VIN barcode with the phone camera and auto-fills the 17-char VIN field.

**Architecture:** A pure `normalizeScannedVin` helper (unit-tested in `lib/vin.js`, mirrored inline in the page). The page uses native `BarcodeDetector` where available (Android) and lazy-loads a vendored ZXing UMD build as a fallback (iPhone). Scan-to-fill only — no storage, no new function. Manual typing always remains.

**Tech Stack:** Vanilla browser JS, `BarcodeDetector` API, `@zxing/library` (vendored UMD), `getUserMedia`, `node:test`.

Spec: `docs/superpowers/specs/2026-07-09-installer-vin-scan-design.md`.

---

## File Structure
- `netlify/functions/lib/vin.js` — **new**: canonical `normalizeScannedVin` (pure).
- `tests/vin.test.js` — **new**: unit tests.
- `site/vendor/zxing.min.js` — **new**: vendored ZXing UMD (iOS fallback, lazy-loaded).
- `site/installer.html` — **modify**: Scan button + camera overlay + scan logic + inline `normalizeScannedVin` mirror.

Tests: `node --test tests/vin.test.js`, full `npm test`.

**Note on device verification:** the camera/scan flow cannot be verified by an automated agent (needs a physical phone + a VIN barcode). Tasks 1-2 are fully automatable; Task 3 is verified only for "page loads, no JS errors, scanner code initializes"; real scanning is owner-verified on an Android and an iPhone in Task 4.

---

## Task 1: `normalizeScannedVin` helper + tests

**Files:** Create `netlify/functions/lib/vin.js`, `tests/vin.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/vin.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeScannedVin } = require("../netlify/functions/lib/vin.js");

test("passes a clean 17-char VIN through", () => {
  assert.equal(normalizeScannedVin("5TFDW5F17MX000000"), "5TFDW5F17MX000000");
});
test("uppercases and strips separators/star wrappers", () => {
  assert.equal(normalizeScannedVin("*5tfdw5f17-mx000000*"), "5TFDW5F17MX000000");
});
test("rejects wrong length", () => {
  assert.equal(normalizeScannedVin("5TF"), "");
  assert.equal(normalizeScannedVin("5TFDW5F17MX0000000000"), "");
});
test("rejects a 17-char string containing VIN-illegal I/O/Q", () => {
  assert.equal(normalizeScannedVin("5TFDW5F17MX00000O"), ""); // ends in O
  assert.equal(normalizeScannedVin("I5TFDW5F17MX00000"), ""); // starts with I
});
test("handles null/undefined/empty", () => {
  assert.equal(normalizeScannedVin(null), "");
  assert.equal(normalizeScannedVin(undefined), "");
  assert.equal(normalizeScannedVin(""), "");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/vin.test.js`
Expected: FAIL ("Cannot find module '../netlify/functions/lib/vin.js'").

- [ ] **Step 3: Write the implementation**

Create `netlify/functions/lib/vin.js`:

```js
// netlify/functions/lib/vin.js
// Pure VIN normalization for scanned/typed input. Uppercases, strips anything
// outside A-Z0-9 (Code-39 start/stop `*`, spaces, dashes), and returns the value
// only if it is a valid 17-char VIN (excludes I/O/Q per the VIN standard); else "".
// NOTE: site/installer.html inlines a byte-identical copy (the browser page can't
// require() a node module). Keep the two in sync.
function normalizeScannedVin(raw) {
  const s = String(raw == null ? "" : raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(s) ? s : "";
}
module.exports = { normalizeScannedVin };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/vin.test.js` (expect all pass) then `npm test` (expect all pass).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/vin.js tests/vin.test.js
git commit -m "feat(installer): pure normalizeScannedVin helper + tests"
```

---

## Task 2: Vendor the ZXing UMD build (iOS fallback)

**Files:** Create `site/vendor/zxing.min.js`

- [ ] **Step 1: Download the vendored build**

Run:
```bash
mkdir -p site/vendor
curl -fsSL -o site/vendor/zxing.min.js https://unpkg.com/@zxing/library@0.19.1/umd/index.min.js
```

- [ ] **Step 2: Verify it's the right build**

Run:
```bash
wc -c site/vendor/zxing.min.js
grep -c "BrowserMultiFormatReader" site/vendor/zxing.min.js
head -c 400 site/vendor/zxing.min.js
```
Expected: file size > 100000 bytes; grep count ≥ 1; the head shows a UMD wrapper that assigns a global (root factory) exposing `ZXing`.

If the grep count is 0 (build layout changed), instead download `@zxing/library@0.18.6` (`https://unpkg.com/@zxing/library@0.18.6/umd/index.min.js`) and re-verify — 0.18.6 is a known-good UMD that exposes `window.ZXing.BrowserMultiFormatReader`. Do not proceed until `BrowserMultiFormatReader` is present and the global is `ZXing`. (Task 3's code uses `window.ZXing.BrowserMultiFormatReader`.)

- [ ] **Step 3: Confirm it will be served (static file under site/)**

Run: `git check-ignore site/vendor/zxing.min.js || echo "not ignored (will be committed + served)"`
Expected: prints "not ignored …" (files under `site/` are served directly by Netlify; no redirect rule needed).

- [ ] **Step 4: Commit**

```bash
git add site/vendor/zxing.min.js
git commit -m "chore(installer): vendor ZXing UMD build for iOS VIN-scan fallback"
```

---

## Task 3: Scan button + camera overlay in the console

**Files:** Modify `site/installer.html`

No unit tests (browser-only camera code; the page has no JS test harness). Verified by load + syntax check here; real scan verified on-device in Task 4.

- [ ] **Step 1: Add scan CSS**

In `site/installer.html`, inside the `<style>` block, add these rules just before `</style>`:

```css
  .scanvin{background:#5B4B42;margin:0 0 6px;width:100%;}
  .scanwrap{position:relative;margin:6px 0;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#000;}
  .scanwrap video{width:100%;display:block;max-height:60vh;object-fit:cover;}
  .scanhint{color:#fff;font-size:12px;text-align:center;padding:6px;background:rgba(0,0,0,.55);position:absolute;top:0;left:0;right:0;}
  .scanmsg{color:#ffe;font-size:12px;text-align:center;padding:4px 4px 8px;background:#000;}
```

- [ ] **Step 2: Add the Scan button to the open close-out card**

In `rowCard(b)`, find the VIN input line:
```js
      '<input id="vin_'+b.id+'" maxlength="17" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="VIN — 17 characters" style="text-transform:uppercase;margin:6px 0">'+
```
Immediately AFTER it (before the `'<select id="cal_'+b.id+'">'` line), insert:
```js
      (canScan()?'<button type="button" class="btn scanvin" id="scan_'+b.id+'">📷 Scan VIN</button>':'')+
```
Then, in the same function where the other handlers are wired (near `c.querySelector('#ok_'+b.id).onclick=...`), add:
```js
    if(canScan()){ var sb=c.querySelector('#scan_'+b.id); if(sb) sb.onclick=function(){ startScan(b.id); }; }
```

- [ ] **Step 3: Add the scan logic (inline mirror of normalizeScannedVin + camera)**

In the `<script>` block, add these functions (place them just above `function rowCard(b){`):

```js
  // --- VIN scan (mirror of netlify/functions/lib/vin.js — keep in sync) ---
  function normalizeScannedVin(raw){
    var s=String(raw==null?'':raw).toUpperCase().replace(/[^A-Z0-9]/g,'');
    return /^[A-HJ-NPR-Z0-9]{17}$/.test(s)?s:'';
  }
  function canScan(){ return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }
  var scanState=null, zxingLoading=null;
  function loadZXing(){
    if(window.ZXing) return Promise.resolve();
    if(zxingLoading) return zxingLoading;
    zxingLoading=new Promise(function(resolve,reject){
      var s=document.createElement('script'); s.src='/vendor/zxing.min.js';
      s.onload=function(){ resolve(); }; s.onerror=function(){ reject(new Error('zxing load failed')); };
      document.head.appendChild(s);
    });
    return zxingLoading;
  }
  function setScanMsg(id,m){ var el=document.getElementById('scanmsg_'+id); if(el) el.textContent=m; }
  function onVin(id,vin){ var i=document.getElementById('vin_'+id); if(i) i.value=vin; stopScan(id); }
  function stopScan(id){
    if(scanState && scanState.id===id){
      if(scanState.raf) cancelAnimationFrame(scanState.raf);
      if(scanState.reader && scanState.reader.reset){ try{ scanState.reader.reset(); }catch(e){} }
      if(scanState.stream){ scanState.stream.getTracks().forEach(function(t){ t.stop(); }); }
      scanState=null;
    }
    var o=document.getElementById('scanov_'+id); if(o) o.remove();
    var b=document.getElementById('scan_'+id); if(b) b.style.display='';
  }
  async function startScan(id){
    if(!canScan()) return;
    var card=document.getElementById('c_'+id); if(!card) return;
    if(document.getElementById('scanov_'+id)) return; // already open
    var ov=document.createElement('div'); ov.id='scanov_'+id; ov.className='scanwrap';
    ov.innerHTML='<video id="scanvid_'+id+'" playsinline autoplay muted></video>'+
      '<div class="scanhint">Point at the VIN barcode — door jamb or windshield</div>'+
      '<div id="scanmsg_'+id+'" class="scanmsg"></div>'+
      '<button type="button" class="btn" id="scancx_'+id+'" style="width:100%;background:#8a2a2a">Cancel</button>';
    card.appendChild(ov);
    var sbtn=document.getElementById('scan_'+id); if(sbtn) sbtn.style.display='none';
    document.getElementById('scancx_'+id).onclick=function(){ stopScan(id); };
    var video=document.getElementById('scanvid_'+id);
    var stream;
    try{ stream=await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' } }); }
    catch(e){ setScanMsg(id,'Camera unavailable — type the VIN.'); return; }
    scanState={ id:id, stream:stream, raf:null, reader:null };
    video.srcObject=stream;
    if('BarcodeDetector' in window){
      var det=new window.BarcodeDetector({ formats:['code_39','data_matrix'] });
      var tick=async function(){
        if(!scanState || scanState.id!==id) return;
        try{ var codes=await det.detect(video);
          for(var i=0;i<codes.length;i++){ var vin=normalizeScannedVin(codes[i].rawValue); if(vin){ onVin(id,vin); return; } }
        }catch(e){}
        scanState.raf=requestAnimationFrame(tick);
      };
      scanState.raf=requestAnimationFrame(tick);
    } else {
      try{ await loadZXing(); }catch(e){ setScanMsg(id,'Scanner unavailable — type the VIN.'); return; }
      if(!scanState || scanState.id!==id) return; // cancelled while loading
      var reader=new window.ZXing.BrowserMultiFormatReader();
      scanState.reader=reader;
      reader.decodeFromVideoDevice(null, video, function(result){
        if(result){ var vin=normalizeScannedVin(result.getText?result.getText():result.text); if(vin){ onVin(id,vin); } }
      });
    }
  }
```

- [ ] **Step 4: Syntax-check the inline JS + confirm nothing else broke**

Run:
```bash
node -e "const fs=require('fs');const h=fs.readFileSync('site/installer.html','utf8');const m=h.match(/<script>([\s\S]*?)<\/script>/);fs.writeFileSync('_c.js',m[1]);"
node --check _c.js && echo "JS OK"; rm -f _c.js
npm test
```
Expected: "JS OK"; `npm test` all pass (installer.html isn't tested, but confirm no regressions).

- [ ] **Step 5: Confirm the two normalizeScannedVin copies match**

Run:
```bash
grep -A1 "function normalizeScannedVin" site/installer.html | grep -c "A-HJ-NPR-Z0-9"
grep -c "A-HJ-NPR-Z0-9" netlify/functions/lib/vin.js
```
Expected: both ≥ 1 (same VIN regex in the inline mirror and the canonical lib).

- [ ] **Step 6: Commit**

```bash
git add site/installer.html
git commit -m "feat(installer): camera VIN-barcode scan to auto-fill the close-out VIN field"
```

---

## Task 4: Ship & on-device verify

**Files:** none (deploy).

- [ ] **Step 1: Full suite green**

Run: `npm test` → all pass.

- [ ] **Step 2: Push (deploys page + vendored asset)**

```bash
git push origin master
```

- [ ] **Step 3: Confirm published**

Run:
```bash
curl -s -o /dev/null -w "installer.html %{http_code}\n" https://tunedyota.com/installer.html
curl -s -o /dev/null -w "zxing %{http_code} %{content_type}\n" https://tunedyota.com/vendor/zxing.min.js
curl -s https://tunedyota.com/installer.html | grep -c "Scan VIN"
```
Expected: installer.html 200; zxing.min.js 200 (JS content-type); "Scan VIN" count ≥ 1.

- [ ] **Step 4: On-device verification (owner / installer — cannot be automated)**

Open `https://tunedyota.com/installer.html` on **an Android phone** and **an iPhone**, unlock, open a booking, tap **📷 Scan VIN**, point at a real VIN barcode (driver's door jamb):
- Android: fills the 17-char VIN via native BarcodeDetector.
- iPhone: `/vendor/zxing.min.js` loads and fills the VIN via ZXing.
- Confirm on iPhone **in the home-screen (standalone) PWA** too (needs iOS 16.4+); if camera is blocked there, the Scan button should be absent and typing still works.
- Cancel releases the camera (indicator light off).

---

## Self-Review notes
- **Spec coverage:** Scan button + overlay + auto-fill (Task 3) ✓; BarcodeDetector + lazy vendored ZXing fallback (Tasks 2-3) ✓; pure normalizeScannedVin unit-tested + inline mirror (Tasks 1, 3) ✓; graceful degradation via `canScan()` gate (Task 3) ✓; scan-to-fill only / no storage (whole plan) ✓; iOS-standalone caveat (Task 4 verify) ✓.
- **Consistency:** `normalizeScannedVin` regex `^[A-HJ-NPR-Z0-9]{17}$` identical in `lib/vin.js` and the inline mirror; Task 3 Step 5 guards it. Element IDs: button `scan_<id>`, overlay `scanov_<id>`, video `scanvid_<id>`, cancel `scancx_<id>`, msg `scanmsg_<id>` — used consistently across startScan/stopScan.
- **Known limit:** ZXing global/API is pinned to `@zxing/library@0.19.1` (`window.ZXing.BrowserMultiFormatReader`, `decodeFromVideoDevice`); Task 2 verifies the class is present before proceeding. Final proof is on-device (Task 4).
