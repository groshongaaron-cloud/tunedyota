# Email-Failure Hardening + Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Resend send-failures impossible to miss — real-time Slack alert + Airtable flag + softened customer copy on every failed booking/lead email, plus a daily canary that proves the send path still works.

**Architecture:** All alerts go through the existing Slack webhook (independent of Resend). New side-effects (`notifyOwner`, `updateRecord`) are dependency-injected into `book.js`/`submission-created.js` and individually try/caught so they can never break the booking/lead flow. A scheduled `email-health.js` function sends a daily canary and alerts on non-200.

**Tech Stack:** Node CommonJS, Netlify Functions (scheduled via `netlify.toml`), Resend REST, Airtable REST, `node:test`.

---

## File Structure

- `netlify/functions/lib/alert.js` *(new)* — `notifyOwner()` Slack poster; never throws.
- `netlify/functions/lib/airtable.js` — add `updateRecord()` (PATCH).
- `netlify/functions/book.js` — capture send results; alert + flag (booking & priority paths); return `emailFailed`.
- `netlify/functions/submission-created.js` — capture send results; alert on failure.
- `netlify/functions/email-health.js` *(new)* — daily canary; alert on non-200.
- `netlify.toml` — schedule `email-health`.
- `site/find-your-exact-tune.html` — softened success copy when `out.emailFailed`.
- Tests: `tests/alert.test.js` *(new)*, `tests/airtable.test.js`, `tests/book.test.js`, `tests/process-submission.test.js`, `tests/email-health.test.js` *(new)*, `tests/booking-ui.test.js`.

**Branching:** create `feat/email-failure-hardening` off `master` (independent of the held `feat/homepage-cta-ott-update` branch).

---

### Task 0: Branch

- [ ] **Step 1: Create the branch off master**

```bash
git checkout master
git checkout -b feat/email-failure-hardening
```

Expected: on `feat/email-failure-hardening`, clean tree.

---

### Task 1: Slack alert helper

**Files:**
- Create: `netlify/functions/lib/alert.js`
- Test: `tests/alert.test.js` (new)

- [ ] **Step 1: Write the failing test** (`tests/alert.test.js`)

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { notifyOwner } = require("../netlify/functions/lib/alert.js");

