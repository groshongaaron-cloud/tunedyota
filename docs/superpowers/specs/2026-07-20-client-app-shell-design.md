# Client App Shell (Garage-led) — Design

**Date:** 2026-07-20
**Program:** Tuned Yota app program — the phase that turns the store app from installer-only into a **client-first app**. Approved by Aaron 2026-07-20 (brainstorm w/ visual mockups in `.superpowers/brainstorm/381-1784571649/`).
**Owner decisions this spec encodes:** one app, client-first, garage-led navigation; installers sign in inside the same app for their dashboard; **build the installer chat inbox now** (SMS relay stays as fallback); the Garage is a **tailored per-vehicle upgrade hub** with a supplier-pluggable product-line architecture — future profit centers (suspension, tires, wheels/offsets, lighting, …) onboard as data, not redesigns.
**Standing directive (applies throughout):** no barriers to purchase, Apple Pay/Google Pay one-tap as the end state, minimal fields, deep links straight to product, world-class design.

## Goal

A customer downloads Tuned Yota from the App Store / Play Store and lands in **their garage**: pick year/model with zero sign-up, see the certificate/fluids/upgrades that fit *their* truck, buy Magnuson in-app (Converge), reserve AMSOIL compliantly, book an install, and chat — while installers sign in to the same app for the console, now including an in-app chat inbox.

## 1. Shape & the no-fork rule

- New **`site/app.html`** — the client app shell. `app/scripts/sync-web.mjs` changes: `app.html` → `app/www/index.html`; `installer.html`, `book.html`, and the shared assets/catalogs bundle alongside. Web stays canonical; the shell is reachable at `/app` on the web for testing (noindex); Capgo OTA ships shell changes without store resubmission.
- Single-page shell, vanilla JS (repo idiom), four tabs: **Garage · Shop · Book · Chat**, hash routing (`#garage`, `#vehicle/<i>`, `#shop`, `#shop/<lineId>`, `#book`, `#chat`). Header: brand + settings sheet (sign in/out, notifications later, **Installer sign-in**, privacy/terms).
- Composed from the shared modules that exist: `site.css` (brand tokens), `amsoil-garage-render.js`, `magnuson-catalog.js`, `payment-checkout.js`, `chat.js`, `vehicles.json` / `amsoil-garage.json`. Shell-specific logic lives in **`site/app-shell.js`** with pure, testable functions (router, view state, fitment calls).

## 2. First run & identity — zero barriers

- No login wall. First open: **"What do you drive?"** → year + model picker (data from the existing catalogs) → garage exists immediately, stored in the SAME localStorage key the web guest garage uses (`ty_amsoil_garage`), so web↔app behavior is identical and the existing account merge-union logic applies unchanged.
- Sign-in is offered, never required: existing magic-link flow (`client-auth.js`, `ty_client_token`, sliding renewal). Signing in syncs the garage (`client-garage`) and lights up certificates (`client-certs`). Copy on first run: "Already tuned with us? Certificates appear when you sign in — one tap from your email, no password."

## 3. Garage tab — the tailored vehicle hub

Each vehicle page renders **sections from the product-line registry** (§4), plus:

- **Certificate of Calibration** — signed-in: list/view/download via `client-certs` (blob-open, header auth — unchanged). Signed-out: a quiet "sign in to see your certificates" row.
- **Fluids — AMSOIL** — the vehicle's kit via the existing garage renderer; CTA = **Reserve** (existing `amsoil-reserve` flow) + referral links. Never direct checkout (dealer policy G-4000 §7.6; see `docs/operations/online-payments-go-live.md`).
- **Power — Magnuson** — items whose fitment matches the vehicle; CTA = in-app purchase (§6).
- **More for this truck** — the forward slot: renders any future registry lines matching the vehicle; until suppliers onboard, a tasteful "lines added as suppliers onboard" placeholder (no dead-feeling empty state).
- Add/remove vehicles mirrors the web garage (≤ 20, same shape `{make, model, year}` — the shape the client-accounts spec committed to for exactly this purpose).

## 4. Product-line registry — pluggable profit centers

New **`site/product-lines.js`**: an ordered list of line adapters, each declaring:

```js
{ id, label, icon, checkout: 'converge' | 'reserve' | 'referral',
  itemsFor(vehicle) -> [{ sku, name, blurb, price?, url? }] }
```

- **v1 lines:** `magnuson` (checkout `converge`; items and prices sourced from `magnuson-catalog.js` — single price source; server-side `lib/magnuson-prices.js` parity stands) and `amsoil` (checkout `reserve` + referral; items from `amsoil-garage.json`).
- Fitment keys on `{make, model, year}` (trim-level fitment is a future refinement, out of scope).
- **Onboarding a new supplier = adding one adapter + its data file.** The checkout mode is enforced structurally — a line can only render the CTAs its mode allows, which is how compliance boundaries (AMSOIL) stay unbreakable by construction.
- Both Garage vehicle pages (§3) and the Shop tab (§5) render from this registry — one source, two presentations.

## 5. Shop tab

- Shelves by product line from the registry. With a garage vehicle selected (default: first vehicle), shelves filter to what fits, with a toggle to view all.
- Deep-link target: `#shop/<lineId>` and product URLs (§9) land here.

## 6. Payments — Elavon Converge (explicit integration path)

Decision of record (Aaron 2026-07-20): **online payments run through US Bank's Elavon Converge** — not Stripe. The integration is already built server-side and dormant; the app consumes the same seam:

