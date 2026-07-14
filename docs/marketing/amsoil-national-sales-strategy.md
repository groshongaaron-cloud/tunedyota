# AMSOIL National Sales Strategy — Tuned Yota

**Created:** 2026-07-13 · **Goal:** ≥ **$15,000/mo** AMSOIL sales within 3 months (by ~2026-10-13); **$30,000/mo** by year-end.
**Dealer/ZO:** 30713116. **Model:** referral to amsoil.com (no cart/inventory) — same as every page-1 competitor.

---

## 1. What the page-1 competitors taught us

Analyzed 6 page-1 AMSOIL sites (syntheticsusa, southsidelube, buyoildirect, thesyntheticgarage, cardey4everoil, switchsynthetics). Findings were remarkably consistent:

- **All 6 use the identical model we do** — a `?zo=` referral funnel to amsoil.com. None run a cart, hold inventory, or ship. Price is fixed by AMSOIL for everyone. **→ This is won on traffic, trust, and conversion — not price or fulfillment.**
- **What earns them page-1 + revenue:**
  1. **Content volume.** BuyOilDirect's moat = **31 deep product guides** ("AMSOIL 5W-30 guide," "0W-20," "ATF," ~2,500 words + FAQ). The Synthetic Garage = programmatic **"Buy AMSOIL in [State]"** pages. That is their traffic engine.
  2. **Domain age/tenure** (2011–2018).
  3. **Preferred-Customer (PC) registration is the money event** — a PC signup locks the customer to the dealer's ZO and **recurs** (25% off; reorders for years). Every competitor pushes PC hard. One-off retail is the appetizer; **PC is the entrée.**
- **What NONE of them have (our opening):**
  - No real **vehicle authority** (even "The Synthetic Garage" has no vehicle lookup; BuyOilDirect stops at make-level).
  - No **Product/Offer/AggregateRating/FAQ schema** → no rich results, invisible in AI answers.
  - No **first-party reviews, dyno proof, or design quality** → weak E-E-A-T.
  - They **leak every visitor** to amsoil.com with no price shown and no relationship captured.

## 2. Our unfair advantages
World-class design · strong AI/search visibility (we get cited; they don't) · genuine **Toyota/Lexus authority + dyno proof + real reviews + rich schema** · and the one they structurally cannot copy — the **certificate/tune funnel**: a warm, high-trust audience captured at the moment they invest in their engine.

## 3. Strategy — 3 fronts

### Front A — Own the Toyota/Lexus AMSOIL niche, nationally (our moat; **fastest ROI**)
No competitor can rank for "best AMSOIL for a tuned Tundra / 3rd-gen Tacoma / GX460." Turn our 13 per-vehicle AMSOIL pages (`amsoil-<make>-<model>.html`) into true **conversion-optimized buying guides**: real product images (now live), exact fluids + capacities, a one-click **"oil-change kit"**, **Product/Offer + FAQPage + AggregateRating schema**, reviews/trust, and a prominent **PC-savings CTA** — each deep-linking to amsoil.com with `?zo=30713116`. Uncontested demand.

### Front B — Capture broad national AMSOIL demand (their engine, our quality)
Build the two proven traffic machines, schema-rich and genuinely useful:
- **Product-guide library** — "AMSOIL 0W-20 / 5W-30 / ATF / gear-lube" guides (beat BuyOilDirect on depth + schema + design).
- **Geo pages** — "Buy AMSOIL in [State/metro]" (beat Synthetic Garage's thin templates with real substance; reuse the state-page generator).

### Front C — Convert, don't leak (where the revenue compounds)
- Make **"Become a Preferred Customer — save 25%"** the primary, well-designed money CTA everywhere (recurring, ZO-locked, compounding).
- Reduce leakage: show prices + **curated vehicle "oil-change kits"**, then deep-link to the cart with `?zo=` at the pre-sold moment (already done for cert QR + email).
- Fire the **cert funnel** hard: cert QR + 3-day email (live) + (P3) mileage/service-due reminders — near-term revenue while SEO ramps.

## 4. Revenue model (directional)
Price is fixed, so **revenue = traffic × conversion × AOV**, with **PC registrations** as the compounding layer.
- $15K/mo ≈ ~200 orders at ~$75 AOV (~7/day). Sources: (a) warm cert-funnel base now, (b) Front-A niche rankings in weeks, (c) Front-B volume as it indexes.
- **PC base compounds:** each PC customer reorders ~quarterly → recurring revenue grows toward $30K by year-end.
- Instrument orders + PC-signups **by source** (UTM on `?zo=` links where possible; GSC query tracking; the measurement engine) to double down on what converts.

## 5. Phased 3-month roadmap

**Phase 1 (weeks 1–4) — Front A + conversion foundation.**
1. ✅ Real product images self-hosted + zo deep-link (cert QR + email) — SHIPPED 2026-07-13.
2. Rebuild the 13 vehicle AMSOIL pages as buying guides: product cards w/ images + prices, **oil-change "kit"** per vehicle, Product/Offer + FAQPage + AggregateRating schema, PC-savings hero CTA, trust/reviews block, order links w/ `?zo=`. (Generator: `scripts/build-amsoil-pages.mjs`.)
3. A prominent **"Become a Preferred Customer (save 25%)"** conversion module (shared component) on the garage + vehicle pages.
4. Resolve EA15K02/EA15K49 filter part numbers (owner) so those vehicles show images.

**Phase 2 (weeks 3–8) — Front B content engine.**
5. Product-guide library (start with the highest-volume: 0W-20, 5W-30, ATF, gear lube, "AMSOIL vs conventional," "extended drain intervals") — schema-rich, cross-linked to vehicle pages + garage.
6. Geo pages: "Buy AMSOIL in [State]" for our 7 markets first, then expand; substance over templates.

**Phase 3 (weeks 6–12) — Front C conversion + measurement.**
7. Inline kits/bundles + price presentation refinements; PC-conversion optimization.
8. Measurement dashboard: orders/PC-signups by source; iterate on winners.
9. Cert-funnel P3: mileage/service-due reminders (recurring reorder driver).

## 6. KPIs / instrumentation
- **North star:** AMSOIL sales/mo through ZO 30713116 (owner reads in the AMSOIL dealer portal).
- **Leading indicators:** organic sessions to `/amsoil-*` pages, `?zo=` click-throughs, PC registrations, keyword rankings ("AMSOIL for [model]", "AMSOIL [viscosity] guide", "buy AMSOIL [state]"), AI-answer citations.
- Wire tracking on outbound `?zo=` links + monthly GSC snapshots (existing measurement engine).

## 7. Open items / dependencies
- **EA15K02 / EA15K49** filters — not in AMSOIL's library; need correct part numbers (Front A blocker for 2 platforms' images).
- **PC-registration link** — confirm the exact AMSOIL PC enrollment URL under our ZO (`amsoil.com/offers/pc/?zo=30713116`) for the conversion CTA.
- **AMSOIL brand/marketing compliance** — dealer sites must follow AMSOIL's advertising rules; keep claims within AMSOIL-authorized language (no fabricated discounts; PC pricing is AMSOIL's program).

Related: [[amsoil-garage-program]], [[certificate-v2-dashboard-program]], [[search-ai-visibility-program]], [[seo-generator]].
