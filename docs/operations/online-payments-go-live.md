# Online Payments — go-live steps (NOT LIVE · Elavon Converge)

**Decision (Aaron, 2026-07-20): online payments run through US Bank's Elavon
(Converge gateway)** — not Stripe. Online checkout is intentionally not wired: the
pricing page uses the reservation flow (mailto) until the Elavon merchant account
credentials exist.

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
