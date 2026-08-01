# Installer Login Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An installer enters the passcode once per device and stays logged in forever — the gate reappears only on a genuine passcode rotation or explicit logout.

**Architecture:** All changes are in the single-file web console `site/installer.html` (vanilla JS, no build step). Remove the native biometric gate, funnel all ten inline `401 → wipe → reload` handlers into one shared `handle401()` that re-verifies the token against `installer-prefs` before wiping, render a "Logged in as …" line from the already-returned `roster.installer`, and add a gate breadcrumb explaining why the gate appeared. Tests are static regex asserts over the HTML, matching the existing pattern in `tests/installer-password-manager.test.js`.

**Tech Stack:** Vanilla JS in `site/installer.html`, `node:test` + regex static tests, Netlify functions (unchanged), Capacitor app bundle synced via `app/scripts/sync-web.mjs`.

**Spec:** `docs/superpowers/specs/2026-08-01-installer-login-persistence-design.md`

**Repo caveat:** Other sessions share this repo — commit with explicit pathspecs only (never `git add -A`). Unrelated dirty files (`netlify/functions/lib/leads.js`, `tests/leads.test.js`, `scripts/magnuson/*`) must not be committed.

---

### Task 1: Failing static test file

**Files:**
- Create: `tests/installer-login-persistence.test.js`

- [ ] **Step 1: Write the failing tests**

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const HTML = fs.readFileSync(path.join(__dirname, "..", "site", "installer.html"), "utf8");

// Owner decision 2026-08-01: no biometric gate. The phone's lock screen is the
// security boundary; the passcode is entered once per device, ever.
test("no biometric lock remains", () => {
  assert.ok(!/nativeLock/.test(HTML), "nativeLock must be gone (call and definition)");
  assert.ok(!/BiometricAuth/.test(HTML), "BiometricAuth plugin must not be referenced");
});

// A single 401 must never wipe the passcode — only a CONFIRMED rotation (recheck
// also 401s) or an explicit logout may clear it.
test("exactly two wipe paths: confirmed rotation + explicit logout", () => {
  const wipes = HTML.match(/removeItem\('ty_installer_token'\)/g) || [];
  assert.equal(wipes.length, 2, "only handle401 (confirmed) and the logout handler may wipe the token");
  assert.ok(/function handle401\(/.test(HTML), "shared handle401 must exist");
  const inline = HTML.match(/res\.status===401\)\{ await handle401\(\); return; \}/g) || [];
  assert.ok(inline.length >= 10, "all data-call 401 sites must delegate to handle401 (found " + inline.length + ")");
});

test("gate breadcrumb explains why the gate appeared", () => {
  assert.ok(/id="gatewhy"/.test(HTML), "gate needs the #gatewhy element");
  assert.ok(/ty_gate_reason/.test(HTML), "wipe paths must record a gate reason");
  assert.ok(/passcode was changed/.test(HTML), "rotation copy must be present");
});

test("console shows who is logged in", () => {
  assert.ok(/id="whoami"/.test(HTML), "header needs the #whoami element");
  assert.ok(/Logged in as/.test(HTML), "'Logged in as' render must be present");
});
```

- [ ] **Step 2: Run to verify all four fail**

Run: `node --test tests/installer-login-persistence.test.js` (cwd `C:\Users\grosh\Documents\tunedyota`)
Expected: 4 failing tests ("nativeLock must be gone", wipe count is 11 not 2, no #gatewhy, no #whoami).

---

### Task 2: Implement in `site/installer.html`

**Files:**
- Modify: `site/installer.html` (gate HTML ~line 296, header links ~line 301, gate boot ~lines 451–456, `applyRoster` ~line 767, `nativeLock` ~lines 704–710, ten 401 sites)

- [ ] **Step 1: Remove the biometric lock**

In `showApp()` (~line 456), delete the guard ` if(!(await nativeLock())) return;`:

```js
async function showApp(){ registerServiceWorker(); renderPendingBadge(); document.getElementById('gate').classList.add('hidden'); document.getElementById('app').classList.remove('hidden'); load(); loadThemePref(); }
```

Delete the whole `nativeLock` function (~lines 704–710):

```js
  async function nativeLock(){
    if(!isNative()) return true;
    var B = window.Capacitor.Plugins && window.Capacitor.Plugins.BiometricAuth;
    if(!B) return true;
    try{ await B.authenticate({ reason:'Unlock Tuned Yota', allowDeviceCredential:true }); return true; }
    catch(e){ return false; }
  }
```

(`isNative()` stays — `registerPush` still uses it.)

- [ ] **Step 2: Add the shared `handle401`**

Insert directly after the `fail`/`succeed`/`clearMsg` helpers (~line 459):

```js
  // A lone 401 is NOT proof the passcode is bad — cold starts and transient server
  // trouble must never log an installer out. Re-verify with one cheap authed GET;
  // only a CONFIRMED second 401 (a genuine rotation) wipes the saved passcode.
  var AUTH_CHECKING=false;
  async function handle401(){
    if(AUTH_CHECKING) return; AUTH_CHECKING=true;
    try{
      var res=await fetch('/.netlify/functions/installer-prefs',{headers:{'x-installer-token':tok()}});
      if(res.status===401){
        try{ localStorage.setItem('ty_gate_reason','passcode-changed'); }catch(e){}
        localStorage.removeItem('ty_installer_token'); location.reload(); return;
      }
      fail('Server hiccup — your session is fine. Try that again.');
    }catch(e){ fail('Server hiccup — your session is fine. Try that again.'); }
    finally{ AUTH_CHECKING=false; }
  }
