# Multi-date-per-city booking rule — design

_Drafted 2026-07-06._

## Goal

Let a single city hold **multiple scheduled events**, and give the booking funnel a clear
rule when a customer selects a city:

1. Show the city's **soonest** upcoming event and its open times.
2. If that date doesn't work, the customer chooses either:
   - **(1)** join the **Priority Wait List**, or
   - **(2)** step to the **next scheduled event in that same city**.
3. When the city has no further upcoming dates, only the Priority Wait List remains.

There is **no** cross-city / nearest-neighbor fallback (explicitly out of scope). "Next" only
ever walks the **same city's** future dates, soonest-first.

## Why this needs a data-model change

Today `netlify/functions/lib/events.js` builds a **city → single event** map (baked
`events-data.js` merged over an optional Google Sheet), and every consumer reads that
one-event-per-city shape:

- `availability.js` — funnel slot lookup
- `book.js` — booking + Priority Wait List
- `event-roster-run.js` — installer roster emails
- `event-reminders.js` — reminder / day-of / post-event sweeps
- `report-sources.js` — submissions report
- `intake.js` — staff intake form

Even the Google-Sheet parser overwrites on a duplicate city, so a city literally cannot
have two events. "The next scheduled event in that city" is therefore impossible without
changing the shape the helper produces.

## Approach A — city → array of events, centralized in `lib/events.js`

The event map value becomes an **array** of event records. The helper **normalizes**: a
city still written as a single object (all of them today) is treated as a one-element
array, so **no existing `events-data.js` entry has to be rewritten** — a city only becomes
an array when it earns a second date. The shape is owned in exactly one place; consumers
call helpers instead of reading the raw map.

Rejected alternative (Approach C, `event.moreDates`): keeps the single-event map but makes
extra dates second-class — every consumer that must treat each date as a real event
(roster, reminders, schema) has to remember to expand `moreDates`, and forgetting one
silently drops a date's roster/reminders. Approach A pays a one-time clean refactor to
avoid that permanent footgun.

## Components

### 1. `lib/events.js` — the shape owner

Internal map becomes `{ [cityLower]: EventRecord[] }`. `EventRecord` keeps today's fields:
`{ city, label, dateISO, active, event, details, address }`.

- **`fetchEvents(deps)`** — returns the array-valued map.
  - Baked `events-data.js`: a city value that is a single object is wrapped to `[object]`;
    a city value that is already an array passes through. City backfill (the existing
    `ev.city` fix) applies to every element.
  - Google Sheet: duplicate-city rows **append** to the city's array instead of
    overwriting. A configured sheet still overrides the baked entry for that city (replaces
    the whole array for that city, matching today's "sheet wins" rule).
- **`getEventsForCity(city, deps, now = new Date())`** — the city's **active** events with a
  `dateISO` **on or after today**, sorted **ascending by `dateISO`** (soonest-first).
  Returns `[]` when none.
- **`getCurrentEventForCity(city, deps, now)`** — first element of `getEventsForCity`, or
  `null`. Drop-in replacement for today's `getEventForCity` (keep `getEventForCity` as an
  alias so nothing breaks mid-refactor).
- **`getAllActiveEvents(deps, now)`** — flat list of every active event that has a
  `dateISO`, across all cities, each carrying its `city`. **No past/future filter** here —
  reminders and reports own their own date windows (day-of, post-event sweeps) and must
  still see recently-past events.

Rule of thumb: **funnel/booking** paths use `getEventsForCity` / `getCurrentEventForCity`
(future-only, ordered); **ops** paths (roster, reminders, reports) use `getAllActiveEvents`
and filter by their own window.

### 2. `availability.js` — return the ordered list

Response shape:

```json
{
  "city": "Twin Cities",
  "hasEvent": true,
  "events": [
    { "dateISO": "2026-08-29", "eventLabel": "August 29, 2026",
      "full": false, "openSlots": ["..."], "takenSlots": ["..."], "slotLabels": {"...":"..."} },
    { "dateISO": "2026-10-16", "eventLabel": "October 16, 2026",
      "full": false, "openSlots": ["..."], "takenSlots": ["..."], "slotLabels": {"...":"..."} }
  ]
}
```

- `events` is `getEventsForCity` order (soonest-first, future only). Each element computes
  its own open/taken slots from Airtable bookings scoped to **that `(city, dateISO)`**.
- `hasEvent = events.length > 0`. No event → `events: []`.
- **Back-compat:** also mirror the soonest event's fields at the top level
  (`eventLabel`, `eventDateISO`, `full`, `openSlots`, `takenSlots`, `slotLabels`) so any
  unforeseen reader keeps working. The funnel uses `events`.

### 3. `find-your-exact-tune.html` — stepwise UX (client only)

State: an index into `avail.events` (default 0 = soonest).

