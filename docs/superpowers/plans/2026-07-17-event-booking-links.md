# Event Booking Links + QR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every scheduled event gets a shareable link (`tunedyota.com/book/fargo-2026-08-09`) opening a times-first mini booking flow, plus a console widget (dropdown → Share/Copy/QR) and funnel share icons.

**Architecture:** One new static page (`site/book.html`) resolves its slug against the live `availability` endpoint and submits through the existing `/book` pipeline (`Source: "event-link"`). A pure lib (`lib/event-links.js`) owns slug build/parse; a tiny `event-qr` function (clone of `review-qr`) renders SVG QRs. Console + funnel get share affordances driven by data they already load. Spec: `docs/superpowers/specs/2026-07-16-event-booking-links-design.md`.

**Tech Stack:** Plain ES5-ish browser JS (match `installer.html`/funnel style), CJS Netlify functions, `node --test` + Playwright (existing harness pattern in `tests/installer-search-scope.test.mjs`).

**Conventions:** run tests from repo root; TDD every task; commit per task with the trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`; ship via the repo's `/ship` skill flow (build:seo only if SEO inputs change — Task 2 changes one: re-run it).

**Key existing contracts (verified 2026-07-17):**
- `GET /.netlify/functions/availability?city=<name>` → `{ city, hasEvent, capacity, events: [{ dateISO, eventLabel, details, address, openSlots: ["9:00",...], takenSlots, full, slotLabels: {"9:00":"9:00 AM",...} }], ... }` (first event = soonest; unknown city → `{ hasEvent:false, error:"unknown-city" }`).
- `POST /.netlify/functions/book` accepts `{ city, dateISO, slot, name, phone, email, vehicle, modelYear, mods, goals, installer_key, bot_field, source, utm_source, utm_medium, utm_campaign }` → `{ status: "booked"|"priority"|"conflict"|..., eventLabel, slot, openSlots?, emailFailed? }` (conflict returns fresh `openSlots`).
- `lib/qr.js` exports `qrSvg(text, opts)`; `review-qr.js` is the endpoint pattern to clone.
- `lib/markets.js` exports `MARKETS` (`{city,state,inst}`) + `getMarket(city)` (case-insensitive).
- Console `buildEvents()` (installer.html) yields `{ key, city, dateISO, installer, bookings, open, ... }`; `STATE.today` is the console's date; `visibleEvents()`/roster feed it.
- Funnel beacons: `track(step, name)` posts `{sid, step, name, utm_*}` to `/.netlify/functions/track`.

---

### Task 1: `lib/event-links.js` — slug build/parse/resolve

**Files:**
- Create: `netlify/functions/lib/event-links.js`
- Test: Create `tests/event-links.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { slugifyCity, buildEventSlug, parseEventSlug, eventUrl } = require("../netlify/functions/lib/event-links.js");

test("slugifyCity lowercases and hyphenates known market names", () => {
  assert.equal(slugifyCity("Fargo"), "fargo");
  assert.equal(slugifyCity("Twin Cities"), "twin-cities");
  assert.equal(slugifyCity("Coon Rapids"), "coon-rapids");
});

test("buildEventSlug + eventUrl compose city and date", () => {
  assert.equal(buildEventSlug("Twin Cities", "2026-08-09"), "twin-cities-2026-08-09");
  assert.equal(eventUrl("Fargo", "2026-08-09"), "https://tunedyota.com/book/fargo-2026-08-09");
});

test("parseEventSlug resolves a real market city + date", () => {
  const p = parseEventSlug("twin-cities-2026-08-09");
  assert.equal(p.city, "Twin Cities");           // canonical market casing
  assert.equal(p.dateISO, "2026-08-09");
});

test("parseEventSlug rejects unknown cities, bad dates, junk", () => {
  assert.equal(parseEventSlug("atlantis-2026-08-09"), null);
  assert.equal(parseEventSlug("fargo-2026-13-45"), null); // impossible date parts
  assert.equal(parseEventSlug("fargo"), null);
  assert.equal(parseEventSlug(""), null);
  assert.equal(parseEventSlug(null), null);
});
```

- [ ] **Step 2:** Run `node --test tests/event-links.test.js` — FAIL (module missing).

- [ ] **Step 3: Implement**

```javascript
// netlify/functions/lib/event-links.js
// Per-event shareable booking links: tunedyota.com/book/<city-slug>-<YYYY-MM-DD>.
// Pure — used by the event-qr endpoint and unit tests. The client pages (book.html,
// installer.html) inline the same slugify expression; tests/event-links.test.js +
// the client presence tests keep them in step.
const { MARKETS } = require("./markets.js");

