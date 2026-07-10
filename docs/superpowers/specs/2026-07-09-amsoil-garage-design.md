# Tuned Yota × AMSOIL Garage — Design Spec

**Date:** 2026-07-09
**Status:** Approved (Phase 1 design); Phases 2–4 captured as north-star
**Dealer referral number (ZO):** `30713116` (stored as config `AMSOIL_ZO`, never hardcoded)

---

## 1. Vision & business model

Tuned Yota is an authorized AMSOIL dealer. This project turns tunedyota.com (and, later, the
Capacitor app) into a branded AMSOIL storefront + service-intelligence tool for the Toyota/Lexus
platforms Tuned Yota already supports.

**The money model is a conversion funnel, not just a store:**

1. **Retail buyers (today):** every visitor can buy AMSOIL at retail through a Tuned-Yota-branded
   experience. The order completes on amsoil.com with `?zo=30713116` attached, which pays Tuned
   Yota a commission. Attribution persists on the visitor's device for 30 days.
2. **Preferred Customer / Dealer conversions (the jackpot):** the experience actively pushes visitors
   to enroll as a Preferred Customer (save ~25%) or Dealer. Once they enroll under the referral
   number they are **permanently associated with Tuned Yota's dealer account** and buy under it
   forever, hands-off. After enrollment they get their own AMSOIL portal and Tuned Yota's active job
   is done — the relationship keeps earning.

**Hard constraint (confirmed via AMSOIL docs):** AMSOIL does not expose an ordering/payment API and
does not permit taking AMSOIL payment on a third-party site. All online orders complete on
amsoil.com. "Order from our site/app" = a fully branded Tuned Yota experience whose checkout hands
off to amsoil.com with the referral number attached. Tuned Yota owns the experience, audience, and
service intelligence; AMSOIL owns the cart. Upside: zero inventory, zero payment liability, pure
margin.

Sources:
- Referral link format & 30-day attribution: https://accountdirect.lube-direct.com/2018/04/19/amsoil-dealer-transferring-links/
- Preferred Customer program: https://www.amsoil.com/offers/pc/
- Become a Dealer: https://www.amsoil.com/lander/join/

---

## 2. Phased roadmap

Four independently shippable phases. **Phase 1 is specified in detail below; Phases 2–4 are the
north-star** and shape Phase 1's data model so nothing boxes them out.

| Phase | Scope | Notes |
|-------|-------|-------|
| **1** | Garage v1 — no login. Vehicle-specific fluids + retail ordering + conversion CTAs. | Earns commission on day one. This spec. |
| **2** | Client accounts + persistent multi-vehicle "My Garage". | New subsystem; auth must work on web + app. |
| **3** | Mileage tracking + service-due reminders (email on web, push in app) → "order now" from the reminder. | Recurring-revenue engine. |
| **4** | App parity (Capacitor) + Preferred-Customer share/growth loop + launch email to the 4-year client list. | Launch email can actually fire once Phase 1 is live. |

---

## 3. Phase 1 — detailed design

### 3.1 Scope decisions (locked)

- **Depth:** full depth per vehicle — engine oil + filter, front diff, rear diff, transmission,
  transfer case, plus coolant / grease / brake / power-steering where applicable.
- **Lineup:** only Tuned Yota's supported Toyota/Lexus platforms (~13), keyed to the same platform
  identifiers the existing vehicle pages use. Curated and exact, not a universal lookup.
- **Full catalog escape hatch:** a "Browse the full AMSOIL catalog" link (web + app) deep-linking to
  amsoil.com with the referral attached, for anything outside the curated garage.
- **Pricing:** retail only (all purchasers are treated as retail buyers). No PC/wholesale price is
  displayed. Prices live in the catalog file with a `priceVerifiedAt` date and are kept current by
  the price-sync agent (§3.5).
- **Look & feel:** Hybrid ("Direction C"). Tuned Yota's warm brand frames the page (tokens from
  `site/site.css`); the product cards use AMSOIL-authentic presentation (real bottle shots, product
  identity). Co-branded "Authorized AMSOIL Dealer."
