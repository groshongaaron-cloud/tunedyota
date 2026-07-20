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

## Build plan (when credentials arrive)

1. `netlify/functions/create-payment-session.js` — validates the SKU against
   `magnuson-catalog.js` server-side, POSTs Converge for the session token, returns it.
   **Never trust a price sent from the browser** — the amount comes from the server-side
   catalog only; add a parity test between the function's price source and
   `magnuson-catalog.js`.
2. Pricing page: load `PayWithConverge.js`, wire the checkout button →
   fetch session token → `PayWithConverge.open` with approval/declined/cancelled/error
   callbacks; on approval, record the transaction (Airtable Bookings/Orders) + Slack
   notify via `lib/alert.js`.
3. Tests: session-function unit tests (mocked fetch), price-parity test, callback
   handling in a pure page module (same pattern as `amsoil-garage-render.js`).
4. Go-live: swap demo URL → `api.convergepay.com`, real card test, then point the
   pricing page's reservation CTA at the checkout.

**Waiting on:** Aaron to open the Elavon/Converge merchant account and provide the
four credentials above (+ demo creds). Everything else is buildable the same day.
