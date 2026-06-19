---
name: add-review
description: Use when adding a new verified customer review to the Tuned Yota site — keeps the on-page booking social proof and the homepage review schema (review list + aggregateRating) in sync and truthful.
---

# Adding a Customer Review

## Overview

Reviews live in **two** places that must mirror each other, and they must be **real and verbatim** — they're public claims and structured data Google reads.

## Sources of truth

| File | Role |
|---|---|
| `site/index.html` → `AutomotiveBusiness` `review[]` + `aggregateRating` | Homepage schema.org reviews + the aggregate star rating. Add a `Review` object **and** bump `reviewCount`. |
| `site/find-your-exact-tune.html` → `REVIEWS` array | Booking-flow proof cards (`{ name, make, text }`), brand-matched to the customer's vehicle. |

## Steps

1. **`index.html` schema** — add to the `review` array:
   `{"@type":"Review","author":{"@type":"Person","name":"D. Olsen"},"reviewRating":{"@type":"Rating","ratingValue":"5","bestRating":"5"},"reviewBody":"<verbatim review text>"}`
   and **increment `aggregateRating.reviewCount`** (e.g. `"4"` → `"5"`). Leave `ratingValue` at the true average (5 if all are 5-star).
2. **`find-your-exact-tune.html` `REVIEWS`** — add `{ name: "D. Olsen", make: "toyota"|"lexus"|"any", text: "<faithfully trimmed>" }`. `make` is the customer's brand (drives the brand-matched proof card); use `"any"` for a general review.
3. (Optional) **`tests/booking-ui.test.js`** pins one verbatim phrase per featured review as a truthfulness/parity guard. If you want the new one guarded, add a distinctive verbatim phrase from it to that test.
4. **`npm test`** — must pass. The existing review-phrase guards still hold; a new `REVIEWS` entry doesn't break them.
5. **Deploy:** push to `master`. Verify the homepage `Review` schema and the booking proof cards show the new review.

## Truthfulness

Only **real, verified** reviews. `reviewBody` is verbatim; the `REVIEWS` `text` may be trimmed but must not change meaning. Never invent a review or inflate `reviewCount` / `ratingValue`. (Past work surfaced these as real reviews — J. Mayer, S. Berry, H. Aguirre, C. Vang.)

## Common mistakes

- **Added to schema but not `REVIEWS`** (or vice versa) → the two sources drift.
- **Forgot to bump `aggregateRating.reviewCount`** → the count no longer matches the review list.
- **Non-verbatim / invented text** → false advertising, and it breaks the phrase guard if pinned.

## Quick reference

`index.html` `review[]` + `reviewCount++` → `find-your-exact-tune.html` `REVIEWS` → `npm test` → push `master`.
