# Online Payments — go-live steps (NOT LIVE · Elavon Payment Gateway)

> **2026-08-03 PIVOT: Converge Hosted Payments → EPG (Elavon Payment Gateway).**
> Elavon's answer to the 403/allowlist saga: EPG supports **domain-based
> whitelisting and requires NO IP whitelisting** — their recommended path for
> serverless hosting like our Netlify Functions. That kills the QuotaGuard /
> static-IP-proxy plan entirely. The integration was ported the same day (see
> the EPG section at the bottom); everything below the pivot line is the
> Converge history, kept for reference. **Current state and go-live steps live
> in the "Status 2026-08-03 — EPG port" section.**

**Decision (Aaron, 2026-07-20): online payments run through US Bank's Elavon
(Converge gateway)** — not Stripe. Online checkout is intentionally not wired: the
pricing page uses the reservation flow (mailto) until the Elavon merchant account
credentials exist.

## Scope (what checkout covers — and what it can't)

- **Magnuson products (kits, tunes, install packages): YES** — direct checkout on
  tunedyota.com and later in the app. This is what the pre-built code sells.
- **AMSOIL products: NO direct checkout — AMSOIL Dealer Policies forbid it.**
  G-4000 §7.6: *"Only AMSOIL INC. may post AMSOIL product pricing online. All
  sales and price inquiries shall be conducted by directing customers to the
  AMSOIL online store…"* (§7.3 and §7.11 reinforce it). A dealer-owned cart
  selling AMSOIL at posted prices risks the dealer agreement — the same class of
  risk as the OTT IP boundary. The **compliant AMSOIL "checkout" has two legs**:
  (1) the referral hand-off — on-site store → amsoil.com under `?zo=30713116`,
  PC path for recurring attribution; (2) **the Reserve flow (shipped 2026-07-20)**
  — the customer builds their kit in the AMSOIL Garage and reserves it with NO
  online payment (`amsoil-reserve` function → lead pipeline → personal
  confirmation, which is the "personal communications" channel §7.6 sanctions);
  payment completes in person via **Elavon card-present** at pickup/install or a
  personal 1:1 invoice. Aaron's business context (2026-07-20): physical location
  holds stock for pickup/delivery, and all posted prices are AMSOIL's full MSRP —
  Aaron holds this pricing display compliant; the §7.6/§7.11 text does not carve
  out MSRP, so written rep confirmation is still the recommended backstop.
- **Tuned Yota app: YES for Magnuson** — the same `create-payment-session`
  function serves the app; the Converge Lightbox opens in a WebView/system
  browser. No separate gateway work expected (see the Elavon ask-list below).

## What to request from US Bank / Elavon (Aaron's onboarding checklist)

Work through these with the Elavon rep — each one unblocks a specific piece:

1. **Converge gateway boarding** — confirm the merchant account is boarded onto
   the **Converge** gateway with **e-commerce / card-not-present** enabled (not
   just an in-person processing MID).
2. **Converge account ID** — the **6-7 digit Converge account ID** (they'll also
   quote a 10-digit Elavon merchant ID; we need the Converge one for the API).
3. **Converge admin login** for you at convergepay.com (to manage users/receipts).
4. **Hosted API User + 64-char PIN** — a Converge user **flagged "Hosted API
   User"** in the Converge UI, and its 64-character PIN. This is the credential
   our server uses; ask the rep to walk you through creating it if it's
   self-serve.
5. **Hosted Payments / Lightbox enablement** — confirm "Hosted Payments Page /
   Lightbox (PayWithConverge)" is enabled on the account.
6. **Demo/sandbox credentials** — a Converge **demo account**
   (api.demo.convergepay.com) so we integration-test before any real card.
7. **Vendor ID** — if they issue one for third-party/hosted integrations.
8. **Card brands** — confirm Visa/MC/Discover/AMEX acceptance as desired
   (AMEX is often a separate enablement + rate).
9. **Fraud controls** — ask that **AVS + CVV rules** are configured; at
   $1,500-$8,395 tickets, also ask about 3-D Secure availability on Converge.
10. **Statement descriptor** — set the customer-facing descriptor to
    "TUNED YOTA" so charges are recognized (fewer chargebacks).
