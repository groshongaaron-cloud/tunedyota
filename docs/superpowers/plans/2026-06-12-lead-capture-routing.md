# Lead Capture + Territory Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture every tune-finder lead in the shared Netlify Forms dashboard and route it server-side to the assigned installer (CC info@) with a customer auto-reply, enriched with goals, quoted prices, and marketing attribution — keeping the existing mailto fallback.

**Architecture:** A single hidden Netlify-detectable form registers `tune-lead` at deploy time. The page submits via `fetch` (form-encoded) to `/`; Netlify stores the submission and runs spam filtering, then fires a `submission-created` function. That function maps the submitted `installer_key` to an email and sends two messages via the Resend REST API. Pure logic (routing, templates, send wrapper) lives in small importable modules with `node --test` unit tests; HTML/handler wiring is verified on a Netlify preview deploy.

**Tech Stack:** Static HTML + vanilla JS (existing), Netlify Forms, Netlify Functions (CommonJS, Node 24), Resend REST API via global `fetch`, Node built-in test runner (`node --test`, `node:assert`). No npm dependencies.

**Spec:** `docs/superpowers/specs/2026-06-12-lead-capture-routing-design.md`

**Convention:** Every commit message ends with the trailer:
```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `package.json` | Test script only (`node --test`); `private`, no deps, CommonJS default | Create |
| `netlify.toml` | Root config: `publish = "site"`, `functions = "netlify/functions"` | Create |
| `netlify/functions/lib/routing.js` | Pure: `keyToInstaller(key)` → `{key,name,email,phone}`, fallback to Aaron/info@ | Create |
| `netlify/functions/lib/templates.js` | Pure: `buildInstallerEmail(d,inst)`, `buildCustomerEmail(d,inst)` → `{subject,html,text}` | Create |
| `netlify/functions/lib/resend.js` | `sendEmail({...})` thin wrapper over Resend REST (fetch injectable) | Create |
| `netlify/functions/submission-created.js` | Netlify event handler + pure `processSubmission(payload, deps)` orchestrator | Create |
| `tests/routing.test.js` | Unit tests for routing | Create |
| `tests/templates.test.js` | Unit tests for templates | Create |
| `tests/resend.test.js` | Unit tests for send wrapper (fake fetch) | Create |
| `tests/process-submission.test.js` | Unit tests for orchestrator (spy sendEmail) | Create |
| `site/find-your-exact-tune.html` | Hidden detection form; attribution capture; `installer_key` in state; rewritten submit | Modify |
| `README.md` | Deploy command, env var, Resend domain verification, backstop notification | Modify |

`tests/` and `package.json` live at repo root (outside `site/` publish dir and outside `netlify/functions/`), so they never deploy. The `lib/` subfolder has no top-level `.js` matching a function name, so Netlify bundles it on import but does not deploy it as a function.

---

## Task 1: Project scaffolding (package.json + netlify.toml)

**Files:**
- Create: `package.json`
- Create: `netlify.toml`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "tunedyota-site",
  "private": true,
  "version": "1.0.0",
  "description": "Tuned Yota marketing site + Netlify lead-routing functions",
  "scripts": {
    "test": "node --test"
  }
}
```

(No `"type"` field → `.js` files are CommonJS, matching the Netlify functions and tests below.)

- [ ] **Step 2: Create `netlify.toml`**

```toml
[build]
  publish = "site"
  functions = "netlify/functions"
```

- [ ] **Step 3: Verify both files are valid (do NOT run `npm test` yet — `tests/` doesn't exist, which would error)**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'));console.log('package.json OK')"`
Expected: `package.json OK`

Run: `test -f netlify.toml && echo "netlify.toml present"`
Expected: `netlify.toml present`

- [ ] **Step 4: Commit**

```bash
git add package.json netlify.toml
git commit -m "$(printf 'chore: add package.json test script and root netlify.toml\n\nConfigures Netlify publish=site + functions dir and a node --test\nscript for the lead-routing logic.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2: Installer routing logic (TDD)

**Files:**
- Create: `netlify/functions/lib/routing.js`
- Test: `tests/routing.test.js`

- [ ] **Step 1: Write the failing test**

`tests/routing.test.js`:
```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { keyToInstaller, INSTALLERS } = require("../netlify/functions/lib/routing.js");

test("maps each known key to its installer", () => {
  assert.equal(keyToInstaller("aaron").email, "info@tunedyota.com");
  assert.equal(keyToInstaller("noah").email, "noah@tunedyota.com");
  assert.equal(keyToInstaller("cody").email, "cody@tunedyota.com");
});

