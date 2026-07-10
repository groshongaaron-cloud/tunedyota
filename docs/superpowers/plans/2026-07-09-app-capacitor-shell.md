# Tuned Yota App — Capacitor Shell Implementation Plan (Plan 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the installer console in a Capacitor iOS/Android app — native VIN scanning, biometric lock, push registration — bundled web + Capgo OTA, built by Codemagic, plus the "new booking" push trigger.

**Architecture:** Capacitor project in `app/`. A `sync-web` step assembles `app/www` from the existing `site/` console (no fork). `installer.html` gains **guarded** native branches (`window.Capacitor?.isNativePlatform?.()`) so the plain website is unaffected but the app uses native plugins. Codemagic (cloud Mac) runs `cap add`/build/sign — no Mac needed locally.

**Tech Stack:** Capacitor 6, `@capacitor-mlkit/barcode-scanning`, `@aparajita/capacitor-biometric-auth`, `@capacitor/push-notifications`, `@capgo/capacitor-updater`, Codemagic CI. Backend (Plan 1) already shipped.

Spec: `docs/superpowers/specs/2026-07-09-tunedyota-app-foundation-installer-design.md`. Runbook (owner prereqs): `docs/app/RUNBOOK.md`.

---

## ⚠ Verification reality (read first)
- **Tasks 1–2 are fully testable here** (Node backend + a file-sync script) — do these normally.
- **Tasks 3–6 are Capacitor config + guarded web code that CANNOT be compiled or run from this
  environment** (no Mac/Xcode/Android SDK/accounts). They are written here, then **verified by the
  first Codemagic build + on-device testing** once the runbook accounts exist. Treat their "tests"
  as: web page still syntax-valid + existing suite green + the config is well-formed. Expect to
  adjust the exact native plugin call-shape during the first real build (flagged inline).

## File Structure
- `app/package.json`, `app/capacitor.config.ts` — Capacitor project.
- `app/scripts/sync-web.mjs` — assembles `app/www` from `site/`.
- `codemagic.yaml` — cloud build/sign/publish.
- `site/installer.html` — guarded native branches (scan, biometric, push register).
- `netlify/functions/book-background.js` — add the push trigger.
- `tests/app-sync-web.test.js`, `tests/book-push-trigger.test.js` — new tests.

---

## Task 1: "New booking" push trigger (testable)

**Files:** Modify `netlify/functions/book-background.js`; Test `tests/book-push-trigger.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/book-push-trigger.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processNotifications } = require("../netlify/functions/book-background.js");

// A booking job should fire a push to the assigned installer (non-blocking).
test("a completed booking notification pushes the installer", async () => {
  const pushes = [];
  const job = { mode: "book", d: { name: "Jo", city: "Fargo", email: "j@x.com" }, recordId: "rec1" };
  await processNotifications(job, {
    env: {}, send: async () => ({}), notify: async () => ({}), update: async () => ({}),
    ping: async () => ({}), log: { error() {}, log() {} },
    push: async (key, msg) => { pushes.push({ key, msg }); return { sent: 1, failed: 0 }; },
  });
  assert.equal(pushes.length, 1);
  assert.match(pushes[0].msg.title, /booking/i);
  assert.match(pushes[0].msg.body, /Jo/);
});

test("a push failure never breaks the notification flow", async () => {
  const job = { mode: "book", d: { name: "Jo", city: "Fargo" }, recordId: "rec1" };
  const out = await processNotifications(job, {
    env: {}, send: async () => ({}), notify: async () => ({}), update: async () => ({}),
    ping: async () => ({}), log: { error() {}, log() {} },
    push: async () => { throw new Error("fcm down"); },
  });
  assert.ok(out); // returned, did not throw
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/book-push-trigger.test.js`
Expected: FAIL (push not called / not injectable yet).

- [ ] **Step 3: Wire the trigger**

In `netlify/functions/book-background.js`:

3a. Add to the top requires:
```js
const { sendPush } = require("./lib/push.js");
```
3b. Add `push` to the destructured deps in `processNotifications` (alongside `send`/`notify`/`ping`):
```js
          push = sendPush,
```
3c. Immediately AFTER the booking installer-email block (the `try { ... buildBookingInstallerEmail ... }` at ~line 60), add — using the installer object already in scope (`inst`) and its key:
```js
    try {
      const instKey = Array.isArray(inst && inst.key) ? inst.key[0] : (inst && inst.key);
      if (instKey) await push(instKey, { title: "New booking", body: `${d.name || "A customer"} — ${city || d.city || ""}`, data: { recordId: job.recordId || "" } });
    } catch (e) { if (log.error) log.error("booking push", e.message); }
```
*(If `inst` has no `.key` in this codebase, use whatever installer-key variable is in scope at that point — confirm by reading the surrounding code; the roster/close-out functions use `keyToInstaller(...).key`.)*

- [ ] **Step 4: Run tests**

