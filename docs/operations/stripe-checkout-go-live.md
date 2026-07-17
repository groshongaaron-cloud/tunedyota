# Stripe Checkout — go-live steps (NOT LIVE)

Online checkout is intentionally not wired: the pricing page uses the
reservation flow (mailto) until the Stripe account exists. The old
`netlify/functions/create-checkout.js` stub (fully commented-out
implementation, returned 503, zero callers) was removed 2026-07-16 to stop
its embedded price table drifting from `magnuson-catalog.js`. Recover it
anytime: `git log --diff-filter=D -- netlify/functions/create-checkout.js`.

## To go live

1. Create the Stripe account.
2. **Preferred (simpler): Stripe Payment Links** — create one per SKU and set
   `window.MAGNUSON_CHECKOUT` in `site/magnuson-catalog.js`; no server code needed.
3. Server-side Checkout (only if Payment Links won't do):
   - Netlify → Site settings → Environment variables: `STRIPE_SECRET_KEY = sk_live_...`
   - `npm install stripe` (add to package.json dependencies).
   - Restore `create-checkout.js` from git history and uncomment the implementation.
   - Point the pricing page's checkout at `/.netlify/functions/create-checkout`.

**Never trust a price sent from the browser** — prices must come from
`magnuson-catalog.js` / the server-side catalog, and any restored function's
price table must be kept in sync with it (add a parity test when restoring).