test("posts the text to the webhook", async () => {
  let seen;
  const fetchImpl = async (url, opts) => { seen = { url, opts }; return { ok: true }; };
  const r = await notifyOwner({ fetchImpl, webhookUrl: "https://hooks.slack.test/x", text: "hello" });
  assert.equal(r.ok, true);
  assert.equal(seen.url, "https://hooks.slack.test/x");
  assert.equal(seen.opts.method, "POST");
  assert.equal(JSON.parse(seen.opts.body).text, "hello");
});
test("no-ops (does not throw, does not fetch) when webhookUrl is falsy", async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return { ok: true }; };
  const r = await notifyOwner({ fetchImpl, webhookUrl: "", text: "x", log: { warn() {} } });
  assert.equal(r.skipped, true);
  assert.equal(called, false);
});
test("never throws when fetch rejects", async () => {
  const fetchImpl = async () => { throw new Error("network"); };
  const r = await notifyOwner({ fetchImpl, webhookUrl: "https://x", text: "x", log: { error() {} } });
  assert.equal(r.ok, false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/alert.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (`netlify/functions/lib/alert.js`)

```js
// Resend-independent owner alert: POSTs a plain Slack message. Never throws —
// alerting must not break the caller. Returns {ok}|{skipped}|{ok:false,error}.
async function notifyOwner({ fetchImpl = fetch, webhookUrl, text, log = console }) {
  if (!webhookUrl) {
    if (log.warn) log.warn("SLACK_WEBHOOK_URL unset — alert skipped:", text);
    return { skipped: true };
  }
  try {
    const res = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return { ok: !!res.ok };
  } catch (e) {
    if (log.error) log.error("slack alert failed:", e.message);
    return { ok: false, error: e.message };
  }
}
module.exports = { notifyOwner };
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/alert.test.js`
Expected: PASS (3).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/alert.js tests/alert.test.js
git commit -m "feat(alert): Resend-independent Slack owner-alert helper"
```

---

### Task 2: Airtable `updateRecord`

**Files:**
- Modify: `netlify/functions/lib/airtable.js`
- Test: `tests/airtable.test.js`

- [ ] **Step 1: Write the failing test** (append to `tests/airtable.test.js`)

```js
test("updateRecord PATCHes the record by id with typecast", async () => {
  let seen;
  const fetchImpl = async (url, opts) => { seen = { url, opts }; return { ok: true, json: async () => ({ id: "r1" }) }; };
  const { updateRecord } = require("../netlify/functions/lib/airtable.js");
  const r = await updateRecord({ fetchImpl, token: "t", baseId: "b", table: "Bookings", id: "r1", fields: { "Email Status": "FAILED" } });
  assert.equal(r.id, "r1");
  assert.equal(seen.opts.method, "PATCH");
  assert.ok(seen.url.endsWith("/b/Bookings/r1"));
  const body = JSON.parse(seen.opts.body);
  assert.equal(body.fields["Email Status"], "FAILED");
  assert.equal(body.typecast, true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/airtable.test.js`
Expected: FAIL — `updateRecord is not a function`.

- [ ] **Step 3: Implement** — add to `netlify/functions/lib/airtable.js` before `module.exports`, and export it:

```js
async function updateRecord({ fetchImpl = fetch, token, baseId, table, id, fields }) {
  const url = `${API}/${baseId}/${encodeURIComponent(table)}/${id}`;
  const res = await fetchImpl(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields, typecast: true }),
  });
  if (!res.ok) throw new Error(`airtable update ${res.status}: ${await res.text().catch(() => "")}`);
  return res.json();
}
module.exports = { cfg, listRecords, createRecord, updateRecord };
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/airtable.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/airtable.js tests/airtable.test.js
git commit -m "feat(airtable): add updateRecord (PATCH by id)"
```

---

### Task 3: book.js — alert + flag + emailFailed (booking & priority)

**Files:**
- Modify: `netlify/functions/book.js`
- Test: `tests/book.test.js`

- [ ] **Step 1: Extend the test harness + add failing tests** (`tests/book.test.js`)

In the `harness` function, extend `deps` and expose spies. Replace the `deps` object with:

```js
  const notifies = [];
  const updates = [];
  const deps = {
    fetchImpl,
    env: { EVENTS_SHEET_ID: "x", AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", RESEND_API_KEY: "re", SLACK_WEBHOOK_URL: "https://hooks.slack.test/x" },
    send: async (a) => { emails.push(a); return { id: "e" }; },
    notify: async (a) => { notifies.push(a); return { ok: true }; },
    update: async (a) => { updates.push(a); return { id: a.id }; },
    now: () => "20260101T000000Z",
    log: { warn() {}, error() {} },
  };
  return { deps, created, emails, notifies, updates };
```

Then append these tests:

```js
test("failed customer email -> alert + Airtable flag + emailFailed", async () => {
  const h = harness({ events: EV });
  h.deps.send = async (a) => {                 // installer ok, customer throws
    if (a.to === base.email) throw new Error("Resend 403: domain not verified");
    return { id: "e" };
  };
  const r = await processBooking({ ...base, slot: "9:20" }, h.deps);
  assert.equal(r.status, "booked");
  assert.equal(r.emailFailed, true);
  assert.equal(h.notifies.length, 1);
  assert.match(h.notifies[0].text, /Booking email FAILED/);
  assert.equal(h.updates.length, 1);
  assert.equal(h.updates[0].fields["Email Status"], "FAILED");
});
test("all emails succeed -> no alert, no flag, emailFailed falsy", async () => {
  const h = harness({ events: EV });
  const r = await processBooking({ ...base, slot: "9:40" }, h.deps);
  assert.equal(r.status, "booked");
  assert.ok(!r.emailFailed);
  assert.equal(h.notifies.length, 0);
  assert.equal(h.updates.length, 0);
});
test("priority email failure -> alert (no throw into flow)", async () => {
  const h = harness({ events: "Market,Date,Active\nSioux Falls,nope,yes\n" }); // no event -> priority
  h.deps.send = async () => { throw new Error("Resend 403"); };
  const r = await processBooking({ ...base, slot: "9:00" }, h.deps);
  assert.equal(r.status, "priority");
  assert.equal(h.notifies.length, 1);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/book.test.js`
Expected: FAIL — `emailFailed`/`notifies`/`updates` undefined or empty.

- [ ] **Step 3: Implement book.js changes**

(a) Add requires at the top (after the existing `tpl` require):

```js
const { sendEmail } = require("./lib/resend.js");
const { notifyOwner } = require("./lib/alert.js");
```
and change the airtable require to include `updateRecord`:
```js
const { cfg, listRecords, createRecord, updateRecord } = require("./lib/airtable.js");
```

(b) Add a module-level helper (above `processBooking`):

```js
async function reportEmailFailure({ fetchImpl, env, notify, update, c, table, id, d, city, reason, log }) {
  const who = d.phone || d.email || "no contact";
  try {
    await notify({ fetchImpl, webhookUrl: env.SLACK_WEBHOOK_URL,
      text: `⚠️ Booking email FAILED — ${d.name} · ${city} · ${who} · reason: ${reason}`, log });
  } catch (e) { if (log.error) log.error("notify", e.message); }
  if (id) {
    try {
      await update({ fetchImpl, token: c.token, baseId: c.baseId, table, id, fields: { "Email Status": "FAILED" } });
    } catch (e) { if (log.error) log.error("flag", e.message); }
  }
}
```

(c) In `processBooking`, extend the deps destructure:

```js
  const { fetchImpl = fetch, env = process.env, send = sendEmail, now, log = console,
          notify = notifyOwner, update = updateRecord } = deps;
```

(d) **Priority path** — capture the record id and the send results. Replace the body of `priority(reason)` from the `createRecord` line through the two `send` blocks and the `return` with:

```js
    let pid;
    try {
      const rec = await createRecord({ fetchImpl, token: c.token, baseId: c.baseId, table: c.priority, fields: pfields });
      pid = rec && rec.id;
    } catch (e) { if (log.error) log.error("priority create", e.message); return { status: "error", error: "store-unavailable" }; }
    let ok = true, why = "";
    try { const m = tpl.buildPriorityInstallerEmail(d, inst, market, reason); await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: inst.email, cc: inst.email === OWNER ? undefined : OWNER, replyTo: d.email || undefined, subject: m.subject, html: m.html, text: m.text }); } catch (e) { ok = false; why = e.message; if (log.error) log.error("prio inst email", e.message); }
    if (d.email) { try { const m = tpl.buildPriorityCustomerEmail(d, inst, market, reason); await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: d.email, replyTo: OWNER, subject: m.subject, html: m.html, text: m.text }); } catch (e) { ok = false; why = why || e.message; if (log.error) log.error("prio cust email", e.message); } }
    if (!ok) await reportEmailFailure({ fetchImpl, env, notify, update, c, table: c.priority, id: pid, d, city: market.city, reason: why, log });
    return { status: "priority", reason };
```

(e) **Booking path** — capture the record id, capture the two send results, then report. Replace the booking `createRecord` try-block and the two `send` blocks and the final `return` with:

```js
  let bid;
  try {
    const rec = await createRecord({ fetchImpl, token: c.token, baseId: c.baseId, table: c.bookings, fields: {
      City: market.city, "Event Date": event.dateISO, Slot: d.slot,
      Name: d.name, Phone: d.phone || "", Email: d.email || "",
      Vehicle: d.vehicle || "", Goals: d.goals || "", Installer: inst.key,
      Status: "Booked", Source: d.source || "find-your-exact-tune",
      "UTM Source": d.utm_source || "", "UTM Medium": d.utm_medium || "", "UTM Campaign": d.utm_campaign || "",
    } });
    bid = rec && rec.id;
  } catch (e) { if (log.error) log.error("create", e.message); return { status: "error", error: "store-unavailable" }; }

  let instOk = true, custOk = true, why = "";
  try { const m = tpl.buildBookingInstallerEmail(d, inst, market, event); await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: inst.email, cc: inst.email === OWNER ? undefined : OWNER, replyTo: d.email || undefined, subject: m.subject, html: m.html, text: m.text }); } catch (e) { instOk = false; why = e.message; if (log.error) log.error("inst email", e.message); }
  if (d.email) {
    try {
      const ics = buildIcs({ uid: `${event.dateISO}-${d.slot}-${now()}@tunedyota.com`, dateISO: event.dateISO, slot: d.slot, summary: `Tuned Yota — ${market.city} OTT Tune`, location: `${market.city}, ${market.state}`, description: `Your ${d.vehicle || "vehicle"} tune with ${inst.name}. Questions: ${inst.phone}`, stamp: now() });
      const m = tpl.buildBookingCustomerEmail(d, inst, market, event);
      await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: d.email, replyTo: OWNER, subject: m.subject, html: m.html, text: m.text, attachments: [{ filename: "tuned-yota-booking.ics", content: Buffer.from(ics).toString("base64") }] });
    } catch (e) { custOk = false; why = why || e.message; if (log.error) log.error("cust email", e.message); }
  }
  const emailFailed = d.email ? !custOk : false;
  if (!instOk || (d.email && !custOk)) await reportEmailFailure({ fetchImpl, env, notify, update, c, table: c.bookings, id: bid, d, city: market.city, reason: why, log });

  return { status: "booked", city: market.city, eventDateISO: event.dateISO, eventLabel: event.label, slot: d.slot, emailFailed };
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/book.test.js`
Expected: PASS (all, incl. the 3 new).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/book.js tests/book.test.js
git commit -m "feat(book): alert + Airtable flag + emailFailed on send failure (booking & priority)"
```

