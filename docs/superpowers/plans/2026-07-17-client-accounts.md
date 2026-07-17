# Client Accounts v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Passwordless (magic-link) client login with a 1-year sliding session, a client portal at `/account` showing every certificate tied to the client's email, and an account-backed My Garage that replaces the device-local one.

**Architecture:** A pure token lib (`lib/client-auth.js`, HMAC via Node `crypto`) mirrors `installer-auth.js`; three Netlify functions own I/O (`client-auth` request/exchange, `client-certs` list/render, `client-garage` get/put). Certificates are never duplicated — they re-render deterministically from Bookings via a render core extracted from `installer-certificate.js` into `lib/cert-render.js`. Client records live in a new Airtable **Clients** table; the garage page treats localStorage as the signed-in cache so its existing sync code keeps working.

**Tech Stack:** Node.js (CommonJS), `node --test` + `node:assert/strict`, Netlify Functions, Airtable REST (`lib/airtable.js`), Resend (`lib/resend.js`). **No new npm dependencies.**

**Spec:** `docs/superpowers/specs/2026-07-17-client-accounts-design.md`

**Conventions:**
- Run one test file: `node --test tests/<file>.test.js`. Run all: `npm test`.
- Tests: `const { test } = require("node:test"); const assert = require("node:assert/strict");`.
- Builders/libs are pure; functions inject deps (`send`, `list`, `create`, `update`, `get`, `now`) for testability.
- Commit after each task. **Confirm `git branch --show-current` is `master` before committing** (shared-folder rule); if not, land via a temp master worktree.

---

## File Structure

**Create:**
- `netlify/functions/lib/client-auth.js` — pure HMAC token sign/verify + `resolveClient` header auth.
- `netlify/functions/lib/cert-render.js` — shared "booking record → certificate HTML" core (moved out of `installer-certificate.js`).
- `netlify/functions/client-auth.js` — POST `request` (email magic link) / `exchange` (link token → session + profile upsert).
- `netlify/functions/client-certs.js` — GET list (email-scoped) / `?recordId=` cert HTML render.
- `netlify/functions/client-garage.js` — GET/PUT the account vehicle list (with server-side merge).
- `site/account.html` — the client portal page (noindex).
- Tests: `tests/client-auth.test.js`, `tests/client-auth-fn.test.js`, `tests/client-certs.test.js`, `tests/client-garage.test.js`.

**Modify:**
- `netlify/functions/lib/airtable.js` — `cfg()` gains `clients` table.
- `netlify/functions/installer-certificate.js` — delegate rendering to `lib/cert-render.js`.
- `netlify/functions/installer-closeout.js`, `netlify/functions/certificate-dispatch.js` — cert email gains a 7-day account sign-in link.
- `netlify/functions/lib/amsoil-email.js` + `netlify/functions/amsoil-followup.js` — follow-up email gains the account link.
- `site/amsoil-garage.html` — My Garage syncs to the account when signed in.
- `site/index.html` — footer "My Account" link.
- Tests: `tests/installer-closeout.test.js`, `tests/certificate-dispatch.test.js`, `tests/amsoil-email.test.js` (or the follow-up's test file if that's where builder tests live — check first).

---

## Task 1: `lib/client-auth.js` — pure token lib

**Files:**
- Create: `netlify/functions/lib/client-auth.js`
- Test: `tests/client-auth.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/client-auth.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  signSession, verifySession, signLogin, verifyLogin, resolveClient,
  SESSION_TTL_MS, RENEW_AFTER_MS,
} = require("../netlify/functions/lib/client-auth.js");

const ENV = { CLIENT_SESSION_SECRET: "test-secret-0123456789" };
const NOW = 1800000000000; // fixed epoch ms

test("session round-trip, lower-cases the email", () => {
  const t = signSession("Marcus@Example.com", NOW, ENV);
  assert.ok(t && t.includes("."));
  const v = verifySession(t, NOW + 1000, ENV);
  assert.equal(v.email, "marcus@example.com");
});

test("session expires after 365 days", () => {
  const t = signSession("a@b.co", NOW, ENV);
  assert.ok(verifySession(t, NOW + SESSION_TTL_MS - 1, ENV));
  assert.equal(verifySession(t, NOW + SESSION_TTL_MS + 1, ENV), null);
});

test("tampered token rejected", () => {
  const t = signSession("a@b.co", NOW, ENV);
  const [p, sig] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ e: "evil@b.co", t: "session", x: NOW + SESSION_TTL_MS, i: NOW })).toString("base64url");
  assert.equal(verifySession(forged + "." + sig, NOW, ENV), null);
  assert.equal(verifySession(p + ".AAAA", NOW, ENV), null);
});

test("login token is not a session token (type confusion)", () => {
  const lt = signLogin("a@b.co", 30 * 60 * 1000, NOW, ENV);
  assert.equal(verifySession(lt, NOW, ENV), null);
  assert.equal(verifyLogin(lt, NOW + 1000, ENV).email, "a@b.co");
  const st = signSession("a@b.co", NOW, ENV);
  assert.equal(verifyLogin(st, NOW, ENV), null);
});

test("login token honors its ttl", () => {
  const lt = signLogin("a@b.co", 1000, NOW, ENV);
  assert.ok(verifyLogin(lt, NOW + 999, ENV));
  assert.equal(verifyLogin(lt, NOW + 1001, ENV), null);
});

test("fails closed when the secret is unset", () => {
  assert.equal(signSession("a@b.co", NOW, {}), null);
  const t = signSession("a@b.co", NOW, ENV);
  assert.equal(verifySession(t, NOW, {}), null);
});

test("resolveClient reads the header; renews only past the renewal window", () => {
  const fresh = signSession("a@b.co", NOW, ENV);
  const r1 = resolveClient({ "x-client-token": fresh }, NOW + 1000, ENV);
  assert.equal(r1.email, "a@b.co");
  assert.equal(r1.renewedToken, undefined);
  const r2 = resolveClient({ "x-client-token": fresh }, NOW + RENEW_AFTER_MS + 1, ENV);
  assert.equal(r2.email, "a@b.co");
  assert.ok(r2.renewedToken && r2.renewedToken !== fresh);
  assert.equal(resolveClient({}, NOW, ENV), null);
  assert.equal(resolveClient({ "x-client-token": "junk" }, NOW, ENV), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/client-auth.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `netlify/functions/lib/client-auth.js`:

```js
// netlify/functions/lib/client-auth.js
// Client (customer) identity: stateless HMAC tokens signed with CLIENT_SESSION_SECRET.
// Mirrors installer-auth.js in spirit — fail-closed, constant-time compares — but for
// clients the "account" is just a verified email. Two token types share one format
// (base64url(JSON payload).base64url(hmac)): t:"session" (365d, sliding renewal) and
// t:"login" (short-lived magic-link). Revocation = rotate the secret.
const crypto = require("crypto");
const { secretEquals } = require("./secrets.js");

const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const RENEW_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

function hmac(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}
function makeToken(obj, env) {
  const secret = env && env.CLIENT_SESSION_SECRET;
  if (!secret) return null;
  const p = Buffer.from(JSON.stringify(obj)).toString("base64url");
  return p + "." + hmac(p, secret);
}
function readToken(token, env) {
  const secret = env && env.CLIENT_SESSION_SECRET;
  if (!secret) return null;
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return null;
  if (!secretEquals(parts[1], hmac(parts[0], secret))) return null;
  try { return JSON.parse(Buffer.from(parts[0], "base64url").toString()); } catch { return null; }
}

