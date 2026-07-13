# AMSOIL Attach Follow-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three days after a tune, automatically email the customer their exact AMSOIL fluids + a Preferred-Customer pitch, via a daily scheduled sweep over completed bookings.

**Architecture:** A pure email builder (`lib/amsoil-email.js`) + a scheduled sweep (`amsoil-followup.js`) that mirrors `certificate-dispatch.js` — injectable deps, idempotent via an `AMSOIL Email Sent` stamp, Slack alert on failure. The "opportunity" is the completed booking itself (no new table); the fluids are derived with `resolveFluids`.

**Tech Stack:** Node.js (CommonJS), `node --test` + `node:assert/strict`, Netlify scheduled functions (`netlify.toml` cron), Airtable REST (`lib/airtable.js`), Resend (`lib/resend.js`), Slack relay (`lib/alert.js`).

**Spec:** `docs/superpowers/specs/2026-07-13-amsoil-attach-followup-design.md`

**Conventions:** one test file `node --test tests/<f>.test.js`; full suite `npm test`. Commit per task. Confirm `git branch --show-current` before committing (shared repo). Known pre-existing failure only in a fresh worktree: `tests/magnuson-schema-image.test.js` (passes in the main checkout after `build:seo`) — ignore it. Reused shapes: `resolveFluids(vehicle, modelYear)` → `{ make, model, engine, systems:[{system,product,stockNo,capacity,unit,factoryInterval,tunedInterval}], garageUrl }`; `sendEmail({fetchImpl,apiKey,from,to,cc,replyTo,subject,html,text,attachments})`; `notifyOwner({fetchImpl,webhookUrl,text,log})`.

---

## File Structure

**Create:**
- `netlify/functions/lib/amsoil-email.js` — pure follow-up email builder.
- `netlify/functions/amsoil-followup.js` — scheduled sweep.
- Tests: `tests/amsoil-email.test.js`, `tests/amsoil-followup.test.js`.

**Modify:**
- `netlify.toml` — add the schedule entry.

---

## Task 1: `amsoil-email.js` — tailored follow-up email builder

**Files:**
- Create: `netlify/functions/lib/amsoil-email.js`
- Test: `tests/amsoil-email.test.js`

- [ ] **Step 1: Write the failing test** — `tests/amsoil-email.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildAmsoilEmail } = require("../netlify/functions/lib/amsoil-email.js");
const { resolveFluids } = require("../netlify/functions/lib/amsoil-fluids.js");

test("builds a tailored AMSOIL follow-up email with fluids + opt-out", () => {
  const fluids = resolveFluids("2024 Toyota Tacoma 2.4L-T I4", "2024");
  const { subject, html, text } = buildAmsoilEmail({
    name: "Marcus Bell", vehicle: "2024 Toyota Tacoma 2.4L-T I4", modelYear: "2024", fluids });
  assert.match(subject, /AMSOIL|running strong/i);
  assert.ok(html.includes("Signature Series 0W-20"), "product listed");
  assert.ok(html.includes("ASMQT"), "stock number listed");
  assert.ok(html.includes(fluids.garageUrl), "CTA links to the pre-filtered garage");
  assert.match(html, /amsoil-logo\.png/);
  assert.match(html, /UNSUBSCRIBE/);
  assert.match(html, /Marcus/);
  assert.match(text, /UNSUBSCRIBE/);
});

test("degrades safely with no fluids", () => {
  const { html } = buildAmsoilEmail({ name: "A", vehicle: "2020 Ford F-150", fluids: null });
  assert.ok(!/<table/.test(html), "no fluids table when unresolved");
  assert.match(html, /amsoil-garage/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/amsoil-email.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation** — `netlify/functions/lib/amsoil-email.js`:

```js
// netlify/functions/lib/amsoil-email.js
// Pure builder for the 3-day post-tune AMSOIL follow-up email. Email-client-safe
// HTML: inline styles, absolute image URL, no <style>/SVG. Consumes a resolveFluids()
// result (or null). No I/O.
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const LOGO = "https://tunedyota.com/images/amsoil/amsoil-logo.png";
const GARAGE = "https://tunedyota.com/amsoil-garage";

function firstName(name) { return name ? esc(String(name).trim().split(/\s+/)[0]) : "there"; }