---

### Task 4: submission-created.js — alert on lead email failure

**Files:**
- Modify: `netlify/functions/submission-created.js`
- Test: `tests/process-submission.test.js`

- [ ] **Step 1: Add the failing test** (append to `tests/process-submission.test.js`)

```js
test("alerts owner when a lead email send fails", async () => {
  const notifies = [];
  const deps = {
    apiKey: "re_test", log: { warn() {}, error() {} },
    webhookUrl: "https://hooks.slack.test/x",
    notify: async (a) => { notifies.push(a); return { ok: true }; },
    sendEmail: async () => { throw new Error("Resend 403: domain not verified"); },
  };
  const r = await processSubmission({ form_name: "tune-lead", data }, deps);
  assert.equal(r.sent, 0);
  assert.equal(notifies.length, 1);
  assert.match(notifies[0].text, /lead email FAILED/i);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/process-submission.test.js`
Expected: FAIL — notify never called.

- [ ] **Step 3: Implement**

(a) Add requires at top:
```js
const { notifyOwner } = require("./lib/alert.js");
```

(b) Extend the deps destructure in `processSubmission`:
```js
  const { sendEmail: send, apiKey, log = console, notify = notifyOwner, webhookUrl = process.env.SLACK_WEBHOOK_URL } = deps;
```

