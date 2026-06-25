# Homepage CTA buttons + "Free OTT Update" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two top-of-page homepage CTAs ("Book Event Time Slot NOW", "Schedule my FREE OTT Update") and route the second into the existing booking funnel with an `?intent=update` flag that reframes the copy and tags the lead/booking as a free re-flash.

**Architecture:** Static-site change. Homepage gets a new `.band` CTA reusing existing styles. The funnel reads `intent` from the URL, rewrites step-0 copy, and sends a `source` field. `book.js` passes that `source` into the Airtable `Source` column (Bookings table only — Priority List has no such column), and the installer email template surfaces a "Free OTT Update" row for both booking and priority paths so re-flashes are visible regardless of Airtable schema.

**Tech Stack:** Plain HTML/inline-JS site, Netlify Functions (Node), `node:test` (presence + behavior tests), Resend, Airtable.

---

## File Structure

- `site/index.html` — add CTA band at top of `.wrap` body.
- `site/find-your-exact-tune.html` — parse `intent`, reframe step 0, add `source` to payloads.
- `netlify/functions/book.js` — `Source: d.source || "find-your-exact-tune"` on the booking record.
- `netlify/functions/lib/templates.js` — request-type row in `buildBookingInstallerEmail` + `buildPriorityInstallerEmail`.
- `tests/book.test.js` — source-tagging behavior tests.
- `tests/templates.test.js` — request-type row tests.
- `tests/booking-ui.test.js` — funnel intent presence test.
- `tests/homepage-cta.test.js` — NEW, homepage button presence + placement test.

**Note (deviation from spec):** spec suggested also adding `Source` to the Priority List record. Airtable rejects unknown field names (422) even with `typecast`, and that table has no `Source` column, so we omit it there and rely on the installer-email row for re-flash visibility on full/no-event requests.

---

### Task 1: Server — tag booking `Source` from client `source`

**Files:**
- Modify: `netlify/functions/book.js:63`
- Test: `tests/book.test.js`

- [ ] **Step 1: Write the failing tests** (append to `tests/book.test.js`)

```js
test("source flag tags the booking record + installer email", async () => {
  const h = harness({ events: EV });
  const r = await processBooking({ ...base, slot: "9:20", source: "OTT Update" }, h.deps);
  assert.equal(r.status, "booked");
  assert.equal(h.created[0].fields.Source, "OTT Update");
  const inst = h.emails.find((e) => e.to === "cody@tunedyota.com");
  assert.ok(inst && /Free OTT Update/.test(inst.text), "installer email should flag the re-flash");
});
test("booking source defaults when flag absent", async () => {
  const h = harness({ events: EV });
  await processBooking({ ...base, slot: "9:40" }, h.deps);
  assert.equal(h.created[0].fields.Source, "find-your-exact-tune");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/book.test.js`
Expected: FAIL — `Source` is `"find-your-exact-tune"` even when `source: "OTT Update"` is sent (and the installer-email assertion fails until Task 2).

- [ ] **Step 3: Implement the booking Source change**

In `netlify/functions/book.js`, the booking `createRecord` fields block (currently `Source: "find-your-exact-tune",`):

```js
Status: "Booked", Source: d.source || "find-your-exact-tune",
```

- [ ] **Step 4: Run the Source test to confirm it passes**

