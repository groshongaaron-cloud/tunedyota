# Event-Date Urgency (Funnel Spec B) — Design

**Date:** 2026-06-25
**Status:** Approved (owner sign-off 2026-06-25)

## Goal

Add truthful, time-based urgency to the booking funnel, keyed to each market's
real event date. It layers on top of the existing real spot-count scarcity
(`scarcityLine` → "Only N spots left") so time + supply reinforce each other. No
fake deadlines, no behavioral cutoff — **display only**, frontend only.

## Context

- The funnel (`site/find-your-exact-tune.html`) already shows the event date and a
  count-based scarcity line on the slot grid (from the booking-conversion-polish
  pass). It has **no time/date urgency**.
- The event date is already in client state: the `availability` function returns
  `eventDateISO` + `eventLabel`; the booking flow holds it in `BOOK.avail`.
- No server change: this reads data the client already has.

## Behavior

A pure helper computes urgency from the event date and today:

`eventUrgency({ dateISO, label, city, now })` → `{ tier, text } | null`

**Tiers (days until event, inclusive boundaries):**

| Condition | tier | text |
|---|---|---|
| no `dateISO`, or event date is in the past (date < today) | — | returns `null` (no block) |
| 0 days (event is today) | `"now"` | `⏱ Today — {city}, {label}. Lock in your spot.` |
| 1 day | `"now"` | `⏱ Tomorrow — {city}, {label}. Lock in your spot.` |
| 2–3 days | `"soon"` | `⏱ Just {n} days left — {city}, {label}.` |
| 4–14 days | `"approaching"` | `⏱ {city} event is in {n} days — {label}. Lock in your spot.` |
| ≥ 15 days | `"upcoming"` | `Next {city} event · {label} (in {n} days)` |

- Day count = whole days between **start-of-today** and the event date (local),
  so "today" = 0, not affected by time-of-day.
- Singular/plural: "1 day" vs "N days" (only used in 2–3 range and ≥15; the 0/1
  cases use Today/Tomorrow).
- `label` is the human event label (e.g. "June 20, 2026"); fall back to `dateISO`.

## Placement

**Booking/slot step (step 5) only** — the urgency line rendered **above** the
existing `.tf-scarcity` line in `renderSlots`, using the authoritative
`eventDateISO`/`eventLabel`/`city` from the `availability` response.

> Correction from initial draft: the market (and therefore the event date) is not
> chosen until step 5's market map (`selectMarket`), so an earlier "result step"
> placement has no event to count down to. Urgency lives where the date is known:
> the slot step. Hidden (renders nothing) whenever the helper returns `null`.

## Rendering & style

- New `.tf-urgency` class mirroring `.tf-scarcity` (centered, Lato, bold, small).
  A `.tf-urgency.hot` modifier (warm accent, matching `.tf-scarcity.low`'s
  `#9b4a3a`/`#c2603f`) for tiers `now` and `soon`; default sage tone for
  `approaching`/`upcoming`.
- An empty/`null` result renders nothing (element hidden or not inserted).

## Implementation

- All in `site/find-your-exact-tune.html`:
  - Add `eventUrgency({dateISO,label,city,now})` near the existing
    `scarcityLine(...)` helper.
  - Add a `urgencyLine(a)` renderer that reads `a.eventDateISO`/`a.eventLabel`/
    `a.city`, calls `eventUrgency` with `now = new Date()`, and returns the
    `.tf-urgency` HTML (or `""`).
  - Prepend `urgencyLine(a)` to the `renderSlots` `box.innerHTML` (above the
    scarcity line). Not added to `renderWaitlistFull`/`renderPriority` (a full or
    non-existent event needs the waitlist message, not a countdown).
  - Add the `.tf-urgency` CSS near `.tf-scarcity`.
- No new files, no server change, no new dependency.

## Truthfulness

- Every line is literally true: real event date, real day count, real spot count
  (existing). **No "registration closes" / implied-deadline copy** (dropped per
  owner). Past events show nothing rather than a stale/negative countdown.

## Testing

- `tests/booking-ui.test.js` (presence/string checks, matching existing pattern):
  - the HTML contains `tf-urgency`, the `eventUrgency` function, and the tier
    phrases (`Lock in your spot`, `Just`, `event is in`, `Next`).
- Note: the funnel's JS is inline (static page, no bundler), so date-tier math is
  verified by reading the rendered logic + presence tests, consistent with how
  `scarcityLine`/proof hooks are covered today. The boundaries (0/1/3/14/15 days,
  past) are encoded explicitly and reviewed in the diff.

## Out of scope

- No booking cutoff / behavioral change (display only).
- No homepage urgency (funnel only).
- No server/availability changes.