```

- [ ] **Step 3: Delegate all ten 401 sites**

Replace all 8 occurrences (Edit `replace_all`):

```js
if(res.status===401){ localStorage.removeItem('ty_installer_token'); location.reload(); return; }
```
→
```js
if(res.status===401){ await handle401(); return; }
```

Replace both `netErr` variants (lines ~1840, ~2715) the same way:

```js
if(!netErr && res.status===401){ localStorage.removeItem('ty_installer_token'); location.reload(); return; }
```
→
```js
if(!netErr && res.status===401){ await handle401(); return; }
```

(All ten sites are inside async functions — `await` is legal at each.)

- [ ] **Step 4: Gate breadcrumb**

In the gate form, add above the Unlock button (after the `height:8px` spacer, ~line 295):

```html
    <div id="gatewhy" class="hidden" style="margin:0 0 8px;font-size:13px;color:var(--muted)"></div>
```

Update the gate submit handler (~line 451) to clear the reason on unlock:

```js
  document.getElementById('gate').onsubmit=function(e){ e.preventDefault(); var v=document.getElementById('tok').value.trim(); if(!v) return; try{ localStorage.removeItem('ty_gate_reason'); }catch(err){} localStorage.setItem('ty_installer_token', v); showApp(); };
```

Update the logout handler (~line 453) to record its reason:

```js
  document.getElementById('logout').onclick=function(e){ e.preventDefault();
    if(Q().loadQueue(store()).length && !confirm('You have unsynced close-outs/walk-ins. Log out anyway and lose them?')) return;
    try{ localStorage.setItem('ty_gate_reason','logged-out'); }catch(err){}
    localStorage.removeItem('ty_installer_token'); location.reload(); };
```

Add the breadcrumb boot render immediately after `if(tok()) showApp();` (~line 452):

```js
  (function(){ if(tok()) return; var r=''; try{ r=localStorage.getItem('ty_gate_reason')||''; }catch(e){}
    if(!r) return; var el=document.getElementById('gatewhy'); if(!el) return;
    el.textContent = r==='passcode-changed' ? 'Your passcode was changed — enter the new one.' : 'You logged out on this device.';
    el.classList.remove('hidden'); })();
```

- [ ] **Step 5: "Logged in as …" line**

In the header links (~line 301), insert before the logout anchor:

```html
    <span id="whoami" style="margin-left:14px;font-size:12px;color:var(--muted)"></span>
```

In `applyRoster` directly after `STATE.me = data.installer || '';` (~line 767):

```js
    var who=document.getElementById('whoami'); if(who) who.textContent = STATE.me ? 'Logged in as '+STATE.me : '';
```

- [ ] **Step 6: Run the new tests**

Run: `node --test tests/installer-login-persistence.test.js`
Expected: 4 pass. (If the wipe count isn't 2, an inline handler was missed — regrep `res.status===401`.)

---

### Task 3: Full suite, app bundle sync, commit

- [ ] **Step 1: Full test suite**

Run: `npm test` (cwd `C:\Users\grosh\Documents\tunedyota`; regenerates AMSOIL pages as a side effect — expected)
Expected: all tests green, including the untouched `tests/installer-password-manager.test.js` (the gate form itself didn't change).

- [ ] **Step 2: Sync the native app bundle**

Run: `node app/scripts/sync-web.mjs` (from repo root; check the script header if it wants cwd `app/`)
Expected: `app/www/installer.html` now matches the new console. Note: `app/www` is NOT tracked in git — this only stages the next app build; the installed app updates then.

- [ ] **Step 3: Commit with pathspecs (shared repo)**

```powershell
git add -- site/installer.html tests/installer-login-persistence.test.js docs/superpowers/plans/2026-08-01-installer-login-persistence.md
git commit -m "feat(installer): passcode entered once, kept forever" -- site/installer.html tests/installer-login-persistence.test.js docs/superpowers/plans/2026-08-01-installer-login-persistence.md
```

(Include any AMSOIL regeneration artifacts ONLY if `npm test` changed tracked generated files it always regenerates — check `git status` and follow the repo's established pattern; never sweep in the other session's `leads.js`/magnuson files.)

---

### Task 4: Deploy + live verify

- [ ] **Step 1: Deploy via the ship skill** (regenerate → test → push master → live verify — its standard order)

- [ ] **Step 2: Live verification**

- `https://tunedyota.com/installer` returns 200 and the served HTML contains `id="gatewhy"`, `id="whoami"`, `function handle401(` and does NOT contain `nativeLock`.
- With a valid token (clipboard flow from `.claude/memory/installer-console-access.md` — never print it): `installer-roster` returns 200 JSON with `installer` set; a bogus token gets 401 (fail-closed unchanged).

- [ ] **Step 3: Report to Aaron** — browser console fixed immediately; installed app picks it up at its next build; Face ID gone by his decision.