function buildAmsoilEmail({ name, vehicle, modelYear, fluids } = {}) {
  const hasFluids = !!(fluids && fluids.systems && fluids.systems.length);
  const veh = esc(fluids && fluids.model
    ? (fluids.make + " " + fluids.model + (fluids.engine ? " " + fluids.engine : ""))
    : (vehicle || "your vehicle"));
  const url = (fluids && fluids.garageUrl) || GARAGE;
  const subject = `Keep your ${fluids && fluids.model ? esc(fluids.model) : "tuned Toyota"} running strong — your AMSOIL fluids`;
  const th = 'padding:6px 10px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8a8f94;';
  const td = 'padding:8px 10px;border-bottom:1px solid #e7e3da;';
  const rows = hasFluids ? fluids.systems.map(function (s) {
    return `<tr>
      <td style="${td}font-weight:700;color:#191c1e;">${esc(s.system)}</td>
      <td style="${td}color:#5b6066;">${esc(s.product)}${s.stockNo ? ` <span style="color:#ed1c24;font-weight:700;">(${esc(s.stockNo)})</span>` : ""}</td>
      <td style="${td}color:#191c1e;white-space:nowrap;">${esc(s.capacity)} ${esc(s.unit)}</td>
      <td style="${td}color:#b3141b;font-weight:700;white-space:nowrap;">${esc(s.tunedInterval)}</td>
    </tr>`;
  }).join("") : "";
  const table = hasFluids ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
    <tr><th align="left" style="${th}">System</th><th align="left" style="${th}">AMSOIL product</th><th align="left" style="${th}">Capacity</th><th align="left" style="${th}">Interval</th></tr>
    ${rows}</table>` : "";
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f2ed;">
  <div style="max-width:600px;margin:0 auto;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#191c1e;">
    <div style="padding:24px 28px;border-bottom:3px solid #ed1c24;text-align:center;">
      <img src="${LOGO}" alt="AMSOIL" width="200" style="display:inline-block;max-width:200px;height:auto;">
    </div>
    <div style="padding:24px 28px;">
      <p style="font-size:16px;margin:0 0 12px;">Hi ${firstName(name)},</p>
      <p style="font-size:15px;line-height:1.5;color:#5b6066;margin:0 0 8px;">Your ${veh} is dialed in. A tuned truck asks more of its fluids — here are the exact <strong>AMSOIL</strong> synthetic fluids, capacities, and severe-service intervals for your vehicle, from Tuned&nbsp;Yota, your Authorized AMSOIL Dealer.</p>
      ${table}
      <div style="text-align:center;margin:24px 0 8px;">
        <a href="${esc(url)}" style="display:inline-block;background:#191c1e;color:#fff;text-decoration:none;font-weight:800;font-size:15px;padding:14px 26px;border-radius:8px;">Shop your fluids &amp; save up to 25% &#9658;</a>
      </div>
      <p style="font-size:13px;color:#8a8f94;text-align:center;margin:8px 0 0;">Enroll free as a Preferred Customer under Tuned Yota and save up to 25% on every future order.</p>
    </div>
    <div style="padding:16px 28px;border-top:1px solid #e7e3da;font-size:11px;color:#8a8f94;line-height:1.5;">
      You&rsquo;re receiving this because Tuned Yota tuned your ${veh}. Reply <strong>UNSUBSCRIBE</strong> to stop AMSOIL emails.<br>
      Tuned Yota &middot; Authorized AMSOIL Dealer &middot; tunedyota.com/amsoil-garage
    </div>
  </div></body></html>`;
  const text = `Hi ${name ? String(name).trim().split(/\s+/)[0] : "there"},\n\n` +
    `Your ${fluids && fluids.model ? fluids.make + " " + fluids.model : "tuned vehicle"} is dialed in. ` +
    `Here are the exact AMSOIL synthetic fluids for your vehicle — shop and save up to 25% as a Preferred Customer: ${url}\n\n` +
    `Reply UNSUBSCRIBE to stop AMSOIL emails.\nTuned Yota — Authorized AMSOIL Dealer`;
  return { subject, html, text };
}
module.exports = { buildAmsoilEmail };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/amsoil-email.test.js`
Expected: PASS (2 tests). Then `npm test` (no new failures).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/amsoil-email.js tests/amsoil-email.test.js
git commit -m "feat(amsoil): tailored 3-day follow-up email builder"
```

---

## Task 2: `amsoil-followup.js` — scheduled sweep

**Files:**
- Create: `netlify/functions/amsoil-followup.js`
- Test: `tests/amsoil-followup.test.js`