test("returns name and phone for templates", () => {
  const noah = keyToInstaller("noah");
  assert.equal(noah.name, "Noah Kreis");
  assert.equal(noah.phone, "(920) 860-7050");
});

test("falls back to Aaron / info@ for unknown or empty key", () => {
  assert.equal(keyToInstaller("").email, "info@tunedyota.com");
  assert.equal(keyToInstaller("nobody").email, "info@tunedyota.com");
  assert.equal(keyToInstaller(undefined).key, "aaron");
});

test("INSTALLERS table is exported for reuse", () => {
  assert.ok(INSTALLERS.aaron && INSTALLERS.noah && INSTALLERS.cody);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/routing.test.js`
Expected: FAIL — `Cannot find module '../netlify/functions/lib/routing.js'`.

- [ ] **Step 3: Write minimal implementation**

`netlify/functions/lib/routing.js`:
```js
// Maps a market's installer key (MARKETS[i].inst in the tune finder) to the
// person who should receive the lead. Mirrors INSTALLERS in
// site/find-your-exact-tune.html. Keep in sync if installer contacts change.
const INSTALLERS = {
  aaron: { key: "aaron", name: "Aaron Groshong", email: "info@tunedyota.com", phone: "(612) 406-7117" },
  noah:  { key: "noah",  name: "Noah Kreis",     email: "noah@tunedyota.com", phone: "(920) 860-7050" },
  cody:  { key: "cody",  name: "Cody Star",      email: "cody@tunedyota.com", phone: "(605) 214-1335" },
};

const FALLBACK_KEY = "aaron";

function keyToInstaller(key) {
  return INSTALLERS[key] || INSTALLERS[FALLBACK_KEY];
}

module.exports = { INSTALLERS, FALLBACK_KEY, keyToInstaller };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/routing.test.js`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/routing.js tests/routing.test.js
git commit -m "$(printf 'feat: add installer routing with Aaron/info@ fallback\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 3: Email templates (TDD)

**Files:**
- Create: `netlify/functions/lib/templates.js`
- Test: `tests/templates.test.js`

The form data shape (`d`) — keys exactly as submitted by the page:
`name, phone, email, market, installer_key, installer_name, vehicle, goals, quote_base, quote_custom, quote_sc, message, source, referrer, utm_source, utm_medium, utm_campaign`.

- [ ] **Step 1: Write the failing test**

`tests/templates.test.js`:
```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildInstallerEmail, buildCustomerEmail } = require("../netlify/functions/lib/templates.js");
const { keyToInstaller } = require("../netlify/functions/lib/routing.js");

const sample = {
  name: "Jane Driver", phone: "(555) 111-2222", email: "jane@example.com",
  market: "Green Bay, WI", installer_key: "noah", installer_name: "Noah Kreis",
  vehicle: "2025+ Toyota Tacoma 2.4L-T I4", goals: "More power & torque, Towing confidence",
  quote_base: "650", quote_custom: "800", quote_sc: "950",
  message: "Interested in the supercharger path.",
  referrer: "https://instagram.com/", utm_source: "ig", utm_medium: "social", utm_campaign: "tacoma-launch",
};

test("installer email includes contact, vehicle, goals, quote, attribution", () => {
  const m = buildInstallerEmail(sample, keyToInstaller(sample.installer_key));
  assert.match(m.subject, /Tacoma/);
  for (const needle of ["Jane Driver", "(555) 111-2222", "jane@example.com",
       "Green Bay, WI", "2025+ Toyota Tacoma", "More power", "650", "950",
       "supercharger path", "ig", "tacoma-launch", "instagram.com"]) {
    assert.ok(m.text.includes(needle), `text missing: ${needle}`);
    assert.ok(m.html.includes(needle), `html missing: ${needle}`);
  }
});

test("customer email names the assigned installer and phone", () => {
  const m = buildCustomerEmail(sample, keyToInstaller(sample.installer_key));
  assert.match(m.subject, /Tuned Yota/);
  assert.ok(m.text.includes("Noah Kreis"));
  assert.ok(m.text.includes("(920) 860-7050"));
  assert.ok(m.html.includes("Noah Kreis"));
});

test("templates tolerate missing optional fields", () => {
  const bare = { name: "X", phone: "", email: "x@y.com", market: "Not selected",
    installer_key: "", vehicle: "2020-2024 4Runner", goals: "", quote_base: "600",
    quote_custom: "", quote_sc: "", message: "", referrer: "", utm_source: "",
    utm_medium: "", utm_campaign: "" };
  const inst = keyToInstaller(bare.installer_key);
  assert.doesNotThrow(() => buildInstallerEmail(bare, inst));
  assert.doesNotThrow(() => buildCustomerEmail(bare, inst));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/templates.test.js`
Expected: FAIL — `Cannot find module '../netlify/functions/lib/templates.js'`.

- [ ] **Step 3: Write minimal implementation**

`netlify/functions/lib/templates.js`:
```js
// Pure builders: given form data `d` and the resolved `inst` (from routing),
// return { subject, html, text }. No I/O.

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function row(label, value) {
  if (!value) return { text: "", html: "" };
  return {
    text: `${label}: ${value}\n`,
    html: `<tr><td style="padding:4px 12px 4px 0;color:#7c8472;font-weight:700">${esc(label)}</td><td style="padding:4px 0;color:#3A2E26">${esc(value)}</td></tr>`,
  };
}

function quoteLine(d) {
  const parts = [];
  if (d.quote_base) parts.push(`OTT from $${d.quote_base}`);
  if (d.quote_custom) parts.push(`Custom $${d.quote_custom}`);
  if (d.quote_sc) parts.push(`Forced-induction from $${d.quote_sc}`);
  return parts.join(" · ");
}

function attribution(d) {
  const parts = [];
  if (d.utm_source) parts.push(`source=${d.utm_source}`);
  if (d.utm_medium) parts.push(`medium=${d.utm_medium}`);
  if (d.utm_campaign) parts.push(`campaign=${d.utm_campaign}`);
  if (d.referrer) parts.push(`referrer=${d.referrer}`);
  return parts.join(" · ");
}

function buildInstallerEmail(d, inst) {
  const rows = [
    row("Name", d.name), row("Phone", d.phone), row("Email", d.email),
    row("Market", d.market), row("Vehicle", d.vehicle), row("Goals", d.goals),
    row("Quote shown", quoteLine(d)), row("Message", d.message),
    row("Attribution", attribution(d)),
  ];
  const subject = `New tune lead — ${d.vehicle || "vehicle TBD"} (${d.market || "no market"})`;
  const text =
    `New lead from the tune finder — routed to ${inst.name}.\n\n` +
    rows.map((r) => r.text).join("") +
    `\nReply directly to reach the customer.\n`;
  const html =
    `<div style="font-family:Arial,sans-serif;color:#3A2E26;max-width:560px">` +
    `<h2 style="color:#5B4B42;margin:0 0 4px">New tune lead</h2>` +
    `<p style="margin:0 0 16px;color:#7c8472">Routed to ${esc(inst.name)} — reply directly to reach the customer.</p>` +
    `<table style="border-collapse:collapse;font-size:14px">${rows.map((r) => r.html).join("")}</table>` +
    `</div>`;
  return { subject, html, text };
}

function buildCustomerEmail(d, inst) {
  const subject = "Tuned Yota — we got your request";
  const first = (d.name || "there").split(" ")[0];
  const text =
    `Hi ${first},\n\n` +
    `Thanks for using the Tuned Yota tune finder. Your request for your ` +
    `${d.vehicle || "vehicle"} is in, and ${inst.name} — your installer for ` +
    `${d.market || "your area"} — will reach out to confirm your event date and calibration.\n\n` +
    `Want it sooner? Call or text ${inst.name} at ${inst.phone}.\n\n` +
    `— Tuned Yota · Undeniable Performance\n`;
  const html =
    `<div style="font-family:Arial,sans-serif;color:#3A2E26;max-width:560px">` +
    `<h2 style="color:#5B4B42">Thanks, ${esc(first)} — we got your request.</h2>` +
    `<p>Your request for your <strong>${esc(d.vehicle || "vehicle")}</strong> is in. ` +
    `<strong>${esc(inst.name)}</strong>, your installer for ${esc(d.market || "your area")}, ` +
    `will reach out to confirm your event date and calibration.</p>` +
    `<p>Want it sooner? Call or text ${esc(inst.name)} at <strong>${esc(inst.phone)}</strong>.</p>` +
    `<p style="color:#7c8472;font-weight:700;letter-spacing:.04em">— Tuned Yota · Undeniable Performance</p>` +
    `</div>`;
  return { subject, html, text };
}

module.exports = { buildInstallerEmail, buildCustomerEmail };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/templates.test.js`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/templates.js tests/templates.test.js
git commit -m "$(printf 'feat: add installer + customer email templates\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 4: Resend send wrapper (TDD with injected fetch)

**Files:**
- Create: `netlify/functions/lib/resend.js`
- Test: `tests/resend.test.js`

- [ ] **Step 1: Write the failing test**

`tests/resend.test.js`:
```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { sendEmail } = require("../netlify/functions/lib/resend.js");

function fakeFetch(captured, { ok = true, status = 200, body = "{\"id\":\"abc\"}" } = {}) {
  return async (url, opts) => {
    captured.url = url; captured.opts = opts;
    return {
      ok, status,
      json: async () => JSON.parse(body),
      text: async () => body,
    };
  };
}

test("posts to Resend with auth header and JSON body", async () => {
  const cap = {};
  await sendEmail({
    fetchImpl: fakeFetch(cap), apiKey: "re_test",
    from: "Tuned Yota <info@tunedyota.com>", to: "noah@tunedyota.com",
    cc: "info@tunedyota.com", replyTo: "jane@example.com",
    subject: "S", html: "<p>H</p>", text: "T",
  });
  assert.equal(cap.url, "https://api.resend.com/emails");
  assert.equal(cap.opts.method, "POST");
  assert.equal(cap.opts.headers.Authorization, "Bearer re_test");
  const sent = JSON.parse(cap.opts.body);
  assert.deepEqual(sent.to, ["noah@tunedyota.com"]);
  assert.deepEqual(sent.cc, ["info@tunedyota.com"]);
  assert.deepEqual(sent.reply_to, ["jane@example.com"]);
  assert.equal(sent.subject, "S");
});

test("omits cc and reply_to when not provided", async () => {
  const cap = {};
  await sendEmail({
    fetchImpl: fakeFetch(cap), apiKey: "re_test",
    from: "f", to: "x@y.com", subject: "S", html: "h", text: "t",
  });
  const sent = JSON.parse(cap.opts.body);
  assert.equal(sent.cc, undefined);
  assert.equal(sent.reply_to, undefined);
});

test("throws on non-ok response", async () => {
  const cap = {};
  await assert.rejects(
    () => sendEmail({
      fetchImpl: fakeFetch(cap, { ok: false, status: 422, body: "bad" }),
      apiKey: "re_test", from: "f", to: "x@y.com", subject: "s", html: "h", text: "t",
    }),
    /Resend 422/,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/resend.test.js`
Expected: FAIL — `Cannot find module '../netlify/functions/lib/resend.js'`.

- [ ] **Step 3: Write minimal implementation**

`netlify/functions/lib/resend.js`:
```js
// Thin wrapper over the Resend REST API. fetchImpl is injectable for tests;
// defaults to the global fetch (Node 18+).
async function sendEmail({
  fetchImpl = fetch, apiKey, from, to, cc, replyTo, subject, html, text,
}) {
  const body = {
    from,
    to: [].concat(to),
    subject, html, text,
  };
  if (cc) body.cc = [].concat(cc);
  if (replyTo) body.reply_to = [].concat(replyTo);

  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${detail}`);
  }
  return res.json();
}

module.exports = { sendEmail };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/resend.test.js`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/resend.js tests/resend.test.js
git commit -m "$(printf 'feat: add Resend send wrapper with injectable fetch\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 5: submission-created handler + orchestrator (TDD)

**Files:**
- Create: `netlify/functions/submission-created.js`
- Test: `tests/process-submission.test.js`

`processSubmission(payload, deps)` is the pure-ish orchestrator (deps inject `sendEmail`, `apiKey`, `log`); `handler` is the thin Netlify entry that reads `event.body` + `process.env`.

- [ ] **Step 1: Write the failing test**

`tests/process-submission.test.js`:
```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processSubmission } = require("../netlify/functions/submission-created.js");

function spyDeps(apiKey = "re_test") {
  const calls = [];
  return {
    apiKey,
    log: { warn() {}, error() {} },
    sendEmail: async (args) => { calls.push(args); return { id: "x" }; },
    calls,
  };
}

const data = {
  name: "Jane", phone: "555", email: "jane@example.com", market: "Green Bay, WI",
  installer_key: "noah", installer_name: "Noah Kreis",
  vehicle: "2025+ Toyota Tacoma", goals: "Power", quote_base: "650",
  quote_custom: "", quote_sc: "950", message: "hi",
  referrer: "", utm_source: "ig", utm_medium: "", utm_campaign: "",
};

test("ignores submissions from other forms", async () => {
  const d = spyDeps();
  const r = await processSubmission({ form_name: "contact", data }, d);
  assert.equal(r.skipped, true);
  assert.equal(d.calls.length, 0);
});

test("sends installer email (cc info@) and customer auto-reply", async () => {
  const d = spyDeps();
  const r = await processSubmission({ form_name: "tune-lead", data }, d);
  assert.equal(r.sent, 2);
  const installerMail = d.calls[0];
  assert.equal(installerMail.to, "noah@tunedyota.com");
  assert.equal(installerMail.cc, "info@tunedyota.com");
  assert.equal(installerMail.replyTo, "jane@example.com");
  const customerMail = d.calls[1];
  assert.equal(customerMail.to, "jane@example.com");
  assert.equal(customerMail.replyTo, "info@tunedyota.com");
});

test("does not cc info@ when the installer IS info@ (Aaron)", async () => {
  const d = spyDeps();
  await processSubmission({ form_name: "tune-lead", data: { ...data, installer_key: "aaron" } }, d);
  assert.equal(d.calls[0].to, "info@tunedyota.com");
  assert.equal(d.calls[0].cc, undefined);
});

test("skips customer auto-reply when no customer email", async () => {
  const d = spyDeps();
  const r = await processSubmission({ form_name: "tune-lead", data: { ...data, email: "" } }, d);
  assert.equal(r.sent, 1);
  assert.equal(d.calls.length, 1);
});

test("unknown installer_key routes to Aaron / info@", async () => {
  const d = spyDeps();
  await processSubmission({ form_name: "tune-lead", data: { ...data, installer_key: "zzz" } }, d);
  assert.equal(d.calls[0].to, "info@tunedyota.com");
});

test("no API key → sends nothing, returns reason", async () => {
  const d = spyDeps(null);  // null bypasses the apiKey default; undefined would trigger it
  const r = await processSubmission({ form_name: "tune-lead", data }, d);
  assert.equal(r.sent, 0);
  assert.equal(r.reason, "no-api-key");
  assert.equal(d.calls.length, 0);
});

test("a failing send is caught and does not abort the other send", async () => {
  const calls = [];
  let first = true;
  const deps = {
    apiKey: "re_test", log: { warn() {}, error() {} },
    sendEmail: async (args) => {
      calls.push(args);
      if (first) { first = false; throw new Error("boom"); }
      return { id: "ok" };
    },
  };
  const r = await processSubmission({ form_name: "tune-lead", data }, deps);
  assert.equal(calls.length, 2);   // both attempted
  assert.equal(r.sent, 1);         // only the second succeeded
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/process-submission.test.js`
Expected: FAIL — `Cannot find module '../netlify/functions/submission-created.js'`.

- [ ] **Step 3: Write minimal implementation**

`netlify/functions/submission-created.js`:
```js
// Netlify event function: fires automatically after a verified (non-spam)
// form submission. Routes tune-finder leads to the assigned installer and
// sends a customer auto-reply via Resend.
const { keyToInstaller } = require("./lib/routing.js");
const { buildInstallerEmail, buildCustomerEmail } = require("./lib/templates.js");
const { sendEmail } = require("./lib/resend.js");

const FROM = "Tuned Yota <info@tunedyota.com>";
const OWNER = "info@tunedyota.com";

async function processSubmission(payload, deps) {
  const { sendEmail: send, apiKey, log = console } = deps;
  if (!payload || payload.form_name !== "tune-lead") return { skipped: true };

  const d = payload.data || {};
  const inst = keyToInstaller(d.installer_key);

  if (!apiKey) {
    log.warn("RESEND_API_KEY unset — relying on Netlify backstop notification");
    return { sent: 0, reason: "no-api-key" };
  }

  let sent = 0;

  // 1. Installer notification (CC owner unless the installer already is owner).
  try {
    const m = buildInstallerEmail(d, inst);
    await send({
      fetchImpl: deps.fetchImpl, apiKey, from: FROM,
      to: inst.email,
      cc: inst.email === OWNER ? undefined : OWNER,
      replyTo: d.email || undefined,
      subject: m.subject, html: m.html, text: m.text,
    });
    sent++;
  } catch (e) {
    log.error("installer email failed:", e.message);
  }

  // 2. Customer auto-reply (only if we have their email).
  if (d.email) {
    try {
      const m = buildCustomerEmail(d, inst);
      await send({
        fetchImpl: deps.fetchImpl, apiKey, from: FROM,
        to: d.email, replyTo: OWNER,
        subject: m.subject, html: m.html, text: m.text,
      });
      sent++;
    } catch (e) {
      log.error("customer email failed:", e.message);
    }
  }

  return { sent };
}

async function handler(event) {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 200, body: "ignored: bad json" };
  }
  await processSubmission(body.payload, {
    sendEmail,
    apiKey: process.env.RESEND_API_KEY,
  });
  return { statusCode: 200, body: "ok" };
}

module.exports = { handler, processSubmission };
```

Note: tests pass `sendEmail` as a spy via `deps.sendEmail`, which the orchestrator reads as `send`. The real `handler` passes the imported `sendEmail`. `deps.fetchImpl` is `undefined` in production (so the wrapper uses global `fetch`) and unused by the spy.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/process-submission.test.js`
Expected: PASS — 7 tests pass.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — all tests across routing, templates, resend, process-submission (17 total).

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/submission-created.js tests/process-submission.test.js
git commit -m "$(printf 'feat: add submission-created handler routing leads via Resend\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 6: Add the hidden Netlify-detectable form

**Files:**
- Modify: `site/find-your-exact-tune.html` (insert just after `<body>`, before `<header class="snav">` on line 248)

Netlify registers a form only if a matching `<form>` with all field names exists in deployed HTML at deploy time. This hidden form is detection-only; the live submit is the JS `fetch` in Task 7.

- [ ] **Step 1: Insert the detection form**

Find (line 247-248):
```html
<body>
<header class="snav">
```
Replace with:
```html
<body>
<form name="tune-lead" data-netlify="true" netlify-honeypot="bot-field" hidden aria-hidden="true">
  <input type="text" name="name"><input type="tel" name="phone"><input type="email" name="email">
  <input type="text" name="market"><input type="text" name="installer_key"><input type="text" name="installer_name">
  <input type="text" name="vehicle"><input type="text" name="goals">
  <input type="text" name="quote_base"><input type="text" name="quote_custom"><input type="text" name="quote_sc">
  <textarea name="message"></textarea><input type="text" name="source">
  <input type="text" name="referrer"><input type="text" name="utm_source">
  <input type="text" name="utm_medium"><input type="text" name="utm_campaign">
  <input type="text" name="bot-field">
</form>
<header class="snav">
```

- [ ] **Step 2: Verify the form is present and well-formed**

Run: `grep -c 'name="tune-lead"' site/find-your-exact-tune.html`
Expected: `1`

Run: `grep -o 'name="[a-z_-]*"' site/find-your-exact-tune.html | grep -E 'installer_key|utm_campaign|bot-field' | sort -u`
Expected: lists `name="bot-field"`, `name="installer_key"`, `name="utm_campaign"` (confirms key fields present).

- [ ] **Step 3: Commit**

```bash
git add site/find-your-exact-tune.html
git commit -m "$(printf 'feat: add hidden Netlify form for tune-lead detection\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 7: Attribution capture + submit rewrite

**Files:**
- Modify: `site/find-your-exact-tune.html` (the `<script>` data/logic block, lines ~415-731)

- [ ] **Step 1: Update the lead-delivery comment + constants**

Find (lines 415-421):
```js
/* (1) LEAD DELIVERY ------------------------------------------------
   Leave blank to use the e-mail fallback (opens the customer's mail
   app addressed to info@tunedyota.com).  For real lead capture into
   a dashboard + auto-email, paste a free Formspree endpoint here, e.g.
   "https://formspree.io/f/abcdwxyz".  (Setup: formspree.io → new form.) */
const LEAD_ENDPOINT = "";
const LEAD_EMAIL    = "info@tunedyota.com";
```
Replace with:
```js
/* (1) LEAD DELIVERY ------------------------------------------------
   Leads POST to the Netlify form "tune-lead" (see the hidden <form> after
   <body>). Netlify stores them in the dashboard and fires the
   netlify/functions/submission-created function, which routes to the
   assigned installer + auto-replies to the customer via Resend.
   If the POST fails (offline / not on Netlify), we fall back to opening
   the customer's mail app addressed to LEAD_EMAIL so no lead is lost. */
const LEAD_FORM_NAME = "tune-lead";
const LEAD_EMAIL     = "info@tunedyota.com";
```

- [ ] **Step 2: Add `installerKey` to state and capture attribution on load**

Find (line 541):
```js
const S={make:null,model:null,cfg:null,goals:new Set(),market:"",marketIndex:null,installer:""};
```
Replace with:
```js
const S={make:null,model:null,cfg:null,goals:new Set(),market:"",marketIndex:null,installer:"",installerKey:""};

/* Marketing attribution — captured once on load, persisted across steps. */
const ATTR=(function(){
  let store={}; try{ store=JSON.parse(sessionStorage.getItem("ty_attr")||"{}"); }catch(e){}
  const qs=new URLSearchParams(location.search); let changed=false;
  ["utm_source","utm_medium","utm_campaign"].forEach(k=>{
    const v=qs.get(k); if(v){ store[k]=v; changed=true; }
  });
  if(!store.referrer && document.referrer){ store.referrer=document.referrer; changed=true; }
  if(changed){ try{ sessionStorage.setItem("ty_attr",JSON.stringify(store)); }catch(e){} }
  return store;
})();
```

- [ ] **Step 3: Record the installer key when a market is selected**

Find (lines 689-691):
```js
  const inst=INSTALLERS[m.inst];
  if(inst){
    S.installer=inst.name;
```
Replace with:
```js
  const inst=INSTALLERS[m.inst];
  if(inst){
    S.installer=inst.name;
    S.installerKey=m.inst;
```

- [ ] **Step 4: Rewrite the submit handler to POST to the Netlify form**

Find (lines 708-731):
```js
$("#fSubmit").onclick=async()=>{
  const name=$("#fName").value.trim(), phone=$("#fPhone").value.trim(), email=$("#fEmail").value.trim();
  if(!name||(!phone&&!email)){$("#fErr").style.display="block";return;}
  $("#fErr").style.display="none";
  const payload={
    name, phone, email,
    location:$("#fLoc").value||S.market||"Not selected",
    installer:S.installer||"",
    vehicle:$("#fVeh").value,
    message:$("#fMsg").value.trim(),
    source:"Tune Finder"
  };
  const btn=$("#fSubmit"); btn.textContent="Sending…"; btn.disabled=true;

  if(LEAD_ENDPOINT){
    try{
      const r=await fetch(LEAD_ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(payload)});
      if(!r.ok) throw 0;
      showSuccess(false);
    }catch(e){ openMail(payload); showSuccess(true); }
  }else{
    openMail(payload); showSuccess(true);
  }
}
```
Replace with:
```js
$("#fSubmit").onclick=async()=>{
  const name=$("#fName").value.trim(), phone=$("#fPhone").value.trim(), email=$("#fEmail").value.trim();
  if(!name||(!phone&&!email)){$("#fErr").style.display="block";return;}
  $("#fErr").style.display="none";
  const cfg=S.cfg||{};
  const goalsStr=[...S.goals].map(id=>(GOALS.find(g=>g.id===id)||{}).l).filter(Boolean).join(", ");
  const market=$("#fLoc").value||S.market||"Not selected";
  const message=$("#fMsg").value.trim();
  const vehicle=$("#fVeh").value;
  const payload={ name, phone, email, location:market, installer:S.installer||"", vehicle, message, source:"Tune Finder" };
  const fields={
    "form-name":LEAD_FORM_NAME, "bot-field":"",
    name, phone, email, market,
    installer_key:S.installerKey||"", installer_name:S.installer||"",
    vehicle, goals:goalsStr,
    quote_base:cfg.base!=null?String(cfg.base):"",
    quote_custom:cfg.custom!=null?String(cfg.custom):"",
    quote_sc:cfg.sc!=null?String(cfg.sc):"",
    message, source:"Tune Finder",
    referrer:ATTR.referrer||"",
    utm_source:ATTR.utm_source||"", utm_medium:ATTR.utm_medium||"", utm_campaign:ATTR.utm_campaign||""
  };
  const btn=$("#fSubmit"); btn.textContent="Sending…"; btn.disabled=true;
  try{
    const r=await fetch("/",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams(fields).toString()});
    if(!r.ok) throw 0;
    showSuccess(false);
  }catch(e){ openMail(payload); showSuccess(true); }
}
```

- [ ] **Step 5: Verify no stale references and the page parses**

Run: `grep -n 'LEAD_ENDPOINT' site/find-your-exact-tune.html`
Expected: no output (constant fully removed).

Run: `node --check site/find-your-exact-tune.html 2>&1 | head -1 || echo "not pure JS (expected — it's HTML)"`
Expected: `node --check` errors because the file is HTML, not JS — that's fine. Instead verify the inline script alone is valid:

Run: `node -e "const fs=require('fs');const h=fs.readFileSync('site/find-your-exact-tune.html','utf8');const m=h.match(/<script>([\s\S]*?)<\/script>/g)||[];const big=m.map(s=>s.replace(/<\/?script>/g,'')).filter(s=>s.includes('fSubmit'))[0];new Function(big);console.log('inline script parses OK');"`
Expected: `inline script parses OK`

- [ ] **Step 6: Commit**

```bash
git add site/find-your-exact-tune.html
git commit -m "$(printf 'feat: submit leads to Netlify form with attribution + installer key\n\nCaptures utm_*/referrer, sends goals + quoted prices + installer_key,\nPOSTs form-encoded to the tune-lead Netlify form, keeps the mailto\nfallback on failure.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 8: Documentation (README)

**Files:**
- Modify: `README.md` (Deploy section, lines 18-39)

- [ ] **Step 1: Update the Deploy + Editing sections**

Find (lines 18-39):
```markdown
## Deploy (Netlify CLI)

```sh
# one-time
npm i -g netlify-cli
netlify login

# preview deploy (private URL, safe to test)
netlify deploy --dir=site

# go live on the Netlify subdomain
netlify deploy --dir=site --prod
```

Connect `tunedyota.com` in **Netlify → Site settings → Domain management**
only when ready — that cutover replaces the current live Wix site.

## Editing data
All site data lives in the `<script>` block of `site/find-your-exact-tune.html`:
`VEHICLES` (years/engines/prices), `INSTALLERS` (bios/photos/contact),
`MARKETS` (event cities + coordinates; add a `date:` field for event dates),
`LEAD_ENDPOINT` (Formspree URL).
```
Replace with:
```markdown
## Deploy (Netlify CLI)

Deploys are driven by `netlify.toml` (publish dir `site/`, functions in
`netlify/functions/`) — no `--dir` flag needed.

```sh
# one-time
npm i -g netlify-cli
netlify login

# preview deploy (private URL, safe to test — includes functions)
netlify deploy

# go live on the Netlify subdomain
netlify deploy --prod
```

Connect `tunedyota.com` in **Netlify → Site settings → Domain management**
only when ready — that cutover replaces the current live Wix site.

## Lead capture (one-time setup)
Tune-finder leads POST to the Netlify form **`tune-lead`** (stored under
**Netlify → Forms**) and trigger `netlify/functions/submission-created.js`,
which routes each lead to the assigned installer (CC info@) and sends the
customer an auto-reply via [Resend](https://resend.com).

1. **Resend:** create an account, **verify the `tunedyota.com` domain** (add the
   SPF/DKIM DNS records Resend shows) so mail can send from
   `info@tunedyota.com`. Create an API key.
2. **Netlify env var:** set `RESEND_API_KEY` in **Site settings → Environment
   variables**, then redeploy.
3. **Backstop:** in **Netlify → Forms → Form notifications**, keep an email
   notification to `info@tunedyota.com` enabled — if Resend or the function ever
   fails, you still get the raw lead and it stays in the dashboard.

Installer routing lives in `netlify/functions/lib/routing.js` (keyed by
`MARKETS[i].inst`). Unknown/empty keys fall back to Aaron / info@.

## Tests
`npm test` runs the lead-routing unit tests (`node --test`, no dependencies).

## Editing data
All site data lives in the `<script>` block of `site/find-your-exact-tune.html`:
`VEHICLES` (years/engines/prices), `INSTALLERS` (bios/photos/contact),
`MARKETS` (event cities + coordinates; add a `date:` field for event dates).
Lead delivery is handled by the Netlify form + function described above.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "$(printf 'docs: document Netlify lead capture, Resend setup, and tests\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 9: Integration verification (preview deploy)

Netlify Dev does not fully emulate Forms + `submission-created`, so integration is verified on a **preview deploy** (not `--prod`). This task ships nothing new — it confirms the wiring end-to-end before going live.

**Prerequisite:** Resend domain verified + `RESEND_API_KEY` set in Netlify (Task 8). Until then, the lead still lands in the dashboard + backstop email; only the Resend routing/auto-reply is unverified.

- [ ] **Step 1: Confirm the full unit suite is green**

Run: `npm test`
Expected: PASS — all 17 tests.

- [ ] **Step 2: Preview deploy (includes the function)**

Run: `netlify deploy`
Expected: succeeds; output lists `submission-created` under Functions and prints a "Website draft URL".

- [ ] **Step 3: Submit a test lead on the draft URL**

Open the draft URL's `/find-your-exact-tune` page. Complete the funnel choosing a **Green Bay, WI** market (routes to Noah). Use a real inbox you control as the customer email and submit. Add `?utm_source=ig&utm_campaign=verify` to the URL first to test attribution.

Verify:
- Netlify → Forms → `tune-lead` shows the submission with `installer_key=noah`, `goals`, `quote_*`, and `utm_source=ig`.
- Noah's inbox (or its test equivalent) receives the lead email, CC info@.
- The customer inbox receives the branded auto-reply naming Noah.

- [ ] **Step 4: Verify the fallback**

In the browser devtools, go offline and submit again; confirm the mail app opens (mailto fallback) and the on-page success screen shows.

- [ ] **Step 5: Go live**

Run: `netlify deploy --prod`
Expected: production deploy succeeds with the function listed.

- [ ] **Step 6: Final confirmation (no code commit needed)**

If any step revealed a fix, make it, re-run `npm test`, and commit with a `fix:` message + the Co-Authored-By trailer before re-deploying.

---

## Notes for the implementer

- **No npm install needed** — everything uses Node built-ins (`fetch`, `node:test`, `node:assert`).
- **Keep `routing.js` in sync** with `INSTALLERS` in `site/find-your-exact-tune.html` if installer emails/phones change. (A future spec could share one source; out of scope here.)
- **Resend "from" requires domain verification.** Before that completes, installer/customer emails will fail to send — but leads are never lost (dashboard + backstop notification).
- The Meta Pixel `Lead` event still fires in `showSuccess()` — unchanged.