(c) Track failure across the two sends. Add `let failed = false, why = "";` before the installer block; in each `catch (e)` set `failed = true; why = why || e.message;` (keep the existing `log.error`). After the customer block, before `return { sent }`:
```js
  if (failed) {
    const d2 = payload.data || {};
    try { await notify({ fetchImpl: deps.fetchImpl, webhookUrl, text: `⚠️ Tune lead email FAILED — ${d2.name || "?"} · ${d2.market || "?"} · ${d2.phone || d2.email || "no contact"} · reason: ${why}`, log }); }
    catch (e) { if (log.error) log.error("notify", e.message); }
  }
```
(The installer `catch` is at the existing `log.error("installer email failed:", e.message);` — add `failed = true; why = why || e.message;` in that same block; likewise in the customer `catch`.)

(d) In `handler`, pass the webhook env through:
```js
  await processSubmission(body.payload, {
    sendEmail,
    apiKey: process.env.RESEND_API_KEY,
    webhookUrl: process.env.SLACK_WEBHOOK_URL,
  });
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/process-submission.test.js`
Expected: PASS (incl. the existing "a failing send is caught" test, which still asserts `sent`).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/submission-created.js tests/process-submission.test.js
git commit -m "feat(leads): alert owner via Slack when a lead email fails"
```

---

### Task 5: Daily email canary

**Files:**
- Create: `netlify/functions/email-health.js`
- Modify: `netlify.toml`
- Test: `tests/email-health.test.js` (new)

- [ ] **Step 1: Write the failing test** (`tests/email-health.test.js`)

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { checkEmailHealth } = require("../netlify/functions/email-health.js");

const baseEnv = { RESEND_API_KEY: "re", SLACK_WEBHOOK_URL: "https://hooks.slack.test/x", CANARY_TO: "info+canary@tunedyota.com" };

test("stays quiet when the canary send succeeds", async () => {
  const notifies = [];
  const r = await checkEmailHealth({ env: baseEnv, send: async () => ({ id: "ok" }), notify: async (a) => notifies.push(a) });
  assert.equal(r.ok, true);
  assert.equal(notifies.length, 0);
});
test("alerts when the canary send fails", async () => {
  const notifies = [];
  const r = await checkEmailHealth({ env: baseEnv, send: async () => { throw new Error("Resend 403"); }, notify: async (a) => { notifies.push(a); }, log: { error() {} } });
  assert.equal(r.ok, false);
  assert.equal(notifies.length, 1);
  assert.match(notifies[0].text, /email path DOWN/i);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/email-health.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (`netlify/functions/email-health.js`)

```js
// Daily canary: prove the Resend send path still returns 200. On failure, alert
// the owner via Slack (independent of Resend). Scheduled in netlify.toml.
const { sendEmail } = require("./lib/resend.js");
const { notifyOwner } = require("./lib/alert.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";

async function checkEmailHealth(deps) {
  const { fetchImpl = fetch, env = process.env, send = sendEmail, notify = notifyOwner, log = console } = deps;
  const to = env.CANARY_TO || "info+canary@tunedyota.com";
  try {
    await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to,
      subject: "[canary] email-health", text: "Tuned Yota email-path canary — a 200 means sending works." });
    return { ok: true };
  } catch (e) {
    try { await notify({ fetchImpl, webhookUrl: env.SLACK_WEBHOOK_URL, text: `⚠️ Tuned Yota email path DOWN: ${e.message}`, log }); }
    catch (e2) { if (log.error) log.error("canary notify", e2.message); }
    return { ok: false, error: e.message };
  }
}
async function handler() {
  const r = await checkEmailHealth({});
  return { statusCode: 200, body: JSON.stringify(r) };
}
module.exports = { handler, checkEmailHealth };
```

- [ ] **Step 4: Schedule it** — append to `netlify.toml`:

```toml
[functions."email-health"]
  schedule = "@daily"