- [ ] **Step 1: Write the failing test** — `tests/amsoil-followup.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runAmsoilFollowup } = require("../netlify/functions/amsoil-followup.js");

const NOW = new Date("2026-07-20T15:00:00Z");   // fixed clock; dueBy = NOW-3 = 2026-07-17
let n = 0;
function bk(fields) { return { id: "rec" + (++n), fields }; }
function harness(rows, over = {}) {
  const sent = [], updated = [], notified = [];
  const d = {
    now: NOW, fetchImpl: async () => ({ ok: true, json: async () => ({}) }),
    env: { RESEND_API_KEY: "x", AMSOIL_FOLLOWUP_START: "2026-07-14", SLACK_WEBHOOK_URL: "w" },
    list: async () => rows,
    update: async (a) => { updated.push(a); return {}; },
    send: async (a) => { sent.push(a); },
    notify: async (a) => { notified.push(a); },
    log: { error() {} },
    ...over,
  };
  return { sent, updated, notified, d };
}
const TACOMA = { Status: "Completed", Name: "Cust One", Email: "c@example.com",
  Vehicle: "2024 Toyota Tacoma 2.4L-T I4", "Model Year": "2024" };

test("sends to an in-window completed booking and marks it", async () => {
  const { sent, updated, d } = harness([ bk({ ...TACOMA, "Calibration Date": "2026-07-16" }) ]);
  const r = await runAmsoilFollowup(d);
  assert.equal(r.sent, 1);
  assert.equal(sent[0].to, "c@example.com");
  assert.match(sent[0].html, /Signature Series 0W-20/);
  assert.equal(updated[0].fields["AMSOIL Email Sent"], "2026-07-20");
});

test("skips tunes newer than 3 days", async () => {
  const { sent, d } = harness([ bk({ ...TACOMA, "Calibration Date": "2026-07-19" }) ]);
  const r = await runAmsoilFollowup(d);
  assert.equal(r.sent, 0);
  assert.equal(sent.length, 0);
});

test("skips tunes before the backfill floor", async () => {
  const { sent, d } = harness([ bk({ ...TACOMA, "Calibration Date": "2026-07-10" }) ]);
  const r = await runAmsoilFollowup(d);
  assert.equal(r.sent, 0);
});

test("skips a non-catalog vehicle, leaving it unmarked", async () => {
  const { updated, d } = harness([ bk({ ...TACOMA, Vehicle: "2020 Ford F-150", "Calibration Date": "2026-07-16" }) ]);
  const r = await runAmsoilFollowup(d);
  assert.equal(r.sent, 0);
  assert.equal(updated.length, 0);
});

test("a send failure alerts Slack and leaves the row unmarked for retry", async () => {
  const { updated, notified, d } = harness(
    [ bk({ ...TACOMA, "Calibration Date": "2026-07-16" }) ],
    { send: async () => { throw new Error("boom"); } });
  const r = await runAmsoilFollowup(d);
  assert.equal(r.sent, 0);
  assert.equal(updated.length, 0);
  assert.equal(notified.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/amsoil-followup.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation** — `netlify/functions/amsoil-followup.js`:

```js
// netlify/functions/amsoil-followup.js
// Scheduled daily sweep: ~3 days after a tune, email the customer their tailored
// AMSOIL fluids + Preferred-Customer pitch. The "opportunity" is the completed
// booking itself. Mirrors certificate-dispatch.js: injectable deps, idempotent via
// an "AMSOIL Email Sent" stamp, Slack alert on failure. Backfill floor via
// AMSOIL_FOLLOWUP_START; opt-out + no-email + already-sent excluded by the query.
const { cfg, listRecords, updateRecord } = require("./lib/airtable.js");
const { sendEmail } = require("./lib/resend.js");
const { notifyOwner } = require("./lib/alert.js");
const { resolveFluids } = require("./lib/amsoil-fluids.js");
const { buildAmsoilEmail } = require("./lib/amsoil-email.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";
const FORMULA = 'AND({Status}="Completed", NOT({AMSOIL Email Sent}), NOT({AMSOIL Opt-Out}), {Email}!="")';
const dateOnly = (s) => String(s == null ? "" : s).slice(0, 10);
const daysAgoISO = (now, days) => new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);