function signSession(email, now, env) {
  return makeToken({ e: String(email || "").trim().toLowerCase(), t: "session", x: now + SESSION_TTL_MS, i: now }, env);
}
function verifySession(token, now, env) {
  const p = readToken(token, env);
  if (!p || p.t !== "session" || !p.e || !(p.x > now)) return null;
  return { email: p.e, issuedAt: p.i || 0 };
}
function signLogin(email, ttlMs, now, env) {
  return makeToken({ e: String(email || "").trim().toLowerCase(), t: "login", x: now + ttlMs }, env);
}
function verifyLogin(token, now, env) {
  const p = readToken(token, env);
  if (!p || p.t !== "login" || !p.e || !(p.x > now)) return null;
  return { email: p.e };
}
// Header auth for client endpoints. Returns {email, renewedToken?} or null.
// renewedToken implements the sliding session: any visit after 30 days re-issues.
function resolveClient(headers, now, env) {
  const got = ((headers || {})["x-client-token"] || (headers || {})["X-Client-Token"] || "").toString();
  const v = verifySession(got, now, env);
  if (!v) return null;
  const out = { email: v.email };
  if (now - v.issuedAt > RENEW_AFTER_MS) out.renewedToken = signSession(v.email, now, env);
  return out;
}

module.exports = { signSession, verifySession, signLogin, verifyLogin, resolveClient, SESSION_TTL_MS, RENEW_AFTER_MS };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/client-auth.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/client-auth.js tests/client-auth.test.js
git commit -m "feat(client): pure HMAC token lib for client sessions + magic links"
```

---

## Task 2: `client-auth.js` function — request + exchange

**Files:**
- Modify: `netlify/functions/lib/airtable.js` (cfg gains `clients`)
- Create: `netlify/functions/client-auth.js`
- Test: `tests/client-auth-fn.test.js`

- [ ] **Step 1: Add the Clients table to cfg**

In `netlify/functions/lib/airtable.js`, inside `cfg()`'s returned object after the `priority` line, add:

```js
    clients: env.AIRTABLE_CLIENTS_TABLE || "Clients",
```

- [ ] **Step 2: Write the failing tests**

Create `tests/client-auth-fn.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processClientAuth } = require("../netlify/functions/client-auth.js");
const { verifyLogin, verifySession, signLogin } = require("../netlify/functions/lib/client-auth.js");

const ENV = {
  CLIENT_SESSION_SECRET: "test-secret-0123456789",
  RESEND_API_KEY: "rk", AIRTABLE_TOKEN: "at", AIRTABLE_BASE_ID: "app1",
};
const NOW = 1800000000000;

test("request emails a 30-minute magic link and never enumerates", async () => {
  const sent = [];
  const out = await processClientAuth({ action: "request", email: "Pat@Example.com" },
    { env: ENV, now: NOW, send: async (a) => { sent.push(a); } });
  assert.equal(out.status, "sent");
  assert.equal(sent[0].to, "pat@example.com");
  const m = /account\?lt=([A-Za-z0-9_\-\.]+)/.exec(sent[0].html);
  assert.ok(m, "link in email");
  assert.equal(verifyLogin(m[1], NOW + 29 * 60 * 1000, ENV).email, "pat@example.com");
  assert.equal(verifyLogin(m[1], NOW + 31 * 60 * 1000, ENV), null, "30-min ttl");
});

test("request rejects a malformed email without sending", async () => {
  const sent = [];
  const out = await processClientAuth({ action: "request", email: "not-an-email" },
    { env: ENV, now: NOW, send: async (a) => { sent.push(a); } });
  assert.equal(out.status, "error");
  assert.equal(out.error, "bad-email");
  assert.equal(sent.length, 0);
});

test("request reports an honest send failure", async () => {
  const out = await processClientAuth({ action: "request", email: "pat@example.com" },
    { env: ENV, now: NOW, send: async () => { throw new Error("Resend 500"); } });
  assert.deepEqual(out, { status: "error", error: "send-failed" });
});

test("exchange creates the client on first login and returns a session", async () => {
  const created = [];
  const lt = signLogin("pat@example.com", 30 * 60 * 1000, NOW, ENV);
  const out = await processClientAuth({ action: "exchange", token: lt },
    { env: ENV, now: NOW + 1000,
      list: async () => [],
      create: async (a) => { created.push(a.fields); return { id: "rc1" }; } });
  assert.equal(out.status, "ok");
  assert.equal(out.email, "pat@example.com");
  assert.deepEqual(out.vehicles, []);
  assert.equal(created[0].Email, "pat@example.com");
  assert.ok(created[0]["Created At"]);
  assert.equal(verifySession(out.token, NOW + 2000, ENV).email, "pat@example.com");
});

test("exchange returns the existing profile and stamps Last Login", async () => {
  const updated = [];
  const lt = signLogin("pat@example.com", 30 * 60 * 1000, NOW, ENV);
  const out = await processClientAuth({ action: "exchange", token: lt },
    { env: ENV, now: NOW + 1000,
      list: async () => [{ id: "rc1", fields: { Email: "pat@example.com", Name: "Pat R",
        Vehicles: JSON.stringify([{ make: "Toyota", model: "Tundra", year: "2021" }]) } }],
      update: async (a) => { updated.push(a); return { id: a.id }; } });
  assert.equal(out.status, "ok");
  assert.equal(out.name, "Pat R");
  assert.equal(out.vehicles[0].model, "Tundra");
  assert.equal(updated[0].id, "rc1");
  assert.ok(updated[0].fields["Last Login"]);
});

