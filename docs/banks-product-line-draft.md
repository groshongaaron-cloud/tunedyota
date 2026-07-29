# Banks Power product line — draft proposal (2026-07-29)

Grounded in `data/banks-site-scrape.json` (full bankspower.com catalogue, 335
products / 534 variants, scraped 2026-07-29) and the registry pattern in
`app/www/product-lines.js`.

## The business gate — RESOLVED 2026-07-29

**Banks sent a dealer application; Tuned Yota will be onboarded with full
access to sell the line.** Dealer mode it is: Converge checkout like
Magnuson once the dealer price sheet arrives. Until pricing lands, the
line can launch in reserve (install-partner) mode and flip to converge.

### Original mode analysis (for the record)

Banks sells direct on their own Shopify store. Unlike AMSOIL (we're a dealer
with referral code `zo=30713116`) and Magnuson (distributor pricing, we sell
via Converge), **Tuned Yota has no Banks relationship today** — so there is
no revenue mechanism yet. Options:

| Mode | Mechanism | Revenue | Blocker |
|------|-----------|---------|---------|
| **Dealer** (recommended if margins work) | Buy at dealer price, sell via Converge like Magnuson | Product margin + install labor | Apply to Banks dealer program; get the price sheet |
| **Install-partner** | Customer buys from Banks, we book the install | Labor only | None — could ship this week |
| **Referral** | Outbound links to bankspower.com | None (no known affiliate program) | Not worth a line |

The install-partner mode needs no Banks approval and matches how the booking
engine already works; the dealer mode is the real profit center. The draft
below works for either — only the `checkout` field changes.

## Why Banks fits (the catalog says so)

Banks has leaned hard into the **2024+ Tacoma 2.4L (gas + hybrid) and 2025+
4Runner 2.4L hybrid** — exactly the new-generation trucks TY's audience is
buying and exactly where OTT tuning + Magnuson don't play yet:

**Shipping now (in stock, real prices):**
- Ram-Air intake 42291 — Tacoma 2.4L — $398
- Boost Tube upgrade kit 26012 — Tacoma 2.4L — $498
- Pre-filter 42660 / filter element 41023 — service items ($44/$109)
- iDash Stealth Pod mounts — Tacoma 2024+ (63380/63381), 4Runner 2025+
  (63397), Tundra 2020/2022+ (63373/63376), legacy Tacoma/Tundra/4Runner
- PedalMonster throttle controller 64335/64337-P — $295–$714, broad fitment

**Coming soon (null price, `In_Development` tag — free future content):**
- Monster-Ram turbo inlet 42840 (Tacoma 2.4L), intercooler 26028,
  Monster Exhaust 48147/48145/48146/48144 (Tacoma, Tundra, 4Runner)

That's a credible "Air & Monitoring" line for the newest Toyotas today, with
the exhaust/intercooler wave landing later — each new Banks release becomes a
TY page + install offer the day it ships.

## Technical shape (mirrors Magnuson exactly)

1. **Catalog**: generate `app/www/banks-catalog.js` from
   `data/banks-site-scrape.json`, applications keyed by the structured
   fitment tags Banks embeds (`Year_2024_Make_Toyota_Model_Tacoma_Engine_2.4L…`
   — machine-readable, no manual fitment work). Toyota-only first pass:
   ~19 products → ~10 applications.
2. **Registry**: add to `LINES[]` in `app/www/product-lines.js`:
   `{ id: "banks", label: "Air & Gauges — Banks", icon: "🌀",
   checkout: "reserve" (install-partner) | "converge" (dealer),
   itemsFor: banksItems }` — `banksItems()` is ~30 lines mirroring
   `magnusonItems()` (same `AG.inRange` year logic; tags carry engine).
3. **Checkout**:
   - *Install-partner*: reuse the AMSOIL `reserve` flow verbatim — kit
     reservation → lead → booking. Zero new backend.
   - *Dealer*: add Banks SKUs to `create-payment-session.js` server-side
     price lookup (same pattern as Magnuson; prices never from browser).
4. **Pages**: optional SEO tier later — `scripts/banks/build-store-pages.mjs`
   cloned from the Magnuson builder. Not needed for the app line to work.
5. **Data freshness**: the UWS extraction is a saved automation — re-run (or
   cron) refreshes prices/stock for ~42 credits; `In_Development` → priced
   transition is the signal a new product launched.

**Effort**: install-partner mode ≈ one session (catalog generator + registry
entry + tests). Dealer mode adds the payment-session lookup + whatever the
dealer price sheet requires (a Banks version of `ingest-price-file.mjs` with
the same confidentiality bar).

## Open questions for Aaron

1. Apply for a Banks dealer account? (Their program is the fork in the road.)
2. If dealer: does the margin on $300–$500 parts justify Converge checkout,
   or is install-partner + labor the better unit economics anyway?
3. Line scope: Toyota-only (clean fit with the brand) or include the diesel
   truck catalog (big, but off-brand for Tuned *Yota*)?
