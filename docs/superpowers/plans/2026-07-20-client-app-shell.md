# Client App Shell (Garage-led) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Capacitor app from installer-only into a garage-led client app (spec `docs/superpowers/specs/2026-07-20-client-app-shell-design.md`): zero-barrier first run, per-vehicle upgrade hub driven by a pluggable product-line registry, Converge checkout seam, booking + chat tabs, installer entrance + NEW installer chat inbox, deep links — plus a fix for the pre-existing native-fetch gap (relative `/.netlify/functions/*` URLs fail inside the Capacitor WebView).

**Architecture:** New `site/app.html` (shell UI) + `site/app-shell.js` (pure logic, UMD) + `site/product-lines.js` (registry, UMD) + `site/native-fetch.js` (app-only URL bridge). Backend: `netlify/functions/lib/chat-admin.js` + installer ops in `netlify/functions/chat.js`. `app/scripts/sync-web.mjs` assembles the multi-page bundle. Web stays canonical — no fork.

**Tech Stack:** Vanilla JS (UMD modules like `payment-checkout.js`), Netlify functions + Airtable (deps-injected, `node --test` + `node:assert/strict`), Capacitor 6 (CapacitorHttp, @capacitor/app).

**Conventions (read first):**
- Tests: CJS, `const { test } = require("node:test")`, mocks injected via a `deps` object (see `tests/client-garage.test.js`).
- Site JS modules are UMD: `(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(...); else root.X = factory(...); })(...)` — this is what makes them `require()`-able in tests.
- Loading `site/magnuson-catalog.js` in Node: use `loadCatalog()` from `netlify/functions/lib/magnuson-prices.js` (window shim).
- Run tests: `npm test` (full) or `node --test tests/<file>.test.js` (single).
- Commit style: `feat(app): …` / `feat(chat): …` / `docs(app): …`; push after each green commit (repo rule).

---

### Task 1: Product-line registry (`site/product-lines.js`)

**Files:**
- Create: `site/product-lines.js`
- Test: `tests/product-lines.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/product-lines.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const lines = require("../site/product-lines.js");
const { loadCatalog, priceForSku } = require("../netlify/functions/lib/magnuson-prices.js");
const GARAGE = require(path.join(__dirname, "..", "site", "amsoil-garage.json"));

const MAG = loadCatalog();
const DATA = { magnuson: MAG, amsoil: GARAGE };
const TUNDRA = { make: "Toyota", model: "Tundra", year: "2015" };

test("ctasFor: compliance by construction", () => {
  assert.deepEqual(lines.ctasFor("converge"), ["buy"]);
  assert.deepEqual(lines.ctasFor("reserve"), ["reserve", "referral"]);
  assert.deepEqual(lines.ctasFor("referral"), ["referral"]);
});

test("amsoil line can never render a buy CTA", () => {
  const am = lines.LINES.find((l) => l.id === "amsoil");
  assert.equal(am.checkout, "reserve");
  assert.ok(!lines.ctasFor(am.checkout).includes("buy"));
});

test("magnuson fitment: 2015 Tundra gets kits, prices match server lookup", () => {
  const out = lines.linesFor(TUNDRA, DATA);
  const mag = out.find((l) => l.id === "magnuson");
  assert.ok(mag.items.length >= 1, "expected at least one kit for a 2015 Tundra");
  for (const it of mag.items) {
    const server = priceForSku(it.sku);
    assert.ok(server, `sku ${it.sku} missing from server price map`);
    assert.equal(it.price, server.retail, `price drift for ${it.sku}`);
  }
});

test("amsoil fitment: 2015 Tundra bundle resolves to priced items", () => {
  const out = lines.linesFor(TUNDRA, DATA);
  const am = out.find((l) => l.id === "amsoil");
  assert.ok(am.items.length >= 2, "expected a fluid bundle");
  for (const it of am.items) assert.equal(typeof it.price, "number");
});

test("unknown vehicle -> empty items, lines still listed", () => {
  const out = lines.linesFor({ make: "Honda", model: "Civic", year: "2020" }, DATA);
  assert.equal(out.length, lines.LINES.length);
  for (const l of out) assert.deepEqual(l.items, []);
});

test("no vehicle -> empty items (shop 'view all' handles catalog itself)", () => {
  const out = lines.linesFor(null, DATA);
  for (const l of out) assert.deepEqual(l.items, []);
});

test("garage year-option values like '2024|2.4L-T I4' resolve", () => {
  const out = lines.linesFor({ make: "Toyota", model: "Tacoma", year: "2024|2.4L-T I4" }, DATA);
  const am = out.find((l) => l.id === "amsoil");
  assert.ok(am.items.length >= 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/product-lines.test.js`
Expected: FAIL — `Cannot find module '../site/product-lines.js'`

- [ ] **Step 3: Write the implementation**

```javascript
// site/product-lines.js — pluggable product-line registry (profit centers).
// One adapter per supplier line; onboarding a new supplier = one new entry in
// LINES + its data file. Fitment keys on {make, model, year}; `year` accepts a
// plain year ("2015"), a garage option value ("2024|2.4L-T I4"), or a range.
// The checkout mode is structural compliance: 'converge' may render Buy;
// 'reserve' renders Reserve + referral ONLY (AMSOIL G-4000 §7.6 — no direct
// checkout); 'referral' renders links only.
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./amsoil-garage-render.js"));
  } else {
    root.TYProductLines = factory(root.AmsoilGarage);
  }
})(typeof self !== "undefined" ? self : this, function (AG) {
  function yearNum(year) {
    var m = String(year == null ? "" : year).match(/(19|20)\d{2}/);
    return m ? parseInt(m[0], 10) : null;
  }

  // Which CTAs a checkout mode may render — tested; do not widen casually.
  function ctasFor(mode) {
    if (mode === "converge") return ["buy"];
    if (mode === "reserve") return ["reserve", "referral"];
    return ["referral"];
  }

  function ciKey(obj, want) {
    if (!obj) return null;
    var w = String(want || "").toLowerCase();
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) if (keys[i].toLowerCase() === w) return keys[i];
    return null;
  }

  function magnusonItems(vehicle, catalog) {
    if (!vehicle || !catalog || !Array.isArray(catalog.applications)) return [];
    var name = (String(vehicle.make || "") + " " + String(vehicle.model || "")).trim().toLowerCase();
    var y = yearNum(vehicle.year);
    var out = [];
    catalog.applications.forEach(function (app) {
      if (String(app.vehicle || "").toLowerCase() !== name) return;
      if (y != null && !AG.inRange(app.years, y)) return;
      (app.kits || []).forEach(function (k) {
        out.push({ sku: k.sku, name: k.name, price: k.retail, blurb: k.note || (app.engine + " · " + app.years), url: "/" + app.slug });
      });
    });
    return out;
  }

  function amsoilGen(vehicle, garage) {
    if (!vehicle || !garage || !garage.vehicles) return null;
    var mk = ciKey(garage.vehicles, vehicle.make);
    var md = mk ? ciKey(garage.vehicles[mk], vehicle.model) : null;
    if (!md) return null;
    var gens = garage.vehicles[mk][md];
    var byOption = AG.genForOption(gens, String(vehicle.year || ""));
    if (byOption) return byOption;
    var y = yearNum(vehicle.year);
    if (y == null) return null;
    for (var i = 0; i < gens.length; i++) if (AG.inRange(gens[i].y, y)) return gens[i];
    return null;
  }

  function amsoilItems(vehicle, garage) {
    var gen = amsoilGen(vehicle, garage);
    if (!gen || !Array.isArray(gen.bundle)) return [];
    var out = [];
    gen.bundle.forEach(function (sku) {
      var p = (garage.products || {})[sku];
      if (!p) return;
      out.push({ sku: sku, name: p.name, price: p.salePrice != null ? p.salePrice : p.retailPrice, blurb: null, url: "/amsoil-garage" });
    });
    return out;
  }

  var LINES = [
    { id: "magnuson", label: "Power — Magnuson", icon: "⚡", checkout: "converge",
      itemsFor: function (vehicle, data) { return magnusonItems(vehicle, (data || {}).magnuson); } },
    { id: "amsoil", label: "Fluids — AMSOIL", icon: "🛢", checkout: "reserve",
      itemsFor: function (vehicle, data) { return amsoilItems(vehicle, (data || {}).amsoil); } },
  ];

  function linesFor(vehicle, data) {
    return LINES.map(function (l) {
      return { id: l.id, label: l.label, icon: l.icon, checkout: l.checkout, ctas: ctasFor(l.checkout), items: l.itemsFor(vehicle, data) };
    });
  }

  return { LINES: LINES, linesFor: linesFor, ctasFor: ctasFor, yearNum: yearNum, amsoilGen: amsoilGen };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/product-lines.test.js`
Expected: PASS (all 7). If the 2015-Tundra magnuson test fails, check `AG.inRange` handles the catalog's en-dash ranges ("2007–2018") — it does; the bug will be in your matching, not the data.

- [ ] **Step 5: Full suite + commit**

Run: `npm test` — expected: all green.
```bash
git add site/product-lines.js tests/product-lines.test.js
git commit -m "feat(app): product-line registry - pluggable profit centers w/ structural checkout compliance"
git push
```

---

### Task 2: Native fetch bridge (`site/native-fetch.js`) + CapacitorHttp

Fixes the pre-existing gap: inside the Capacitor WebView, relative `/.netlify/functions/*` URLs resolve against the local bundle origin and fail. The bridge rewrites them to `https://tunedyota.com`; CapacitorHttp performs them natively (no WebView CORS). The file is bundled ONLY into the app (injected by sync-web in Task 9) — web pages never load it.

