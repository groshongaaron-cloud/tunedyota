# Client Accounts v1 — Design

**Date:** 2026-07-17
**Program:** Certificate v2 / installer-dashboard program — sub-project D (first half: clients as first-class users). Installer identity (the other half of D) is deliberately out of scope.
**Owner requirements:** log in **once** per device and stay signed in (same feel as the installer console — no repeated passcode entry); v1 = certificates + synced My Garage; structure vehicle data so a future per-vehicle **parts** add-on (Magnuson supercharger + other Tuned Yota dealer lines) attaches without a remodel.

## Goal

Customers become first-class users of tunedyota.com (and, automatically, the future Capacitor app): they sign in with a passwordless magic link, see and download every Certificate of Calibration tied to their email, and keep a persistent multi-vehicle **My Garage** (account-backed, replacing the device-local localStorage precursor) that feeds AMSOIL reorders, Preferred Customer conversion, and later service-due reminders and parts fitment.

## Approach chosen

**Magic-link (passwordless) login + stateless long-lived signed sessions.** Rejected: password accounts (friction + credential store + reset burden — violates the standing frictionless principle) and managed auth providers (external dependency, cost, user data outside Airtable, poor fit for the static-site + functions stack). Google sign-in can layer onto the same session scheme later if ever wanted.

## 1. Identity & session

- New pure lib `netlify/functions/lib/client-auth.js`, mirroring `installer-auth.js` in shape and spirit.
- **Session token** = stateless HMAC (Node `crypto`, no new deps), signed with new env secret **`CLIENT_SESSION_SECRET`**. Payload: lower-cased email + expiry timestamp. Format: `base64url(payload).base64url(hmac)`.
  - Lifetime **365 days**, and any authenticated endpoint **re-issues a fresh token when the presented one is older than 30 days** (sliding renewal) — a device that visits at least yearly stays signed in forever.
  - Stored client-side in `localStorage["ty_client_token"]`; sent as **`x-client-token`** header on every call.
  - Signature verification uses the existing `secretEquals` constant-time compare (`lib/secrets.js`).
  - Revocation = rotate `CLIENT_SESSION_SECRET` (invalidates all sessions; same model as installer passcode rotation). No per-user revocation in v1 — acceptable for cert-viewing + garage scope.
- **Login (magic-link) token** = same scheme, distinct type tag in the payload (`t:"login"` vs `t:"session"`), expiry **30 minutes** (email links) or **7 days** (links embedded in certificate / AMSOIL follow-up emails — that email is already the trust channel).
- Lib API: `signSession(email, now, env)`, `verifySession(token, now, env)` → `{email}` or `null`, `signLogin(email, ttlMs, now, env)`, `verifyLogin(token, now, env)`, `resolveClient(headers, now, env)` → `{email, renewedToken?}` or `null`. All fail-closed when the secret is unset.

## 2. Login flow

New function `netlify/functions/client-auth.js` (POST, JSON body, `action` field):

- **`request`** `{email}` → validates shape, emails a sign-in link via Resend (existing `lib/resend.js`, FROM the existing send domain): `https://tunedyota.com/account?lt=<30-min login token>`. Response is **always `{status:"sent"}`** for a well-formed email (no account enumeration). **Any email may request a link** — a prospect gets an empty cert list and a working garage (deliberate: feeds the AMSOIL funnel). Best-effort abuse damping: per-invocation in-memory throttle + neutral copy; Resend failure returns an honest `{status:"error", error:"send-failed"}`.
- **`exchange`** `{token}` → `verifyLogin`; on success **upserts the Clients row** (auto-create on first login — no signup form), stamps `Last Login`, and returns `{status:"ok", token:<session>, email, name, vehicles}`. Invalid/expired → 401 `{error:"bad-link"}` (page offers to send a fresh one).

**Zero-typing first login:** `installer-closeout.js`, `certificate-dispatch.js`, and `lib/amsoil-email.js` add a "View your certificates & garage anytime" link carrying a 7-day login token for the recipient's email. First click → signed in, no typing. (Cert page-2 HTML links to plain `/account` — the printed/attached cert must not embed a login token.)

## 3. Data

New Airtable **Clients** table, created **programmatically via the metadata-API schema-token flow** (per `airtable-metadata-api` memory — no manual column adds):

| Column | Type | Notes |
|---|---|---|
| `Email` | single line text (primary) | lower-cased key |
| `Name` | single line text | best-effort, from first matched booking or garage add |
| `Vehicles` | long text | JSON array (below) |
| `Created At` | date | first login |
| `Last Login` | date | stamped on exchange |

`Vehicles` JSON entries: `{make, model, year, addedAt}` — the same make/model/year shape the AMSOIL catalog (`amsoil-garage.json`) and Magnuson catalog key on, so **future parts fitment attaches to these records without a remodel** (future add-on, explicitly not built now).