function slugifyCity(city) {
  return String(city || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function buildEventSlug(city, dateISO) { return `${slugifyCity(city)}-${dateISO}`; }

function eventUrl(city, dateISO, base = "https://tunedyota.com") {
  return `${base}/book/${buildEventSlug(city, dateISO)}`;
}

// slug → { city (canonical market casing), dateISO } | null. Date is validated
// structurally (real month/day ranges); whether an EVENT exists on that date is
// the caller's job (book.html asks the availability endpoint).
function parseEventSlug(slug) {
  const m = String(slug || "").match(/^([a-z0-9-]+)-(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, citySlug, y, mo, d] = m;
  if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) return null;
  const market = MARKETS.find((mk) => slugifyCity(mk.city) === citySlug);
  if (!market) return null;
  return { city: market.city, dateISO: `${y}-${mo}-${d}` };
}

module.exports = { slugifyCity, buildEventSlug, parseEventSlug, eventUrl };
```

- [ ] **Step 4:** Run — ALL PASS.
- [ ] **Step 5: Commit** — `git add netlify/functions/lib/event-links.js tests/event-links.test.js && git commit -m "feat(events): event-link slug build/parse lib"`

---

### Task 2: Publish `site/vehicles.json` (no third VEHICLES copy)

The mini flow needs vehicle pickers + prices. The funnel's inline `VEHICLES` is the human-edited source; `build:seo` already syncs it to `lib/vehicles.json`. Extend that sync to ALSO write a public static copy so `book.html` fetches data instead of duplicating it.

**Files:**
- Modify: `scripts/build-seo.mjs` (`syncVehicles()`, ~line 91)
- Test: `tests/vehicles-parity.test.js` (extend)

- [ ] **Step 1: Failing test** — append to `tests/vehicles-parity.test.js`:

```javascript
test("site/vehicles.json is byte-equal to lib/vehicles.json (book.html data source)", () => {
  const site = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "site", "vehicles.json"), "utf8"));
  assert.deepEqual(site, JSON_COPY,
    "site/vehicles.json out of sync — run `npm run build:seo` (it writes both copies from the funnel VEHICLES).");
});
```

(`fs`, `path`, `JSON_COPY` already exist at the top of that file.)

- [ ] **Step 2:** Run `node --test tests/vehicles-parity.test.js` — FAIL (ENOENT site/vehicles.json).

- [ ] **Step 3: Implement** — in `scripts/build-seo.mjs` `syncVehicles()`, after the existing `fs.writeFileSync(... lib/vehicles.json ...)` add:

```javascript
  // Public copy for the /book mini flow's vehicle picker — same source, zero drift
  // (tests/vehicles-parity.test.js pins both copies to the funnel literal).
  fs.writeFileSync(path.join(SITE_DIR, "vehicles.json"),
    JSON.stringify(vehicles, null, 2) + "\n");
