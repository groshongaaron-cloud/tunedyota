---
name: client-accounts-program
description: Client Accounts v1 (sub-project D first half) — magic-link login, /account portal (certs + synced My Garage) — code SHIPPED LIVE 2026-07-17; Clients table CREATED + write-tested 2026-07-17; only live E2E pending owner
metadata:
  node_type: memory
  type: project
---

**Client Accounts v1 — CODE SHIPPED LIVE 2026-07-17** (master @ e4f2f33, 11 feature commits from 02aafe1, 812 tests green, subagent-driven, all tasks two-stage reviewed + final review READY). First half of [[certificate-v2-dashboard-program]] sub-project D (clients as first-class users). Spec/plan: `docs/superpowers/{specs,plans}/2026-07-17-client-accounts*`.

**What it is.** Passwordless client portal at **`/account`** (noindex; subtle "My Account" footer link on the homepage next to Console): client enters email → magic link via Resend → session. **Log in once per device**: stateless HMAC session tokens (`lib/client-auth.js`, signed with Netlify env **`CLIENT_SESSION_SECRET`** — set 2026-07-17, 43-char base64url), 365-day TTL with 30-day sliding renewal (`x-renewed-token` response header, which the frontend reads; JSON bodies also carry `renewedToken`). Token in `localStorage['ty_client_token']` → `x-client-token` header (mirrors the installer-console pattern). Login tokens are type-tagged (`t:"login"` vs `"session"`, no confusion), 30-min from the login form, **7-day when embedded in cert/AMSOIL emails** (`accountLink()` — the email IS the trust channel; falls back to plain /account when the secret's unset). **The certificate HTML itself NEVER carries a token** (printed/forwarded; page-2 fine print mentions plain tunedyota.com/account — test-guarded).

**Endpoints** (all fail-closed 401 without session): `client-auth` (request/exchange; request is enumeration-safe — always "sent"; ACCEPTED RISK: unthrottled → could mail a victim sign-in links, noted in the file header; exchange auto-creates the Clients row, no signup form, and swallows Airtable errors so login never breaks), `client-certs` (list = completed Bookings matched by `LOWER({Email})`, minimal field projection — no VIN/installer leak; `?recordId=` re-renders the cert via shared `lib/cert-render.js`, extracted from installer-certificate.js so installer + client renders stay byte-identical; ownership = booking Email == session email → else 403), `client-garage` (GET/PUT vehicles JSON, `mergeVehicles` unions by make|model|year, caps 20 vehicles/40-char fields; `merge:true` absorbs a device's localStorage garage on first login; KNOWN v1 LIMITATION, commented: concurrent first-logins can duplicate Clients rows — findRow uses rows[0]).

**Frontend:** `site/account.html` (certs cards w/ authed blob-open view/download; garage chips → prefilled /amsoil-garage; add-vehicle picker fed from amsoil-garage.json; 401 anywhere → sign out → login form). `site/amsoil-garage.html` now syncs: localStorage `ty_amsoil_garage` stays the cache, signed-in visits PUT-merge then mirror server truth; signed-out behavior unchanged. Vehicles keep the `{make, model, year}` shape → **owner-flagged FUTURE ADD-ON: per-vehicle PARTS fitment (Magnuson supercharger + future dealer lines) attaches to these records** — do not remodel.

**Emails:** closeout + certificate-dispatch customer text and the AMSOIL follow-up (html + text) all carry a 7-day pre-authenticated account link → first click = signed in, zero typing.

**⚠ REMAINING:**
1. ✅ **Airtable `Clients` table CREATED 2026-07-17** (id `tblyy4a00RlgHvXwB`, schema-token clipboard flow): `Email` (primary) / `Name` / `Vehicles` (long text) / `Created At` / `Last Login` (dates, iso). Production data-token write-test passed (probe create+delete 200). Persistence fully live.
2. **Live E2E (owner)** — request → email arrives → click link → portal → certs list (owner's email has completed bookings) → add vehicle → reload persists → /amsoil-garage shows the same garage; confirm the next cert/AMSOIL email carries `account?lt=` and clicking it signs in.

**Deferred (design-noted, not built):** installer identity (other half of D), bookings/history + profile editing, per-user session revocation (rotate `CLIENT_SESSION_SECRET` to revoke ALL), Google sign-in, request-endpoint rate limit.