11. **App usage** — confirm the hosted-payments session/Lightbox may be opened
    from a mobile WebView, and whether any domain/referrer allow-listing needs
    tunedyota.com registered.
12. **Apple Pay / Google Pay in the Lightbox** — ask whether Converge Hosted
    Payments supports wallet buttons (Apple Pay / Google Pay) in the Lightbox,
    and what enablement/registration each needs (Apple Pay requires merchant
    domain validation). One-tap wallets are the app's standing no-barrier
    directive — if supported, we want it enabled from day one.

Hand items 2, 4 (ID + PIN), 6, and 7 to the build as Netlify env vars (table
below) — everything else is account configuration on Elavon's side.

History: the original plan was Stripe. The old `netlify/functions/create-checkout.js`
stub (fully commented-out Stripe implementation, returned 503, zero callers) was removed
2026-07-16. Recover it anytime for reference:
`git log --diff-filter=D -- netlify/functions/create-checkout.js` — but the Elavon
build below replaces it, not restores it.

## Integration shape (per developer.elavon.com, checked 2026-07-20)

Two Converge options keep card data entirely off our servers (lightest PCI burden):

1. **Hosted Payment Page (HPP)** — low-code redirect to a Converge-hosted page.
   Simplest; least control over look-and-feel.
2. **Lightbox payment modal** — Converge's `PayWithConverge.js` opens a modal on OUR
   pricing page. Flow: a Netlify function POSTs
   `https://api.convergepay.com/hosted-payments/transaction_token`
   (demo: `api.demo.convergepay.com`) with merchant credentials + `ssl_transaction_type=CCSALE`
   + `ssl_amount` → returns a session token → the page calls
   `PayWithConverge.open({ ssl_txn_auth_token }, callbacks)`. Card entry happens in the
   modal on Converge's side. **Preferred** — same on-site feel as the rest of the funnel.

## Credentials needed (from the Converge dashboard once the account exists)

Set as Netlify env vars — never in the repo:

| Env var | What it is |
|---|---|
| `CONVERGE_MERCHANT_ID` | Converge 6-7 digit **account** ID (NOT the 10-digit Elavon merchant ID) |
| `CONVERGE_USER_ID` | A Converge user **flagged as "Hosted API User"** in the Converge UI |
| `CONVERGE_PIN` | 64-char alphanumeric PIN for that user |
| `CONVERGE_VENDOR_ID` | Vendor ID (if issued) |

Ask Elavon for **demo/sandbox credentials** too — build and test against
`api.demo.convergepay.com` before switching the URL to production.

## Pre-built (2026-07-20) — ready, dormant until credentials

Shipped ahead of the account so go-live is a config change, not a build:

- **`netlify/functions/create-payment-session.js`** — mints the Converge session
  token. Amount comes ONLY from `lib/magnuson-prices.js`, which loads
  `site/magnuson-catalog.js` itself (no second price table to drift; a parity
  test walks every kit). Client-sent amounts are ignored by design. Without the
  Converge env vars it returns **503 payments-not-configured**, so nothing
  changes on the site until the credentials exist. `CONVERGE_DEMO=true` targets
  `api.demo.convergepay.com`.
- **`site/payment-checkout.js`** — `TYPayment.startCheckout(sku, handlers)`:
  requests the session, loads the right `PayWithConverge.js` (demo/prod), opens
  the Lightbox with approval/declined/cancelled/error callbacks;
  `onUnavailable` fires while payments are unconfigured so the pricing page
  keeps its reservation flow.
- Tests: `tests/create-payment-session.test.js` (incl. the price-parity sweep),
  `tests/payment-checkout.test.js`.

## Go-live (when credentials arrive)

1. Set the four `CONVERGE_*` env vars in Netlify **plus `CONVERGE_DEMO=true`**,
   redeploy, and sandbox-test the token mint + Lightbox end-to-end.
2. Wire the pricing page CTA to `TYPayment.startCheckout` (activation map:
   `window.MAGNUSON_CHECKOUT` in `site/magnuson-catalog.js`); on approval,
   record the transaction (Airtable) + Slack notify via `lib/alert.js` — this
   approval-handling piece is deliberately NOT pre-built (needs the real
   approval payload shape from sandbox).
