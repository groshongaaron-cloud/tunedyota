---
name: gsc-product-schema-warnings
description: "GSC \"Missing field review/aggregateRating\" warnings on Magnuson Product schema are intentionally left; do NOT fabricate ratings"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 6ec397dd-845e-4b02-8508-666add6aae5f
---

GSC reports "Missing field aggregateRating" + "Missing field review" for the Magnuson `Product` schema injected by `site/magnuson-schema.js` (pricing page + 7 vehicle pages). These are **warnings, not errors** — the Product markup is valid and still eligible for the price/offer rich result; indexing is unaffected.

Owner decision (2026-07-09): **leave them as-is.**

**Why:** `review`/`aggregateRating` are *recommended*, not required, on Product. The only honest way to clear them is genuine per-kit customer reviews (of the supercharger products themselves), shown on-page. We don't have those. The homepage `AutomotiveBusiness` schema's 4 real reviews + 5.0 aggregateRating are about the **tuning service**, not the kits.

**How to apply:** Do NOT copy the service reviews/rating onto the supercharger `Product`s to silence the warning — that's a product/review mismatch that risks a Google manual action, strictly worse than a cosmetic warning. Aligns with [[brand-rules-locked]] and the truthfulness principle in the `add-review` skill. Only revisit if the owner supplies real kit reviews. See [[magnuson-pricing-integration]].