async function runAmsoilFollowup(deps) {
  const { env = process.env, fetchImpl = fetch, now = new Date(),
          list = (a) => listRecords({ fetchImpl, ...a }),
          update = (a) => updateRecord({ fetchImpl, ...a }),
          send = sendEmail, notify = notifyOwner, log = console } = deps;
  const c = cfg(env);
  const floor = dateOnly(env.AMSOIL_FOLLOWUP_START || "");   // backfill guard; skip pre-launch tunes
  const dueBy = daysAgoISO(now, 3);                          // only tunes >= 3 days old
  const today = now.toISOString().slice(0, 10);

  let rows = [];
  try { rows = await list({ token: c.token, baseId: c.baseId, table: c.bookings, filterByFormula: FORMULA }); }
  catch (e) { if (log.error) log.error("amsoil list", e.message); return { ok: false, error: e.message }; }

  let sent = 0, skipped = 0;
  for (const row of rows) {
    const f = row.fields || {};
    const calDate = dateOnly(f["Calibration Date"] || f["Event Date"]);
    if (!calDate || (floor && calDate < floor) || calDate > dueBy) { skipped++; continue; }
    const fluids = resolveFluids(f.Vehicle, f["Model Year"]);
    if (!fluids) { skipped++; continue; }   // non-catalog vehicle; leave unmarked (self-heals if catalog grows)
    try {
      const { subject, html, text } = buildAmsoilEmail({ name: f.Name, vehicle: f.Vehicle, modelYear: f["Model Year"], fluids });
      await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to: f.Email, replyTo: OWNER, subject, html, text });
      await update({ token: c.token, baseId: c.baseId, table: c.bookings, id: row.id, fields: { "AMSOIL Email Sent": today } });
      sent++;
    } catch (e) {
      if (log.error) log.error("amsoil send", e.message);
      try { await notify({ fetchImpl, webhookUrl: env.SLACK_WEBHOOK_URL, text: `⚠️ AMSOIL follow-up email FAILED — ${f.Name || "?"} · ${e.message}`, log }); }
      catch (e2) { if (log.error) log.error("amsoil notify", e2.message); }
    }
  }
  return { ok: true, sent, skipped, found: rows.length };
}

async function handler() { const r = await runAmsoilFollowup({}); return { statusCode: 200, body: JSON.stringify(r) }; }
module.exports = { handler, runAmsoilFollowup };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/amsoil-followup.test.js`
Expected: PASS (5 tests). Then `npm test` (no new failures).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/amsoil-followup.js tests/amsoil-followup.test.js
git commit -m "feat(amsoil): scheduled 3-day follow-up sweep (idempotent, floor, opt-out)"
```

---

## Task 3: Schedule the function

**Files:**
- Modify: `netlify.toml`

- [ ] **Step 1: Add the schedule entry**

Append to `netlify.toml` (match the existing `[functions."name"]` block style; place near `certificate-dispatch`):

```toml
# Daily AMSOIL follow-up: ~3 days post-tune (netlify/functions/amsoil-followup.js).
[functions."amsoil-followup"]
  schedule = "0 15 * * *"
```

(15:00 UTC ≈ 10am Central, one hour after `certificate-dispatch` at `0 14 * * *`.)

- [ ] **Step 2: Verify the file still parses**

Run: `node -e "const fs=require('fs'); const t=fs.readFileSync('netlify.toml','utf8'); if(!/\[functions.\"amsoil-followup\"\]/.test(t)) throw new Error('entry missing'); if((t.match(/schedule =/g)||[]).length < 8) throw new Error('lost entries'); console.log('ok, schedule entries:', (t.match(/schedule =/g)||[]).length);"`
Expected: `ok, schedule entries: 8` (was 7 + the new one).

- [ ] **Step 3: Commit**

```bash
git add netlify.toml
git commit -m "chore(netlify): schedule amsoil-followup daily at ~10am Central"
```

---

## Task 4: Full suite + ship

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: all pass (existing + the 7 new tests).

- [ ] **Step 2: Owner setup (must precede enabling)**

Confirm with the operator (do NOT block the code merge on it, but the function must not run before these exist):
- Airtable **Bookings** columns: `AMSOIL Email Sent` (Date), `AMSOIL Opt-Out` (Checkbox).
- Netlify env `AMSOIL_FOLLOWUP_START` = the go-live date (ISO, e.g. `2026-07-14`).

- [ ] **Step 3: Ship**

Use the `ship` skill: no SEO inputs changed (functions/toml only) so `build:seo` is not required, but run `npm test`, confirm branch is `master` (shared-folder rule), push, and confirm the Netlify deploy is `ready`. The scheduled function registers on deploy.

- [ ] **Step 4: Post-ship verification**

- Confirm the function appears in Netlify's scheduled functions.
- Optionally validate end-to-end with the `testing-airtable-backed-emails` pattern: inject a transient Completed booking dated 4+ days ago (on/after the floor) with a test email, run the function once (`curl` the function URL or trigger from Netlify), confirm the email renders + `AMSOIL Email Sent` is stamped, then delete the test row.

---

## Owner inputs (tracked)
1. 2 Airtable Bookings columns (`AMSOIL Email Sent` Date, `AMSOIL Opt-Out` Checkbox) — before enabling.
2. `AMSOIL_FOLLOWUP_START` env (go-live ISO date) — the backfill floor.
3. `RESEND_API_KEY` + `SLACK_WEBHOOK_URL` already configured (reused).
