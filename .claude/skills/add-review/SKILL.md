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
| `site/index.html` → visible `.rev` cards (`<div class="revs">`, "What owners say") | The review cards customers actually see. Google requires structured-data reviews to **match visible on-page content**, so add a matching card. |
| `site/find-your-exact-tune.html` → `REVIEWS` array | Booking-flow proof cards (`{ name, make, text }`), brand-matched to the customer's vehicle. |

All three surfaces must mirror each other. The visible card shape is:
`<div class="rev"><div class="stars">★★★★★</div><p>&ldquo;quote&rdquo;</p><div class="who">Name</div><div class="ctx">Vehicle · Area</div></div>`

## Steps

1. **`index.html` schema** — add to the `review` array:
   `{"@type":"Review","author":{"@type":"Person","name":"D. Olsen"},"reviewRating":{"@type":"Rating","ratingValue":"5","bestRating":"5"},"reviewBody":"<verbatim review text>"}`
   and **increment `aggregateRating.reviewCount`** (e.g. `"4"` → `"5"`). Leave `ratingValue` at the true average (5 if all are 5-star).
2. **`index.html` visible card** — add a `.rev` card inside `<div class="revs">` matching the schema review (same person/quote/vehicle), using the card shape above. Schema and visible card must agree.
3. **`find-your-exact-tune.html` `REVIEWS`** — add `{ name: "D. Olsen", make: "toyota"|"lexus"|"any", text: "<faithfully trimmed>" }`. `make` is the customer's brand (drives the brand-matched proof card); use `"any"` for a general review.
4. (Optional) **`tests/booking-ui.test.js`** pins one verbatim phrase per featured review as a truthfulness/parity guard. If you want the new one guarded, add a distinctive em-dash-free phrase from it to that test.
5. **`npm test`** — must pass. The existing review-phrase guards still hold; a new `REVIEWS` entry doesn't break them.
6. **Deploy:** push to `master`. Verify the homepage `Review` schema + visible cards and the booking proof cards all show the new review.

**Count parity (unguarded — eyeball it):** `aggregateRating.reviewCount` must equal the number of schema `review` objects **and** the number of visible `.rev` cards. No test checks this, so it ships silently if wrong.

**Em-dash convention:** commit `cfb0cd5` removed em-dashes from copy sitewide. Keep the visible card and `REVIEWS` `text` em-dash-free (use periods/commas); the schema `reviewBody` may stay verbatim.

## Truthfulness

Only **real, verified** reviews. `reviewBody` is verbatim; the `REVIEWS` `text` may be trimmed but must not change meaning. Never invent a review or inflate `reviewCount` / `ratingValue`. (Past work surfaced these as real reviews — J. Mayer, S. Berry, H. Aguirre, C. Vang.)

## Common mistakes

- **Updated schema but not the visible `.rev` cards** (or vice versa) → Google flags "review snippet doesn't match page content."
- **Added to schema/cards but not `REVIEWS`** (or vice versa) → the homepage and booking funnel show different social proof.
- **`reviewCount` ≠ actual review/card count** → unguarded by tests; ships silently wrong.
- **Em-dash in the visible/booking copy** → violates the sitewide `cfb0cd5` convention.
- **Non-verbatim / invented text** → false advertising, and it breaks the phrase guard if pinned.

## Quick reference

`index.html` schema `review[]` + `reviewCount++` + visible `.rev` card → `find-your-exact-tune.html` `REVIEWS` → `npm test` → push `master`. Keep count parity; no em-dashes in copy.