test("exchange rejects a bad or expired link", async () => {
  const out = await processClientAuth({ action: "exchange", token: "junk" }, { env: ENV, now: NOW });
  assert.deepEqual(out, { status: "error", error: "bad-link" });
  const lt = signLogin("pat@example.com", 1000, NOW, ENV);
  const out2 = await processClientAuth({ action: "exchange", token: lt }, { env: ENV, now: NOW + 2000 });
  assert.deepEqual(out2, { status: "error", error: "bad-link" });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test tests/client-auth-fn.test.js`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

Create `netlify/functions/client-auth.js`:

```js
// netlify/functions/client-auth.js
// Client login: action "request" emails a 30-minute magic link (response is always
// "sent" for a well-formed email — no account enumeration; any email may sign in,
// a prospect just gets an empty portal). Action "exchange" verifies the link token,
// auto-creates/updates the Clients row (no signup form), and returns the 1-year
// session token + profile. Fail-closed when CLIENT_SESSION_SECRET is unset.
const { cfg, escapeFormula, listRecords, createRecord, updateRecord } = require("./lib/airtable.js");
const { signSession, signLogin, verifyLogin } = require("./lib/client-auth.js");
const { sendEmail } = require("./lib/resend.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";
const LOGIN_TTL_MS = 30 * 60 * 1000;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function parseVehicles(raw) {
  try { const v = JSON.parse(raw || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

async function processClientAuth(body, deps = {}) {
  const {
    env = process.env, fetchImpl = fetch, now = Date.now(),
    send = (a) => sendEmail({ fetchImpl, ...a }),
    list = (a) => listRecords({ fetchImpl, ...a }),
    create = (a) => createRecord({ fetchImpl, ...a }),
    update = (a) => updateRecord({ fetchImpl, ...a }),
  } = deps;
  const c = cfg(env);
  const action = (body && body.action) || "";

  if (action === "request") {
    const email = String((body && body.email) || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return { status: "error", error: "bad-email" };
    const lt = signLogin(email, LOGIN_TTL_MS, now, env);
    if (!lt) return { status: "error", error: "not-configured" };
    const link = `https://tunedyota.com/account?lt=${lt}`;
    try {
      await send({ apiKey: env.RESEND_API_KEY, from: FROM, to: email, replyTo: OWNER,
        subject: "Your Tuned Yota sign-in link",
        text: `Sign in to your Tuned Yota account (certificates + AMSOIL garage): ${link}\n\nThis link works for 30 minutes. If you didn't request it, you can ignore this email.`,
        html: `<p>Tap to sign in to your <strong>Tuned Yota</strong> account — your certificates and AMSOIL garage:</p>` +
          `<p><a href="${link}" style="display:inline-block;background:#191c1e;color:#fff;text-decoration:none;font-weight:800;font-size:15px;padding:14px 26px;border-radius:8px;">Sign in to Tuned Yota &#9658;</a></p>` +
          `<p style="font-size:13px;color:#8a8f94;">This link works for 30 minutes and signs you in on this device. If you didn't request it, ignore this email.</p>` });
      return { status: "sent" };
    } catch { return { status: "error", error: "send-failed" }; }
  }

  if (action === "exchange") {
    const v = verifyLogin(body && body.token, now, env);
    if (!v) return { status: "error", error: "bad-link" };
    const today = new Date(now).toISOString().slice(0, 10);
    let name = "", vehicles = [];
    try {
      const rows = await list({ token: c.token, baseId: c.baseId, table: c.clients,
        filterByFormula: `LOWER({Email})="${escapeFormula(v.email)}"` });
      if (rows.length) {
        name = String(rows[0].fields.Name || "");
        vehicles = parseVehicles(rows[0].fields.Vehicles);
        await update({ token: c.token, baseId: c.baseId, table: c.clients, id: rows[0].id,
          fields: { "Last Login": today } });
      } else {
        await create({ token: c.token, baseId: c.baseId, table: c.clients,
          fields: { Email: v.email, "Created At": today, "Last Login": today } });
      }
    } catch { /* best-effort profile — the session is still valid */ }
    return { status: "ok", token: signSession(v.email, now, env), email: v.email, name, vehicles };
  }

  return { status: "error", error: "bad-action" };
}

async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "method-not-allowed" };
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad-json" }; }
  const out = await processClientAuth(body);
  const code = out.status === "ok" || out.status === "sent" ? 200
    : out.error === "bad-link" ? 401 : out.error === "bad-email" || out.error === "bad-action" ? 400 : 502;
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}

module.exports = { handler, processClientAuth };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/client-auth-fn.test.js`
Expected: PASS (6 tests). Also run `node --test tests/client-auth.test.js` — still green.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/lib/airtable.js netlify/functions/client-auth.js tests/client-auth-fn.test.js
git commit -m "feat(client): magic-link request/exchange endpoint with auto-created client records"
```

---

## Task 3: Extract the shared cert render core

**Files:**
- Create: `netlify/functions/lib/cert-render.js`
- Modify: `netlify/functions/installer-certificate.js`
- Test: existing `tests/installer-certificate.test.js` (must stay green — behavior unchanged)

- [ ] **Step 1: Create the shared core**

Create `netlify/functions/lib/cert-render.js` (logic moved verbatim from `installer-certificate.js` lines 23–33 — read that file first; if it has drifted from the excerpt below, move its CURRENT logic, don't restore this snapshot):

```js
// netlify/functions/lib/cert-render.js
// Shared "booking record -> certificate HTML" core, used by BOTH the installer
// repository (installer-certificate.js) and the client portal (client-certs.js).
// Deterministic: stable serial + stored issue date. Callers own auth/ownership.
const { keyToInstaller } = require("./routing.js");
const { buildCertificate, certSerial } = require("./certificate.js");
const { resolveFluids } = require("./amsoil-fluids.js");
const { qrSvg } = require("./qr.js");

function certHtmlForRecord(rec) {
  const f = (rec && rec.fields) || {};
  const owner = Array.isArray(f.Installer) ? f.Installer[0] : f.Installer;
  const inst = keyToInstaller(owner);
  const calibrationDate = String(f["Calibration Date"] || f["Event Date"] || "").slice(0, 10);
  const issueDate = String(f["Certificate Issued"] || calibrationDate).slice(0, 10);
  const certNo = certSerial(rec.id, calibrationDate, issueDate);
  const fluids = resolveFluids(f.Vehicle, f["Model Year"]);
  const amsoil = { fluids, qrSvg: qrSvg((fluids && fluids.garageUrl) || "https://tunedyota.com/amsoil-garage") };
  const { html } = buildCertificate({
    name: f.Name, vehicle: f.Vehicle, modelYear: f["Model Year"], vin: f.VIN,
    calibration: f["OTT Calibration"], installer: inst.name, installerRegion: inst.region,
    calibrationDate, certNo, issueDate, amsoil });
  return html;
}

module.exports = { certHtmlForRecord };
```

⚠ If the current `installer-certificate.js` builds a TRACKED QR (`amsoil-go` URL) or differs otherwise, carry that current logic into `cert-render.js` unchanged — the invariant is "repository render and client render are byte-identical for the same record."

- [ ] **Step 2: Delegate from installer-certificate.js**

In `netlify/functions/installer-certificate.js`: remove the now-moved requires (`keyToInstaller`, `buildCertificate`/`certSerial`, `resolveFluids`, `qrSvg`) and the moved logic; add `const { certHtmlForRecord } = require("./lib/cert-render.js");` and end `renderCertificate` with:

```js
  return { status: "ok", html: certHtmlForRecord(rec) };
```

(The auth/ownership check and the store-unavailable handling stay exactly where they are.)

- [ ] **Step 3: Verify no regression**

Run: `node --test tests/installer-certificate.test.js`
Expected: PASS unchanged.

- [ ] **Step 4: Commit**

```bash
git add netlify/functions/lib/cert-render.js netlify/functions/installer-certificate.js
git commit -m "refactor(cert): extract shared record->certificate render core for the client portal"
```

---

## Task 4: `client-certs.js` — email-scoped list + render

**Files:**
- Create: `netlify/functions/client-certs.js`
- Test: `tests/client-certs.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/client-certs.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { listCerts, renderClientCert } = require("../netlify/functions/client-certs.js");

const ENV = { CLIENT_SESSION_SECRET: "s", AIRTABLE_TOKEN: "at", AIRTABLE_BASE_ID: "app1" };

const REC = { id: "recX", fields: {
  Installer: "aaron", Name: "Marcus Bell", Vehicle: "2024 Toyota Tacoma 2.4L-T I4",
  "Model Year": "2024", VIN: "3TMLB5JN1RM123456", "OTT Calibration": "Medium",
  "Calibration Date": "2026-07-12", "Certificate Issued": "2026-07-12",
  Status: "Completed", Email: "Marcus@Example.com" } };

test("listCerts filters by the session email, case-insensitively, completed only", async () => {
  let formula = "";
  const out = await listCerts("marcus@example.com",
    { env: ENV, list: async (a) => { formula = a.filterByFormula; return [REC]; } });
  assert.match(formula, /LOWER\(\{Email\}\)="marcus@example\.com"/);
  assert.match(formula, /\{Status\}="Completed"/);
  assert.equal(out.certs.length, 1);
  assert.deepEqual(out.certs[0], {
    recordId: "recX", name: "Marcus Bell", vehicle: "2024 Toyota Tacoma 2.4L-T I4",
    modelYear: "2024", calibration: "Medium", calibrationDate: "2026-07-12",
    certIssued: "2026-07-12" });
});

test("renderClientCert renders when the booking email matches the session", async () => {
  const out = await renderClientCert("recX", "marcus@example.com",
    { env: ENV, get: async () => REC });
  assert.equal(out.status, "ok");
  assert.match(out.html, /Marcus Bell/);
  assert.match(out.html, /AMSOIL Maintenance Reference/);
});

test("renderClientCert refuses another client's booking", async () => {
  const out = await renderClientCert("recX", "other@example.com",
    { env: ENV, get: async () => REC });
  assert.deepEqual(out, { status: "error", error: "not-yours" });
});

test("renderClientCert reports store failures as retryable", async () => {
  const out = await renderClientCert("recX", "marcus@example.com",
    { env: ENV, get: async () => { throw new Error("airtable get 503"); } });
  assert.deepEqual(out, { status: "error", error: "store-unavailable" });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/client-certs.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `netlify/functions/client-certs.js`:

```js
// netlify/functions/client-certs.js
// Client portal certificates. GET (no params) -> the caller's completed bookings
// (matched by session email, case-insensitive). GET ?recordId= -> that booking's
// certificate HTML, re-rendered deterministically (never stored). Ownership =
// the booking's Email equals the session email. 401 without a valid session.
const { cfg, escapeFormula, listRecords, getRecord } = require("./lib/airtable.js");
const { resolveClient } = require("./lib/client-auth.js");
const { certHtmlForRecord } = require("./lib/cert-render.js");

async function listCerts(email, deps = {}) {
  const { env = process.env, fetchImpl = fetch, list = (a) => listRecords({ fetchImpl, ...a }) } = deps;
  const c = cfg(env);
  let rows;
  try {
    rows = await list({ token: c.token, baseId: c.baseId, table: c.bookings,
      filterByFormula: `AND(LOWER({Email})="${escapeFormula(email)}", {Status}="Completed")`,
      fields: ["Name", "Vehicle", "Model Year", "OTT Calibration", "Calibration Date", "Event Date", "Certificate Issued"] });
  } catch { return { status: "error", error: "store-unavailable" }; }
  const certs = rows.map((r) => {
    const f = r.fields || {};
    const calibrationDate = String(f["Calibration Date"] || f["Event Date"] || "").slice(0, 10);
    return { recordId: r.id, name: String(f.Name || ""), vehicle: String(f.Vehicle || ""),
      modelYear: String(f["Model Year"] || ""), calibration: String(f["OTT Calibration"] || ""),
      calibrationDate, certIssued: String(f["Certificate Issued"] || calibrationDate).slice(0, 10) };
  });
  return { status: "ok", certs };
}

async function renderClientCert(recordId, email, deps = {}) {
  const { env = process.env, fetchImpl = fetch, get = (a) => getRecord({ fetchImpl, ...a }) } = deps;
  if (!recordId) return { status: "error", error: "missing-record" };
  const c = cfg(env);
  let rec;
  try { rec = await get({ token: c.token, baseId: c.baseId, table: c.bookings, id: recordId }); }
  catch { return { status: "error", error: "store-unavailable" }; }
  const f = (rec && rec.fields) || {};
  if (String(f.Email || "").trim().toLowerCase() !== email) return { status: "error", error: "not-yours" };
  return { status: "ok", html: certHtmlForRecord(rec) };
}

async function handler(event) {
  const session = resolveClient(event.headers || {}, Date.now(), process.env);
  if (!session) return { statusCode: 401, body: "unauthorized" };
  const q = event.queryStringParameters || {};
  const renewHeaders = session.renewedToken ? { "x-renewed-token": session.renewedToken } : {};
  if (q.recordId) {
    const out = await renderClientCert(q.recordId, session.email, {});
    if (out.status !== "ok") {
      const code = out.error === "not-yours" ? 403 : out.error === "missing-record" ? 400 : 502;
      return { statusCode: code, headers: { "Content-Type": "application/json", ...renewHeaders }, body: JSON.stringify(out) };
    }
    return { statusCode: 200, headers: { "Content-Type": "text/html; charset=utf-8", ...renewHeaders }, body: out.html };
  }
  const out = await listCerts(session.email, {});
  if (out.status !== "ok") return { statusCode: 502, headers: { "Content-Type": "application/json", ...renewHeaders }, body: JSON.stringify(out) };
  const body = { ...out, ...(session.renewedToken ? { renewedToken: session.renewedToken } : {}) };
  return { statusCode: 200, headers: { "Content-Type": "application/json", ...renewHeaders }, body: JSON.stringify(body) };
}

module.exports = { handler, listCerts, renderClientCert };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/client-certs.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/client-certs.js tests/client-certs.test.js
git commit -m "feat(client): email-scoped certificate list + render for the client portal"
```

---

## Task 5: `client-garage.js` — get/put with server-side merge

**Files:**
- Create: `netlify/functions/client-garage.js`
- Test: `tests/client-garage.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/client-garage.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mergeVehicles, getGarage, putGarage } = require("../netlify/functions/client-garage.js");

const ENV = { CLIENT_SESSION_SECRET: "s", AIRTABLE_TOKEN: "at", AIRTABLE_BASE_ID: "app1" };
const T = (make, model, year) => ({ make, model, year });

test("mergeVehicles unions by make|model|year, caps sizes, drops junk", () => {
  const out = mergeVehicles(
    [T("Toyota", "Tundra", "2021"), { bogus: true }, T("toyota", "tundra", "2021")],
    [T("Toyota", "Tacoma", "2024"), T("Toyota", "Tundra", "2021")]);
  assert.deepEqual(out, [
    { make: "Toyota", model: "Tundra", year: "2021" },
    { make: "Toyota", model: "Tacoma", year: "2024" }]);
  const long = mergeVehicles(Array.from({ length: 30 }, (_, i) => T("M" + i, "X", "")), []);
  assert.equal(long.length, 20, "bounded at 20");
  const capped = mergeVehicles([T("A".repeat(99), "B".repeat(99), "12345678901234")], []);
  assert.equal(capped[0].make.length, 40);
  assert.equal(capped[0].year.length, 10);
});

test("getGarage returns the stored vehicles (empty when no row)", async () => {
  const out = await getGarage("pat@example.com", { env: ENV,
    list: async () => [{ id: "rc1", fields: { Vehicles: JSON.stringify([T("Toyota", "Tundra", "2021")]) } }] });
  assert.deepEqual(out, { status: "ok", vehicles: [T("Toyota", "Tundra", "2021")] });
  const empty = await getGarage("pat@example.com", { env: ENV, list: async () => [] });
  assert.deepEqual(empty, { status: "ok", vehicles: [] });
});

test("putGarage writes sanitized vehicles to the existing row", async () => {
  const updated = [];
  const out = await putGarage("pat@example.com", { vehicles: [T("Toyota", "Tacoma", "2024")] },
    { env: ENV, list: async () => [{ id: "rc1", fields: {} }],
      update: async (a) => { updated.push(a); return { id: a.id }; } });
  assert.equal(out.status, "ok");
  assert.deepEqual(JSON.parse(updated[0].fields.Vehicles), [T("Toyota", "Tacoma", "2024")]);
});

test("putGarage with merge unions with what's stored", async () => {
  const updated = [];
  const out = await putGarage("pat@example.com",
    { vehicles: [T("Toyota", "Tacoma", "2024")], merge: true },
    { env: ENV,
      list: async () => [{ id: "rc1", fields: { Vehicles: JSON.stringify([T("Toyota", "Tundra", "2021")]) } }],
      update: async (a) => { updated.push(a); return { id: a.id }; } });
  assert.deepEqual(out.vehicles, [T("Toyota", "Tundra", "2021"), T("Toyota", "Tacoma", "2024")]);
  assert.deepEqual(JSON.parse(updated[0].fields.Vehicles), out.vehicles);
});

test("putGarage creates the row when the client has none yet", async () => {
  const created = [];
  const out = await putGarage("pat@example.com", { vehicles: [T("Toyota", "Tacoma", "2024")] },
    { env: ENV, list: async () => [],
      create: async (a) => { created.push(a.fields); return { id: "rc9" }; } });
  assert.equal(out.status, "ok");
  assert.equal(created[0].Email, "pat@example.com");
  assert.deepEqual(JSON.parse(created[0].Vehicles), [T("Toyota", "Tacoma", "2024")]);
});

test("putGarage reports store failure as retryable, never silent", async () => {
  const out = await putGarage("pat@example.com", { vehicles: [] },
    { env: ENV, list: async () => { throw new Error("airtable list 503"); } });
  assert.deepEqual(out, { status: "error", error: "store-unavailable" });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/client-garage.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `netlify/functions/client-garage.js`:

```js
// netlify/functions/client-garage.js
// Account-backed My Garage. GET -> stored vehicles; PUT {vehicles, merge?} ->
// sanitized write (merge:true unions with what's stored — used once to absorb a
// device's localStorage garage on first login, so nothing a client saved is lost).
// Vehicles keep the {make, model, year} shape the AMSOIL + Magnuson catalogs key
// on, so future parts fitment attaches to these records without a remodel.
const { cfg, escapeFormula, listRecords, createRecord, updateRecord } = require("./lib/airtable.js");
const { resolveClient } = require("./lib/client-auth.js");

const MAX_VEHICLES = 20;

function mergeVehicles(a, b) {
  const seen = new Set(), out = [];
  for (const v of [...(a || []), ...(b || [])]) {
    if (!v || !v.make || !v.model) continue;
    const clean = { make: String(v.make).slice(0, 40), model: String(v.model).slice(0, 40),
      year: String(v.year || "").slice(0, 10) };
    const key = (clean.make + "|" + clean.model + "|" + clean.year).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= MAX_VEHICLES) break;
  }
  return out;
}

function parseVehicles(raw) {
  try { const v = JSON.parse(raw || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

async function findRow(email, c, list) {
  const rows = await list({ token: c.token, baseId: c.baseId, table: c.clients,
    filterByFormula: `LOWER({Email})="${escapeFormula(email)}"` });
  return rows[0] || null;
}

async function getGarage(email, deps = {}) {
  const { env = process.env, fetchImpl = fetch, list = (a) => listRecords({ fetchImpl, ...a }) } = deps;
  const c = cfg(env);
  try {
    const row = await findRow(email, c, list);
    return { status: "ok", vehicles: row ? mergeVehicles(parseVehicles(row.fields.Vehicles), []) : [] };
  } catch { return { status: "error", error: "store-unavailable" }; }
}

async function putGarage(email, body, deps = {}) {
  const { env = process.env, fetchImpl = fetch, now = Date.now(),
    list = (a) => listRecords({ fetchImpl, ...a }),
    create = (a) => createRecord({ fetchImpl, ...a }),
    update = (a) => updateRecord({ fetchImpl, ...a }) } = deps;
  const c = cfg(env);
  const incoming = mergeVehicles((body && body.vehicles) || [], []);
  try {
    const row = await findRow(email, c, list);
    const vehicles = body && body.merge && row
      ? mergeVehicles(parseVehicles(row.fields.Vehicles), incoming) : incoming;
    if (row) {
      await update({ token: c.token, baseId: c.baseId, table: c.clients, id: row.id,
        fields: { Vehicles: JSON.stringify(vehicles) } });
    } else {
      const today = new Date(now).toISOString().slice(0, 10);
      await create({ token: c.token, baseId: c.baseId, table: c.clients,
        fields: { Email: email, "Created At": today, "Last Login": today, Vehicles: JSON.stringify(vehicles) } });
    }
    return { status: "ok", vehicles };
  } catch { return { status: "error", error: "store-unavailable" }; }
}

async function handler(event) {
  const session = resolveClient(event.headers || {}, Date.now(), process.env);
  if (!session) return { statusCode: 401, body: "unauthorized" };
  const renew = session.renewedToken ? { renewedToken: session.renewedToken } : {};
  let out;
  if (event.httpMethod === "GET") out = await getGarage(session.email, {});
  else if (event.httpMethod === "PUT" || event.httpMethod === "POST") {
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad-json" }; }
    out = await putGarage(session.email, body, {});
  } else return { statusCode: 405, body: "method-not-allowed" };
  return { statusCode: out.status === "ok" ? 200 : 502,
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...out, ...renew }) };
}

module.exports = { handler, getGarage, putGarage, mergeVehicles };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/client-garage.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/client-garage.js tests/client-garage.test.js
git commit -m "feat(client): account-backed My Garage endpoint with merge-on-first-login"
```

---

## Task 6: Account links in the certificate + AMSOIL emails

**Files:**
- Modify: `netlify/functions/installer-closeout.js`, `netlify/functions/certificate-dispatch.js`, `netlify/functions/lib/amsoil-email.js`, `netlify/functions/amsoil-followup.js`
- Tests: add cases to `tests/installer-closeout.test.js`, `tests/certificate-dispatch.test.js`, and the amsoil email builder's test file (find it: `grep -l buildAmsoilEmail tests/`)

The email is already the trust channel, so these links carry a **7-day** login token. The printed/attached certificate HTML itself must NOT embed a token (it gets forwarded/printed) — only email bodies get it. When `CLIENT_SESSION_SECRET` is unset, fall back to a plain `/account` link (fail-safe, not fail-broken).

- [ ] **Step 1: Add a tiny shared helper**

In `netlify/functions/lib/client-auth.js`, add (and export):

```js
const ACCOUNT_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Account URL for an email body: pre-authenticated when the secret is configured,
// plain /account otherwise. Never embed in the certificate HTML itself.
function accountLink(email, now, env) {
  const lt = signLogin(email, ACCOUNT_LINK_TTL_MS, now, env);
  return lt ? `https://tunedyota.com/account?lt=${lt}` : "https://tunedyota.com/account";
}
```

Add `accountLink` to `module.exports`. Add to `tests/client-auth.test.js`:

```js
test("accountLink embeds a 7-day login token, plain when unconfigured", () => {
  const { accountLink } = require("../netlify/functions/lib/client-auth.js");
  const url = accountLink("a@b.co", NOW, ENV);
  const m = /lt=([A-Za-z0-9_\-\.]+)/.exec(url);
  assert.ok(m);
  assert.ok(verifyLogin(m[1], NOW + 6 * 24 * 3600 * 1000, ENV));
  assert.equal(verifyLogin(m[1], NOW + 8 * 24 * 3600 * 1000, ENV), null);
  assert.equal(accountLink("a@b.co", NOW, {}), "https://tunedyota.com/account");
});
```

- [ ] **Step 2: Write the failing tests for the three senders**

Add to `tests/installer-closeout.test.js` (reuse that file's existing deps-stub helper):

```js
test("customer cert email includes a pre-authenticated account link", async () => {
  const { sent, deps } = baseDeps();  // this file's existing helper — adapt name if it differs
  deps.env = { ...(deps.env || {}), CLIENT_SESSION_SECRET: "test-secret-0123456789" };
  await processCloseout({ recordId: "recX", action: "complete", calibration: "Medium",
    vin: "3TMLB5JN1RM123456", customerEmail: "marcus@example.com" }, deps);
  assert.match(sent[0].text, /account\?lt=/, "account link with login token");
});
```

Add the equivalent to `tests/certificate-dispatch.test.js` (customer-email path → `sent[0].text` matches `/account\?lt=/`), and to the amsoil email builder's test file assert the built `html` contains `account?lt=` when an `accountUrl` with a token is passed, and that `buildAmsoilEmail` renders a plain `/account` link when `accountUrl` is `"https://tunedyota.com/account"`.

Run each test file; expected: FAIL.

- [ ] **Step 3: Implement in installer-closeout.js**

Add the require at the top: `const { accountLink } = require("./lib/client-auth.js");`
In the `complete` branch where the customer email `text` is built (the `send({...})` call around line 119), change the customer-facing text to append the link:

```js
      text: toCustomer
        ? `Attached is your Tuned Yota Certificate of Calibration and AMSOIL maintenance reference for your ${f.Vehicle || "vehicle"}.\n\nView your certificates & AMSOIL garage anytime: ${accountLink(customerEmail, Date.now(), env)}`
        : `Attached is the Certificate of Calibration for ${f.Name || "your customer"} — no customer email on file; please forward it to them.`,
```

- [ ] **Step 4: Implement in certificate-dispatch.js**

Same require. In its `send({...})` call, the customer-path `text` becomes:

```js
        text: customerEmail
          ? `Attached is your Tuned Yota Certificate of Calibration and AMSOIL maintenance reference for your ${f.Vehicle || "vehicle"}.\n\nView your certificates & AMSOIL garage anytime: ${accountLink(customerEmail, Date.now(), env)}`
          : `Attached is the Certificate of Calibration for ${f.Name || "your customer"} — no customer email on file; please forward it to them.`,
```

- [ ] **Step 5: Implement in the AMSOIL follow-up**

`netlify/functions/lib/amsoil-email.js`: add `accountUrl` to `buildAmsoilEmail`'s destructured params; in the footer area (near the existing PC line at ~line 55), add:

```js
      <p style="font-size:13px;color:#8a8f94;text-align:center;margin:8px 0 0;"><a href="${accountUrl || "https://tunedyota.com/account"}" style="color:#8a8f94;text-decoration:underline;">View your certificates &amp; AMSOIL garage</a></p>
```

`netlify/functions/amsoil-followup.js`: require `accountLink` from `./lib/client-auth.js` and pass it at the call site (line ~41):

```js
      const { subject, html, text } = buildAmsoilEmail({ name: f.Name, vehicle: f.Vehicle, modelYear: f["Model Year"], fluids, bookingId: row.id, accountUrl: accountLink(f.Email, Date.now(), env) });
```

- [ ] **Step 6: Cert page-2 fine print mentions the account (plain URL, NO token)**

In `netlify/functions/lib/certificate.js`, in the `amsoilPage` fine-print line (`.ref-fine`), change the trailing `tunedyota.com/amsoil-garage` mention to:

```
tunedyota.com/account — your certificates &amp; AMSOIL garage
```

Update the matching assertion in `tests/certificate.test.js` if one pins the old fine-print text. The certificate HTML gets printed/forwarded, so it must NEVER carry a login token — plain URL only.

- [ ] **Step 7: Run the touched test files, then commit**

Run: `node --test tests/client-auth.test.js tests/certificate.test.js tests/installer-closeout.test.js tests/certificate-dispatch.test.js` plus the amsoil email test file.
Expected: PASS.

```bash
git add netlify/functions/lib/client-auth.js netlify/functions/lib/certificate.js netlify/functions/installer-closeout.js netlify/functions/certificate-dispatch.js netlify/functions/lib/amsoil-email.js netlify/functions/amsoil-followup.js tests/
git commit -m "feat(client): pre-authenticated account links in certificate + AMSOIL emails"
```

---

## Task 7: `site/account.html` — the client portal page

**Files:**
- Create: `site/account.html`

No unit test (static page — same policy as installer.html); browser-verify in Task 9. Follow `installer.html` patterns: token in localStorage, authed `fetch`, blob-open for cert HTML (a plain link can't send the header). Brand chrome via `site.css`. **`<meta name="robots" content="noindex">`** — private page, don't register in `seo-data.mjs` HEAD_PAGES (the Console page isn't either).

- [ ] **Step 1: Create the page**

Create `site/account.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>My Account — Tuned Yota</title>
<link rel="stylesheet" href="/site.css">
<style>
  .acct{max-width:640px;margin:0 auto;padding:24px 16px 64px}
  .acct h1{margin:18px 0 6px}
  .acct .sub{color:#5c6166;margin:0 0 22px}
  .card{background:#fff;border:1px solid #e4e2dd;border-radius:12px;padding:16px;margin:10px 0}
  .card .veh{font-weight:800}
  .card .meta{color:#5c6166;font-size:14px;margin-top:2px}
  .card a.link{display:inline-block;margin-top:8px;font-weight:700}
  .chips{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
  .chip{background:#f4f2ee;border:1px solid #e4e2dd;border-radius:999px;padding:8px 14px;font-weight:700;text-decoration:none;color:inherit}
  .chip .x{margin-left:8px;opacity:.5;cursor:pointer}
  input,select,button{font:inherit}
  .field{width:100%;padding:12px;border:1px solid #d9d6cf;border-radius:8px;margin:6px 0}
  .btn{background:#191c1e;color:#fff;border:0;border-radius:8px;padding:12px 22px;font-weight:800;cursor:pointer}
  .row{display:flex;gap:8px;flex-wrap:wrap}
  .row select{flex:1;min-width:120px}
  #msg{margin:12px 0;font-weight:700}
  #msg.ok{color:#1d7a3d}#msg.err{color:#b3261e}
  .signout{float:right;font-size:14px;opacity:.6}
</style>
</head>
<body>
<div class="acct">
  <h1>My Tuned Yota <a href="#" id="signout" class="signout" hidden>Sign out</a></h1>
  <p class="sub">Your certificates and AMSOIL garage.</p>
  <div id="msg"></div>

  <div id="login" hidden>
    <p>Enter your email and we&rsquo;ll send you a sign-in link — no password needed.</p>
    <input id="em" class="field" type="email" autocomplete="email" placeholder="you@example.com">
    <button class="btn" id="sendlink">Email me a sign-in link</button>
  </div>

  <div id="portal" hidden>
    <h2>My certificates</h2>
    <div id="certs"><p class="meta">Loading…</p></div>
    <h2 style="margin-top:28px">My Garage</h2>
    <p class="sub">Your vehicles — each links to its AMSOIL fluids, capacities &amp; intervals.</p>
    <div class="chips" id="garage"></div>
    <div class="row">
      <select id="v-make" class="field"><option value="">Make…</option></select>
      <select id="v-model" class="field" disabled><option value="">Model…</option></select>
      <select id="v-year" class="field" disabled><option value="">Year…</option></select>
    </div>
    <button class="btn" id="v-add">＋ Add vehicle</button>
  </div>
</div>
<script>
(function () {
  var KEY = "ty_client_token", LOCAL_GARAGE = "ty_amsoil_garage";
  var tok = function () { return localStorage.getItem(KEY) || ""; };
  var CAT = null, VEHICLES = [];
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function msg(t, cls) { var m = el("msg"); m.textContent = t || ""; m.className = cls || ""; }
  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ "x-client-token": tok() }, opts.headers || {});
    return fetch("/.netlify/functions/" + path, opts).then(function (res) {
      var renewed = res.headers.get("x-renewed-token");
      if (renewed) localStorage.setItem(KEY, renewed);
      return res;
    });
  }
  function show(view) {
    el("login").hidden = view !== "login";
    el("portal").hidden = view !== "portal";
    el("signout").hidden = view !== "portal";
  }
  function signOut() { localStorage.removeItem(KEY); show("login"); msg(""); }

  // --- login: request a link ---
  el("sendlink").onclick = function () {
    var em = el("em").value.trim();
    if (!em) { msg("Enter your email first.", "err"); return; }
    msg("Sending…");
    fetch("/.netlify/functions/client-auth", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request", email: em }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.status === "sent") msg("Check your email — we sent you a sign-in link.", "ok");
        else if (j.error === "bad-email") msg("That doesn't look like an email address.", "err");
        else msg("Couldn't send the link — please try again.", "err");
      })
      .catch(function () { msg("Couldn't send the link — please try again.", "err"); });
  };

  // --- magic-link landing: exchange lt= for a session ---
  function exchange(lt) {
    msg("Signing you in…");
    fetch("/.netlify/functions/client-auth", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "exchange", token: lt }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.status === "ok") {
          localStorage.setItem(KEY, j.token);
          history.replaceState(null, "", "/account");
          msg("");
          boot();
        } else {
          show("login");
          msg("That sign-in link expired — enter your email and we'll send a fresh one.", "err");
        }
      })
      .catch(function () { show("login"); msg("Sign-in failed — please try again.", "err"); });
  }

  // --- certificates ---
  function loadCerts() {
    api("client-certs").then(function (res) {
      if (res.status === 401) { signOut(); return null; }
      return res.json();
    }).then(function (j) {
      if (!j) return;
      var box = el("certs");
      if (j.status !== "ok") { box.innerHTML = '<p class="meta">Couldn’t load certificates — refresh to retry.</p>'; return; }
      if (!j.certs.length) { box.innerHTML = '<p class="meta">No certificates yet — they appear here after your tune.</p>'; return; }
      box.innerHTML = j.certs.map(function (c) {
        return '<div class="card"><div class="veh">' + esc(c.vehicle) + '</div>' +
          '<div class="meta">' + esc(c.calibration) + ' calibration · ' + esc(c.calibrationDate) + '</div>' +
          '<a href="#" class="link" data-rec="' + esc(c.recordId) + '">View / download certificate</a></div>';
      }).join("");
      box.querySelectorAll("a.link").forEach(function (a) {
        a.onclick = function (e) {
          e.preventDefault();
          api("client-certs?recordId=" + encodeURIComponent(a.getAttribute("data-rec")))
            .then(function (res) {
              if (!res.ok) { msg("Couldn't load that certificate — try again.", "err"); return null; }
              return res.text();
            })
            .then(function (html) {
              if (!html) return;
              window.open(URL.createObjectURL(new Blob([html], { type: "text/html" })), "_blank");
            });
        };
      });
    });
  }

  // --- garage ---
  function garageUrl(v) {
    return "/amsoil-garage?make=" + encodeURIComponent(v.make) + "&model=" + encodeURIComponent(v.model) +
      (v.year ? "&year=" + encodeURIComponent(v.year) : "");
  }
  function renderGarage() {
    var box = el("garage");
    box.innerHTML = VEHICLES.length
      ? VEHICLES.map(function (v, i) {
          return '<a class="chip" href="' + garageUrl(v) + '">' + esc(v.make + " " + v.model + (v.year ? " " + v.year : "")) +
            '<span class="x" data-i="' + i + '" title="Remove">✕</span></a>';
        }).join("")
      : '<p class="meta">No vehicles yet — add one below.</p>';
    box.querySelectorAll(".x").forEach(function (x) {
      x.onclick = function (e) {
        e.preventDefault(); e.stopPropagation();
        VEHICLES.splice(parseInt(x.getAttribute("data-i"), 10), 1);
        saveGarage();
      };
    });
  }
  function saveGarage() {
    renderGarage();
    api("client-garage", { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicles: VEHICLES }) })
      .then(function (res) { return res.json(); })
      .then(function (j) {
        if (j.status === "ok") { VEHICLES = j.vehicles; localStorage.setItem(LOCAL_GARAGE, JSON.stringify(VEHICLES)); renderGarage(); }
        else msg("Couldn't save your garage — try again.", "err");
      })
      .catch(function () { msg("Couldn't save your garage — try again.", "err"); });
  }
  function loadGarage() {
    var local = [];
    try { local = JSON.parse(localStorage.getItem(LOCAL_GARAGE) || "[]"); } catch (e) {}
    var init = local.length
      ? api("client-garage", { method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vehicles: local, merge: true }) })
      : api("client-garage");
    init.then(function (res) {
      if (res.status === 401) { signOut(); return null; }
      return res.json();
    }).then(function (j) {
      if (!j) return;
      if (j.status === "ok") { VEHICLES = j.vehicles; localStorage.setItem(LOCAL_GARAGE, JSON.stringify(VEHICLES)); }
      renderGarage();
    });
  }
  // vehicle picker fed by the AMSOIL catalog (same data as /amsoil-garage)
  function initPicker() {
    fetch("/amsoil-garage.json").then(function (r) { return r.json(); }).then(function (cat) {
      CAT = cat;
      var mk = el("v-make");
      Object.keys(cat.vehicles || {}).forEach(function (m) { mk.add(new Option(m, m)); });
      mk.onchange = function () {
        var md = el("v-model"); md.length = 1; md.disabled = !mk.value;
        el("v-year").length = 1; el("v-year").disabled = true;
        if (mk.value) Object.keys(cat.vehicles[mk.value]).forEach(function (m) { md.add(new Option(m, m)); });
      };
      el("v-model").onchange = function () {
        var yr = el("v-year"); yr.length = 1;
        var rows = (CAT.vehicles[mk.value] || {})[el("v-model").value] || [];
        var seen = {};
        rows.forEach(function (r) { if (r.y && !seen[r.y]) { seen[r.y] = 1; yr.add(new Option(r.y, r.y)); } });
        yr.disabled = !el("v-model").value;
      };
    });
  }
  el("v-add").onclick = function () {
    var v = { make: el("v-make").value, model: el("v-model").value, year: el("v-year").value };
    if (!v.make || !v.model) { msg("Pick a make and model first.", "err"); return; }
    msg("");
    var key = (v.make + "|" + v.model + "|" + v.year).toLowerCase();
    var dup = VEHICLES.some(function (s) { return (s.make + "|" + s.model + "|" + (s.year || "")).toLowerCase() === key; });
    if (!dup) { VEHICLES.push(v); saveGarage(); }
  };

  el("signout").onclick = function (e) { e.preventDefault(); signOut(); };

  function boot() {
    show("portal");
    loadCerts();
    loadGarage();
    if (!CAT) initPicker();
  }
  var lt = new URLSearchParams(location.search).get("lt");
  if (lt) exchange(lt);
  else if (tok()) boot();
  else show("login");
})();
</script>
</body>
</html>
```

- [ ] **Step 2: Sanity-check locally**

Run: `node -e "const s=require('fs').readFileSync('site/account.html','utf8'); if(!/noindex/.test(s)) throw new Error('missing noindex'); console.log('ok', s.length)"` (from the repo root)
Expected: `ok <bytes>`.

- [ ] **Step 3: Commit**

```bash
git add site/account.html
git commit -m "feat(client): /account portal page — magic-link login, certificates, My Garage"
```

---

## Task 8: Garage-page sync + footer link

**Files:**
- Modify: `site/amsoil-garage.html`
- Modify: `site/index.html`

Strategy for the garage page: **localStorage stays the read/write cache** so the existing sync code (`savedGarage`/`saveGarage`/`renderMyGarage`, ~lines 252–309) keeps working untouched. When a session token exists we (a) on load, merge any local vehicles into the account (`PUT {merge:true}`) or just GET, write the result back into `localStorage["ty_amsoil_garage"]`, and re-render; (b) on every local save, fire a background PUT.

- [ ] **Step 1: Hook the account into the garage page**

In `site/amsoil-garage.html`, immediately AFTER the existing `function saveGarage(arr) {...}` definition (~line 259), add:

```js
  // --- Account sync (signed-in clients): localStorage is the cache, the account is truth.
  var CLIENT_TOKEN = localStorage.getItem("ty_client_token") || "";
  function pushGarage(arr, merge) {
    if (!CLIENT_TOKEN) return;
    fetch("/.netlify/functions/client-garage", { method: "PUT",
      headers: { "Content-Type": "application/json", "x-client-token": CLIENT_TOKEN },
      body: JSON.stringify(merge ? { vehicles: arr, merge: true } : { vehicles: arr }) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j && j.status === "ok") {
          try { localStorage.setItem(GARAGE_KEY, JSON.stringify(j.vehicles)); } catch (e) {}
          renderMyGarage();
        }
      })
      .catch(function () {});
  }
  if (CLIENT_TOKEN) pushGarage(savedGarage(), true); // absorb this device's garage once, then render truth
```

Then change the body of `saveGarage` from just the localStorage write to also push:

```js
  function saveGarage(arr) {
    try { localStorage.setItem(GARAGE_KEY, JSON.stringify(arr)); } catch (e) {}
    pushGarage(arr, false);
  }
```

(`pushGarage` is hoisted-safe because `saveGarage` only runs on click, after the block above has executed. `renderMyGarage` is defined later in the same IIFE — also fine, `pushGarage` callbacks run async.)

- [ ] **Step 2: Footer link on the homepage**

In `site/index.html` line ~267, extend the `.fcopy` line — after the existing Console anchor, add:

```html
 · <a href="/account" rel="nofollow noopener" style="color:inherit;opacity:.4;text-decoration:none">My Account</a>
```

- [ ] **Step 3: Regenerate SEO artifacts + run the site guards**

Run: `npm run build:seo` then `node --test tests/seo.test.js`
Expected: build succeeds; SEO tests PASS (account.html is not in HEAD_PAGES — deliberate).

- [ ] **Step 4: Commit**

```bash
git add site/amsoil-garage.html site/index.html
git commit -m "feat(client): garage page syncs to the account; My Account footer link"
```

(Include any files build:seo regenerated in the same commit.)

---

## Task 9: Full suite, setup, ship, live verify

- [ ] **Step 1: Full suite**

Run: `npm test`
Expected: ALL tests pass (779 existing + ~24 new).

- [ ] **Step 2: Production setup (automated)**

1. **Session secret** (value never echoed/stored in chat or repo):
```bash
SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")
netlify env:set CLIENT_SESSION_SECRET "$SECRET"
unset SECRET
```
2. **Clients table** via the metadata API (per the `airtable-metadata-api` memory): ask the owner to put an ephemeral **schema-scoped** PAT on the clipboard, then create table `Clients` with fields `Email` (singleLineText, primary), `Name` (singleLineText), `Vehicles` (multilineText), `Created At` (date), `Last Login` (date); write-test with the data token (create+delete one row); tell the owner to revoke the schema token; clear the clipboard.
3. **Force a redeploy** after `env:set` (stale-deploy gotcha — an env change needs a fresh deploy before functions see it): push the ship commit (Step 3) and verify the deploy actually ran.

- [ ] **Step 3: Ship**

Use the `ship` project skill: `npm run build:seo` (already run), `npm test`, confirm `git branch --show-current` = `master`, push, confirm deploy.

- [ ] **Step 4: Live verification (production)**

1. `curl -s -o /dev/null -w "%{http_code}" https://tunedyota.com/account` → 200.
2. `curl -s -o /dev/null -w "%{http_code}" https://tunedyota.com/.netlify/functions/client-certs` → 401 (fail-closed).
3. `curl -s -o /dev/null -w "%{http_code}" https://tunedyota.com/.netlify/functions/client-garage` → 401.
4. Real flow with a test email the owner controls: request link → email arrives → click → portal shows (empty or real certs) → add a vehicle → reload → vehicle persists → open `/amsoil-garage` → same vehicle appears in My Garage.
5. If the owner's own email has completed bookings: certs list shows them; View/download opens the two-page certificate identical to the installer-repository render.
6. Confirm the next cert/AMSOIL email (or a safe test send) carries the `account?lt=` link and that clicking it signs in without typing.

- [ ] **Step 5: Update memories**

Update `.claude/memory/certificate-v2-dashboard-program.md` (sub-project D first half shipped) and `MEMORY.md` hook line; note anything owner-pending.

---

## Owner inputs (tracked)

1. **Ephemeral schema token** for creating the Clients table (clipboard flow, revoke after) — needed at Task 9 Step 2; everything else is automated.
2. Optional later: per-user session revocation and Google sign-in were explicitly deferred; parts fitment (Magnuson + dealer lines) is the flagged future add-on and attaches to the stored `{make, model, year}` vehicle shape.
```