Certificates are **not duplicated** into Clients: they resolve live by matching the session email against completed Bookings (existing `Email` column), reusing the deterministic cert re-render that powers the installer repository (`lib/certificate.js` + `resolveFluids` + `qrSvg`).

## 4. Endpoints

- **`netlify/functions/client-certs.js`** (GET, `x-client-token`):
  - list mode → completed bookings where `Email` matches the session email (case-insensitive; Airtable filter built with the existing `escapeFormula`): `[{recordId, name, vehicle, modelYear, calibration, calibrationDate, certIssued}]`.
  - `?recordId=` → re-renders that booking's certificate HTML; **ownership = the booking's `Email` equals the session email**, else 403 `not-yours`. Render path shared with `installer-certificate.js` (extract/reuse its render core rather than copy it).
- **`netlify/functions/client-garage.js`** (`x-client-token`): GET → `{vehicles}`; PUT `{vehicles}` → validates shape (array of `{make, model, year}`, bounded length ≤ 20, strings capped), writes `Vehicles` JSON. 401 without a session; Airtable failure → retryable `{error:"store-unavailable"}`.
- Both endpoints return a `renewedToken` field when the sliding renewal fires; the client swaps localStorage.

## 5. Frontend

- **New `site/account.html`** — brand chrome from `site.css`; interaction patterns copied from `installer.html` (token in localStorage, authed `fetch`, blob-open for cert HTML):
  - signed-out: single email field → "Check your email — we sent you a sign-in link."
  - landing with `?lt=` → exchange → store token → clean the URL.
  - signed-in: **My certificates** (cards: vehicle, date, calibration; View/download via authed fetch → blob open — a plain link can't send the header) + **My Garage** (vehicle chips; add-vehicle picker fed from `amsoil-garage.json` makes/models/years; each chip links to `/amsoil-garage?make=&model=&year=`) + sign out (clears token).
- **`site/amsoil-garage.html`** upgrade: when `ty_client_token` exists, My Garage reads/writes the account via `client-garage` instead of localStorage; **on first authenticated visit, device-local `ty_amsoil_garage` vehicles merge into the account** (union by `make|model|year`, then localStorage cleared) — nothing a client saved is lost. Signed-out behavior unchanged (localStorage precursor stays).
- **Discoverability:** subtle "My Account" footer link (same treatment as the existing Console link), plus the email links from §2. Cert page-2 gains a plain `/account` mention.

## 6. Errors & abuse

- Expired/invalid magic link → friendly inline "That link expired — enter your email and we'll send a fresh one" (never a dead end).
- Expired/invalid session → clear `ty_client_token`, show the email form (mirror of the console's 401 → re-login).
- No account enumeration anywhere; `request` always claims success for well-formed emails (except honest send-failure).
- All new endpoints fail-closed on missing secret/env (same posture as `book-background.js`).
- Garage PUT is last-write-wins (single user, low contention — acceptable v1).

## 7. Testing & ship

- TDD throughout (`node --test`, `node:assert/strict`, injected deps per repo convention):
  - `tests/client-auth.test.js` — sign/verify round-trip, expiry, tamper, type confusion (login token ≠ session token), unset-secret fail-closed, sliding renewal boundary.
  - `tests/client-auth-fn.test.js` — request sends a link email (URL shape, 30-min token), enumeration-safe response, exchange upserts + returns session, bad-link 401.
  - `tests/client-certs.test.js` — list scoped to session email only (cross-email leak test), case-insensitive match, recordId ownership 403, render parity with the installer repository render.
  - `tests/client-garage.test.js` — get/put round-trip, shape validation/caps, merge-union logic (pure helper).
  - Email-link additions covered in the existing closeout/dispatch/amsoil-email test files.
- **Setup (automated, no owner steps planned):** generate `CLIENT_SESSION_SECRET` locally → `netlify env:set` (value never in chat/repo) + forced redeploy (per the stale-deploy gotcha); create the Clients table via an ephemeral schema token (clipboard flow).
- Ship per the `ship` skill: `npm run build:seo` if site HTML changed, full `npm test`, master-branch check (shared-folder rule), push, live verification: request → email → exchange → certs list → cert render → garage save/merge, on production.

## Out of scope (tracked)

- Per-vehicle **parts fitment** (Magnuson supercharger + future dealer lines) — the flagged future add-on; enabled by the Vehicles shape, not built.
- Bookings/appointment history and profile/preference editing (v2 candidates).
- **Installer identity** (other half of sub-project D).
- Per-user session revocation; Google sign-in.
- App-native touches — `/account` rides into the Capacitor app automatically once bundled (app inherits web/server updates; no fork).