```

Then run `npm run build:seo` once to generate the file (idempotent; only intended outputs change — verify `git status` shows `site/vehicles.json` new + `site/sitemap.xml` untouched-or-lastmod-only).

- [ ] **Step 4:** Run `node --test tests/vehicles-parity.test.js tests/seo.test.js` — ALL PASS. (`book.html`/`vehicles.json` must NOT be added to `HEAD_PAGES` — the mini flow is a conversion tool, not an indexable page; `seo.test.js`'s sitemap-set assertion stays green precisely because we don't touch the page set.)
- [ ] **Step 5: Commit** — `git add scripts/build-seo.mjs tests/vehicles-parity.test.js site/vehicles.json && git commit -m "feat(events): publish site/vehicles.json for the /book mini flow"`

---

### Task 3: `event-qr` function + `/book/*` rewrite

**Files:**
- Create: `netlify/functions/event-qr.js`
- Modify: `netlify.toml` (add rewrite ABOVE the existing `[[redirects]]` block)
- Test: Create `tests/event-qr.test.js`

- [ ] **Step 1: Failing tests**

```javascript
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/event-qr.js");

test("valid slug returns an SVG QR of the event link", async () => {
  const res = await handler({ queryStringParameters: { e: "fargo-2026-08-09" } });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["Content-Type"], /svg/);
  assert.match(res.body, /^<svg|<\?xml/);
});

test("unknown or junk slug is a 404, not an error", async () => {
  for (const e of ["atlantis-2026-08-09", "fargo", "", undefined]) {
    const res = await handler({ queryStringParameters: { e } });
    assert.equal(res.statusCode, 404, String(e));
  }
});
```

- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3: Implement** (clone the `review-qr.js` shape):

```javascript
// netlify/functions/event-qr.js
// Public: SVG QR for a per-event booking link (/book/<slug>). Mirrors review-qr.js.
// Validates the slug against real markets so this can't QR arbitrary strings.
const { qrSvg } = require("./lib/qr.js");
const { parseEventSlug, eventUrl } = require("./lib/event-links.js");

async function handler(event) {
  const slug = ((event && event.queryStringParameters) || {}).e || "";
  const parsed = parseEventSlug(slug);
  if (!parsed) return { statusCode: 404, headers: { "Content-Type": "text/plain" }, body: "unknown event" };
  const svg = qrSvg(eventUrl(parsed.city, parsed.dateISO));
  return { statusCode: 200, headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=3600" }, body: svg };
}
module.exports = { handler };
```

`netlify.toml` — insert before the `/get-ott-now` redirect:

```toml
# Per-event booking links: /book/<city-slug>-<date> → the times-first mini flow
# (200 rewrite keeps the pretty URL; book.html reads the slug from location.pathname).
[[redirects]]
  from = "/book/*"
  to = "/book.html"
  status = 200
```

- [ ] **Step 4:** Run `node --test tests/event-qr.test.js tests/scheduled-guardrails.test.js` — PASS (event-qr is NOT scheduled and is intentionally public/read-only like review-qr — no guardrail entry).
- [ ] **Step 5: Commit** — `git add netlify/functions/event-qr.js netlify.toml tests/event-qr.test.js && git commit -m "feat(events): event QR endpoint + /book/* rewrite"`

---

### Task 4: `site/book.html` — the times-first mini flow

**Files:**
- Create: `site/book.html`
- Test: Create `tests/book-page.test.mjs` (Playwright, copy the server/boot scaffolding from `tests/installer-search-scope.test.mjs`)

- [ ] **Step 1: Failing Playwright tests** — create `tests/book-page.test.mjs`:

```javascript
// Browser tests for the /book/<slug> times-first mini flow. Stubs availability,
// vehicles.json, book, and track so no network/real booking happens.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(__dirname, "..", "site");
let chromium = null;
try { ({ chromium } = await import("playwright")); } catch {}
let server, base, browser, browserOk = false;

before(async () => {
  server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p.startsWith("/book/")) p = "/book.html";               // mirror the netlify.toml rewrite
    const f = path.join(SITE, p);
    if (!f.startsWith(SITE) || !fs.existsSync(f)) { res.writeHead(404); res.end("nf"); return; }
    const ext = path.extname(f);
    res.writeHead(200, { "Content-Type": ext === ".js" ? "text/javascript" : ext === ".html" ? "text/html" : ext === ".json" ? "application/json" : "text/plain" });
    res.end(fs.readFileSync(f));
  });
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  if (chromium) { try { browser = await chromium.launch(); browserOk = true; } catch {} }
});
after(async () => { if (browser) await browser.close(); if (server) server.close(); });

const AVAIL = { city: "Fargo", hasEvent: true, capacity: 12, events: [
  { dateISO: "2099-08-09", eventLabel: "August 9, 2099", details: "", address: "", full: false,
    openSlots: ["9:00", "9:20"], takenSlots: [], slotLabels: { "9:00": "9:00 AM", "9:20": "9:20 AM" } }],
  eventDateISO: "2099-08-09", eventLabel: "August 9, 2099", openSlots: ["9:00", "9:20"], takenSlots: [], full: false,
  slotLabels: { "9:00": "9:00 AM", "9:20": "9:20 AM" } };

async function boot(slug, avail = AVAIL) {
  const booked = [];
  const page = await (await browser.newContext()).newPage();
  await page.route("**/availability**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(avail) }));
  await page.route("**/functions/track", (r) => r.fulfill({ status: 204, body: "" }));
  await page.route("**/functions/book", async (r) => {
    booked.push(JSON.parse(r.request().postData() || "{}"));
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "booked", eventLabel: avail.eventLabel, slot: booked[0].slot }) });
  });
  await page.goto(base + "/book/" + slug);
  return { page, booked };
}

test("event page shows the event header and open time slots", async (t) => {
  if (!browserOk) return t.skip("no browser");
  const { page } = await boot("fargo-2099-08-09");
  await page.waitForSelector("#slots button");
  const txt = await page.evaluate(() => document.body.textContent);
  assert.match(txt, /Fargo/);
  assert.match(txt, /August 9, 2099/);
  assert.match(txt, /9:00 AM/);
  await page.close();
});

test("tap a time → form → confirm books through /book with Source event-link", async (t) => {
  if (!browserOk) return t.skip("no browser");
  const { page, booked } = await boot("fargo-2099-08-09");
  await page.waitForSelector("#slots button");
  await page.click('#slots button[data-slot="9:20"]');
  await page.fill("#bkName", "Jo Test");
  await page.fill("#bkPhone", "6125550100");
  await page.fill("#bkEmail", "jo@x.com");
  await page.selectOption("#bkMake", "Toyota");
  await page.selectOption("#bkModel", "Tundra");
  await page.waitForSelector("#bkConfig option:nth-child(2)");
  await page.selectOption("#bkConfig", { index: 1 });
  await page.click("#bkSubmit");
  await page.waitForSelector("#done", { state: "visible" });
  assert.equal(booked.length, 1);
  assert.equal(booked[0].city, "Fargo");
  assert.equal(booked[0].dateISO, "2099-08-09");
  assert.equal(booked[0].slot, "9:20");
  assert.equal(booked[0].source, "event-link");
  assert.ok(booked[0].vehicle.includes("Tundra"));
  await page.close();
});