```

- [ ] **Step 5: Run to verify pass**

Run: `node --test tests/email-health.test.js`
Expected: PASS (2).

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/email-health.js tests/email-health.test.js netlify.toml
git commit -m "feat(monitor): daily email canary -> Slack alert on send-path failure"
```

---

### Task 6: Softened customer copy in the funnel

**Files:**
- Modify: `site/find-your-exact-tune.html` (the `out.status==="booked"` branch in `$("#fSubmit").onclick`)
- Test: `tests/booking-ui.test.js`

- [ ] **Step 1: Add the failing test** (append to `tests/booking-ui.test.js`)

```js
test("booking success copy softens when email delivery fails", () => {
  assert.ok(HTML.includes("out.emailFailed"), "missing emailFailed branch");
  assert.ok(/confirm the details by phone\/text/i.test(HTML), "missing softened fallback copy");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/booking-ui.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement** — in `site/find-your-exact-tune.html`, replace the booked branch:

```js
    if(out.status==="booked"){ try{if(window.fbq)fbq('track','Schedule',{content_name:'Tune Booking'});}catch(e){} bookSuccess("You're booked.",`You're set for ${out.eventLabel||out.eventDateISO} at ${out.slot}. Check your email for a calendar invite.`); }
```

with:

```js
    if(out.status==="booked"){ try{if(window.fbq)fbq('track','Schedule',{content_name:'Tune Booking'});}catch(e){} const tail=out.emailFailed?"We'll confirm the details by phone/text shortly.":"Check your email for a calendar invite."; bookSuccess("You're booked.",`You're set for ${out.eventLabel||out.eventDateISO} at ${out.slot}. ${tail}`); }
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/booking-ui.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add site/find-your-exact-tune.html tests/booking-ui.test.js
git commit -m "feat(funnel): soften booking success copy when email delivery fails"
```

---

### Task 7: Full verification + ship checkpoint

- [ ] **Step 1: Full suite**

Run: `npm test`
Expected: all pass (existing + new).

- [ ] **Step 2: SEO build idempotency** (only `find-your-exact-tune.html` changed in `site/`)

Run: `npm run build:seo` then `git checkout -- site/` to drop any LF rewrite churn, then `git status` (only real changes already committed).
Expected: no unexpected content diffs.

- [ ] **Step 3: Re-run tests**

Run: `npm test`
Expected: still green.

- [ ] **Step 4: STOP — ship checkpoint**

Do NOT push. Report to the owner:
- Confirm `SLACK_WEBHOOK_URL` is set in Netlify and the `Email Status` column exists in both Airtable tables.
- Then merge `feat/email-failure-hardening` → `master` and push (per `ship` skill), or bundle with the held CTA/DNS work.

---

## Self-Review

**Spec coverage:**
- Real-time Slack alert (booking, priority, lead) → Tasks 3, 4 ✓
- Airtable FAILED flag (booking + priority) → Task 3 (+ `updateRecord` Task 2) ✓
- Softened customer copy → Task 6 (+ `emailFailed` from Task 3) ✓
- Daily canary → Task 5 ✓
- Slack-independent alert channel / never-throw safety → Task 1 (notifyOwner never throws) + every side-effect try/caught in Tasks 3–5 ✓
- Config prerequisites (env + Airtable column) → called out in Task 7 checkpoint ✓
- Tests for each unit → Tasks 1–6 ✓

**Placeholder scan:** none — all steps have exact code/commands.

**Type/name consistency:** `notifyOwner`/`notify`, `updateRecord`/`update`, `webhookUrl`, `SLACK_WEBHOOK_URL`, `Email Status`, `emailFailed`, `CANARY_TO`, `checkEmailHealth` used consistently across tasks. `reportEmailFailure` defined once (Task 3) and called in both booking & priority paths. `book.js` deps add `notify`/`update`; `submission-created.js` deps add `notify`/`webhookUrl`; `email-health` deps add `send`/`notify`.