**Files:**
- Create: `site/native-fetch.js`
- Modify: `app/capacitor.config.ts`
- Test: `tests/native-fetch.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/native-fetch.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const nf = require("../site/native-fetch.js");

test("rewrites function URLs to the live site", () => {
  assert.equal(nf.rewriteFnUrl("/.netlify/functions/chat"), "https://tunedyota.com/.netlify/functions/chat");
});

test("leaves bundled-asset and absolute URLs alone", () => {
  assert.equal(nf.rewriteFnUrl("/vehicles.json"), "/vehicles.json");
  assert.equal(nf.rewriteFnUrl("https://fonts.googleapis.com/x"), "https://fonts.googleapis.com/x");
  assert.equal(nf.rewriteFnUrl("/book.html"), "/book.html");
});

test("install wraps window.fetch and rewrites string inputs only", async () => {
  const calls = [];
  const w = { fetch: async (url, init) => { calls.push([url, init]); return { ok: true }; } };
  nf.install(w);
  await w.fetch("/.netlify/functions/client-garage", { method: "GET" });
  await w.fetch({ url: "req-object" });
  assert.equal(calls[0][0], "https://tunedyota.com/.netlify/functions/client-garage");
  assert.deepEqual(calls[1][0], { url: "req-object" });
});

test("isNative false without Capacitor", () => {
  assert.equal(nf.isNative({}), false);
  assert.equal(nf.isNative({ Capacitor: { isNativePlatform: () => true } }), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/native-fetch.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```javascript
// site/native-fetch.js — APP-BUNDLE-ONLY bootstrap. sync-web.mjs injects a
// <script> tag for this file into bundled HTML; no web page references it.
// Rewrites relative Netlify-function URLs to the live site so the native
// WebView (local-bundle origin) reaches production; CapacitorHttp (enabled in
// app/capacitor.config.ts) then performs the request natively, avoiding CORS.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else {
    var api = factory();
    if (api.isNative(root)) api.install(root);
  }
})(typeof self !== "undefined" ? self : this, function () {
  var BASE = "https://tunedyota.com";
  function isNative(w) {
    return !!(w && w.Capacitor && w.Capacitor.isNativePlatform && w.Capacitor.isNativePlatform());
  }
  function rewriteFnUrl(url) {
    if (typeof url === "string" && url.indexOf("/.netlify/") === 0) return BASE + url;
    return url;
  }
  function install(w) {
    var orig = w.fetch.bind(w);
    w.fetch = function (input, init) {
      return orig(typeof input === "string" ? rewriteFnUrl(input) : input, init);
    };
  }
  return { BASE: BASE, isNative: isNative, rewriteFnUrl: rewriteFnUrl, install: install };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/native-fetch.test.js` — expected: PASS.

- [ ] **Step 5: Enable CapacitorHttp**

In `app/capacitor.config.ts`, change the `plugins` block:

```typescript
  plugins: {
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
    CapacitorHttp: { enabled: true },
  },
```

- [ ] **Step 6: Full suite + commit**

Run: `npm test` — expected: green.
```bash
git add site/native-fetch.js tests/native-fetch.test.js app/capacitor.config.ts
git commit -m "fix(app): native fetch bridge - function calls reach live site from the Capacitor WebView"
git push
```

---

### Task 3: Shell logic (`site/app-shell.js`)

**Files:**
- Create: `site/app-shell.js`
- Test: `tests/app-shell.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/app-shell.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const S = require("../site/app-shell.js");

test("parseRoute covers all views, defaults to garage", () => {
  assert.deepEqual(S.parseRoute(""), { view: "garage", arg: null });
  assert.deepEqual(S.parseRoute("#garage"), { view: "garage", arg: null });
  assert.deepEqual(S.parseRoute("#vehicle/2"), { view: "vehicle", arg: 2 });
  assert.deepEqual(S.parseRoute("#vehicle/x"), { view: "vehicle", arg: 0 });
  assert.deepEqual(S.parseRoute("#shop"), { view: "shop", arg: null });
  assert.deepEqual(S.parseRoute("#shop/magnuson"), { view: "shop", arg: "magnuson" });
  assert.deepEqual(S.parseRoute("#book"), { view: "book", arg: null });
  assert.deepEqual(S.parseRoute("#chat"), { view: "chat", arg: null });
  assert.deepEqual(S.parseRoute("#nonsense"), { view: "garage", arg: null });
});

test("tabFor maps vehicle detail to the garage tab", () => {
  assert.equal(S.tabFor("vehicle"), "garage");
  assert.equal(S.tabFor("shop"), "shop");
});

test("routeForLink: universal-link paths -> shell hash", () => {
  assert.equal(S.routeForLink("/app"), "#garage");
  assert.equal(S.routeForLink("/account"), "#garage");
  assert.equal(S.routeForLink("/magnuson-supercharger-pricing"), "#shop/magnuson");
  assert.equal(S.routeForLink("/supercharger"), "#shop/magnuson");
  assert.equal(S.routeForLink("/amsoil-garage"), "#shop/amsoil");
  assert.equal(S.routeForLink("/book"), "#book");
  assert.equal(S.routeForLink("/book/lakeville-2026-08-02"), "#book");
  assert.equal(S.routeForLink("/faq.html"), null);
});

test("garage store: load/save/add/dedup/remove via injected storage", () => {
  const mem = {}; const storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; } };
  assert.deepEqual(S.loadGarage(storage), []);
  let g = S.addVehicle([], { make: "Toyota", model: "Tundra", year: "2015" });
  g = S.addVehicle(g, { make: "toyota", model: "TUNDRA", year: "2015" }); // dupe, case-insensitive
  assert.equal(g.length, 1);
  S.saveGarage(storage, g);
  assert.deepEqual(S.loadGarage(storage), g);
  assert.deepEqual(S.removeVehicle(g, 0), []);
});

test("loadGarage survives corrupt JSON", () => {
  const storage = { getItem: () => "{not json", setItem: () => {} };
  assert.deepEqual(S.loadGarage(storage), []);
});

