---
name: event-booking-links
description: "Per-event booking links + QR SHIPPED LIVE 2026-07-17: tunedyota.com/book/<city-slug>-<date> times-first mini flow (site/book.html), console Share-event-link widget, funnel share icons, event-qr endpoint. Live-verified against des-moines-2026-10-10."
metadata:
  node_type: memory
  type: project
---

**SHIPPED LIVE 2026-07-17** (10 commits on master, 778 tests; spec
`docs/superpowers/specs/2026-07-16-event-booking-links-design.md`, plan
`docs/superpowers/plans/2026-07-17-event-booking-links.md`).

- **Link shape:** `tunedyota.com/book/<city-slug>-<YYYY-MM-DD>` → netlify.toml 200-rewrite
  to `site/book.html` (noindex; NOT in HEAD_PAGES/sitemap — conversion tool). Slug logic:
  `lib/event-links.js` (canonical) + inline copies in book.html/installer.html/funnel —
  a whitespace-normalized drift-guard test in booking-ui.test.js pins all four.
- **Mini flow:** slots (live availability) → tap time → name/phone/email +
  make/model/config pickers fed by `site/vehicles.json` (NEW third artifact written by
  build:seo's syncVehicles — parity-tested against lib/vehicles.json; retail fields only)
  → price shown pre-confirm → existing /book endpoint with `Source: "event-link"` + utm
  passthrough. Conflict → fresh slots re-render; passed/unknown event → next-event link +
  funnel/waitlist path (never dead-ends). Funnel beacons: track(5) on load,
  track(6,'booked'/'priority'), tel-tap → track(6,'call'). Same ty_sid as the funnel.
- **Console:** "🔗 Share an event booking link" collapsed <details> at top of Jobs
  (all/city tabs): dropdown of upcoming roster events → link + native Share / Copy / QR
  (`/.netlify/functions/event-qr?e=<slug>`, per-event aria-label). App inherits via
  sync-web.
- **Event-qr:** public read-only like review-qr; validates slug against MARKETS
  (calendar-valid dates), 404 unknown, qrSvg gained opts.ariaLabel (default unchanged
  for existing callers).
- **Live-verified:** rewrite serves the page, QR SVG + aria-label correct, unknown→404,
  vehicles.json public, availability for des-moines-2026-10-10 shows 12 open slots.
- **Gotchas for future edits:** never deploy the /book/* rewrite without book.html
  (200+404-body on every event URL); `slugify(city)` ↔ `getMarket(slug.replace(/-/g," "))`
  round-trips because no market name contains a hyphen — if one ever does, revisit;
  bookings from event links leave Model Year blank by design (funnel = deep-qual path).