Run: `node --test tests/book-push-trigger.test.js` (expect pass) then `npm test` (expect all pass).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/book-background.js tests/book-push-trigger.test.js
git commit -m "feat(app): push the installer on a new booking (non-blocking)"
```

---

## Task 2: `sync-web` — assemble app/www from the console (testable)

**Files:** Create `app/scripts/sync-web.mjs`, `tests/app-sync-web.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/app-sync-web.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

test("sync-web copies the console + its assets into app/www with index.html", () => {
  execFileSync("node", ["app/scripts/sync-web.mjs"], { cwd: path.join(__dirname, "..") });
  const www = path.join(__dirname, "..", "app", "www");
  assert.ok(fs.existsSync(path.join(www, "index.html")), "index.html (from installer.html)");
  assert.ok(fs.existsSync(path.join(www, "site.css")), "site.css");
  assert.ok(fs.existsSync(path.join(www, "vendor", "zxing.min.js")), "vendor/zxing.min.js");
  const idx = fs.readFileSync(path.join(www, "index.html"), "utf8");
  assert.match(idx, /Installer Console/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/app-sync-web.test.js`
Expected: FAIL (script missing).

- [ ] **Step 3: Write the script**

Create `app/scripts/sync-web.mjs`:

```js
// app/scripts/sync-web.mjs
// Assemble app/www (the Capacitor webDir) from the canonical console assets in
// site/ — no fork. installer.html becomes the app's index.html. Run before build.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SITE = path.join(ROOT, "site");
const WWW = path.join(ROOT, "app", "www");

fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(path.join(WWW, "vendor"), { recursive: true });

fs.copyFileSync(path.join(SITE, "installer.html"), path.join(WWW, "index.html"));
for (const f of ["site.css", "favicon.ico", "icon-192.png", "icon-512.png", "apple-touch-icon.png", "fox.svg", "site.webmanifest"]) {
  const src = path.join(SITE, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(WWW, f));
}
fs.copyFileSync(path.join(SITE, "vendor", "zxing.min.js"), path.join(WWW, "vendor", "zxing.min.js"));
console.log("app/www assembled from site/ console assets");
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/app-sync-web.test.js` (expect pass) then `npm test`.

- [ ] **Step 5: Add app/www to .gitignore + commit**

```bash
echo "app/www/" >> .gitignore
git add app/scripts/sync-web.mjs tests/app-sync-web.test.js .gitignore
git commit -m "feat(app): sync-web assembles app/www from the console (no fork)"
```

---

## Task 3: Capacitor project config (CI-verified)

**Files:** Create `app/package.json`, `app/capacitor.config.ts`

- [ ] **Step 1: Create `app/package.json`**

```json
{
  "name": "tunedyota-app",
  "version": "1.0.0",
  "private": true,
  "scripts": { "sync-web": "node scripts/sync-web.mjs" },
  "dependencies": {
    "@capacitor/core": "^6.1.2",
    "@capacitor/ios": "^6.1.2",
    "@capacitor/android": "^6.1.2",
    "@capacitor/push-notifications": "^6.0.2",
    "@capacitor-mlkit/barcode-scanning": "^6.1.0",
    "@aparajita/capacitor-biometric-auth": "^7.0.0",
    "@capgo/capacitor-updater": "^6.2.0"
  },
  "devDependencies": { "@capacitor/cli": "^6.1.2" }
}
```

- [ ] **Step 2: Create `app/capacitor.config.ts`**

```ts
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.tunedyota.app",
  appName: "Tuned Yota",
  webDir: "www",
  plugins: {
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
  },
};

export default config;
```

- [ ] **Step 3: Commit**

```bash
git add app/package.json app/capacitor.config.ts
git commit -m "feat(app): Capacitor project config (com.tunedyota.app)"
```
*(Verification: Codemagic runs `npm ci` + `npx cap sync` in Task 5; local `npm install` here is optional and not required.)*

---

## Task 4: Guarded native branches in the console (CI/on-device verified)

**Files:** Modify `site/installer.html`

All branches are behind `window.Capacitor?.isNativePlatform?.()` — **the plain website keeps its
current behavior** (web scanner, no lock, no push). Only the built app takes these paths.

- [ ] **Step 1: Native VIN scan** — in `startScan(id)`, before the existing BarcodeDetector/ZXing logic, add a native short-circuit:

```js
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins && window.Capacitor.Plugins.BarcodeScanner) {
      try {
        var res = await window.Capacitor.Plugins.BarcodeScanner.scan();
        var codes = (res && res.barcodes) || [];
        for (var i=0;i<codes.length;i++){ var vin=normalizeScannedVin(codes[i].rawValue || codes[i].displayValue); if(vin){ onVin(id,vin); return; } }
        setScanMsg(id,'No VIN barcode found — try again or type it.');
      } catch(e){ setScanMsg(id,'Scan cancelled.'); }
      return; // do not fall through to the web scanner in native
    }
```
*(Plugin call-shape to confirm on first build: `@capacitor-mlkit/barcode-scanning` exposes `scan()` returning `{ barcodes: [{ rawValue }] }`. If the global-bridge access differs, adjust to the plugin's registered name.)*

- [ ] **Step 2: Biometric lock** — add near `showApp()`; require biometric/passcode before revealing the console in the app (no-op on web):

```js
  async function nativeLock(){
    if (!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) return true;
    var B = window.Capacitor.Plugins && window.Capacitor.Plugins.BiometricAuth;
    if (!B) return true;
    try { await B.authenticate({ reason: 'Unlock Tuned Yota', allowDeviceCredential: true }); return true; }
    catch(e){ return false; }
  }
```
And in `showApp()`, gate the reveal: `if(!(await nativeLock())) return;` before showing the app.

- [ ] **Step 3: Push registration** — after a successful unlock/login, register for push (no-op on web):

```js
  async function registerPush(){
    if (!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) return;
    var P = window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications;
    if (!P) return;
    try {
      var perm = await P.requestPermissions(); if (perm.receive !== 'granted') return;
      P.addListener('registration', function(t){
        fetch('/.netlify/functions/push-register', { method:'POST', headers:{ 'Content-Type':'application/json','x-installer-token':tok() }, body: JSON.stringify({ token: t.value, platform: (window.Capacitor.getPlatform && window.Capacitor.getPlatform()) || '' }) });
      });
      await P.register();
    } catch(e){}
  }
```
Call `registerPush()` from `load()` after the roster loads. (Uses the console's existing `tok()`.)

- [ ] **Step 4: Syntax-check + existing suite**

```bash
node -e "const fs=require('fs');const h=fs.readFileSync('site/installer.html','utf8');const m=h.match(/<script>([\s\S]*?)<\/script>/);fs.writeFileSync('_c.js',m[1]);"
node --check _c.js && echo "JS OK"; rm -f _c.js
npm test
```
Expected: "JS OK"; all tests pass (web behavior unchanged — branches are native-gated).

- [ ] **Step 5: Commit**

```bash
git add site/installer.html
git commit -m "feat(app): native scan/biometric/push branches (guarded; web unaffected)"
```

---

## Task 5: Codemagic build pipeline + icons (CI-verified)

**Files:** Create `codemagic.yaml`; generate `app/resources/icon.png` + `splash.png` from the brand mark.

- [ ] **Step 1: Generate brand icon + splash** — a 1024×1024 icon and a splash from the existing brand SVG/logo (reuse `scripts/build-seo.mjs`'s sharp rasterization approach). Write them to `app/resources/`.

- [ ] **Step 2: Create `codemagic.yaml`**

```yaml
workflows:
  tunedyota-app:
    name: Tuned Yota App
    instance_type: mac_mini_m2
    environment:
      node: 20
      vars:
        BUNDLE_ID: "com.tunedyota.app"
    scripts:
      - name: Install root + app deps
        script: |
          npm ci
          cd app && npm install
      - name: Assemble web + native projects
        script: |
          node app/scripts/sync-web.mjs
          cd app
          npx cap add ios || true
          npx cap add android || true
          npx cap sync
      - name: Build Android (.aab)
        script: cd app/android && ./gradlew bundleRelease
      - name: Build iOS (.ipa)
        script: |
          cd app/ios/App
          xcode-project build-ipa --workspace App.xcworkspace --scheme App
    artifacts:
      - app/android/app/build/outputs/**/*.aab
      - app/ios/App/build/ios/ipa/*.ipa
    # Signing + TestFlight/Play publishing are configured in the Codemagic UI
    # (App Store Connect API key + Play service account) per the runbook.
```
*(This is a starting pipeline; Codemagic's UI wizard finalizes signing + publishing. Exact build
commands are validated on the first CI run and adjusted there.)*

- [ ] **Step 3: Commit**

```bash
git add codemagic.yaml app/resources
git commit -m "chore(app): Codemagic cloud-build pipeline + app icons"
```

---

## Task 6: First build + on-device verification (owner + CI)

- [ ] Owner completes `docs/app/RUNBOOK.md` (Apple/Google/Firebase/Codemagic).
- [ ] Trigger the Codemagic build → resolve any first-run build errors (native project generation,
      signing) with Claude, iterating against real CI logs.
- [ ] Install via TestFlight (iOS) + internal testing (Android). Verify on real phones:
      console loads, **native VIN scan**, **Face ID lock**, **push received** (send a test via the
      new booking flow or a manual `sendPush`), OTA update applies.
- [ ] Fill store listings, submit for review.

---

## Self-Review notes
- **Spec coverage:** Capacitor scaffold (T3) ✓; bundled web via sync-web (T2) ✓; native VIN scan
  with web fallback (T4.1) ✓; biometric lock (T4.2) ✓; push registration app-side (T4.3) ✓; push
  trigger (T1) ✓; Codemagic build (T5) ✓; on-device verify (T6) ✓. OTA (Capgo) dep is declared
  (T3) and wired at first build (T6). Roster-ready push (event-reminders) is a fast-follow — the
  booking push (T1) proves the path.
- **Web safety:** every T4 branch is `isNativePlatform()`-gated; T4.4 proves the plain site is
  unchanged (syntax + suite).
- **Honesty:** T3–T6 are not locally build-verifiable (no Mac/SDK/accounts here); they're finalized
  against the first Codemagic build + devices, exactly as the spec's "environment limit" states.