Run: `node --test tests/book.test.js`
Expected: `booking source defaults when flag absent` PASS and the `Source` assertion of the first new test PASS. (The `/Free OTT Update/` email assertion still fails — fixed in Task 2.)

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/book.js tests/book.test.js
git commit -m "feat(book): tag Airtable Source from client source flag"
```

---

### Task 2: Installer email — surface "Free OTT Update" request type

**Files:**
- Modify: `netlify/functions/lib/templates.js` (`buildBookingInstallerEmail` ~line 97, `buildPriorityInstallerEmail` ~line 123)
- Test: `tests/templates.test.js`

- [ ] **Step 1: Write the failing tests** (append to `tests/templates.test.js`)

```js
test("installer emails surface Free OTT Update request type when source set", () => {
  const b = tB.buildBookingInstallerEmail({ ...dB, slot: "9:20", source: "OTT Update" }, instB, marketB, eventB);
  assert.ok(b.text.includes("Free OTT Update"), "booking text row missing");
  assert.ok(b.html.includes("Free OTT Update"), "booking html row missing");
  const p = tB.buildPriorityInstallerEmail({ ...dB, source: "OTT Update" }, instB, marketB, "no-event");
  assert.ok(p.text.includes("Free OTT Update"), "priority text row missing");
  const plain = tB.buildBookingInstallerEmail({ ...dB, slot: "9:20" }, instB, marketB, eventB);
  assert.ok(!plain.text.includes("Free OTT Update"), "no row when source absent");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/templates.test.js`
Expected: FAIL — "Free OTT Update" not present in installer emails.

- [ ] **Step 3: Implement the request-type row in both installer builders**

In `buildBookingInstallerEmail`, change the `rows` array head:

```js
function buildBookingInstallerEmail(d, inst, market, event) {
  const rows = [
    ...(d.source === "OTT Update" ? [row("Request type", "Free OTT Update (existing customer re-flash)")] : []),
    row("Name", d.name), row("Phone", d.phone), row("Email", d.email),
    row("City", `${market.city}, ${market.state}`), row("Date", event.label || event.dateISO),
    row("Time", d.slot), row("Vehicle", d.vehicle), row("Goals", d.goals), row("Attribution", attribution(d)),
  ];
```

In `buildPriorityInstallerEmail`, change the `rows` array head:

```js
function buildPriorityInstallerEmail(d, inst, market, reason) {
  const rows = [
    ...(d.source === "OTT Update" ? [row("Request type", "Free OTT Update (existing customer re-flash)")] : []),
    row("Name", d.name), row("Phone", d.phone), row("Email", d.email), row("City", market.city),
    row("Requested time", reason === "full" ? (d.slot || "") : ""), row("Vehicle", d.vehicle),
    row("Goals", d.goals), row("Reason", reason === "full" ? "Event full" : "No event scheduled"), row("Attribution", attribution(d)),
  ];
```

- [ ] **Step 4: Run templates + book tests to confirm all pass**

Run: `node --test tests/templates.test.js tests/book.test.js`
Expected: PASS for all (Task 1's `/Free OTT Update/` email assertion now passes too).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/templates.js tests/templates.test.js
git commit -m "feat(email): surface Free OTT Update request type to installer"
```

---

### Task 3: Homepage CTA band

**Files:**
- Modify: `site/index.html` (insert at start of `<div class="wrap">`, before `<section class="sec">` "Why Tuned Yota")
- Test: `tests/homepage-cta.test.js` (new)

- [ ] **Step 1: Write the failing test** (`tests/homepage-cta.test.js`)

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const HTML = fs.readFileSync(path.join(__dirname, "..", "site", "index.html"), "utf8");

test("homepage shows both CTA buttons", () => {
  assert.ok(HTML.includes("Book Event Time Slot NOW"), "missing Book button");
  assert.ok(HTML.includes("Schedule my FREE OTT Update"), "missing Update button");
  assert.ok(HTML.includes("find-your-exact-tune.html?intent=update"), "update button must deep-link intent=update");
});
test("CTA band sits above the main content sections", () => {
  const band = HTML.indexOf("Book Event Time Slot NOW");
  const vehicles = HTML.indexOf('id="vehicles"');
  assert.ok(band > -1 && vehicles > -1 && band < vehicles, "CTA band should appear before the vehicles section");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/homepage-cta.test.js`
Expected: FAIL — buttons not present in `index.html`.

- [ ] **Step 3: Insert the CTA band**

In `site/index.html`, immediately after `<div class="wrap">` and before the first `<section class="sec">` ("Why Tuned Yota"), add:

```html
  <div class="band">
    <h2>Ready when you are.</h2>
    <p>Book your spot at an upcoming event — or, if you're already tuned, grab your free OTT calibration update.</p>
    <div class="cta-row">
      <a class="btn p" href="find-your-exact-tune.html">Book Event Time Slot NOW</a>
      <a class="btn o" href="find-your-exact-tune.html?intent=update">Schedule my FREE OTT Update</a>
    </div>
  </div>
```

(Reuses existing `.band`, `.cta-row`, `.btn.p`, `.btn.o` styles — no CSS change.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/homepage-cta.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add site/index.html tests/homepage-cta.test.js
git commit -m "feat(home): add Book + Free OTT Update CTA band at top of page"
```

---

### Task 4: Funnel `?intent=update` handling

**Files:**
- Modify: `site/find-your-exact-tune.html` (parse near line 630; step-0 reframe; booking payload ~line 896-902; lead payload ~line 925 + 934)
- Test: `tests/booking-ui.test.js`

- [ ] **Step 1: Write the failing test** (append to `tests/booking-ui.test.js`)

```js
test("intent=update reframes step 0 and tags source", () => {
  assert.ok(/getParam|["']intent["']/.test(HTML), "intent parse missing");
  assert.ok(HTML.includes("Free OTT Update"), "update reframe copy missing");
  assert.ok(/["']OTT Update["']/.test(HTML), "OTT Update source tag missing");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/booking-ui.test.js`
Expected: FAIL — intent handling absent.

- [ ] **Step 3a: Parse intent + store on S**

In `site/find-your-exact-tune.html`, immediately after the `ATTR` IIFE block (the `})();` that closes it, ~line 630), add:

```js
S.intent = new URLSearchParams(location.search).get("intent") || "";
if(S.intent==="update"){
  const eb=document.querySelector('[data-step="0"] .tf-eyebrow');
  const h=document.querySelector('[data-step="0"] .tf-h');
  const sub=document.querySelector('[data-step="0"] .tf-sub');
  if(eb) eb.textContent="Free OTT Update";
  if(h) h.textContent="Schedule your free OTT update.";
  if(sub) sub.textContent="Already running a Tuned Yota calibration? Pick your vehicle and we'll get you re-flashed to the latest at an event near you.";
}
```

- [ ] **Step 3b: Tag the booking payload**

In the `$("#fSubmit").onclick` handler, in the `payload` object literal (currently ends with the `utm_*` fields), add a `source` field:

```js
  const payload={
    city:S.marketCity, slot:BOOK.slot||undefined,
    name, phone, email, vehicle:$("#fVeh").value,
    goals: goalsStr + (msg?` · Note: ${msg}`:""),
    installer_key:S.installerKey||"", bot_field:"",
    source: S.intent==="update" ? "OTT Update" : "find-your-exact-tune",
    utm_source:ATTR.utm_source||"", utm_medium:ATTR.utm_medium||"", utm_campaign:ATTR.utm_campaign||""
  };
```

- [ ] **Step 3c: Tag the legacy Netlify lead payload**

In `submitNetlifyLead()`, update the `fields` object's `source` (currently `source:"Tune Finder"`):

```js
    message, source: S.intent==="update" ? "OTT Update" : "Tune Finder",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/booking-ui.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add site/find-your-exact-tune.html tests/booking-ui.test.js
git commit -m "feat(funnel): handle ?intent=update — reframe step 0 + tag source as OTT Update"
```

---

### Task 5: Full verification + ship

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass (existing + 4 new cases).

- [ ] **Step 2: Confirm SEO generator is idempotent on the new band**

Run: `npm run build:seo`
Then: `git diff --stat`
Expected: changes only to generated `<head>`/schema/OG/sitemap regions (or none for `index.html` body). The new `.band` in the body is untouched (injection markers live in `<head>`). If `index.html` body changed, STOP and investigate.

- [ ] **Step 3: Run tests again after build**

Run: `npm test`
Expected: still all green.

- [ ] **Step 4: Ship**

Use the `ship` skill (regenerate → test → push to `master` → live verify). On the live site confirm:
- Homepage shows both CTA buttons above the vehicles section.
- `find-your-exact-tune.html?intent=update` shows the "Free OTT Update" step-0 copy.
- (Email delivery remains blocked until the separate Resend `send.tunedyota.events` verification lands — note, don't treat as a regression.)

---

## Self-Review

**Spec coverage:**
- Homepage two buttons + placement → Task 3 ✓
- `?intent=update` reframe + source tag → Task 4 ✓
- `book.js` Source passthrough → Task 1 ✓
- Installer email request-type row → Task 2 ✓
- Tests for tagging → Tasks 1, 2, 4 ✓; homepage presence → Task 3 ✓
- Deploy via ship + build:seo idempotency check → Task 5 ✓
- Priority List Airtable `Source`: intentionally omitted (documented deviation) — visibility preserved via Task 2 email row ✓

**Placeholder scan:** none — all steps contain exact code/commands.

**Type/name consistency:** `source` (client field) → `d.source` (book.js + templates) → Airtable `Source` column. `S.intent` used consistently. Button labels match across Task 3 and Task 4 deep-link.
