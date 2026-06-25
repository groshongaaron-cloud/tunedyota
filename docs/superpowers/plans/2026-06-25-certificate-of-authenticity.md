# Certificate of Authenticity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a booking is marked `Completed`, a daily scheduled function emails the installer a branded, editable `certificate.html` (pre-filled with booking data) and marks the row `Certificate Sent`.

**Architecture:** Pure `certificate.js` builds the HTML; `certificate-dispatch.js` (scheduled) queries Completed+unsent bookings, emails the installer (CC owner) with the cert attached, marks sent on success / Slack-alerts and retries-next-day on failure. Every side effect is try/caught so one bad row never aborts the batch.

**Tech Stack:** Node CommonJS, Netlify scheduled functions, Airtable REST (filterByFormula + PATCH), Resend, Slack webhook, `node:test`. No new dependency.

---

## File Structure

- `netlify/functions/lib/alert.js` *(re-add, identical)* — `notifyOwner`.
- `netlify/functions/lib/airtable.js` — add `updateRecord` (identical to email branch).
- `netlify/functions/lib/certificate.js` *(new, pure)* — `buildCertificate()`.
- `netlify/functions/certificate-dispatch.js` *(new, scheduled)* — query → email → mark.
- `netlify.toml` — daily schedule.
- Tests: `tests/alert.test.js`, `tests/airtable.test.js`, `tests/certificate.test.js` *(new)*, `tests/certificate-dispatch.test.js` *(new)*.

**Branching:** `feat/certificate-of-authenticity` off `master`. Commit spec + plan first. (Shared `alert.js`/`updateRecord` re-added identically → clean add/add merge with the other held branches.)

---

### Task 0: Branch + docs

- [ ] **Step 1: Branch off master and commit the design docs**

```bash
git checkout master
git checkout -b feat/certificate-of-authenticity
git add docs/superpowers/specs/2026-06-25-certificate-of-authenticity-design.md docs/superpowers/plans/2026-06-25-certificate-of-authenticity.md
git commit -m "docs: spec + plan for Certificate of Authenticity"
```

---

### Task 1: Shared helpers (alert + updateRecord)

**Files:** Create `netlify/functions/lib/alert.js` + `tests/alert.test.js`; modify `netlify/functions/lib/airtable.js`; append `tests/airtable.test.js`.

- [ ] **Step 1: Create `netlify/functions/lib/alert.js`**

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

- [ ] **Step 2: Create `tests/alert.test.js`**

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { notifyOwner } = require("../netlify/functions/lib/alert.js");