3. Flip `CONVERGE_DEMO` off, run one real card test, done.

**Waiting on:** Elavon enabling Hosted Payments / PayWithConverge on the account
(see status below).

## Status 2026-07-30 — account boarded, creds verified, enablement pending

- Account manually boarded on Converge: **AID 2828441, Internet, USD, settle 9 PM,
  TID 102**. Production credentials only — no demo account issued.
- Two credential pairs **authenticate** against
  `api.convergepay.com/hosted-payments/transaction_token` but return **403**
  (user `8047260701web` and user `apiuser401411`, each with its own 64-char PIN —
  PINs live with Aaron + Netlify env once verified, never in this repo).
  `ADMIN` is Aaron's portal login only, not an API user.
- 403 on both valid pairs ⇒ **Hosted Payments / PayWithConverge feature not
  enabled on the account** (401 = bad creds; 403 = authenticated but forbidden).
  Fix: "Hosted API User" checkbox under Settings → Employees, or an Elavon rep
  request: *enable Hosted Payments / PayWithConverge on AID 2828441, TID 102*.
- Aaron wrote Converge support 2026-07-30 (no "Hosted API User" checkbox visible
  in his portal, so enablement is on Elavon's side).
- **Approval recording + CTA wiring prebuilt 2026-07-30** (the "wait for the
  sandbox payload" plan died with the no-demo-account reality — built defensively
  instead): `netlify/functions/record-payment.js` (Slack alert always — flags
  amount-mismatch vs catalog and says *verify in Converge before fulfillment*
  since the browser report is unauthenticated; buyer → lead pipeline as source
  `magnuson-purchase` when contact info exists), `TYPayment.reportApproval`,
  pricing-page CTA wired via `MAGNUSON_CHECKOUT = { "*": true }` with
  onUnavailable falling back to the reservation flow. Tests green (1387).
- Next after a token mints: set `CONVERGE_*` Netlify env vars (no
  `CONVERGE_DEMO` — production only) with the pair that mints, redeploy, retest,
  one real-card test (verify Slack alert + lead + Converge record) + refund/void
  in Converge. Aaron may rotate the PIN after go-live (it transited chat during
  setup).

---

## Status 2026-08-03 — EPG port (CURRENT)

Elavon (via Angel/Matthew) redirected the integration from Converge Hosted
Payments to **EPG — Elavon Payment Gateway**: EPG does not require IP
whitelisting (best for cloud/serverless providers) and whitelists by domain
instead. The Converge 403 dead-end and the static-IP proxy plan are both moot.

### How EPG maps onto what we had

| Converge (dead) | EPG (current code) |
|---|---|
| POST `hosted-payments/transaction_token` (form-encoded, merchant/user/PIN) | POST `/orders` then `/payment-sessions` (JSON, Basic auth `merchantAlias:secretKey`) |
| IP allowlist on the token call (the 403 blocker) | **No IP allowlist**; `originUrl` on each payment session is the domain whitelist |
| `PayWithConverge.js` → `PayWithConverge.open({ssl_txn_auth_token})` | Lightbox library → `new ElavonLightbox({sessionId, onReady, messageHandler})` |
| `onApproval`/`onDeclined`/`onCancelled` callbacks | `MessageTypes`: `transactionCreated` (+`isAuthorized`), `closeOverlay`, `error` |
| No demo account issued | **Real self-serve sandbox**: `api.sandbox.elavonpayments.com` + sandbox merchant portal |

Docs: developer.elavon.com → Elavon Payment Gateway v1 (hosted-payments-overview,
lightbox-sdk, sending-api-requests, messagehandler-function-lightbox).

### Ported 2026-08-03 (tests green, dormant until env vars)

- `netlify/functions/create-payment-session.js` — creates the EPG order (amount
  ONLY from `lib/magnuson-prices.js`, client price ignored) + lightbox payment
  session. 503 `payments-not-configured` without env vars, so the site keeps
  the reservation flow untouched.
- `site/payment-checkout.js` — same `TYPayment` public API (`startCheckout`,
  `reportApproval`, `onUnavailable` fallback, GA4 events); loads the EPG
  lightbox client and maps messages to the existing handler shape. Pricing page
  + app callers unchanged.
- `netlify/functions/record-payment.js` — reads the EPG approval shape
  (`{sessionId, authorized, transaction}`); Slack alert says "verify in the EPG
  portal". Contact for the lead pipeline now comes only from page-level capture
  (the EPG modal keeps cardholder data on Elavon's side).
- Tests: `tests/create-payment-session.test.js`, `tests/payment-checkout.test.js`,
  `tests/record-payment.test.js` (incl. the price-parity sweep).

### Env vars (Netlify, production context, never in the repo)

| Env var | What it is |
|---|---|
| `EPG_MERCHANT_ALIAS` | EPG merchant alias (Basic-auth username) |
| `EPG_SECRET_KEY` | EPG secret key (Basic-auth password) |
| `EPG_SANDBOX` | `true` → sandbox API + sandbox lightbox client |
| `EPG_API_URL` | Optional base-URL override (see open questions) |
| `EPG_ORIGIN_URL` | Optional originUrl override; defaults to `https://tunedyota.com` |

### Open questions for Elavon (Angel) — ask at the working session

1. **Production API base URL.** Sandbox is documented
   (`api.sandbox.elavonpayments.com`); the code defaults production to
   `api.na.elavonpayments.com` (mirrors the documented prod lightbox host
   `hpp.na.elavonpayments.com`) — confirm, or set `EPG_API_URL`.
2. **Production boarding + credentials.** Does AID 2828441 carry over to EPG or
   is it a new boarding? We need the production merchant alias + secret key.
   (Sandbox keys are self-serve via a developer-portal project.)
3. **Order `customReference`/metadata** — best field to carry the SKU so it
   shows in the EPG portal (kept out of the minimal port; verify in sandbox).
4. **App WebView origin.** The native app opens checkout in a WebView — what
   `originUrl` should sessions minted for the app carry (wildcard support?).
5. **Wallets.** Apple Pay / Google Pay availability in the EPG lightbox
   (standing no-barrier directive for the app) and what enablement each needs.
6. **Website compliance review** — does the websitereview@elavon.com thread
   (account 8047260701) follow the merchant to EPG, and can they review the
   live lightbox once sandbox→prod creds land?

### Sandbox E2E VERIFIED 2026-08-04 ✅

Aaron created the developer account + project; sandbox keys live in
`~\.secrets\elavon-developer-portal.txt` (sandbox-only, no real money). A full
checkout ran end-to-end through the REAL code paths (createSession +
payment-checkout.js) via a local Playwright harness
(`~\.tunedyota\elavon-signup\`): session mint → lightbox → 3-D Secure
(frictionless) → Visa test card 4546341111111119 → **captured** transaction
(API-verified, invoice = SKU) → `onApproval` fired with the transaction payload.

Three integration facts the docs get wrong or omit (all now pinned by tests):

1. **Lightbox client is `client/library.js`, NOT `client/index.js`** —
   index.js is the HPP's own bundle and never defines `window.ElavonLightbox`.
2. **`doCreateTransaction` defaults to FALSE** on `/payment-sessions` —
   without `doCreateTransaction: true` (+ `doCapture: true`) the modal shows
   "Thank you for your payment" but only tokenizes a card; NO transaction
   exists. The session also carries `customReference` + `invoiceNumber` (we
   send the SKU in both).
3. **`isAuthorized` lives INSIDE `message.transaction`** in the live lightbox
   library, not top-level as the quickstart shows. The client accepts either.
   The transaction payload carries `card.holderName`, `card.last4`,
   `shopperEmailAddress`, `authorizationCode` — record-payment uses them for
   the Slack alert + lead fallback.

### Go-live (when EPG PRODUCTION credentials arrive)

1. Set `EPG_MERCHANT_ALIAS` + `EPG_SECRET_KEY` (production) in Netlify
   (`--secret --context production`), NO `EPG_SANDBOX`. Confirm the prod API
   base with Elavon first (question 1) — set `EPG_API_URL` if it isn't
   `api.na.elavonpayments.com`.
2. Redeploy; the pricing-page CTA flips from reservation to checkout
   automatically (MAGNUSON_CHECKOUT is already armed).
3. One real-card test (verify Slack alert + lead + captured transaction in the
   EPG portal), then refund it in the portal. Rotate the secret key if it ever
   transited chat.
