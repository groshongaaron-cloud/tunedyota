# Booking-flow conversion polish — design

**Date:** 2026-06-18
**Status:** Draft for review
**Track:** B of the post-launch work (design-skill polish). Surface: `site/find-your-exact-tune.html`. Goal: conversion lift.

## Goal

Lift booking conversion on the tune-finder by adding **trust** and **honest urgency** at the decision point, plus craft polish on the booking moment — without restructuring a funnel that already works. All additions are truthful (real reviews, live slot data).

## Non-goals

- No step restructuring, no sticky CTA, no funnel rebuild (those were the rejected "Approach C").
- No fabricated urgency (no fake countdowns/scarcity), no invented reviews or counts.
- No backend changes — `book.js`/`availability.js` and their tests are untouched. This is HTML/CSS/inline-JS only, consistent with the page's self-contained pattern.

## Decisions (locked with owner)

- **Scope A:** social proof + live scarcity + booking-moment craft.
- **Social proof shows testimonials + a "5.0 ★ verified" cue, but NOT the count** (4 reads thin; stays truthful and scales when more are added).

## Current state (audit)

The page is a 6-step wizard (`data-step` 0–5) with real craft already: animated segmented progress (`.tf-prog`), step entrance animation (`@keyframes rise`), a dark trust block (EPA / 5-gas / VFTuner) on the result step, a live slot grid with taken/open states, and a Priority Wait List for full events. Gaps: (1) **no social proof anywhere in the funnel** — the 4 verified 5-star reviews exist only in `index.html`'s `AutomotiveBusiness` schema; (2) **no quantified scarcity** at the slot grid; (3) the select→confirm→success moment is functional but not *rewarding*. The design system (palette, Spectral/Lato, 16px cards, soft shadows, `prefers-reduced-motion` handling) is coherent and is the basis for all additions.

## Components

### 1. Social proof — `.tf-proof`

- **Data:** a `REVIEWS` array in the page's inline JS, mirroring the 4 reviews in `index.html` schema (J. Mayer, S. Berry — Tacoma, H. Aguirre — Tacoma, C. Vang — Lexus GX). Each `{ name, text, make }`. Text faithfully trimmed to 1–2 sentences (no meaning change). This array is the display source of truth; the schema remains canonical (reviews change rarely; manual parity is acceptable and noted in a code comment).
- **Card:** matches the system — `var(--card)` bg, `--line` border, `--r` radius, `shadow-sm`; 5 filled stars in `--blue`/gold; a Spectral quote; an initials avatar + name; a small "5.0 ★ verified" label. No count.
- **Placement:**
  - Result step (4): one featured review under the trust block, near the "Book at an Event" CTA — reassurance at price reveal.
  - Booking step (5): a compact review near the contact form.
- **Contextual pick:** `pickReview(make, used)` prefers a review matching the chosen make (Lexus → C. Vang; Toyota → a Tacoma review), avoiding repeating the same review across the two placements; falls back to a general one. Truthful and relevant.

### 2. Live scarcity — `.tf-scarcity`

- Rendered in the existing slot-render path (`renderSlots`) above the grid, from real data already in scope (`a.openSlots`, `a.city`, `a.eventLabel`; total = 12 slots).
- Copy: `openCount <= 4` → **"Only N spot(s) left — {city}, {eventLabel}"** (emphasized, warm `--sand`/`--brown` accent); otherwise → "N of 12 times open — {city}, {eventLabel}" (neutral). Full events already route to the Wait List (unchanged).
- Pure helper `scarcityLine(openCount, total, city, label)` builds the string; isolated so the copy/threshold logic is in one place.

### 3. Booking-moment craft — Emil lens

- **Selected slot:** `.tf-slot.sel` gains a checkmark (`::after`) and a subtle scale; smooth transition.
- **Confirm CTA:** when a slot is selected (`BOOK.slot` set, label becomes "Confirm Booking →"), the button gets an emphasis class (gentle one-shot glow/pulse drawing the eye).
- **Success state:** `bookSuccess(...)` is elevated to a `.tf-success` block — an animated check (SVG stroke draw), "You're booked" heading, a clean details card (city / date / time / installer), and the existing calendar-invite note.
- **Motion:** every animation is wrapped by the page's existing `@media (prefers-reduced-motion: reduce)` rules (static fallbacks: solid check, no pulse).

## Truthfulness constraints

Review text is verbatim-or-faithfully-trimmed from the real reviews; the "5.0 ★ verified" cue reflects the real `aggregateRating` (5.0). Scarcity is computed from live availability only. Nothing is invented.

## Verification

- **Visual (owner):** serve via `netlify dev`; owner reviews the result + booking steps on the running site (the agent can't screenshot). Because local availability has no Airtable creds, the scarcity line is verified either against production after deploy or via a temporary stubbed `availability` response during local review.
- **Automated:** keep `npm test` green (no backend touched). Add a light guard test (`tests/booking-ui.test.js`) asserting the page contains the `REVIEWS` entries (review text present = truthfulness/parity guard) and the `.tf-proof` / `.tf-scarcity` / `.tf-success` CSS hooks exist. Runtime-rendered behavior (scarcity, contextual pick) is verified visually.
- **Functional:** confirm the booking flow still completes end-to-end (booked + Priority paths) after the changes.

## Files

- Edit: `site/find-your-exact-tune.html` (CSS additions, step-4/5 markup, inline-JS: `REVIEWS`, `pickReview`, `scarcityLine`, `renderSlots` scarcity line, `updateBookCta` emphasis, `bookSuccess` success block).
- New: `tests/booking-ui.test.js` (light static guard).
- Possibly edit: `index.html` only if the owner later supplies additional reviews (out of scope now).