test("addVehicle rejects incomplete entries and caps at 20", () => {
  assert.deepEqual(S.addVehicle([], { make: "Toyota" }), []);
  let g = [];
  for (let i = 0; i < 25; i++) g = S.addVehicle(g, { make: "M" + i, model: "X", year: "2020" });
  assert.equal(g.length, 20);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/app-shell.test.js` — expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

```javascript
// site/app-shell.js — pure logic for the client app shell (site/app.html):
// hash routing, deep-link map, guest-garage store. UMD so node --test can
// exercise it. Shares the web guest-garage key so web<->app behavior matches.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TYAppShell = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var GARAGE_KEY = "ty_amsoil_garage"; // same key as amsoil-garage.html:337
  var TOKEN_KEY = "ty_client_token";   // same key as account.html:77
  var TABS = ["garage", "shop", "book", "chat"];

  function parseRoute(hash) {
    var h = String(hash || "").replace(/^#/, "");
    if (!h) return { view: "garage", arg: null };
    var parts = h.split("/");
    if (parts[0] === "vehicle") {
      var i = parseInt(parts[1], 10);
      return { view: "vehicle", arg: isNaN(i) || i < 0 ? 0 : i };
    }
    if (parts[0] === "shop") return { view: "shop", arg: parts[1] || null };
    if (TABS.indexOf(parts[0]) !== -1) return { view: parts[0], arg: null };
    return { view: "garage", arg: null };
  }

  function tabFor(view) { return view === "vehicle" ? "garage" : view; }

  // Universal-link paths -> shell hash (spec §9). null = not ours.
  function routeForLink(pathname) {
    var p = String(pathname || "").replace(/\/+$/, "") || "/";
    if (p === "/app" || p === "/account") return "#garage";
    if (p === "/magnuson-supercharger-pricing" || p === "/supercharger") return "#shop/magnuson";
    if (p.indexOf("/amsoil") === 0) return "#shop/amsoil";
    if (p === "/book" || p.indexOf("/book/") === 0) return "#book";
    return null;
  }

  function loadGarage(storage) {
    try {
      var v = JSON.parse(storage.getItem(GARAGE_KEY) || "[]");
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function saveGarage(storage, list) {
    try { storage.setItem(GARAGE_KEY, JSON.stringify(list)); } catch (e) {}
    return list;
  }
  function vehicleKey(v) {
    return [v && v.make, v && v.model, v && v.year].map(function (s) { return String(s || "").toLowerCase(); }).join("|");
  }
  function addVehicle(list, v) {
    if (!v || !v.make || !v.model || !v.year) return list;
    var key = vehicleKey(v);
    if (list.some(function (x) { return vehicleKey(x) === key; })) return list;
    return list.concat([{ make: String(v.make).slice(0, 40), model: String(v.model).slice(0, 40), year: String(v.year) }]).slice(0, 20);
  }
  function removeVehicle(list, i) { return list.filter(function (_, ix) { return ix !== i; }); }

  return { GARAGE_KEY: GARAGE_KEY, TOKEN_KEY: TOKEN_KEY, TABS: TABS, parseRoute: parseRoute, tabFor: tabFor, routeForLink: routeForLink, loadGarage: loadGarage, saveGarage: saveGarage, addVehicle: addVehicle, removeVehicle: removeVehicle, vehicleKey: vehicleKey };
});
```

- [ ] **Step 4: Run tests, then commit**

Run: `node --test tests/app-shell.test.js` then `npm test` — expected: green.
```bash
git add site/app-shell.js tests/app-shell.test.js
git commit -m "feat(app): shell logic - routing, deep-link map, guest-garage store"
git push
```

---

### Task 4: Shell page — chrome, first run, sign-in, settings (`site/app.html`)

The page skeleton with tab chrome, first-run picker, magic-link auth, and settings sheet. Vehicle/shop/book/chat views land in Tasks 5–6. UI-render code is intentionally inline (repo idiom: logic in tested modules, glue inline).

**Files:**
- Create: `site/app.html`
- Modify: `site/_redirects` (add `/app` rewrite)

- [ ] **Step 1: Create `site/app.html`**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex">
<title>Tuned Yota — My Garage</title>
<link rel="icon" href="/favicon.ico">
<link rel="stylesheet" href="/site.css">
<style>
  html,body{margin:0;background:var(--bg);color:var(--ink);font-family:inherit}
  #shell{display:flex;flex-direction:column;min-height:100vh;min-height:100dvh}
  #topbar{display:flex;align-items:center;justify-content:space-between;padding:14px 16px calc(0px + env(safe-area-inset-top, 0px) * 0 + 10px);padding-top:calc(14px + env(safe-area-inset-top,0px))}
  #topbar .brand{font-weight:800;letter-spacing:.06em}
  #topbar button{background:none;border:none;font-size:20px;cursor:pointer;color:var(--ink)}
  #view{flex:1;padding:0 16px 16px;max-width:560px;width:100%;margin:0 auto;box-sizing:border-box}
  #tabbar{position:sticky;bottom:0;display:flex;background:var(--ink);padding:8px 4px calc(10px + env(safe-area-inset-bottom,0px))}
  #tabbar button{flex:1;background:none;border:none;color:var(--bg);opacity:.65;font-size:11px;cursor:pointer}
  #tabbar button.on{opacity:1;font-weight:700;color:var(--sand)}
  #tabbar .ico{display:block;font-size:18px;margin-bottom:2px}
  .card{background:var(--card);border-radius:var(--r);padding:14px 16px;box-shadow:var(--shadow-sm);margin:10px 0}
  .card h3{margin:0 0 4px;font-size:15px}
  .card p{margin:0;font-size:13px;color:var(--brown)}
  .hero{background:linear-gradient(135deg,var(--ink),var(--brown));color:var(--bg);border-radius:var(--r);padding:18px 16px;margin:10px 0}
  .hero h2{margin:0 0 4px;color:var(--sand);font-size:19px}
  .hero p{margin:0;font-size:13px;opacity:.9}
  .cta{display:block;width:100%;background:var(--ink);color:var(--sand);border:none;border-radius:12px;padding:13px;font-size:15px;font-weight:700;cursor:pointer;margin:10px 0}
  .cta.ghost{background:var(--card);color:var(--ink);border:1.5px solid var(--ink)}
  .chip{display:inline-block;background:var(--card);border:1.5px solid var(--line);border-radius:99px;padding:8px 14px;margin:4px 4px 0 0;font-size:13px;cursor:pointer}
  .chip.sel{background:var(--ink);color:var(--sand);border-color:var(--ink)}
  .tag{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--sage-d);font-weight:700}
  .muted{font-size:12px;color:var(--sage-d)}
  input.field{width:100%;box-sizing:border-box;padding:12px;border:1.5px solid var(--line);border-radius:10px;font-size:15px;background:var(--white)}
  #sheet{position:fixed;inset:0;background:rgba(58,46,38,.45);display:none;align-items:flex-end;z-index:40}
  #sheet.open{display:flex}
  #sheet .inner{background:var(--card);width:100%;border-radius:18px 18px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom,0px));max-width:560px;margin:0 auto}
  #bookframe{width:100%;height:calc(100vh - 170px);border:none;border-radius:var(--r);background:var(--white)}
  #chathost{height:calc(100vh - 170px);display:flex}
  .err{color:#8a3b2a;font-size:13px}
</style>
</head>
<body>
<div id="shell">
  <div id="topbar">
    <span class="brand">TUNED YOTA</span>
    <button id="gear" aria-label="Settings">⚙︎</button>
  </div>
  <div id="view"></div>
  <div id="tabbar">
    <button data-tab="garage"><span class="ico">🚙</span>Garage</button>
    <button data-tab="shop"><span class="ico">🛒</span>Shop</button>
    <button data-tab="book"><span class="ico">📅</span>Book</button>
    <button data-tab="chat"><span class="ico">💬</span>Chat</button>
  </div>
</div>
<div id="sheet"><div class="inner" id="sheetbody"></div></div>

<script>window.TY_CHAT_DOCKED = true;</script>
<script src="/magnuson-catalog.js"></script>
<script src="/amsoil-garage-render.js"></script>
<script src="/product-lines.js"></script>
<script src="/app-shell.js"></script>
<script src="/payment-checkout.js"></script>
<script src="/chat.js" defer></script>
<script>
(function () {
  var S = window.TYAppShell, PL = window.TYProductLines, AG = window.AmsoilGarage;
  var DATA = { magnuson: window.MAGNUSON_CATALOG, amsoil: null };
  var CERTS = null; // null = not loaded; [] = loaded, none
  var VIEW = document.getElementById("view");

  function tok() { return localStorage.getItem(S.TOKEN_KEY) || ""; }
  function api(path, opts) { // account.html pattern incl. sliding renewal
    opts = opts || {};
    opts.headers = Object.assign({ "x-client-token": tok() }, opts.headers || {});
    return fetch("/.netlify/functions/" + path, opts).then(function (res) {
      var renewed = res.headers.get("x-renewed-token");
      if (renewed) localStorage.setItem(S.TOKEN_KEY, renewed);
      if (res.status === 401) { localStorage.removeItem(S.TOKEN_KEY); CERTS = null; }
      return res;
    });
  }
  function esc(s) { var d = document.createElement("div"); d.textContent = String(s == null ? "" : s); return d.innerHTML; }
  function garage() { return S.loadGarage(localStorage); }
  function setGarage(g) {
    S.saveGarage(localStorage, g);
    if (tok()) api("client-garage", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vehicles: g }) }).catch(function () {});
  }

  // ---- boot: magic-link landing + garage data + certs ----
  var qs = new URLSearchParams(location.search);
  var boot = Promise.resolve();
  if (qs.get("lt")) {
    boot = fetch("/.netlify/functions/client-auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "exchange", token: qs.get("lt") }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.status === "ok") {
          localStorage.setItem(S.TOKEN_KEY, j.token);
          // first-visit union of device garage into the account (existing server merge)
          return api("client-garage", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vehicles: garage(), merge: true }) })
            .then(function (r2) { return r2.json(); })
            .then(function (g) { if (g.status === "ok") S.saveGarage(localStorage, g.vehicles); });
        }
      }).catch(function () {})
      .then(function () { history.replaceState(null, "", location.pathname + location.hash); });
  }
  fetch("/amsoil-garage.json").then(function (r) { return r.json(); }).then(function (j) { DATA.amsoil = j; render(); }).catch(function () {});
  function loadCerts() {
    if (!tok() || CERTS !== null) return Promise.resolve();
    return api("client-certs").then(function (r) { return r.ok ? r.json() : { certs: [] }; })
      .then(function (j) { CERTS = j.certs || []; }).catch(function () { CERTS = []; });
  }

  // ---- routing ----
  function go(hash) { if (location.hash !== hash) location.hash = hash; else render(); }
  window.addEventListener("hashchange", render);
  document.getElementById("tabbar").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-tab]"); if (b) go("#" + b.getAttribute("data-tab"));
  });
  document.getElementById("gear").onclick = openSettings;

  function render() {
    var r = S.parseRoute(location.hash);
    Array.prototype.forEach.call(document.querySelectorAll("#tabbar button"), function (b) {
      b.classList.toggle("on", b.getAttribute("data-tab") === S.tabFor(r.view));
    });
    if (r.view === "garage") return garage().length ? renderGarage() : renderFirstRun();
    if (r.view === "vehicle") return renderVehicle(r.arg);
    if (r.view === "shop") return renderShop(r.arg);
    if (r.view === "book") return renderBook();
    if (r.view === "chat") return renderChat();
  }

  // ---- first run: zero barriers ----
  function renderFirstRun() {
    var makes = DATA.amsoil ? Object.keys(DATA.amsoil.vehicles) : ["Toyota", "Lexus"];
    var st = { make: makes[0], model: null, year: null };
    function draw() {
      var models = DATA.amsoil ? Object.keys(DATA.amsoil.vehicles[st.make] || {}) : [];
      var gens = st.model && DATA.amsoil ? DATA.amsoil.vehicles[st.make][st.model] : null;
      var years = gens ? AG.yearOptions(gens) : [];
      VIEW.innerHTML =
        '<div class="hero"><h2>What do you drive?</h2><p>We’ll build your garage — no account, no sign-up.</p></div>' +
        '<div class="card"><div class="tag">Make</div>' + makes.map(function (m) { return '<span class="chip' + (m === st.make ? " sel" : "") + '" data-make="' + esc(m) + '">' + esc(m) + "</span>"; }).join("") + "</div>" +
        '<div class="card"><div class="tag">Model</div>' + (models.map(function (m) { return '<span class="chip' + (m === st.model ? " sel" : "") + '" data-model="' + esc(m) + '">' + esc(m) + "</span>"; }).join("") || '<p class="muted">Loading…</p>') + "</div>" +
        (st.model ? '<div class="card"><div class="tag">Year</div>' + years.map(function (y) { return '<span class="chip' + (y.value === st.year ? " sel" : "") + '" data-year="' + esc(y.value) + '">' + esc(y.label) + "</span>"; }).join("") + "</div>" : "") +
        '<button class="cta" id="openg"' + (st.make && st.model && st.year ? "" : " disabled") + ">Open my garage →</button>" +
        '<p class="muted" style="text-align:center">Already tuned with us? Your certificates appear when you sign in — one tap from your email, no password.</p>';
      VIEW.onclick = function (e) {
        var t = e.target;
        if (t.dataset.make) { st.make = t.dataset.make; st.model = null; st.year = null; draw(); }
        else if (t.dataset.model) { st.model = t.dataset.model; st.year = null; draw(); }
        else if (t.dataset.year) { st.year = t.dataset.year; draw(); }
        else if (t.id === "openg" && st.year) { setGarage(S.addVehicle(garage(), st)); go("#garage"); }
      };
    }
    draw();
  }

  // ---- garage list ----
  function renderGarage() {
    loadCerts().then(function () {
      var g = garage();
      VIEW.innerHTML =
        g.map(function (v, i) {
          return '<div class="card" data-veh="' + i + '" style="cursor:pointer"><h3>' + esc(v.year.split("|")[0] + " " + v.make + " " + v.model) + "</h3><p>" +
            (certsFor(v).length ? "Certificate ✓ · " : "") + "Tap for fluids, upgrades & more →</p></div>";
        }).join("") +
        '<button class="cta ghost" id="addveh">+ Add another vehicle</button>' +
        (tok() ? "" : '<div class="card"><h3>Tuned with us before?</h3><p>Sign in to see your Certificates of Calibration.</p><button class="cta" id="signin" style="margin-bottom:0">Sign in — no password</button></div>');
      VIEW.onclick = function (e) {
        var c = e.target.closest("[data-veh]");
        if (c) return go("#vehicle/" + c.getAttribute("data-veh"));
        if (e.target.id === "addveh") { setGarage([]) /* no-op guard */; renderAdd(); }
        if (e.target.id === "signin") openSettings();
      };
    });
  }
  function renderAdd() { var keep = garage(); S.saveGarage(localStorage, []); renderFirstRun(); var old = VIEW.onclick; /* picker saves via addVehicle on existing list */ S.saveGarage(localStorage, keep); }

  function certsFor(v) {
    if (!CERTS) return [];
    var y = PL.yearNum(v.year), model = String(v.model).toLowerCase();
    return CERTS.filter(function (c) {
      return String(c.vehicle || "").toLowerCase().indexOf(model) !== -1 && (!y || String(c.modelYear || "").indexOf(String(y)) !== -1 || !c.modelYear);
    });
  }

  // renderVehicle / renderShop / renderBook / renderChat arrive in Tasks 5–6.
  function renderVehicle(i) { VIEW.innerHTML = '<p class="muted">Vehicle view (Task 5)</p>'; }
  function renderShop(lineId) { VIEW.innerHTML = '<p class="muted">Shop view (Task 5)</p>'; }
  function renderBook() { VIEW.innerHTML = '<p class="muted">Book view (Task 6)</p>'; }
  function renderChat() { VIEW.innerHTML = '<p class="muted">Chat view (Task 6)</p>'; }

  // ---- settings sheet: sign in/out, installer entrance, legal ----
  var sheet = document.getElementById("sheet"), sheetBody = document.getElementById("sheetbody");
  sheet.addEventListener("click", function (e) { if (e.target === sheet) sheet.classList.remove("open"); });
  function openSettings() {
    sheetBody.innerHTML = tok()
      ? '<h3 style="margin-top:0">Account</h3><p class="muted">Signed in — certificates and garage sync are on.</p>' +
        '<button class="cta ghost" id="signout">Sign out</button>' + settingsFooter()
      : '<h3 style="margin-top:0">Sign in</h3><p class="muted">We’ll email you a one-tap sign-in link. No password.</p>' +
        '<input class="field" id="em" type="email" placeholder="you@example.com" autocomplete="email">' +
        '<button class="cta" id="sendlink">Email my sign-in link</button><p id="authmsg" class="muted"></p>' + settingsFooter();
    sheet.classList.add("open");
    sheetBody.onclick = function (e) {
      if (e.target.id === "signout") { localStorage.removeItem(S.TOKEN_KEY); CERTS = null; sheet.classList.remove("open"); render(); }
      if (e.target.id === "toconsole") location.href = "/installer.html";
      if (e.target.id === "sendlink") {
        var em = document.getElementById("em").value.trim(), msg = document.getElementById("authmsg");
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { msg.textContent = "Enter a valid email."; msg.className = "err"; return; }
        fetch("/.netlify/functions/client-auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "request", email: em }) })
          .then(function (r) { return r.json(); })
          .then(function (j) { msg.className = j.status === "sent" ? "muted" : "err"; msg.textContent = j.status === "sent" ? "Check your email — your sign-in link is on the way." : "Couldn’t send just now — try again in a minute."; })
          .catch(function () { msg.className = "err"; msg.textContent = "Couldn’t send just now — try again in a minute."; });
      }
    };
  }
  function settingsFooter() {
    return '<hr style="border:none;border-top:1px solid var(--line);margin:14px 0">' +
      '<button class="cta ghost" id="toconsole">Installer sign-in</button>' +
      '<p class="muted" style="text-align:center"><a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a></p>';
  }

  // ---- deep links (native) ----
  if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() &&
      window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
    window.Capacitor.Plugins.App.addListener("appUrlOpen", function (ev) {
      try { var h = S.routeForLink(new URL(ev.url).pathname); if (h) { location.hash = h; render(); } } catch (e) {}
    });
  }

  boot.then(render);
})();
</script>
</body>
</html>
```

Note the known wart: `renderAdd` as written above is a placeholder-quality flow. Implement it properly as: set a module-level `ADDING = true` flag, call `renderFirstRun()`, and in the `openg` handler use `setGarage(S.addVehicle(garage(), st))` (which already appends to the existing list) — then clear the flag. `renderFirstRun`'s save path already appends, so the real fix is only: `renderGarage`'s `addveh` handler calls `renderFirstRun()` directly (delete the `renderAdd` helper and the `setGarage([])` line). Do it in this step, not later.

- [ ] **Step 2: Add the `/app` route**

In `site/_redirects`, next to the `/book/*` rules (~line 72), add:

```
/app                  /app.html   200
```

- [ ] **Step 3: Verify on the local web**

Run: `npx netlify dev` (or the repo's usual local serve) → open `http://localhost:8888/app`.
Expected: first-run picker renders with real makes/models/years; picking a vehicle lands on the garage list; settings sheet opens; sign-in form validates. (Vehicle/shop/book/chat views show their Task-5/6 placeholders.)

- [ ] **Step 4: Full suite + commit**

Run: `npm test` — green (no JS module changes beyond new files).
```bash
git add site/app.html site/_redirects
git commit -m "feat(app): client shell page - chrome, zero-barrier first run, magic-link sign-in, installer entrance"
git push
```

---

### Task 5: Vehicle page + Shop tab (registry rendering, Converge CTA, in-shell AMSOIL reserve)

**Files:**
- Modify: `site/app.html` (replace the `renderVehicle` / `renderShop` placeholders; add reserve + checkout helpers)

- [ ] **Step 1: Replace `renderVehicle` and `renderShop`**

```javascript
  function money(n) { return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 0 }); }

  function lineSectionHtml(l, v) {
    if (!l.items.length && l.id !== "more") return "";
    var rows = l.items.map(function (it) {
      return '<p>' + esc(it.name) + (it.price != null ? ' — <b>' + money(it.price) + "</b>" : "") + (it.blurb ? ' <span class="muted">(' + esc(it.blurb) + ")</span>" : "") + "</p>";
    }).join("");
    var cta = "";
    if (l.ctas.indexOf("buy") !== -1 && l.items.length) {
      cta = l.items.map(function (it) { return '<button class="cta" data-buy="' + esc(it.sku) + '" style="margin:6px 0 0">Buy — ' + money(it.price) + " · " + esc(it.name.split(" ").slice(0, 3).join(" ")) + "</button>"; }).join("");
    } else if (l.ctas.indexOf("reserve") !== -1 && l.items.length) {
      cta = '<button class="cta ghost" data-reserve="' + esc(JSON.stringify(l.items.map(function (i) { return i.sku; }))) + '" style="margin:6px 0 0">Reserve this kit — pay at pickup</button>';
    }
    return '<div class="card"><h3>' + l.icon + " " + esc(l.label) + "</h3>" + rows + cta + "</div>";
  }

  function renderVehicle(i) {
    var g = garage(), v = g[i];
    if (!v) return go("#garage");
    loadCerts().then(function () {
      var lines = PL.linesFor(v, DATA);
      var certs = certsFor(v);
      VIEW.innerHTML =
        '<p><a href="#garage" style="color:var(--sage-d);text-decoration:none">‹ Garage</a></p>' +
        '<div class="hero"><h2>' + esc(v.year.split("|")[0] + " " + v.make + " " + v.model) + "</h2><p>" + (tok() ? "Garage synced to your account ✓" : "Saved on this device") + "</p></div>" +
        '<div class="card"><h3>📜 Certificate of Calibration</h3>' +
          (certs.length ? certs.map(function (c) { return '<p>' + esc(c.calibration || "OTT Calibration") + " · " + esc(c.calibrationDate || "") + ' — <a href="#" data-cert="' + esc(c.recordId) + '">view</a></p>'; }).join("")
            : tok() ? '<p class="muted">No certificate on this vehicle yet — it appears here after your install.</p>'
                    : '<p class="muted">Sign in (⚙︎) to see certificates tied to your email.</p>') + "</div>" +
        lines.map(function (l) { return lineSectionHtml(l, v); }).join("") +
        '<div class="card"><h3>🔧 More for this truck</h3><p class="muted">Tires · wheels &amp; offsets · lighting · suspension — lines appear here as suppliers onboard.</p></div>' +
        '<p style="text-align:center"><a href="#" id="rmveh" class="muted">Remove this vehicle</a></p>';
      VIEW.onclick = vehicleClicks(v, i);
    });
  }

  function vehicleClicks(v, i) {
    return function (e) {
      var t = e.target;
      if (t.dataset.cert) {
        e.preventDefault();
        api("client-certs?recordId=" + encodeURIComponent(t.dataset.cert))
          .then(function (r) { if (!r.ok) throw 0; return r.text(); })
          .then(function (html) { window.open(URL.createObjectURL(new Blob([html], { type: "text/html" })), "_blank"); })
          .catch(function () { t.textContent = "unavailable — retry"; });
      } else if (t.dataset.buy) { startBuy(t.dataset.buy, t); }
      else if (t.dataset.reserve) { openReserve(v, JSON.parse(t.dataset.reserve)); }
      else if (t.id === "rmveh") { e.preventDefault(); setGarage(S.removeVehicle(garage(), i)); go("#garage"); }
    };
  }

  // Converge checkout — dormant until CONVERGE_* env vars exist (spec §6).
  function startBuy(sku, btn) {
    var orig = btn.textContent; btn.disabled = true; btn.textContent = "Opening secure checkout…";
    window.TYPayment.startCheckout(sku, {
      onUnavailable: function () { btn.disabled = false; btn.textContent = orig; note(btn, "Online checkout opens soon — chat with us (💬) or call to reserve yours today."); },
      onApproval: function () { btn.textContent = "Paid ✓ — we’ll be in touch to schedule"; },
      onDeclined: function () { btn.disabled = false; btn.textContent = orig; note(btn, "Card declined — no charge was made."); },
      onCancelled: function () { btn.disabled = false; btn.textContent = orig; },
      onError: function () { btn.disabled = false; btn.textContent = orig; note(btn, "Checkout hit a snag — try again or chat with us."); },
    });
  }
  function note(after, text) {
    var p = after.nextElementSibling;
    if (!p || !p.classList || !p.classList.contains("muted")) { p = document.createElement("p"); p.className = "muted"; after.parentNode.insertBefore(p, after.nextSibling); }
    p.textContent = text;
  }

  // AMSOIL reserve — the compliant flow: no online payment (G-4000 §7.6).
  function openReserve(v, kit) {
    sheetBody.innerHTML =
      '<h3 style="margin-top:0">Reserve your AMSOIL kit</h3>' +
      '<p class="muted">' + esc(v.year.split("|")[0] + " " + v.make + " " + v.model) + " — we’ll confirm personally; pay at pickup or install.</p>" +
      '<input class="field" id="rname" placeholder="Name" style="margin-bottom:8px">' +
      '<input class="field" id="remail" type="email" placeholder="Email" style="margin-bottom:8px">' +
      '<input class="field" id="rphone" type="tel" placeholder="Phone (optional)">' +
      '<input class="field" id="rco" style="display:none" tabindex="-1" autocomplete="off">' +
      '<button class="cta" id="rgo">Reserve kit</button><p id="rmsg" class="muted"></p>';
    sheet.classList.add("open");
    sheetBody.onclick = function (e) {
      if (e.target.id !== "rgo") return;
      var msg = document.getElementById("rmsg");
      var body = { name: document.getElementById("rname").value.trim(), email: document.getElementById("remail").value.trim(),
        phone: document.getElementById("rphone").value.trim(), company: document.getElementById("rco").value,
        vehicle: (v.year.split("|")[0] + " " + v.make + " " + v.model).slice(0, 120), fulfillment: "pickup", kit: kit };
      if (!body.name || (!body.email && !body.phone)) { msg.className = "err"; msg.textContent = "Name plus an email or phone, please."; return; }
      fetch("/.netlify/functions/amsoil-reserve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j.status === "ok") { msg.className = "muted"; msg.textContent = "Reserved ✓ — we’ll confirm shortly."; document.getElementById("rgo").disabled = true; }
          else { msg.className = "err"; msg.textContent = "Couldn’t reserve just now — try chat (💬) instead."; }
        })
        .catch(function () { msg.className = "err"; msg.textContent = "Couldn’t reserve just now — try chat (💬) instead."; });
    };
  }

  function renderShop(lineId) {
    var g = garage(), v = g[0] || null, fitOnly = !!v;
    function draw(fit) {
      var lines = PL.linesFor(fit ? v : null, DATA);
      VIEW.innerHTML =
        '<div class="hero"><h2>Shop</h2><p>Performance &amp; overland upgrades for Toyota + Lexus</p></div>' +
        (v ? '<p class="muted" style="text-align:center"><span class="chip' + (fit ? " sel" : "") + '" id="fitme">Fits my ' + esc(v.model) + '</span><span class="chip' + (fit ? "" : " sel") + '" id="fitall">Everything</span></p>' : "") +
        PL.LINES.map(function (base) {
          var l = lines.find(function (x) { return x.id === base.id; });
          var open = lineId ? lineId === l.id : true;
          if (!open) return "";
          if (!l.items.length && fit) return '<div class="card"><h3>' + l.icon + " " + esc(l.label) + '</h3><p class="muted">Nothing for this vehicle — try "Everything".</p></div>';
          return lineSectionHtml(l, fit ? v : null) || ('<div class="card"><h3>' + l.icon + " " + esc(l.label) + '</h3><p class="muted">Browse on the web catalog for all fitments.</p></div>');
        }).join("") +
        '<div class="card"><h3>🔧 Coming soon</h3><p class="muted">Suspension · tires · wheels &amp; offsets · lighting — new supplier lines land right here.</p></div>';
      VIEW.onclick = function (e) {
        if (e.target.id === "fitme") return draw(true);
        if (e.target.id === "fitall") return draw(false);
        if (e.target.dataset.buy) return startBuy(e.target.dataset.buy, e.target);
        if (e.target.dataset.reserve && v) return openReserve(v, JSON.parse(e.target.dataset.reserve));
      };
    }
    draw(fitOnly);
  }
```

Note: with `fit=false`, `linesFor(null, DATA)` returns empty items by design (Task 1 test) — the "Everything" toggle for Magnuson should list ALL applications. Implement that inside `renderShop` by special-casing: when `fit` is false, build magnuson rows directly from `window.MAGNUSON_CATALOG.applications` (every app → its kits, `data-buy` per sku, grouped under a small `<p class="tag">` per vehicle name), and AMSOIL shows a browse-the-garage card. Keep `lineSectionHtml` untouched.

- [ ] **Step 2: Verify on the local web**

`npx netlify dev` → `http://localhost:8888/app` with a Tundra in the garage:
- Vehicle page shows Certificate card, AMSOIL kit with prices + Reserve sheet (submits to `amsoil-reserve` — expect `Reserved ✓` against dev functions, or the friendly failure copy without env), Magnuson kit with Buy button.
- Buy button → `onUnavailable` path fires (no CONVERGE env) → button restores + fallback copy appears. This graceful path IS the current production behavior by design.
- Shop tab: fit toggle works; "Everything" lists the full Magnuson catalog.

- [ ] **Step 3: Full suite + commit**

Run: `npm test` — green.
```bash
git add site/app.html
git commit -m "feat(app): vehicle upgrade hub + shop shelves - registry-driven, Converge buy seam, compliant AMSOIL reserve"
git push
```

---

### Task 6: Book + Chat tabs (iframe booking; chat docked mode)

**Files:**
- Modify: `site/app.html` (replace `renderBook` / `renderChat` placeholders)
- Modify: `site/chat.js` (docked mode + `TYChat.mount`)
- Modify: `site/chat.css` (docked styles)

- [ ] **Step 1: Replace the two placeholders in `app.html`**

```javascript
  function renderBook() {
    VIEW.innerHTML = '<iframe id="bookframe" src="/book.html" title="Book your install"></iframe>';
  }

  var chatMounted = false;
  function renderChat() {
    VIEW.innerHTML = '<div id="chathost"></div>';
    var host = document.getElementById("chathost");
    if (window.TYChat && window.TYChat.mount) { window.TYChat.mount(host); chatMounted = true; }
    else { host.innerHTML = '<p class="muted" style="margin:auto">Chat is loading…</p>'; setTimeout(renderChat, 300); }
  }
```

- [ ] **Step 2: Add docked mode to `site/chat.js`**

The widget is an IIFE (`site/chat.js:5-77`). Three surgical changes — web overlay behavior must not change:

1. Where the floating button is appended to `document.body` (~line 17), guard it:
```javascript
  if (!window.TY_CHAT_DOCKED) document.body.appendChild(btn); // app shell docks the panel instead
```
2. Give `openPanel` an optional container: where the panel element is appended to `document.body`, change to:
```javascript
  function openPanel(container) {
    // ...existing panel construction unchanged...
    if (container) { panel.classList.add("ty-chat-docked"); container.appendChild(panel); }
    else document.body.appendChild(panel);
    // ...existing focus/poll-resume logic unchanged...
  }
```
3. At the bottom of the IIFE (before it closes), expose the mount:
```javascript
  window.TYChat = { mount: function (container) { openPanel(container); } };
```
Also: in the close-button handler (~line 71), guard the "show button again" line with `if (!window.TY_CHAT_DOCKED)`.

- [ ] **Step 3: Add docked styles to `site/chat.css`**

```css
/* Docked mode — app shell hosts the panel inside a tab (site/app.html). */
#ty-chat-panel.ty-chat-docked{position:static;width:100%;height:100%;max-height:none;border-radius:16px;box-shadow:none;flex:1}
#ty-chat-panel.ty-chat-docked .ty-chat-close,#ty-chat-panel.ty-chat-docked #ty-chat-close{display:none}
```
(Check the close button's actual selector at `site/chat.js` ~line 66-71 and use the one that matches — id or class.)

- [ ] **Step 4: Verify both modes on the local web**

- `http://localhost:8888/` (any marketing page): floating chat pill still appears bottom-right, opens, sends. UNCHANGED behavior is the requirement.
- `http://localhost:8888/app` → Chat tab: panel renders docked, full-height, no close button; sending a message works (AI reply arrives with `ANTHROPIC_API_KEY` in dev env, or the degraded-copy path renders).

- [ ] **Step 5: Full suite + commit**

Run: `npm test` — green.
```bash
git add site/app.html site/chat.js site/chat.css
git commit -m "feat(app): book tab (bundled booking) + chat tab (docked widget mode, web overlay unchanged)"
git push
```

---

### Task 7: Installer chat backend (`lib/chat-admin.js` + installer ops + push-on-client-turn)

**Files:**
- Create: `netlify/functions/lib/chat-admin.js`
- Modify: `netlify/functions/chat.js` (handler routes installer ops; escalated client turns push to the installer)
- Test: `tests/chat-admin.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/chat-admin.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const admin = require("../netlify/functions/lib/chat-admin.js");
const { installerOp } = require("../netlify/functions/chat.js");

const ENV = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };
const SESS = (over = {}) => Object.assign({
  id: "s1", recordId: "recX", status: "escalated", pageContext: "default",
  customerName: "Pat", phone: "612", vehicle: "Toyota Tundra", city: "Lakeville",
  installer: "aaron", turns: [{ role: "user", text: "hi", at: 1 }], lastActivity: "2026-07-20T10:00:00Z",
}, over);

test("listSessions filters escalated for installer OR unassigned, sorts newest first", async () => {
  let gotFormula = "";
  const fetchImpl = async (url) => {
    gotFormula = decodeURIComponent(url);
    return { ok: true, json: async () => ({ records: [
      { id: "r1", fields: { "Session ID": "s1", Status: "escalated", "Customer Name": "Pat", Installer: "aaron", Transcript: '[{"role":"user","text":"hi","at":1}]', "Last Activity": "2026-07-20T09:00:00Z" } },
      { id: "r2", fields: { "Session ID": "s2", Status: "escalated", "Customer Name": "Lee", Installer: "", Transcript: '[{"role":"user","text":"yo","at":2}]', "Last Activity": "2026-07-20T11:00:00Z" } },
    ] }) };
  };
  const out = await admin.listSessions("aaron", { env: ENV, fetchImpl });
  assert.ok(gotFormula.includes('escalated'));
  assert.ok(gotFormula.includes('aaron'));
  assert.equal(out[0].id, "s2"); // newer activity first
  assert.equal(out[1].lastRole, "user");
});

test("installerReply appends the SAME turn shape as the SMS relay and claims unassigned", async () => {
  const saved = [];
  const out = await admin.installerReply("s1", "noah", "  On my way  ", {
    env: ENV,
    loadFn: async () => SESS({ installer: "" }),
    saveFn: async (s) => { saved.push(s); return s; },
    now: () => 777,
  });
  assert.equal(out.status, "ok");
  const s = saved[0];
  assert.equal(s.installer, "noah"); // claimed
  assert.deepEqual(s.turns[s.turns.length - 1], { role: "installer", text: "On my way", at: 777 });
});

test("installerReply refuses non-escalated and missing sessions", async () => {
  assert.deepEqual((await admin.installerReply("s1", "aaron", "x", { env: ENV, loadFn: async () => SESS({ status: "ai" }), saveFn: async (s) => s })).error, "not-escalated");
  assert.deepEqual((await admin.installerReply("nope", "aaron", "x", { env: ENV, loadFn: async () => null, saveFn: async (s) => s })).error, "not-found");
  assert.deepEqual((await admin.installerReply("s1", "aaron", "   ", { env: ENV, loadFn: async () => SESS(), saveFn: async (s) => s })).error, "empty");
});

test("closeSession sets status closed", async () => {
  const saved = [];
  const out = await admin.closeSession("s1", { env: ENV, loadFn: async () => SESS(), saveFn: async (s) => { saved.push(s); return s; } });
  assert.equal(out.status, "ok");
  assert.equal(saved[0].status, "closed");
});

test("installerOp routes ops and rejects bad ops", async () => {
  const deps = { list: async () => [{ id: "s1" }], transcript: async () => ({ id: "s1", turns: [] }), reply: async () => ({ status: "ok", turnCount: 2 }), close: async () => ({ status: "ok" }) };
  assert.equal((await installerOp({ op: "list" }, "aaron", deps)).status, 200);
  assert.equal((await installerOp({ op: "transcript", session: "s1" }, "aaron", deps)).status, 200);
  assert.equal((await installerOp({ op: "reply", session: "s1", text: "hi" }, "aaron", deps)).status, 200);
  assert.equal((await installerOp({ op: "close", session: "s1" }, "aaron", deps)).status, 200);
  assert.equal((await installerOp({ op: "wat" }, "aaron", deps)).status, 400);
  const missing = { ...deps, transcript: async () => null };
  assert.equal((await installerOp({ op: "transcript", session: "zz" }, "aaron", missing)).status, 404);
});

test("handler 401s installer ops without a valid token", async () => {
  const { handler } = require("../netlify/functions/chat.js");
  const prev = process.env.INSTALLER_TOKENS;
  delete process.env.INSTALLER_TOKENS;
  const res = await handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ installer: true, op: "list" }) });
  if (prev !== undefined) process.env.INSTALLER_TOKENS = prev;
  assert.equal(res.statusCode, 401);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/chat-admin.test.js`
Expected: FAIL — `Cannot find module '.../lib/chat-admin.js'`

- [ ] **Step 3: Write `netlify/functions/lib/chat-admin.js`**

```javascript
// netlify/functions/lib/chat-admin.js
// Installer-side chat operations for the console Chats inbox. Deps-injected
// like every lib here. Replies write the IDENTICAL turn shape the SMS relay
// writes (twilio-sms.js relayInstallerReply) — one conversation, two channels.
const { cfg, escapeFormula, listRecords } = require("./airtable.js");
const { loadSession, saveSession, parseTranscript, TABLE } = require("./chat-store.js");

async function listSessions(installerKey, { env = process.env, fetchImpl = fetch } = {}) {
  const c = cfg(env);
  const key = escapeFormula(String(installerKey || ""));
  const recs = await listRecords({
    fetchImpl, token: c.token, baseId: c.baseId, table: TABLE(env),
    filterByFormula: `AND({Status}="escalated", OR({Installer}="${key}", {Installer}=""))`,
    fields: ["Session ID", "Status", "Customer Name", "Phone", "Vehicle", "City", "Installer", "Transcript", "Last Activity"],
  });
  return recs.map((r) => {
    const f = r.fields || {};
    const turns = parseTranscript(f.Transcript);
    const last = turns[turns.length - 1] || null;
    return {
      id: f["Session ID"] || "", customerName: f["Customer Name"] || "", phone: f.Phone || "",
      vehicle: f.Vehicle || "", city: f.City || "", installer: f.Installer || "",
      lastActivity: f["Last Activity"] || "", turnCount: turns.length,
      lastRole: last ? last.role : "", lastText: last ? String(last.text || "").slice(0, 120) : "",
    };
  }).sort((a, b) => (a.lastActivity < b.lastActivity ? 1 : -1));
}

async function getTranscript(sessionId, deps = {}) {
  const { loadFn = loadSession } = deps;
  const sess = await loadFn(sessionId, deps);
  if (!sess) return null;
  return { id: sess.id, status: sess.status, customerName: sess.customerName, phone: sess.phone, vehicle: sess.vehicle, city: sess.city, turns: sess.turns };
}

async function installerReply(sessionId, installerKey, text, deps = {}) {
  const { loadFn = loadSession, saveFn = saveSession, now = Date.now } = deps;
  const clean = String(text || "").trim().slice(0, 1000);
  if (!clean) return { status: "error", error: "empty" };
  const sess = await loadFn(sessionId, deps);
  if (!sess) return { status: "error", error: "not-found" };
  if (sess.status !== "escalated") return { status: "error", error: "not-escalated" };
  if (!sess.installer) sess.installer = installerKey; // claim unassigned
  sess.turns.push({ role: "installer", text: clean, at: now() });
  await saveFn(sess, deps);
  return { status: "ok", turnCount: sess.turns.length };
}

async function closeSession(sessionId, deps = {}) {
  const { loadFn = loadSession, saveFn = saveSession } = deps;
  const sess = await loadFn(sessionId, deps);
  if (!sess) return { status: "error", error: "not-found" };
  sess.status = "closed";
  await saveFn(sess, deps);
  return { status: "ok" };
}

module.exports = { listSessions, getTranscript, installerReply, closeSession };
```

- [ ] **Step 4: Route installer ops in `netlify/functions/chat.js`**

Add near the top:
```javascript
const { resolveInstaller } = require("./lib/installer-auth.js");
const chatAdmin = require("./lib/chat-admin.js");
```

Add the op router (exported for tests):
```javascript
// Installer-authed inbox operations (console Chats panel).
async function installerOp(body, installerKey, deps = {}) {
  const { list = chatAdmin.listSessions, transcript = chatAdmin.getTranscript,
          reply = chatAdmin.installerReply, close = chatAdmin.closeSession } = deps;
  if (body.op === "list") return { status: 200, body: { sessions: await list(installerKey, deps) } };
  if (body.op === "transcript") {
    const t = await transcript(String(body.session || ""), deps);
    return t ? { status: 200, body: t } : { status: 404, body: { error: "not-found" } };
  }
  if (body.op === "reply") {
    const r = await reply(String(body.session || ""), installerKey, body.text, deps);
    return { status: r.status === "ok" ? 200 : 400, body: r };
  }
  if (body.op === "close") {
    const r = await close(String(body.session || ""), deps);
    return { status: r.status === "ok" ? 200 : 404, body: r };
  }
  return { status: 400, body: { error: "bad-op" } };
}
```

In `handler` (line ~114), after JSON parse and before `processChat`:
```javascript
  if (body && body.installer) {
    const key = resolveInstaller(event.headers || {}, process.env);
    if (!key) return { statusCode: 401, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "unauthorized" }) };
    const out = await installerOp(body, key, {});
    return { statusCode: out.status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out.body) };
  }
```

Extend `module.exports` with `installerOp`.

- [ ] **Step 5: Push the installer on escalated client turns**

In `processChat` (netlify/functions/chat.js:57-112), find the branch where a **user** message is appended to a session whose `status === "escalated"` (the no-AI path). Add a deps-injected notify, default wired to `sendWebPush` (`lib/webpush.js`):

```javascript
const { sendWebPush } = require("./lib/webpush.js");
// in processChat deps destructuring:
const { notify = (sess, text) => sendWebPush(sess.installer, { title: "Chat: " + (sess.customerName || "customer"), body: String(text).slice(0, 90), url: "/installer.html#chats" }) } = deps;
// in the escalated-message branch, after the user turn is appended and saved:
if (sess.installer) { try { await notify(sess, message); } catch (e) {} }
```

Add to `tests/chat-admin.test.js` (uses the real `processChat` with mocks, mirroring `tests/chat-handler.test.js` deps):

```javascript
test("client message on an escalated session notifies the installer, ai session does not", async () => {
  const { processChat } = require("../netlify/functions/chat.js");
  const pings = [];
  const mk = (status) => ({
    env: ENV, log: { error: () => {} },
    load: async () => SESS({ status }),
    save: async (s) => s,
    ai: async () => ({ reply: "ok", transfer: null }),
    notify: async (sess, text) => { pings.push([sess.installer, text]); },
  });
  await processChat({ session: "s1", message: "are you there?" }, mk("escalated"));
  assert.deepEqual(pings, [["aaron", "are you there?"]]);
  await processChat({ session: "s1", message: "hello" }, mk("ai"));
  assert.equal(pings.length, 1);
});
```
(Match the exact deps names `processChat` already uses — open `tests/chat-handler.test.js` and mirror its mock keys; if it injects `load`/`save`/`ai` under different names, use those.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test tests/chat-admin.test.js` then `npm test` (regression: `tests/chat-handler.test.js`, `tests/chat-store.test.js`, twilio relay tests must stay green — the SMS path is untouched).
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/lib/chat-admin.js netlify/functions/chat.js tests/chat-admin.test.js
git commit -m "feat(chat): installer inbox backend - list/transcript/reply/close + push on escalated client turns"
git push
```

---

### Task 8: Installer console Chats panel (`site/installer.html`)

Console JS is inline by repo convention (logic that needed tests landed in Task 7). Follow the existing tab idiom exactly.

**Files:**
- Modify: `site/installer.html`

- [ ] **Step 1: Add state + API helper**

In the `STATE` object (~line 276), add: `chats:[], chatOpen:null, chatsLoaded:false`. Add a module-level `var CHAT_POLL=null;` beside it. Near the other fetch helpers add:

```javascript
  async function chatApi(body){
    var res = await fetch('/.netlify/functions/chat',{ method:'POST',
      headers:{ 'Content-Type':'application/json','x-installer-token':tok() },
      body: JSON.stringify(Object.assign({installer:true}, body)) });
    if(!res.ok) throw new Error('chat '+res.status);
    return res.json();
  }
```

- [ ] **Step 2: Add the tab + render wiring**

In `renderTabs()` (~line 839) add a `tab('chats','Chats', STATE.chats.length||null)` button alongside jobs/leads, and in its click handler load on first open (mirror the leads idiom): `if(STATE.tab==='chats'&&!STATE.chatsLoaded){ loadChats(); }`. In `renderAll()` (~line 829) add: `if(STATE.tab==='chats'){ renderChats(); return; }` before the jobs/leads branch, and clear the poll when leaving: at the top of `renderAll()` add `if(STATE.tab!=='chats'&&CHAT_POLL){ clearInterval(CHAT_POLL); CHAT_POLL=null; }`.

```javascript
  async function loadChats(){
    try{ var j = await chatApi({op:'list'}); STATE.chats = j.sessions||[]; STATE.chatsLoaded = true; }
    catch(e){ STATE.chats = []; STATE.chatsLoaded = true; }
    renderAll();
  }
  function renderChats(){
    var host = document.getElementById('feed');
    if(STATE.chatOpen) return renderChatThread(host);
    if(!CHAT_POLL) CHAT_POLL = setInterval(loadChats, 15000);
    host.innerHTML = STATE.chats.length ? STATE.chats.map(function(s){
      return '<div class="card" data-chat="'+s.id+'" style="cursor:pointer"><b>'+esc(s.customerName||'Customer')+'</b>'+
        (s.lastRole==='user'?' <span style="color:var(--sand);font-weight:700">● new</span>':'')+
        '<div class="muted">'+esc(s.vehicle||'')+(s.city?' · '+esc(s.city):'')+'</div>'+
        '<div class="muted">'+esc(s.lastText||'')+'</div></div>';
    }).join('') : '<p class="muted" style="padding:14px">No active chats. Escalations land here (and still SMS you).</p>';
    host.onclick = function(e){ var c=e.target.closest('[data-chat]'); if(c){ STATE.chatOpen=c.getAttribute('data-chat'); renderAll(); } };
  }
  async function renderChatThread(host){
    var j; try{ j = await chatApi({op:'transcript', session:STATE.chatOpen}); }catch(e){ STATE.chatOpen=null; return renderAll(); }
    host.innerHTML = '<p><a href="#" id="chatback">‹ Chats</a> · <b>'+esc(j.customerName||'Customer')+'</b> '+esc(j.vehicle||'')+
      (j.phone?' · <a href="tel:'+esc(j.phone)+'">'+esc(j.phone)+'</a>':'')+'</p>'+
      '<div id="chatlog" style="max-height:50vh;overflow:auto">'+j.turns.map(function(t){
        var who = t.role==='user'?'Customer':(t.role==='installer'?'You':'AI');
        return '<p><b>'+who+':</b> '+esc(t.text)+'</p>';
      }).join('')+'</div>'+
      '<form id="chatreply"><input id="chattext" placeholder="Reply…" style="width:70%"> <button>Send</button> <button type="button" id="chatclose">Close chat</button></form>';
    var log = document.getElementById('chatlog'); log.scrollTop = log.scrollHeight;
    if(!CHAT_POLL) CHAT_POLL = setInterval(function(){ if(STATE.chatOpen) renderChatThread(host); }, 5000);
    document.getElementById('chatback').onclick = function(e){ e.preventDefault(); STATE.chatOpen=null; loadChats(); };
    document.getElementById('chatreply').onsubmit = async function(e){
      e.preventDefault(); var t=document.getElementById('chattext');
      if(!t.value.trim()) return;
      try{ await chatApi({op:'reply', session:STATE.chatOpen, text:t.value}); t.value=''; renderChatThread(host); }catch(err){}
    };
    document.getElementById('chatclose').onclick = async function(){
      try{ await chatApi({op:'close', session:STATE.chatOpen}); }catch(e){}
      STATE.chatOpen=null; loadChats();
    };
  }
```
(If the console has no `esc()` helper in scope, reuse whichever HTML-escaping helper the feed renderers use — check `renderFeed`; do NOT interpolate raw strings.)

- [ ] **Step 3: Deep-link the push URL + native back-link**

The Task-7 push sends `url: "/installer.html#chats"`. At console boot (after auth success, where the first `renderAll()` runs), add: `if(location.hash==='#chats'){ STATE.tab='chats'; loadChats(); }`.
In the header links row (~line 244-249) add a native-only escape hatch back to the client shell: `<a href="/index.html" id="backapp" style="display:none">‹ App</a>` and, next to the existing `isNative()` usage, `if(isNative()) document.getElementById('backapp').style.display='';`.

- [ ] **Step 4: Verify + regression**

Run: `npm test` — green (no tested modules touched).
`npx netlify dev` → open the console with your dev passcode → Chats tab renders the empty state (or live sessions if any exist in the dev base). Escalate a test chat from `/app`'s Chat tab (ask it for a human + provide contact/vehicle/city) → session appears in the inbox → reply from the console → reply appears in the client widget within ~3s (its existing poll).

- [ ] **Step 5: Commit**

```bash
git add site/installer.html
git commit -m "feat(chat): console Chats inbox - list, thread view, reply, close; #chats deep link + native back-link"
git push
```

---

### Task 9: Deep-link assets + sync-web assembly + @capacitor/app

**Files:**
- Create: `site/.well-known/apple-app-site-association` (placeholder Team ID)
- Create: `site/.well-known/assetlinks.json` (placeholder fingerprint)
- Create: `app/scripts/sync-lib.mjs`
- Modify: `app/scripts/sync-web.mjs`, `app/package.json`, `netlify.toml`, `docs/app/RUNBOOK.md`
- Test: `tests/sync-web.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/sync-web.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");

test("injectNativeFetch adds the bootstrap tag once, right after <head>", async () => {
  const { injectNativeFetch } = await import("../app/scripts/sync-lib.mjs");
  const html = "<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body></html>";
  const out = injectNativeFetch(html);
  assert.ok(out.includes('<script src="/native-fetch.js"></script>'));
  assert.ok(out.indexOf("native-fetch.js") < out.indexOf("<meta"), "bootstrap must load before page scripts");
  assert.equal(injectNativeFetch(out), out, "idempotent");
});

test("PAGES maps app.html to the app index and keeps installer + book", async () => {
  const { PAGES, ASSETS } = await import("../app/scripts/sync-lib.mjs");
  assert.deepEqual(PAGES.find((p) => p[1] === "index.html"), ["app.html", "index.html"]);
  assert.ok(PAGES.some((p) => p[0] === "installer.html"));
  assert.ok(PAGES.some((p) => p[0] === "book.html"));
  for (const need of ["app-shell.js", "product-lines.js", "native-fetch.js", "payment-checkout.js", "magnuson-catalog.js", "amsoil-garage-render.js", "amsoil-garage.json", "vehicles.json", "chat.js", "chat.css"]) {
    assert.ok(ASSETS.includes(need), need + " missing from bundle");
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/sync-web.test.js` — expected: FAIL, cannot find `sync-lib.mjs`.

- [ ] **Step 3: Write `app/scripts/sync-lib.mjs` and slim `sync-web.mjs`**

```javascript
// app/scripts/sync-lib.mjs
// Assembly logic for app/www (the Capacitor webDir), exported for tests.
// The client shell (app.html) is the app's index; installer console + booking
// ride along. Bundled HTML gets the native-fetch bootstrap injected so
// /.netlify/functions/* calls reach the live site from the native WebView.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SITE = path.join(ROOT, "site");
const WWW = path.join(ROOT, "app", "www");

export const PAGES = [
  ["app.html", "index.html"],
  ["installer.html", "installer.html"],
  ["book.html", "book.html"],
];

export const ASSETS = [
  "site.css", "chat.css", "favicon.ico", "icon-192.png", "icon-512.png",
  "apple-touch-icon.png", "fox.svg", "logo.png", "installer.webmanifest",
  "commission-tally.js", "offline-queue.js", "sw.js",
  "app-shell.js", "product-lines.js", "native-fetch.js", "payment-checkout.js",
  "magnuson-catalog.js", "amsoil-garage-render.js", "amsoil-garage.json",
  "vehicles.json", "chat.js",
];

export function injectNativeFetch(html) {
  const tag = '<script src="/native-fetch.js"></script>';
  if (html.includes(tag)) return html;
  return html.replace(/<head([^>]*)>/i, (m) => m + "\n  " + tag);
}

export function assemble() {
  fs.rmSync(WWW, { recursive: true, force: true });
  fs.mkdirSync(path.join(WWW, "vendor"), { recursive: true });
  for (const [src, dst] of PAGES) {
    const html = fs.readFileSync(path.join(SITE, src), "utf8");
    fs.writeFileSync(path.join(WWW, dst), injectNativeFetch(html));
  }
  for (const f of ASSETS) {
    const src = path.join(SITE, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(WWW, f));
  }
  fs.copyFileSync(path.join(SITE, "vendor", "zxing.min.js"), path.join(WWW, "vendor", "zxing.min.js"));
  console.log("app/www assembled: client shell (index) + installer console + booking");
}
```

Replace `app/scripts/sync-web.mjs` body with:
```javascript
// app/scripts/sync-web.mjs — run the assembly (logic + tests: sync-lib.mjs).
import { assemble } from "./sync-lib.mjs";
assemble();
```

- [ ] **Step 4: Run tests, then run the assembly**

Run: `node --test tests/sync-web.test.js` — PASS.
Run: `cd app && npm run sync-web && cd ..` — expected log line, and `app/www/index.html` starts with the app shell + contains the native-fetch tag.

- [ ] **Step 5: Universal-link association files + headers + RUNBOOK**

`site/.well-known/apple-app-site-association` (no file extension — placeholder until the owner's Apple Team ID exists):
```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAMID.com.tunedyota.app",
        "paths": ["/app", "/account", "/book", "/book/*", "/magnuson-supercharger-pricing", "/supercharger", "/amsoil-garage"]
      }
    ]
  }
}
```

`site/.well-known/assetlinks.json`:
```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.tunedyota.app",
      "sha256_cert_fingerprints": ["REPLACE_WITH_PLAY_SIGNING_SHA256"]
    }
  }
]
```

Append to `netlify.toml`:
```toml
[[headers]]
  for = "/.well-known/apple-app-site-association"
  [headers.values]
    Content-Type = "application/json"
```

In `docs/app/RUNBOOK.md`, add a step after the Codemagic section:
```markdown
## 7. Universal links (deep links into the app)
Two placeholder files ship on the site and must be completed before store submission:
1. `site/.well-known/apple-app-site-association` — replace `TEAMID` with your Apple **Team ID** (step 1.4).
2. `site/.well-known/assetlinks.json` — replace the fingerprint with the **SHA-256 of the Play App Signing key** (Play Console → Setup → App signing) once step 2 is done.
→ Tell Claude both values and I'll wire + deploy them.
```

- [ ] **Step 6: Add @capacitor/app**

Open `app/package.json`, read the `@capacitor/core` major version, and add `"@capacitor/app"` at the same major (e.g. core `^6.x` → `"@capacitor/app": "^6.0.0"`) to dependencies. Run `cd app && npm install && cd ..` (updates `app/package-lock.json` if present; Codemagic installs from here).

- [ ] **Step 7: Full suite + commit**

Run: `npm test` — green.
```bash
git add app/scripts/sync-lib.mjs app/scripts/sync-web.mjs tests/sync-web.test.js site/.well-known netlify.toml docs/app/RUNBOOK.md app/package.json
git commit -m "feat(app): multi-page bundle assembly + universal-link scaffolding (@capacitor/app, .well-known, RUNBOOK)"
git push
```
(Include `app/package-lock.json` in the `git add` if it changed.)

---

### Task 10: SEO pass + ship + live verify

**Files:**
- Possibly modify: SEO build output (`site/sitemap.xml` etc.)

- [ ] **Step 1: SEO build**

Run: `npm run build:seo` then `git status -s`.
`app.html` carries `<meta name="robots" content="noindex">`. If the sitemap now lists `/app` or `app.html`, open the build:seo script, find how `installer.html` is excluded (it is not in the sitemap today), and add `app.html` to the same exclusion mechanism; re-run and confirm.

- [ ] **Step 2: Full verification sweep**

Run: `npm test` — every suite green (expect the count to have grown from 350+ by the new suites).
Run: `cd app && npm run sync-web && cd ..` — assembles clean.

- [ ] **Step 3: Ship**

```bash
git add -A
git commit -m "feat(app): client app shell phase - ship"
git push
```
(If Step 1 produced no changes, skip the commit.)

- [ ] **Step 4: Live verify on production (web is the app's canary)**

- `https://tunedyota.com/app` → first-run picker → garage → vehicle page: AMSOIL kit priced, Magnuson Buy → graceful "checkout opens soon" (Converge unconfigured — correct), Reserve sheet submits ✓.
- Magic link: settings → email → link lands back in `/app` signed in; certificates render for a known booking email.
- `/app` Chat tab: docked chat works; escalate → console Chats tab shows the session → reply from console → appears in client chat. SMS relay still works (reply to the escalation SMS → also appears).
- Any marketing page: floating chat pill unchanged.
- `https://tunedyota.com/.well-known/apple-app-site-association` serves JSON with `Content-Type: application/json`.
- Booking: `/app` Book tab loads the flow in-frame; a test booking is NOT required (existing flow untouched).

- [ ] **Step 5: Post-ship bookkeeping**

Update the app-program memory (`tunedyota-app-program.md`): client shell phase shipped; sync-web now injects native-fetch (installer.html no longer byte-identical — injection is the one deliberate delta); native-fetch bridge closed the relative-URL gap; installer chat inbox live; deep-link files await owner Team ID + Play fingerprint (RUNBOOK §7).

---

## Self-review notes (already applied)

- Spec §1–§9 each map to Tasks 1–9; §10 error posture is embedded in Tasks 4–8; §11 testing embedded per task; out-of-scope items untouched.
- Type consistency: `linesFor(vehicle, data)` / `ctasFor(mode)` (Tasks 1→5), `S.parseRoute/tabFor/routeForLink` (Tasks 3→4), `installerOp(body, key, deps)` (Task 7 test ↔ impl), `injectNativeFetch(html)` (Task 9 test ↔ impl), turn shape `{role:"installer", text, at}` (Task 7 ↔ twilio-sms relay).
- Deliberate deviations an implementer must not "fix": AMSOIL lines never render Buy (dealer policy); Buy's `onUnavailable` path is CORRECT production behavior until Converge credentials exist; `native-fetch.js` must never be referenced by web pages.
