/* ═══════════════════════════════════════════════════════════════
   OPEN ITEM · Stripe Checkout (server-side) — NOT LIVE YET
   ═══════════════════════════════════════════════════════════════
   This Netlify Function is the "full checkout" path for when the
   Stripe account exists. Until then it returns 503 and the site
   uses the reservation flow (mailto) instead.

   To go live:
   1. Create the Stripe account (see OPEN-ITEMS.md).
   2. In Netlify → Site settings → Environment variables, add:
        STRIPE_SECRET_KEY = sk_live_...
   3. `npm install stripe` (add to package.json dependencies).
   4. Uncomment the implementation below and deploy.
   5. Point the pricing page's checkout at /.netlify/functions/create-checkout
      (or skip this function entirely and use Stripe Payment Links —
      simpler; see window.MAGNUSON_CHECKOUT in /magnuson-catalog.js).

   NOTE: Prices below must be kept in sync with /magnuson-catalog.js.
   Never trust a price sent from the browser.
*/

exports.handler = async function (event) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return { statusCode: 503, body: JSON.stringify({ error: "Checkout not configured yet — call/text (612) 406-7117 or use the reservation flow." }) };
  }

  /* ── Uncomment when Stripe is configured ──────────────────────

  const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

  // Server-side price table (cents) — sync with magnuson-catalog.js
  const PRICES = {
    "01-26-57-107-BL": 829500, "01-26-57-109-BL": 829500, "01-26-57-113-BL": 829500,
    "05-26-57-107-BL": 519500, "01-26-57-123-BL": 839500, "01-19-35-005-BL": 749500,
    "01-90-40-007-BL": 659500, "01-13-40-021-BL": 769500, "01-13-40-023-BL": 769500,
    "05-90-40-011-BL": 649500, "01-90-40-009-BL": 659500, "01-13-34-003-BL": 449500,
    "02-90-45-003-SL": 799500, "31-19-57-215": 129900,
    "01-99-34-101": 150000, "01-99-34-102": 159900, "01-99-34-103-BL": 224900,
    "01-99-34-103-RD": 224900, "01-99-34-104-BL": 279800, "01-99-34-104-RD": 279800,
    "01-99-34-105-BL": 314700, "01-99-34-105-RD": 314700, "01-99-34-106-BL": 384600,
    "01-99-34-106-RD": 384600
  };

  try {
    const { sku, description } = JSON.parse(event.body || "{}");
    if (!PRICES[sku]) return { statusCode: 400, body: JSON.stringify({ error: "Unknown SKU" }) };

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: PRICES[sku],
          product_data: { name: "Magnuson " + sku + (description ? " — " + description : "") }
        },
        quantity: 1
      }],
      shipping_address_collection: { allowed_countries: ["US"] },
      success_url: "https://tunedyota.com/order-confirmed?sku=" + encodeURIComponent(sku),
      cancel_url: "https://tunedyota.com/magnuson-supercharger-pricing"
    });
    return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }

  ────────────────────────────────────────────────────────────── */
};
