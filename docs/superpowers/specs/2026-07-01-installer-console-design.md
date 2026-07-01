# Installer Event Console — design

Date: 2026-07-01
Status: approved (brainstorming) — proceeding to plan + build

A per-installer, mobile web console for event day: a **live roster** (always current, so
day-of walk-ins appear) with **inline close-out** — mark a booking Completed, pick the OTT
Calibration, and the Certificate of Calibration is emailed immediately. Each installer sees
and acts on **only their own** event bookings.

Reuses existing libs: `airtable.js`, `routing.js`, `markets.js`, `slots.js` (`formatSlot`),
`certificate.js` (`buildCertificate`, `certSerial`), `resend.js`, `events-data.js`.

## Auth & scoping (the key requirement)

Each installer (`aaron` / `noah` / `cody`) has their own token. One Netlify env var
**`INSTALLER_TOKENS`** holds a JSON map `{"aaron":"…","noah":"…","cody":"…"}`.

- **`lib/installer-auth.js`** — `resolveInstaller(headers, env)` → the installer **key** whose
  token matches the `x-installer-token` header, else `null`. Fail-closed when the env var is
  unset/unparseable. Constant-ish exact match (no prefix).
- Every read and write is scoped to that key: the roster lists only `Installer = <key>` rows,
  and close-out **re-verifies** the target booking's `Installer === <key>` before writing
  (403 otherwise) — so no installer can touch another's trucks.

## Components

**`netlify/functions/installer-roster.js`** (read). Authenticates, then lists the installer's
bookings from Airtable — `filterByFormula = AND({Installer}="<key>",{Status}!="Cancelled")` —
keeps rows whose `Event Date >= today` (compared in JS; Event Date is ISO text), groups by
event (`City` + `Event Date`), sorts events by date then rows by slot, and returns JSON:
`{ installer, events: [{ city, dateISO, bookings: [{ id, slot, name, vehicle, phone, email, mods, status, calibration }] }] }`.
Live read each call → reflects walk-ins added via the intake form.

**`netlify/functions/installer-closeout.js`** (write). `POST { recordId, action, calibration }`.
Authenticates → fetches the record → **verifies `Installer === key`** (403 `not-yours` else).
- `action: "noshow"` → update `Status = "No-show"`. Returns `{ status: "noshow" }`.
- `action: "complete"` → require `calibration` ∈ the 9 `CAL_OPTIONS`
  (Light / Mild / Medium / Spicy / SS / Light and Mild / Mild and Medium / Medium and Spicy /
  Spicy and SS; else 400 `bad-calibration`). Update `Status="Completed"`,
  `OTT Calibration=<calibration>`, `Calibration Date=<today ISO>`. **Then immediately build +
  send the certificate** (reuse `buildCertificate` + `certSerial`; email `certificate.html`
  to the installer, cc `info@` unless installer is `info@`, from `events@send.tunedyota.events`)
  and set `Certificate Sent = true`. Returns `{ status:"completed", certSent:true }`.
  If the cert send fails, the Completed/calibration update still stands and `Certificate Sent`
  stays false → the existing daily `certificate-dispatch` job resends it (backstop). The
  response reports `certSent:false` so the UI can note "cert will send shortly."

**`site/installer.html`** (page). Mobile, `noindex`, **not** in `HEAD_PAGES`/sitemap. Token
gate (prompt once → `localStorage`, sent as `x-installer-token`). On load, fetches the roster
and renders each event with a table of rows; each row has an **OTT Calibration** `<select>`
(the 9 options), a **Complete** button (disabled until a calibration is chosen), and a
**No-show** button. Completed/no-show rows render in a done state. A link at top jumps to the
intake form for adding a walk-in. A 401 clears the stored token and re-prompts. All server
values rendered via `textContent` (no XSS).

## Data flow (close-out)

installer taps Complete → `POST /installer-closeout {recordId, action:"complete", calibration}`
→ auth + ownership check → Airtable update (Completed + calibration + date) → build cert →
email to installer (cc owner) → set `Certificate Sent` → UI shows "done · cert sent". Any
un-completed booking still rolls into the T+1 rebook sweep; the daily cert job still backstops.

## Testing

- `installer-auth`: token→key match; unknown/blank token → null; unset/garbage env → null (fail-closed).
- `installer-roster`: scopes to Installer=key; excludes Cancelled and past events; groups by
  event; injected `list` (no network).
- `installer-closeout`: 403 when the record's Installer ≠ caller; complete requires a valid
  calibration (400 otherwise); complete updates the right fields + sends a cert + sets
  Certificate Sent; noshow sets Status; cert-send failure still leaves Completed set with
  `certSent:false`. Injected `fetchImpl`/`update`/`send`/`getRecord`.
- Page: static wiring check (`x-installer-token` + the two endpoints referenced), not in sitemap.

## Deploy / setup

Ships via the normal flow (no SEO inputs change; `installer.html` is unlisted). Claude generates
three strong tokens, sets `INSTALLER_TOKENS` via `netlify env:set`, redeploys, smoke-tests
(page 200; roster/closeout 401 without a token), and hands the owner the three passcodes
out-of-band (one per installer), rotatable via `netlify env:set`.

## Out of scope

- No all-events admin/owner super-view (each token is one installer; Aaron's token covers
  Aaron's markets). Can add later.
- No editing of customer details/slots from the console (close-out only: Complete / No-show).
- Adding walk-ins stays in the existing intake form (linked from the console).
