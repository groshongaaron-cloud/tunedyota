# Online Payments — go-live steps (NOT LIVE · Elavon Converge)

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

**Waiting on:** Aaron to open the Elavon/Converge merchant account and provide
the four credentials above (+ demo creds).