- **Data trust:** the vehicle→fluid dataset is compiled as a draft (products from AMSOIL's product-
  application guide, capacities from Toyota/Lexus factory specs, intervals from AMSOIL's published
  drain intervals with a severe/tuned-service adjustment) and **verified by the owner/installers
  before launch**. Nothing publishes unverified. Same "owner is source of truth" pattern as the
  Magnuson catalog.

### 3.2 Components

Each is independently understandable and testable.

**A. Garage data catalog** — a versioned repo module (pattern: `site/magnuson-catalog.js`). Two
tables:

- **Products**, keyed by AMSOIL SKU/product code:
  `{ sku, name, productPath, image, retailPrice, salePrice|null, priceVerifiedAt }`
  (`productPath` is the amsoil.com path; the `?zo=` is added at render time by the link helper.)
- **Vehicles**, keyed by the existing platform key: each maps to an ordered list of fluid **systems**:
  `{ system, sku, capacityQt, factoryInterval, tunedInterval, notes? }`
  and an optional **bundle** definition: the recommended full-service set of SKUs for that vehicle.

Data model is intentionally forward-compatible with Phase 2/3 (a vehicle instance in a client's My
Garage will reference the same platform key; a mileage record will compare against `tunedInterval`).

**B. Garage page** — `site/amsoil-garage.html`, hybrid look. Behavior:
- **Vehicle resolution:** (1) a URL param (e.g. `?v=<platformKey>&y=<year>`) so booking-confirmation
  emails/links land pre-loaded; (2) a `year → model → engine` picker; (3) last selection remembered
  in `localStorage`. No login in Phase 1.
- **Render:** fluid cards (system, AMSOIL product w/ bottle shot, capacity, tuned interval, retail
  price). Per-item **Order** button. A recommended **bundle** ("full service kit for your truck") that
  lists every item with a running retail total and a guided add-to-cart flow (see §3.4 — no one-click
  multi-item cart).
- **Conversion band:** prominent, first-class — "Buy retail now, or save ~25% forever as a Preferred
  Customer / earn as a Dealer," each a referral-attached enroll link.
- **Full-catalog link.**
- Standard Tuned Yota nav/footer from `site/site.css`; FAQ + trust/E-E-A-T section consistent with
  the rest of the site; schema markup as appropriate.

**C. Referral link helper** — one small pure function used everywhere:
`amsoilUrl(path, zo)` → appends `?zo=<zo>` or `&zo=<zo>` correctly depending on whether `path`
already contains `?`. `zo` sourced from config `AMSOIL_ZO`. Used by product Order buttons, the
bundle items, the full-catalog link, and the PC/Dealer conversion CTAs. Single choke point = single
place to test and to rotate the number.

**D. Price-sync agent** — a scheduled Node job (pattern: the local search-visibility engine / cloud
routines). Weekly:
1. For each SKU in the catalog, fetch its amsoil.com product page (polite: robots-respecting, cached,
   low frequency).
2. Parse current **retail + sale** price.
3. Compare to catalog. On change **within ±40%**: update `retailPrice`/`salePrice` + `priceVerifiedAt`,
   commit, push → Netlify redeploy → propagates to web **and** app (Capacitor reads the same catalog,
   so no App Store resubmission). Post the diff to Slack.
4. Change **outside ±40%** (likely a parse error): do **not** apply — hold and Slack-alert the owner
   for a manual OK. Guardrail ensures a scraper glitch can never push a garbage price live.

### 3.3 Data flow (per order)

```
Client lands (booking link w/ vehicle  OR  picks vehicle)
  → page loads catalog, renders that vehicle's fluid systems
  → taps "Order" on a product (or adds bundle items one by one)
  → opens amsoil.com/<productPath>?zo=30713116 in a new tab
  → AMSOIL owns cart + checkout + payment
  → commission attributed to 30713116 (device-persisted 30 days)
```

### 3.4 The "bundle" and AMSOIL cart rules