test("unknown/passed event shows the fallback with funnel + waitlist paths, no dead end", async (t) => {
  if (!browserOk) return t.skip("no browser");
  const { page } = await boot("fargo-2000-01-01", { city: "Fargo", hasEvent: true, events: [AVAIL.events[0]] });
  await page.waitForSelector("#fallback", { state: "visible" });
  const txt = await page.evaluate(() => document.getElementById("fallback").textContent);
  assert.match(txt, /passed|isn't scheduled/i);
  assert.match(txt, /August 9, 2099/, "offers the next Fargo event");
  const hasFunnelLink = await page.evaluate(() => !!document.querySelector('#fallback a[href*="find-your-exact-tune"]'));
  assert.ok(hasFunnelLink, "waitlist/funnel path present");
  await page.close();
});

test("price appears once a vehicle config is chosen", async (t) => {
  if (!browserOk) return t.skip("no browser");
  const { page } = await boot("fargo-2099-08-09");
  await page.waitForSelector("#slots button");
  await page.click('#slots button[data-slot="9:00"]');
  await page.selectOption("#bkMake", "Toyota");
  await page.selectOption("#bkModel", "Tundra");
  await page.waitForSelector("#bkConfig option:nth-child(2)");
  await page.selectOption("#bkConfig", { index: 1 });
  const price = await page.evaluate(() => document.getElementById("bkPrice").textContent);
  assert.match(price, /\$\d+/, "starting price shown before confirming");
  await page.close();
});
```

- [ ] **Step 2:** Run `node --test tests/book-page.test.mjs` — FAIL (book.html 404).

- [ ] **Step 3: Implement `site/book.html`.** Structure (keep it lean — one screen, funnel visual language via `site.css` + the funnel's font links; copy the `<head>` favicon/manifest block from `site/installer.html`):

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Book your tune | Tuned Yota</title>
<meta name="robots" content="noindex">
<link href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&family=Spectral:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/site.css">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<style>
/* compact mini-flow styles; reuse tokens from site.css (--ink/--brown/--line etc.) */
.bk{font-family:'Lato',sans-serif;max-width:560px;margin:0 auto;padding:26px 16px 60px;color:#5D4B40}
.bk h1{font-family:'Spectral',serif;font-weight:600;color:#3A2E26;font-size:clamp(24px,6vw,34px);margin:6px 0 2px}
.bk .sub{font-size:15px;margin-bottom:18px}
#slots{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}
#slots button{border:1.5px solid rgba(91,75,66,.25);background:#fff;border-radius:10px;padding:12px 16px;font-size:15px;font-weight:700;cursor:pointer}
#slots button.sel{background:#3A2E26;color:#F3EFEA;border-color:#3A2E26}
.bk input,.bk select{width:100%;padding:12px;font-size:16px;border:1px solid rgba(91,75,66,.25);border-radius:9px;margin:6px 0;background:#fff}
#bkPrice{font-weight:900;color:#3A2E26;margin:8px 0;min-height:22px}
#bkSubmit{width:100%;border:0;border-radius:99px;padding:15px;font-weight:900;font-size:15px;background:#3A2E26;color:#F3EFEA;cursor:pointer;margin-top:10px}
#bkSubmit:disabled{opacity:.5;cursor:default}
#done,#fallback{display:none;background:#FAF9F7;border:1.5px solid rgba(91,75,66,.16);border-radius:14px;padding:20px}
.bk .err{color:#8a2a2a;font-size:14px;display:none;margin:6px 0}
.bk .foot{font-size:13px;opacity:.6;margin-top:22px;text-align:center}
</style>
</head>
<body>
<div class="bk">
  <div id="hdr"><h1 id="evTitle">Loading event…</h1><div class="sub" id="evSub"></div></div>
  <div id="flow" style="display:none">
    <div id="slots"></div>
    <div id="form" style="display:none">
      <input id="bkName" placeholder="Your name">
      <input id="bkPhone" placeholder="Phone" inputmode="tel">
      <input id="bkEmail" placeholder="Email (for your calendar invite + certificate)" type="email">
      <select id="bkMake"><option value="">Make…</option></select>
      <select id="bkModel" disabled><option value="">Model…</option></select>
      <select id="bkConfig" disabled><option value="">Year / engine…</option></select>
      <div id="bkPrice"></div>
      <div class="err" id="bkErr"></div>
      <button id="bkSubmit" disabled>Confirm booking</button>
    </div>
  </div>
  <div id="done"></div>
  <div id="fallback"></div>
  <p class="foot">Questions? Call or text <a href="tel:+16124067117">(612) 406-7117</a></p>
</div>
<script>
(function(){
"use strict";
var $=function(s){return document.querySelector(s);};
// --- slug from the pretty URL (/book/<city-slug>-<date>); querystring fallback ---
var m=(location.pathname.match(/\/book\/([a-z0-9-]+-\d{4}-\d{2}-\d{2})\/?$/)||[]);
var slug=m[1]||new URLSearchParams(location.search).get("e")||"";
var sm=slug.match(/^([a-z0-9-]+)-(\d{4}-\d{2}-\d{2})$/)||[];
var citySlug=sm[1]||"", dateISO=sm[2]||"";
var slugify=function(c){return String(c||"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");};
// --- funnel-measurement beacons (same sid key as the funnel) ---
var SID=(function(){var s="";try{s=sessionStorage.getItem("ty_sid")||"";}catch(e){}if(!s){s="s_"+Math.random().toString(36).slice(2)+Date.now().toString(36);try{sessionStorage.setItem("ty_sid",s);}catch(e){}}return s;})();
var UTM=new URLSearchParams(location.search);
function track(step,name){try{var p=JSON.stringify({sid:SID,step:step,name:name||"",utm_source:UTM.get("utm_source")||"",utm_medium:UTM.get("utm_medium")||"",utm_campaign:UTM.get("utm_campaign")||""});if(navigator.sendBeacon){navigator.sendBeacon("/.netlify/functions/track",p);}else{fetch("/.netlify/functions/track",{method:"POST",body:p,keepalive:true});}}catch(e){}}
document.addEventListener("click",function(e){try{var a=e.target.closest&&e.target.closest('a[href^="tel:"]');if(a)track(6,"call");}catch(err){}},true);

var STATE={avail:null,ev:null,slot:null,vehicles:null,cfg:null};

function fallback(html){ $("#hdr").style.display="none"; $("#flow").style.display="none";
  var f=$("#fallback"); f.innerHTML=html; f.style.display="block"; }

function fallbackFor(city,events){
  var next=(events||[]).filter(function(e){return !e.full;})[0];
  var lines=['<h1 style="font-family:Spectral,serif;color:#3A2E26">That event has passed or isn’t scheduled.</h1>'];
  if(next){ lines.push('<p>Good news — the next '+city+' event is <strong>'+next.eventLabel+'</strong>.</p>');
    lines.push('<p><a class="link" style="font-weight:900" href="/book/'+slugify(city)+'-'+next.dateISO+'">See '+next.eventLabel+' times →</a></p>'); }
  lines.push('<p><a href="/find-your-exact-tune?city='+encodeURIComponent(city||"")+'">Find your exact tune '+(next?'':'or join the Priority Waitlist ')+'→</a></p>');
  fallback(lines.join(""));
}

// --- load event + vehicles in parallel ---
if(!citySlug||!dateISO){ fallbackFor("", []); }
else{
  Promise.all([
    fetch("/.netlify/functions/availability?city="+encodeURIComponent(citySlug.replace(/-/g," "))).then(function(r){return r.json();}),
    fetch("/vehicles.json").then(function(r){return r.json();})
  ]).then(function(res){
    var avail=res[0]; STATE.vehicles=res[1]; STATE.avail=avail;
    if(!avail||!avail.hasEvent){ fallbackFor(avail&&avail.city||citySlug.replace(/-/g," "), []); return; }
    var ev=(avail.events||[]).filter(function(e){return e.dateISO===dateISO;})[0];
    if(!ev){ fallbackFor(avail.city, avail.events||[]); return; }
    if(ev.full||!ev.openSlots.length){ fallbackFor(avail.city, (avail.events||[]).filter(function(e){return e.dateISO!==dateISO;})); return; }
    STATE.ev=ev;
    $("#evTitle").textContent=avail.city+" · "+ev.eventLabel;
    $("#evSub").textContent="Pick a time, add your details, and you’re booked."+(ev.address?" · "+ev.address:"");
    renderSlots(ev); populateMakes(); $("#flow").style.display="block";
    track(5,"book");
  }).catch(function(){ fallbackFor(citySlug.replace(/-/g," "), []); });
}

function renderSlots(ev){
  var box=$("#slots"); box.innerHTML="";
  ev.openSlots.forEach(function(s){
    var b=document.createElement("button"); b.dataset.slot=s; b.textContent=(ev.slotLabels||{})[s]||s;
    b.onclick=function(){ Array.prototype.forEach.call(box.children,function(x){x.classList.remove("sel");});
      b.classList.add("sel"); STATE.slot=s; $("#form").style.display="block"; update(); };
    box.appendChild(b);
  });
}

function populateMakes(){
  var mk=$("#bkMake"); Object.keys(STATE.vehicles||{}).forEach(function(k){ var o=document.createElement("option"); o.value=k; o.textContent=k; mk.appendChild(o); });
  mk.onchange=function(){ var md=$("#bkModel"); md.innerHTML='<option value="">Model…</option>'; md.disabled=!mk.value;
    if(mk.value) Object.keys(STATE.vehicles[mk.value]).forEach(function(k){ var o=document.createElement("option"); o.value=k; o.textContent=k; md.appendChild(o); });
    $("#bkConfig").innerHTML='<option value="">Year / engine…</option>'; $("#bkConfig").disabled=true; STATE.cfg=null; update(); };
  $("#bkModel").onchange=function(){ var md=$("#bkModel"), cf=$("#bkConfig"); cf.innerHTML='<option value="">Year / engine…</option>'; cf.disabled=!md.value; STATE.cfg=null;
    if(md.value) (STATE.vehicles[$("#bkMake").value][md.value]||[]).forEach(function(c,i){ var o=document.createElement("option"); o.value=String(i); o.textContent=c.y+" · "+c.e; cf.appendChild(o); });
    update(); };
  $("#bkConfig").onchange=function(){ var i=$("#bkConfig").value; STATE.cfg=i===""?null:STATE.vehicles[$("#bkMake").value][$("#bkModel").value][Number(i)]; update(); };
  ["bkName","bkPhone","bkEmail"].forEach(function(id){ document.getElementById(id).oninput=update; });
}

function update(){
  var p=$("#bkPrice");
  p.textContent = STATE.cfg ? ("Your OTT tune: from $"+STATE.cfg.base) : "";
  var ok=STATE.slot&&$("#bkName").value.trim()&&$("#bkPhone").value.trim()&&STATE.cfg;
  $("#bkSubmit").disabled=!ok;
}

$("#bkSubmit").onclick=function(){
  var btn=$("#bkSubmit"); btn.disabled=true; btn.textContent="Booking…";
  var vehicle=($("#bkMake").value+" "+$("#bkModel").value+" ("+STATE.cfg.y+" "+STATE.cfg.e+")");
  var payload={ city:STATE.avail.city, dateISO:dateISO, slot:STATE.slot,
    name:$("#bkName").value.trim(), phone:$("#bkPhone").value.trim(), email:$("#bkEmail").value.trim(),
    vehicle:vehicle, modelYear:"", mods:"", goals:"Booked via event link", installer_key:"", bot_field:"",
    source:"event-link", utm_source:UTM.get("utm_source")||"", utm_medium:UTM.get("utm_medium")||"", utm_campaign:UTM.get("utm_campaign")||"" };
  fetch("/.netlify/functions/book",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)})
    .then(function(r){return r.json();}).then(function(out){
      if(out.status==="booked"){ track(6,"booked");
        $("#flow").style.display="none"; $("#hdr").style.display="none";
        var d=$("#done"); d.style.display="block";
        d.innerHTML='<h1 style="font-family:Spectral,serif;color:#3A2E26">You’re booked.</h1><p>'+STATE.avail.city+" · "+(out.eventLabel||STATE.ev.eventLabel)+" at "+(STATE.ev.slotLabels[out.slot]||out.slot)+'.</p><p>Check your email for a calendar invite.</p>';
      } else if(out.status==="conflict"){ btn.textContent="Confirm booking";
        STATE.ev.openSlots=out.openSlots||[]; STATE.slot=null; renderSlots(STATE.ev); update();
        var e1=$("#bkErr"); e1.textContent="That time was just taken — fresh times above."; e1.style.display="block";
      } else { track(6,"priority");
        $("#flow").style.display="none"; $("#hdr").style.display="none";
        var d2=$("#done"); d2.style.display="block";
        d2.innerHTML='<h1 style="font-family:Spectral,serif;color:#3A2E26">You’re on the list.</h1><p>We’ll reach out the moment a slot opens in '+STATE.avail.city+".</p>";
      }
    }).catch(function(){ btn.disabled=false; btn.textContent="Confirm booking";
      var e2=$("#bkErr"); e2.textContent="Something hiccuped — try again, or call/text (612) 406-7117."; e2.style.display="block"; });
};
})();
</script>
</body>
</html>
```

- [ ] **Step 4:** Run `node --test tests/book-page.test.mjs` — ALL 4 PASS. Also run `node --test tests/seo.test.js` (page set untouched → still green).
- [ ] **Step 5: Commit** — `git add site/book.html tests/book-page.test.mjs && git commit -m "feat(events): /book/<slug> times-first mini booking flow"`

---

### Task 5: Console "Share event link" widget

**Files:**
- Modify: `site/installer.html` — insert the widget at the top of the Jobs view: in `renderFeed()`, right after `renderSubTabs(events)` and before the Done-tab early return, call `host.appendChild(shareEventWidget(events))`; define `shareEventWidget(events)` near `anydayWalkForm()`
- Test: Create `tests/installer-share-widget.test.mjs` (Playwright, boot pattern from `tests/installer-search-scope.test.mjs`) + presence assertions

- [ ] **Step 1: Failing tests** — Playwright file (reuse the boot scaffolding; roster fixture gives two future events):

```javascript
// (server/boot identical to tests/installer-search-scope.test.mjs — copy it; roster:)
const ROSTER = { admin: false, events: [
    { city: "Fargo", dateISO: "2099-08-09", installer: "cody" },
    { city: "Omaha", dateISO: "2099-09-12", installer: "cody" }],
  bookings: [] };

test("share widget lists upcoming events and generates the link on selection", async (t) => {
  if (!browserOk) return t.skip("no browser");
  const page = await boot();
  await page.waitForSelector("#evshare select");
  const opts = await page.evaluate(() => [...document.querySelectorAll("#evshare select option")].map((o) => o.textContent));
  assert.ok(opts.some((o) => /Fargo/.test(o)) && opts.some((o) => /Omaha/.test(o)));
  await page.selectOption("#evshare select", { index: 1 });
  const link = await page.evaluate(() => document.getElementById("evsharelink").textContent);
  assert.match(link, /tunedyota\.com\/book\/(fargo|omaha)-2099-\d{2}-\d{2}/);
  const btns = await page.evaluate(() => document.getElementById("evshare").textContent);
  assert.match(btns, /Copy/); assert.match(btns, /QR/);
  await page.close();
});

test("QR button reveals the event-qr image for the selected slug", async (t) => {
  if (!browserOk) return t.skip("no browser");
  const page = await boot();
  await page.waitForSelector("#evshare select");
  await page.selectOption("#evshare select", { index: 1 });
  await page.click("#evshareqr");
  const src = await page.evaluate(() => (document.querySelector("#evshare img") || {}).src || "");
  assert.match(src, /event-qr\?e=(fargo|omaha)-2099/);
  await page.close();
});
```

(Also `await page.route("**/event-qr**", r => r.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg xmlns='http://www.w3.org/2000/svg'/>" }))` in boot.)

- [ ] **Step 2:** Run — FAIL (no `#evshare`).
- [ ] **Step 3: Implement** in `installer.html` (match its var/string-concat style):

```javascript
  // "Share an event booking link": dropdown of upcoming events → link + native
  // share sheet / copy / QR. Events come from the roster the console already loads.
  function shareEventWidget(events){
    var slugify=function(c){return String(c||"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");};
    var up=events.filter(function(e){return e.dateISO>=STATE.today;})
      .sort(function(a,b){return a.dateISO.localeCompare(b.dateISO);});
    var det=document.createElement('details'); det.id='evshare'; det.className='evt';
    det.innerHTML='<summary style="padding:10px 12px;cursor:pointer"><span class="etitle">🔗 Share an event booking link</span></summary>';
    var box=document.createElement('div'); box.style.cssText='padding:0 12px 12px';
    var sel=document.createElement('select'); sel.style.cssText='width:100%;padding:11px;font-size:15px;border:1px solid var(--line);border-radius:9px';
    sel.innerHTML='<option value="">Pick an event…</option>'+up.map(function(e){
      return '<option value="'+esc(slugify(e.city)+'-'+e.dateISO)+'">'+esc(e.city)+' · '+esc(e.dateISO)+'</option>'; }).join('');
    var link=document.createElement('div'); link.id='evsharelink'; link.style.cssText='margin:10px 0;font-weight:700;word-break:break-all';
    var row=document.createElement('div'); row.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
    function btn(label,id){ var b=document.createElement('button'); b.className='btn'; b.id=id; b.textContent=label; b.style.display='none'; return b; }
    var share=btn('📤 Share','evshareshare'), copy=btn('Copy','evsharecopy'), qr=btn('QR','evshareqr');
    var qrbox=document.createElement('div');
    row.appendChild(share); row.appendChild(copy); row.appendChild(qr);
    sel.onchange=function(){ qrbox.innerHTML='';
      if(!sel.value){ link.textContent=''; [share,copy,qr].forEach(function(b){b.style.display='none';}); return; }
      var url='https://tunedyota.com/book/'+sel.value; link.textContent=url;
      [copy,qr].forEach(function(b){b.style.display='';});
      share.style.display=(navigator.share?'':'none');
      share.onclick=function(){ try{ navigator.share({title:'Book your Tuned Yota time',url:url}); }catch(e){} };
      copy.onclick=function(){ try{ navigator.clipboard.writeText(url); copy.textContent='Copied ✓'; setTimeout(function(){copy.textContent='Copy';},1500); }catch(e){} };
      qr.onclick=function(){ qrbox.innerHTML='<img alt="Event booking QR" style="width:220px;max-width:100%;background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px" src="/.netlify/functions/event-qr?e='+encodeURIComponent(sel.value)+'">'; };
    };
    box.appendChild(sel); box.appendChild(link); box.appendChild(row); box.appendChild(qrbox); det.appendChild(box);
    return det;
  }
```

Wire into `renderFeed()` after `renderSubTabs(events);` (but before the `done` early-return so it shows on active tabs only — placement: immediately after `host.appendChild(anydayWalkForm());`).

- [ ] **Step 4:** Run the new Playwright file + `node --test tests/installer-search-scope.test.mjs tests/installer-walkin-browser.test.mjs` (both must stay green) + `node app/scripts/sync-web.mjs && node --test tests/app-sync-web.test.js`.
- [ ] **Step 5: Commit** — `git add site/installer.html tests/installer-share-widget.test.mjs && git commit -m "feat(console): Share-event-link widget (dropdown → Share/Copy/QR)"`

---

### Task 6: Funnel per-event share icons

**Files:**
- Modify: `site/find-your-exact-tune.html` — where the book step renders each event's date/pill (the event-picker area around `pickEvent`/`renderEvent`, lines ~939-960; READ it first), append a small share control per event
- Test: extend `tests/booking-ui.test.js` (static presence checks)

- [ ] **Step 1: Failing test** — append to `tests/booking-ui.test.js`:

```javascript
test("funnel event picker offers a per-event share link (event-link virality)", () => {
  assert.ok(/tyShareEvent/.test(HTML), "share handler present");
  assert.ok(/\/book\/'?\s*\+/.test(HTML) || HTML.includes("'/book/'+"), "event link built from /book/ slug");
  assert.ok(/navigator\.share/.test(HTML), "native share sheet used when available");
});
```

- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3: Implement** — add once near the funnel's helpers:

```javascript
function tyShareEvent(city,dateISO){
  var slug=String(city||"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")+"-"+dateISO;
  var url="https://tunedyota.com/book/"+slug;
  if(navigator.share){ navigator.share({title:"Book your Tuned Yota time — "+city, url:url}).catch(function(){}); }
  else{ try{ navigator.clipboard.writeText(url); alert("Link copied — share it anywhere."); }catch(e){} }
}
```

and in the event-render markup (each event date shown in the picker) append:
`'<button type="button" class="tf-link" style="border:0;background:none;cursor:pointer" aria-label="Share this event" onclick="tyShareEvent(\''+CITY_EXPR+'\',\''+DATE_EXPR+'\')">📤 share</button>'`
— substituting the actual variables in that renderer (read the surrounding code; the city is `S.marketCity` or the event object's city, the date is `e.dateISO`). `tyShareEvent` must be attached to `window` if the funnel code is inside an IIFE (`window.tyShareEvent=tyShareEvent;`).

- [ ] **Step 4:** Run `node --test tests/booking-ui.test.js tests/vehicles-parity.test.js` — PASS.
- [ ] **Step 5: Commit** — `git add site/find-your-exact-tune.html tests/booking-ui.test.js && git commit -m "feat(funnel): per-event share icons"`

---

### Task 7: Ship + live verification

- [ ] **Step 1:** `npm test` — full suite green (expect ~775+).
- [ ] **Step 2:** Follow the repo `/ship` skill: SEO input changed in Task 2 (build:seo output) — re-run `npm run build:seo`, confirm idempotent; push master; confirm Netlify deploy `ready`.
- [ ] **Step 3: Live checks:**
  1. `curl -s https://tunedyota.com/book/<real-upcoming-city-slug>-<date> | grep -c evTitle` → 1 (rewrite works; pick a real event from the sheet)
  2. `curl -s "https://tunedyota.com/.netlify/functions/event-qr?e=<same-slug>" | head -c 60` → SVG prefix
  3. `curl -s https://tunedyota.com/vehicles.json | head -c 40` → JSON
  4. Console: open Jobs → "Share an event booking link" → pick event → Copy + QR render
  5. OPTIONAL full-path test booking against a real event with the funnel's stub-fetch technique (see `.claude/memory` funnel verification notes) — or a real booking marked TEST that the owner deletes
- [ ] **Step 4:** Update `.claude/memory` (event-links shipped) + mem0 backlog; commit.

---

## Self-review notes

- **Spec coverage:** slug lib (T1) · vehicles data without a third copy (T2) · QR endpoint + rewrite (T3) · times-first page incl. price-before-confirm, `Source: event-link`, utm passthrough, track(5)/track(6) beacons, tel-click outcome, conflict re-render, passed/unknown fallback with next-event + funnel/waitlist path (T4) · console widget with one-dropdown → Share/Copy/QR, installer-market-first ordering is inherited from roster scoping (T5) · funnel share icons (T6) · ship + live verify (T7).
- **Deliberate scope choices:** the mini flow asks make/model/config (price accuracy) but not exact `modelYear` (kept optional-blank — the funnel remains the deep-qualification path; Airtable Model Year stays blank for event-link bookings, visible in the goals note). `noindex` on book.html per spec (conversion tool, not SEO page). Event-qr is public read-only like review-qr.
- **Executor latitude:** exact insertion points in `installer.html`/`find-your-exact-tune.html` may drift a few lines from those cited — trust the file, keep the intent; Playwright selectors in T4/T5 define the required element ids (`#slots`, `#bkMake`…, `#evshare`, `#evsharelink`, `#evshareqr`) — implement to match the tests.