- Render the event at the current index via the existing `renderSlots` / `renderWaitlistFull`
  path (unchanged slot grid).
- Below the times, a fallback row: **"Can't make {label}?"** with
  - **[ See next date → ]** — shown only when `index < events.length - 1`; advances the index
    and re-renders. Never wraps.
  - **[ Join the Priority Wait List ]** — sets the priority path (existing `renderPriority`
    behavior / `BOOK.reason`).
- When `events.length === 0` → today's no-event path (`renderPriority("no-event")`),
  unchanged.
- When `events.length === 1` → the "See next date" button is simply absent; identical to
  today's single-event experience.
- Booking payload gains **`dateISO`** = the currently-shown event's `dateISO`.

No new markup framework — this is a small extension of the existing `loadAvailability` /
`renderSlots` functions and the `BOOK` state object.

### 4. `book.js` — book against a specific date

- Accept optional **`dateISO`** in the payload. Resolve the target event via
  `getEventsForCity(city)` and match on `dateISO`; if `dateISO` is absent, default to the
  soonest (back-compat).
- If the `dateISO` doesn't match an active future event for the city → treat as no bookable
  event (return the Priority Wait List path), never book a phantom date.
- Slot-conflict detection, Airtable write, confirmation email, and n8n ping all scope to the
  resolved `(city, dateISO)`. The existing sync/background split is unchanged.

### 5. Ops consumers — one date each

`event-roster-run`, `event-reminders`, `report-sources`, and `intake` switch to
`getAllActiveEvents()` and iterate, so **each date** gets its own roster, reminders, and
report row — no date is collapsed away.

- `intake.js` (staff form) books/leads for a **city**; for MVP it defaults to the city's
  **soonest** event via `getCurrentEventForCity` (preserving today's behavior). Per-date
  selection in the staff form is a deliberate future enhancement, not this spec.

### 6. SEO

`scripts/build-seo.mjs` reads active events for Event JSON-LD + sitemap. Moving it to
`getAllActiveEvents` means a city with two dates emits **two** `Event` entries (correct and
desirable). `tests/seo.test.js` updates to expect one Event per active date.

## Data flow (happy path, 2-date city)

1. Customer selects **Twin Cities** → funnel calls `/availability?city=twin cities`.
2. Availability returns `events: [Aug 29, Oct 16]`, each with its own slots.
3. Funnel shows **Aug 29** times. Customer taps **See next date →** → shows **Oct 16** times.
4. Customer picks a time → `book.js` with `dateISO: 2026-10-16` → booked against Oct 16.
5. `event-roster-run` / `event-reminders` treat Aug 29 and Oct 16 as independent events.

## Edge cases & error handling

- **0 future events** → `events: []` → waitlist-only path (unchanged).
- **1 event** → no "next date" button; behaves exactly as today.
- **Slot just taken** → existing `conflict` handling, scoped to `(city, dateISO)`.
- **Invalid/inactive `dateISO` posted** → book.js declines to book, routes to waitlist.
- **Past event still `active:true`** (weekly freshness lag) → excluded from the funnel by
  the `>= today` filter in `getEventsForCity`; still visible to ops via `getAllActiveEvents`
  (their date windows handle it).
- **Availability fetch error** → funnel keeps today's catch → waitlist path.

## Testing

- **`lib/events.js`**: single-object normalization → 1-element array; array pass-through;
  `getEventsForCity` future-filter + ascending order; `getCurrentEventForCity` soonest/null;
  `getAllActiveEvents` flatten + city backfill; Sheet duplicate-city **append**; "sheet wins"
  still replaces a baked city.
- **`availability`**: multi-date response ordering; per-date open/taken computation; empty.
- **`book`**: book soonest with no `dateISO` (back-compat); book a specific non-soonest
  `dateISO`; reject invalid/inactive `dateISO`; per-date conflict.
- **Ops**: roster/reminders/report iterate both dates of a 2-date city.
- **SEO**: `seo.test.js` expects one `Event` per active date.
- **Regression**: a single-date city is unchanged end-to-end.

The funnel stepwise UI is browser JS (no DOM test harness in-repo) → verified live.

## Rollout / verification

- `npm run build:seo` → `npm test` → ship (push `master`) → confirm Netlify `ready`.
- **Live verification needs a city with two future dates.** None exists today, so verifying
  the stepwise chain pairs with scheduling one planned repeat as a real second date (e.g.
  a city that already has an event gets its planned second date via the `schedule-event`
  skill). Until then the feature is **dormant and harmless** — every city has ≤1 date and
  behaves exactly as today.

## Out of scope (YAGNI)

- Cross-city / nearest-neighbor "next event" (removed by decision).
- New admin UI — a second date is added the same way as the first (`schedule-event`).
- Per-date selection inside the staff `intake` form.