test("posts the text to the webhook", async () => {
  let seen;
  const fetchImpl = async (url, opts) => { seen = { url, opts }; return { ok: true }; };
  const r = await notifyOwner({ fetchImpl, webhookUrl: "https://hooks.slack.test/x", text: "hello" });
  assert.equal(r.ok, true);
  assert.equal(JSON.parse(seen.opts.body).text, "hello");
});
test("no-ops when webhookUrl falsy; never throws on reject", async () => {
  const skip = await notifyOwner({ fetchImpl: async () => ({ ok: true }), webhookUrl: "", text: "x", log: { warn() {} } });
  assert.equal(skip.skipped, true);
  const errd = await notifyOwner({ fetchImpl: async () => { throw new Error("net"); }, webhookUrl: "https://x", text: "x", log: { error() {} } });
  assert.equal(errd.ok, false);
});
```

- [ ] **Step 3: Add `updateRecord` to `airtable.js`** — insert before `module.exports` and update exports:

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

- [ ] **Step 4: Append `updateRecord` test to `tests/airtable.test.js`**

```js
test("updateRecord PATCHes by id with typecast", async () => {
  let seen;
  const fetchImpl = async (url, opts) => { seen = { url, opts }; return { ok: true, json: async () => ({ id: "r1" }) }; };
  const { updateRecord } = require("../netlify/functions/lib/airtable.js");
  const r = await updateRecord({ fetchImpl, token: "t", baseId: "b", table: "Bookings", id: "r1", fields: { "Certificate Sent": true } });
  assert.equal(r.id, "r1");
  assert.equal(seen.opts.method, "PATCH");
  assert.ok(seen.url.endsWith("/b/Bookings/r1"));
  assert.equal(JSON.parse(seen.opts.body).fields["Certificate Sent"], true);
});
```

- [ ] **Step 5: Run + commit**

Run: `node --test tests/alert.test.js tests/airtable.test.js`
Expected: PASS.

```bash
git add netlify/functions/lib/alert.js netlify/functions/lib/airtable.js tests/alert.test.js tests/airtable.test.js
git commit -m "feat(lib): shared Slack alert + Airtable updateRecord (for cert dispatch)"
```

---

### Task 2: Certificate HTML builder

**Files:** Create `netlify/functions/lib/certificate.js`; Test `tests/certificate.test.js`.

- [ ] **Step 1: Write the failing test** (`tests/certificate.test.js`)

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildCertificate } = require("../netlify/functions/lib/certificate.js");

test("pre-fills known fields, blanks the installer fields, names customer in subject", () => {
  const { subject, html } = buildCertificate({ name: "Jane Driver", retailer: "Cody Star", vehicle: "2025+ Toyota Tacoma", calibrationDate: "2026-06-28" });
  assert.match(subject, /Certificate of Authenticity/);
  assert.match(subject, /Jane Driver/);
  assert.ok(html.includes("Jane Driver"));        // customer pre-filled
  assert.ok(html.includes("Cody Star"));          // OTT retailer pre-filled
  assert.ok(html.includes("2026-06-28"));         // date applied pre-filled
  assert.ok(html.includes("2025+ Toyota Tacoma")); // booked-as reference
  for (const label of ["VIN", "Vehicle Year", "Vehicle Type", "Engine Size", "Mileage"]) {
    assert.ok(html.includes(label), `missing field label: ${label}`);
  }
  assert.match(html, /contenteditable/);          // editable blanks
});
test("escapes HTML and tolerates a blank calibration date", () => {
  const { html } = buildCertificate({ name: "A<b>", retailer: "R", vehicle: "V&V", calibrationDate: "" });
  assert.ok(html.includes("A&lt;b&gt;"));
  assert.ok(html.includes("V&amp;V"));
  assert.ok(!/undefined/.test(html));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/certificate.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (`netlify/functions/lib/certificate.js`)

```js
// Pure builder: a branded, editable Certificate of Authenticity (HTML). Known
// fields pre-filled; installer fields are contenteditable blanks. No I/O.
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fieldRow(label, value, editable) {
  const cell = editable
    ? `<span contenteditable="true" style="display:inline-block;min-width:240px;border-bottom:1px solid #7c8472;padding:2px 6px">${esc(value)}</span>`
    : `<strong style="display:inline-block;min-width:240px;padding:2px 6px">${esc(value)}</strong>`;
  return `<tr><td style="padding:8px 16px 8px 0;color:#7c8472;font-weight:700;text-transform:uppercase;letter-spacing:.04em;font-size:12px;vertical-align:top">${esc(label)}</td><td style="padding:8px 0">${cell}</td></tr>`;
}

function buildCertificate({ name, retailer, vehicle, calibrationDate }) {
  const subject = `Certificate of Authenticity — ${name || "Customer"}${vehicle ? ` · ${vehicle}` : ""}`;
  const rows = [
    fieldRow("Date Calibration Applied", calibrationDate || "", true),
    fieldRow("OTT Retailer", retailer || "", false),
    fieldRow("Customer Name", name || "", false),
    fieldRow("VIN", "", true),
    fieldRow("Vehicle Year", "", true),
    fieldRow("Vehicle Type", "", true),
    fieldRow("Engine Size", "", true),
    fieldRow("Mileage", "", true),
  ].join("");
  const html =
`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Certificate of Authenticity — Tuned Yota</title>
<style>
  @media print { .noprint { display:none !important } [contenteditable]{ border-bottom:1px solid #7c8472 } }
  body{ font-family:Georgia,'Times New Roman',serif; color:#3A2E26; margin:0; background:#EDECEB }
  .cert{ max-width:760px; margin:24px auto; background:#fff; border:2px solid #5B4B42; padding:40px 48px }
  h1{ font-size:26px; color:#3A2E26; letter-spacing:.02em; margin:0 0 2px }
  .eyebrow{ color:#7c8472; font-weight:700; text-transform:uppercase; letter-spacing:.2em; font-size:12px }
  .note{ color:#7c8472; font-size:13px; margin:6px 0 22px }
  table{ border-collapse:collapse; width:100% }
  .sig{ margin-top:28px; color:#5B4B42; font-weight:700; letter-spacing:.04em }
</style></head>
<body>
  <p class="noprint" style="max-width:760px;margin:18px auto 0;color:#5B4B42;font-size:13px">Open this file in a browser, click each underlined field to type VIN / Year / Type / Engine / Mileage (and the date if blank), then <strong>Print → Save as PDF</strong> and send it to your customer.</p>
  <div class="cert">
    <div class="eyebrow">Tuned Yota · Undeniable Performance</div>
    <h1>Certificate of Authenticity</h1>
    <p class="note">This certifies an authentic OTT calibration${vehicle ? ` · Booked as: ${esc(vehicle)}` : ""}.</p>
    <table>${rows}</table>
    <p class="sig">— Tuned Yota · Authorized OTT Installer</p>
  </div>
</body></html>`;
  return { subject, html };
}
module.exports = { buildCertificate };
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/certificate.test.js`
Expected: PASS (2).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/certificate.js tests/certificate.test.js
git commit -m "feat(cert): pure editable Certificate of Authenticity HTML builder"
```

