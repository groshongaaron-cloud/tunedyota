# Event Booking Links + QR — "scan → pick a time → booked" (design)

**Date:** 2026-07-16 · **Owner approved:** times-first mini flow (Option A) + console
link-generator widget.

## Goal

Every scheduled event gets its own shareable link (and QR) that lands a client on that
event's open time slots for immediate booking — for Facebook posts, posters, and 1:1
sharing by text/DM/email. Sharing must be a two-tap action from the installer console /
Tuned Yota app.

## The link & the mini flow (`site/book.html`)

- **URL shape:** `tunedyota.com/book/<city-slug>-<YYYY-MM-DD>` (e.g.
  `/book/fargo-2026-08-09`) — human-readable on posters. A `netlify.toml` redirect maps
  `/book/*` → `/book.html?e=:splat` (200 rewrite so the URL stays pretty).
- **Times-first flow:** event header ("Fargo · Saturday, Aug 9" + installer name) →
  live open slots (existing availability endpoint) → tap a time → one compact form:
  name, phone, email, vehicle year/make/model — the vehicle picker reuses the funnel's
  VEHICLES data and **reveals the exact starting price before confirming** (no blind
  bookings) → POST to the existing `/book` endpoint. Same conflict handling, emails,
  certificate, and n8n pipeline as the funnel.
- **Provenance:** `Source: "event-link"`; `utm_*` params pass through, so each Facebook
  post/poster can be tagged and attributed (e.g. `?utm_source=fb&utm_campaign=fargo-aug`).
- **Events resolve at page load** from the live Google-Sheet-driven events data — adding
  an event to the sheet makes its link work instantly, zero deploys.
- **Edge cases (nothing dead-ends):** passed date, filled event, or unknown slug → a
  friendly notice + the next scheduled event in that city (when one exists) + the
  Priority Waitlist path. Slot taken between load and submit → the funnel's existing
  conflict flow (fresh open slots offered).

## Console/app: "Share event link" widget

At the top of the Jobs view in the installer console (the Tuned Yota app wraps the
console, so it inherits this):

- **One dropdown** of upcoming events as "City · Day, Date" entries — selecting once
  fully specifies the link, which renders immediately below. Installers see their own
  markets' events first; admin sees all.
- **Share** → `navigator.share` (native share sheet: SMS, Messenger, IG DM, WhatsApp,
  email); fallback to Copy where unsupported.
- **Copy** → clipboard. **QR** → full-screen crisp SVG QR (show-to-scan in person, or
  save/print for posters), served by a new `event-qr` Netlify function cloned from the
  existing `review-qr` pattern (`lib/qr.js`).
- Populated from the roster/events payload the console already loads — no new fetch.

## Public funnel share icons

On the funnel's book step, each displayed event gets a small Share icon →
`navigator.share`/copy of that event's link — customers become distributors.

## Measurement

- `Source: event-link` on the booking row → visible in console + Airtable, countable
  against funnel bookings.
- The mini flow fires the funnel's step-5 ("book") and step-6 ("booked"/"priority")
  beacons with UTM attribution so event-link conversions appear in the monthly report.
  (Note: these sessions skip steps 0–4 by design; outcome totals stay complete.)

## Components

| Piece | Kind | Notes |
|---|---|---|
| `site/book.html` | new page | times-first mini flow; reuses site.css, VEHICLES, availability + `/book` |
| `lib/event-links.js` | new pure lib | slug build/parse/resolve (city+date → event, passed/unknown/full states) — shared by page + console widget tests |
| `event-qr.js` | new function | SVG QR for a given event slug (mirrors `review-qr`) |
| `netlify.toml` | edit | `/book/*` rewrite; guardrail test covers the new function if ungated (QR is harmless-readonly) |
| Console Jobs view | edit | Share-event-link widget (dropdown → link → Share/Copy/QR) |
| Funnel book step | edit | per-event Share icon |

## Testing (TDD, node:test + Playwright)

- `lib/event-links.js` — slug round-trip, resolve against injected events (upcoming /
  passed / unknown / multiple-per-city), next-event-in-city fallback selection.
- Booking submission from the mini flow — reuses `/book` contract tests; new test that
  `Source: "event-link"` and utm passthrough land on the payload.
- Playwright: `/book/<slug>` renders slots from a stubbed availability response; tap
  slot → form → stubbed book → confirmation; passed-event page shows next-event +
  waitlist paths. Console widget: dropdown renders events, link text matches slug,
  copy/share affordances present.
- `event-qr` — returns SVG for a valid slug, 404/fallback for unknown.

## Out of scope

- Per-event landing-page SEO (the mini flow is a conversion tool, not a content page;
  state pages + funnel own SEO).
- Auto-posting links to Facebook (manual sharing is the workflow for now).
- Slot holds/reservations while the form is open (existing conflict flow covers races).