- **Server:** `netlify/functions/create-payment-session.js` mints the Converge Hosted-Payments session token. Amounts come ONLY from `lib/magnuson-prices.js` (client-sent amounts ignored). Returns **503 payments-not-configured** until the four `CONVERGE_*` env vars exist; `CONVERGE_DEMO=true` targets the sandbox.
- **Client (web AND app):** `site/payment-checkout.js` → `TYPayment.startCheckout(sku, handlers)` requests the session and opens the **Converge Lightbox (`PayWithConverge.js`) inside the Capacitor WebView** — card entry stays on Converge's side (lightest PCI burden). The go-live doc's ask #11 (WebView/domain allow-listing) covers the app case.
- **Shell behavior:** Buy CTAs call `startCheckout`; while unconfigured, `onUnavailable` fires and the CTA gracefully falls back to the reservation/contact flow — the app ships now and commerce lights up the day the credentials land, via env vars alone (Capgo/no rebuild needed for activation copy tweaks).
- **Wallets:** Apple Pay / Google Pay one-tap is the directive's end state — **added to the Elavon onboarding ask-list** (gateway-side enablement question; not promised in v1 until Elavon confirms Lightbox wallet support).
- **Still gated (unchanged from the go-live doc):** approval-handling (record transaction in Airtable + Slack notify) is deliberately built only once sandbox payloads exist; physical-goods sales via Converge carry **no Apple/Google 30% cut** (only digital goods trigger IAP) — this is why the Lightbox flow is store-compliant.

## 7. Book & Chat tabs

- **Book:** hosts the existing booking flow — bundled `book.html` in an iframe within the tab (isolated, already mobile-polished, posts to live functions; booking requires network anyway). Tab bar stays persistent.
- **Chat (client):** the existing widget (`chat.js`) rendered full-screen in the tab via a new **container/docked mode option** on `chat.js` (web overlay behavior unchanged). Same AI-first flow, same escalation, same session store.

## 8. Installer side — entrance + chat inbox (new build)

- **Entrance:** settings sheet → "Installer sign-in" navigates the WebView to bundled `installer.html`. Console auth (passcode + Face ID), VIN scan, push — all existing and unchanged; a "back to app" affordance returns to the shell.
- **Chat inbox (new):** a **Chats panel** in the installer console:
  - Session list: escalated sessions assigned to the signed-in installer (plus unassigned), newest activity first, unread indicator.
  - Transcript view + reply box; replies append to the same transcript the SMS relay writes to — **either channel works, one conversation**.
  - **Backend:** extend `netlify/functions/chat.js` with installer-authed operations (`x-installer-token` via existing `installer-auth.js`): list sessions, fetch transcript, `installer-reply` (appends installer turn; client polling picks it up), close session.
  - **Notify:** when a client turn lands on an escalated session, fire web push to the assigned installer (`lib/webpush.js`) in addition to the existing SMS path. SMS relay behavior is untouched (tests must prove the non-chat SMS paths are unchanged).

## 9. Deep links

- Universal links: `site/.well-known/apple-app-site-association` + `assetlinks.json`; Capacitor `@capacitor/app` `appUrlOpen` listener in the shell routes: `/app*` → matching tab, `/account` → Garage, `/magnuson-supercharger-pricing` → `#shop/magnuson`, `/book` → Book. "Want it → bought it" from a post or email. (Native-shell change — lands before store submission anyway.)

## 10. Errors & offline

- Shell views degrade per surface: Garage renders from local data offline; Certificates/Book/Chat show a friendly retry state without network. 401s clear the client token and re-offer magic-link (same posture as `account.html`).
- Chat inbox operations fail-closed without installer auth; all new endpoints fail-closed on missing env (repo posture).

## 11. Testing & ship

TDD per repo convention (`node --test`, `node:assert/strict`, injected deps):

- `tests/product-lines.test.js` — fitment filtering per line, checkout-mode → CTA mapping (AMSOIL can never render a direct-pay CTA), Magnuson registry↔catalog price parity.
- `tests/app-shell.test.js` — router (hash↔view), first-run picker state, guest-garage read/write via the shared key, deep-link route map.
- `tests/chat-installer.test.js` — list scoped to installer + unassigned only, transcript fetch, reply appends + client-visible, auth 401, close; **SMS relay + lead-ingest regression untouched**.
- Existing suites stay green (incl. `create-payment-session` + `payment-checkout`).
- `sync-web.mjs` assembles the new bundle; `npm run sync-web` verified locally.
- Ship: `npm run build:seo` if site HTML changed, full `npm test`, commit, push, live verify `/app` on production web (shell is a website page too — verifiable before any store build).

## Out of scope (tracked)

- **Client push notifications** (chat replies, booking + service reminders) — own phase; needs a client device registry.
- **Supplier lines beyond Magnuson + AMSOIL** — the registry is the enabler; onboarding is a business motion.
- **Converge activation** — Aaron's merchant credentials; then the go-live checklist in `docs/operations/online-payments-go-live.md` (incl. approval-handling build against sandbox).
- **Trim-level fitment** (wheel offsets etc. will want it; year/make/model for now).
- **Task 6 / store submission** — owner RUNBOOK items (Apple, Play, Firebase, Codemagic), unchanged.
- Installer chat inbox on the web console is included by construction (same `installer.html`); a dedicated mobile-native chat UI beyond the console panel is not v1.