A true one-click multi-item cart is **not possible**: the `zo` link attaches attribution but cannot
pre-populate a multi-line amsoil.com cart. So the bundle is presented as a recommended **full-service
kit** (all systems for the vehicle, with a running retail total) and checkout is a **guided
checklist** — each item opens/adds to the AMSOIL cart under the 30-day attribution window, so the
client can assemble the whole kit across the session. Per-item ordering is the reliable primitive;
the bundle is a curated, higher-order-value presentation layered on top of it. Copy will say
"bundle/kit," never imply one-tap multi-item checkout.

### 3.5 Error handling

- **No vehicle resolved** → show the picker (never a blank page).
- **Unsupported vehicle** → "We specialize in these Toyota/Lexus models" + the full-catalog CTA
  (still referral-attached, so an off-lineup shopper still converts).
- **Stale price** (`priceVerifiedAt` old) → still shown, labeled "price confirmed at checkout"; the
  agent will refresh it.
- **Agent fetch/parse failure** → hold, do not write, Slack-alert. Never publish an unverified price.

### 3.6 Testing

Unit tests in the existing `tests/` harness:
- **Referral link builder:** `?` vs `&` handling, zo injection, encoding, idempotence.
- **Catalog integrity:** every vehicle system resolves to a real product SKU + valid `productPath`;
  every bundle references existing SKUs; every supported platform key exists in the site's lineup.
- **Price parser:** fixture amsoil.com HTML → expected price; guardrail (±40%) apply/hold logic.
- **Vehicle resolution:** URL param + picker + localStorage precedence.

### 3.7 Config & secrets

- `AMSOIL_ZO=30713116` — the referral number. Not secret (it appears in public URLs) but stored as
  config for rotation, not hardcoded.
- Slack notifications reuse the existing `/notify` relay (raw webhook stays server-side).

---

## 4. Out of scope for Phase 1 (north-star, designed-around)

- Client accounts / auth (Phase 2). Vehicle keys chosen now so a saved vehicle references them.
- Persistent multi-vehicle My Garage (Phase 2).
- Mileage tracking + service-due reminders, email + push (Phase 3). `tunedInterval` in the catalog is
  the input those reminders will consume.
- Capacitor app parity + Preferred-Customer share/growth loop + 4-year-list launch email (Phase 4).

---

## 5. Open items to resolve during implementation

- Compile + get owner/installer verification of the full vehicle→fluid dataset (products, capacities,
  intervals) for all supported platforms before launch.
- Confirm the exact severe/tuned-service interval adjustment per system with the owner/installers.
- Confirm amsoil.com product-page HTML structure for the price parser (build against a live fixture).
- Decide the agent's host: local Windows Task Scheduler (like the search-visibility engine) vs a
  Netlify scheduled function. Both are viable; pick during planning.
- Product bottle imagery: source authentic AMSOIL product images permitted for dealer use.

### 5.1 BLOCKER discovered during implementation (2026-07-10): AMSOIL is behind Cloudflare

The Task 7 price-sync runner is built, tested, and handles failures gracefully — but a live smoke
test proved **amsoil.com sits behind Cloudflare bot-management**: any server-side `fetch` (any
User-Agent) receives a **403 challenge page**, not product HTML. The parser is structurally fine; the
scrape approach itself is blocked. The automated retail-price monitoring the owner requested needs a
different data source. Options (owner decision required):
- **(a) AMSOIL dealer data feed / API** — ask the AMSOIL dealer rep whether the ZO/dealer account
  exposes a price feed. Most robust + durable if it exists. *Recommended to pursue first.*
- **(b) Local headless browser** (Puppeteer/Playwright) with cookie/challenge solving, run on the
  same Task Scheduler host. Works but heavier + more fragile.
- **(c) Manual price maintenance** — owner edits the catalog periodically; the agent only *flags*
  staleness (via `priceVerifiedAt`) rather than scraping.
- **(d) Don't display price on our side** — "Order ▸" only, price shows on amsoil.com at checkout
  (zero staleness/scrape risk; weaker conversion). This reverses the earlier "Option A" pricing call.

Until this is resolved, the catalog carries owner-verified prices (via Task 8) and the Garage is fully
functional for ordering; only the *automated* refresh is pending.