---

### Task 3: Dispatch function

**Files:** Create `netlify/functions/certificate-dispatch.js`; Modify `netlify.toml`; Test `tests/certificate-dispatch.test.js`.

- [ ] **Step 1: Write the failing test** (`tests/certificate-dispatch.test.js`)

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { dispatchCertificates } = require("../netlify/functions/certificate-dispatch.js");

function deps(overrides = {}) {
  const sends = [], updates = [], notifies = [];
  const rows = [{ id: "b1", fields: { Name: "Jane", Vehicle: "Tacoma", Installer: "cody", "Calibration Date": "2026-06-28", Status: "Completed" } }];
  return {
    env: { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", RESEND_API_KEY: "re", SLACK_WEBHOOK_URL: "https://hooks.slack.test/x" },
    list: async () => rows,
    send: async (a) => { sends.push(a); return { id: "e" }; },
    update: async (a) => { updates.push(a); return { id: a.id }; },
    notify: async (a) => { notifies.push(a); return { ok: true }; },
    log: { warn() {}, error() {} },
    _sends: sends, _updates: updates, _notifies: notifies,
    ...overrides,
  };
}

test("emails installer (CC owner) with cert attachment and marks sent", async () => {
  const d = deps();
  await dispatchCertificates(d);
  assert.equal(d._sends.length, 1);
  assert.equal(d._sends[0].to, "cody@tunedyota.com");
  assert.equal(d._sends[0].cc, "info@tunedyota.com");
  assert.equal(d._sends[0].attachments[0].filename, "certificate.html");
  assert.equal(d._updates.length, 1);
  assert.equal(d._updates[0].fields["Certificate Sent"], true);
  assert.equal(d._notifies.length, 0);
});
test("email failure -> Slack alert AND row left unmarked", async () => {
  const d = deps({ send: async () => { throw new Error("Resend 403"); } });
  await dispatchCertificates(d);
  assert.equal(d._updates.length, 0);          // not marked -> retried next run
  assert.equal(d._notifies.length, 1);
  assert.match(d._notifies[0].text, /Certificate email FAILED/i);
});
test("installer IS owner (aaron) -> no CC", async () => {
  const d = deps({ list: async () => [{ id: "b2", fields: { Name: "Sam", Vehicle: "4Runner", Installer: "aaron", Status: "Completed" } }] });
  await dispatchCertificates(d);
  assert.equal(d._sends[0].to, "info@tunedyota.com");
  assert.equal(d._sends[0].cc, undefined);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/certificate-dispatch.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (`netlify/functions/certificate-dispatch.js`)

```js
const { cfg, listRecords, updateRecord } = require("./lib/airtable.js");
const { sendEmail } = require("./lib/resend.js");
const { notifyOwner } = require("./lib/alert.js");
const { keyToInstaller } = require("./lib/routing.js");
const { buildCertificate } = require("./lib/certificate.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";
const FORMULA = 'AND({Status}="Completed", NOT({Certificate Sent}))';

async function dispatchCertificates(deps) {
  const { env = process.env, fetchImpl = fetch,
          list = (a) => listRecords({ fetchImpl, ...a }),
          update = (a) => updateRecord({ fetchImpl, ...a }),
          send = sendEmail, notify = notifyOwner, log = console } = deps;
  const c = cfg(env);
  let rows = [];
  try {
    rows = await list({ token: c.token, baseId: c.baseId, table: c.bookings, filterByFormula: FORMULA });
  } catch (e) { if (log.error) log.error("cert list", e.message); return { ok: false, error: e.message }; }

  let sent = 0;
  for (const row of rows) {
    const f = row.fields || {};
    const inst = keyToInstaller(f.Installer);
    const { subject, html } = buildCertificate({ name: f.Name, retailer: inst.name, vehicle: f.Vehicle, calibrationDate: f["Calibration Date"] });
    try {
      await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM,
        to: inst.email, cc: inst.email === OWNER ? undefined : OWNER, replyTo: OWNER,
        subject,
        text: `Attached is the Certificate of Authenticity for ${f.Name || "your customer"}. Open certificate.html in a browser, fill in VIN, Vehicle Year, Vehicle Type, Engine Size, and Mileage (and the date if blank), then Print → Save as PDF and send it to the customer.`,
        attachments: [{ filename: "certificate.html", content: Buffer.from(html).toString("base64") }] });
      await update({ token: c.token, baseId: c.baseId, table: c.bookings, id: row.id, fields: { "Certificate Sent": true } });
      sent++;
    } catch (e) {
      if (log.error) log.error("cert send", e.message);
      try { await notify({ fetchImpl, webhookUrl: env.SLACK_WEBHOOK_URL, text: `⚠️ Certificate email FAILED — ${f.Name || "?"} · ${inst.name} · reason: ${e.message}`, log }); }
      catch (e2) { if (log.error) log.error("cert notify", e2.message); }
    }
  }
  return { ok: true, sent, found: rows.length };
}

async function handler() { const r = await dispatchCertificates({}); return { statusCode: 200, body: JSON.stringify(r) }; }
module.exports = { handler, dispatchCertificates };
```

- [ ] **Step 4: Schedule it** — append to `netlify.toml`:

```toml
# Daily Certificate of Authenticity dispatch (netlify/functions/certificate-dispatch.js).
[functions."certificate-dispatch"]
  schedule = "0 14 * * *"
```

- [ ] **Step 5: Run to verify pass**

Run: `node --test tests/certificate-dispatch.test.js`
Expected: PASS (3).

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/certificate-dispatch.js netlify.toml tests/certificate-dispatch.test.js
git commit -m "feat(cert): daily dispatch — email installer the cert, mark sent, alert on failure"
```

---

### Task 4: Full verification + ship checkpoint

- [ ] **Step 1: Full suite** — Run: `npm test` — Expected: all pass.
- [ ] **Step 2: Eyeball the certificate** — render the HTML to a file and confirm it looks right:

```bash
node -e "const{buildCertificate}=require('./netlify/functions/lib/certificate.js');const{html}=buildCertificate({name:'Jane Driver',retailer:'Cody Star',vehicle:'2025+ Toyota Tacoma',calibrationDate:'2026-06-28'});require('fs').writeFileSync('/tmp/cert-preview.html',html);console.log('wrote /tmp/cert-preview.html — open in a browser to verify');"
```
Expected: a branded certificate with pre-filled Customer/Retailer/Date and editable underlined blanks for VIN/Year/Type/Engine/Mileage.

- [ ] **Step 3: STOP — ship checkpoint.** Do NOT push. Confirm with owner: `Certificate Sent` checkbox column added to `Bookings`; `SLACK_WEBHOOK_URL` set. Then merge `feat/certificate-of-authenticity` → `master` + push (per `ship` skill). Dispatch runs daily; emails activate once the Resend domain verifies (until then, rows stay unmarked and retry).

---

## Self-Review

**Spec coverage:** daily scheduled dispatch on Completed+unsent (Task 3 + netlify.toml) ✓; editable HTML cert with pre-filled known fields + contenteditable blanks (Task 2) ✓; installer recipient + CC owner, owner-is-installer no-CC (Task 3 tests) ✓; attached `certificate.html` (Task 3) ✓; mark `Certificate Sent` on success, leave unmarked + Slack on failure → retry (Task 3) ✓; never-abort batch via per-row try/catch (Task 3) ✓; shared `alert`/`updateRecord` re-added (Task 1) ✓; `Certificate Sent` column prerequisite + DNS-retry behavior (Task 4 checkpoint) ✓; no new dependency, no data capture (by construction) ✓.

**Placeholder scan:** none — full code in every step.

**Type/name consistency:** `buildCertificate({name,retailer,vehicle,calibrationDate})` → `{subject,html}` used identically in Task 2 + Task 3. `dispatchCertificates(deps)` with `list/send/update/notify` injection matches tests. `notifyOwner`/`updateRecord` signatures match Task 1. Airtable field name `Certificate Sent` consistent across formula, update, tests. Attachment shape `{filename,content}` matches `resend.js`.
