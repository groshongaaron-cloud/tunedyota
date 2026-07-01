# Event Ops Enhancements — design

Date: 2026-06-30
Status: approved (brainstorming) — proceeding to plan + build

Three additive features on the existing event/booking pipeline, ordered quickest-first.
All reuse existing libs (`event-plan.js`, `templates.js`, `airtable.js`, `slots.js`,
`routing.js`, `markets.js`, `events.js`, `book.js`). Deploy via the `ship` flow.

## Feature 1 — Day-of customer notice (2 hrs before start)

Customers currently get reminder emails at **T‑10 and T‑2** (7:00 AM Central). Add a
**T‑0** (event morning) notice. Events start 9:00 AM (slots 9:00–12:40), and the
reminder function already acts only at the 07:00 Central tick — so a T‑0 send is
exactly **2 hours before start**.

- `lib/event-plan.js`: `CUSTOMER_OFFSETS = [10, 2]` → `[10, 2, 0]`. The existing
  cancelled/no-email guard already applies to every customer-notify action.
- `lib/templates.js`: `buildEventReminderCustomerEmail(booking, event, inst, daysUntil)`
  gains a `daysUntil === 0` variant — subject "Tuned Yota — your tune is **today**",
  body "Your appointment is **today at {Slot}**" + venue address + installer. The
  existing 2-day/`coming up` copy is unchanged.
- **Tests:** `event-plan` (a T‑0 event yields a `customer-notify` per booked, non-cancelled,
  emailed booking); `templates` (day-of subject/body render, includes slot).

## Feature 2 — Post-event rebook report (T+1 + weekly)

A single reusable renderer feeds two deliveries, both to **info@** (`OWNER`).

- **`lib/rebook-render.js`** — pure. `renderRebookReport(records, { title })` →
  `{ subject, html, text }`. Input = flattened Priority-List rows. Output shows:
  1. **All** outstanding records (count + a line each: name, phone, vehicle, city,
     reason, event date).
  2. Grouped **by event location** (City).
  3. Grouped **by installer** (Installer key → display name via `routing.js`).
  "Outstanding" = `Notified` not truthy. Each row is labeled with its `Reason`
  (`Rebook — not completed` / `Event full` / `No event scheduled`) so the one report
  covers the whole waitlist/rebook backlog.
- **T+1 delivery** — in `event-reminders.js`, after the day's waitlist sweep, email
  info@ a report **scoped to the events swept today** (title `Post-event rebook — {City} {date}`).
  Reuses the freshly-listed `priority` records filtered to those cities/dates.
- **Weekly delivery** — new scheduled function **`rebook-report.js`**
  (`schedule = "0 13 * * 1"` = Mondays 13:00 UTC ≈ 8:00 AM CDT; gated to the 07:00
  Central tick like the others is unnecessary since it's already a weekly cron — send
  on invocation). Lists ALL outstanding Priority rows and emails the full grouped
  report (title `Weekly rebook backlog`). Registered in `netlify.toml`.
- **Recipient:** info@ only (installers do not get separate copies this round).
- **Tests:** `rebook-render` (grouping by city + installer, outstanding filter, empty
  case → "none outstanding"); `rebook-report` fn (lists + sends; no-op-sends when empty).

## Feature 3 — Mobile intake form (multi-channel + walk-ins)

A private staff tool to intake leads/bookings from text, phone, email, Facebook,
Instagram, and day-of walk-ins.

- **`site/intake.html`** — mobile-first, not linked in nav. Passcode gate: on first use
  prompts for a passcode, stores it in `localStorage`, sends it on every submit as an
  `x-intake-secret` header. Fields: Name, Phone, Email, Vehicle, Goals/Notes,
  Modifications, **Source channel** (`Text / Phone / Email / Facebook / Instagram /
  Walk-in / Other`), and a **mode toggle**:
  - **Book into an event** → city + date (from active events) + open slot (fetched live
    from the existing `availability` function) → real booking.
  - **Add as a lead** → city (or "no event") → Priority-List follow-up.
  On success shows a confirmation + a "add another" reset (fast repeat entry at events).
- **`netlify/functions/intake.js`** — validates `x-intake-secret` against
  `INTAKE_SECRET` (401 otherwise). Then:
  - **book mode:** create the `Bookings` record directly using the same libs as
    `book.js` — `getMarket`/`keyToInstaller` for installer routing, `getEventForCity`
    for the event, `computeOpen`/`isValidSlot` (`slots.js`) for a live slot-availability
    check (return `conflict` + open slots if the picked slot is taken), then
    `createTolerant` with `Status: "Booked"`, `Source: "intake:<channel>"`. It does
    **not** call `processBooking` and does **not** fire the customer-confirmation
    background job — intake bookings send no auto-email (per design); they appear in the
    installer roster automatically and future-dated ones still get the normal reminders.
  - **lead mode:** create a Priority-List row directly (like `book.js`'s `priority()`),
    `Installer` auto-routed from the chosen city, `Reason = "No event scheduled"`,
    channel recorded. `Source` written via `createTolerant` so a missing Priority
    `Source` column degrades gracefully (no Airtable change required).
- **Access:** `INTAKE_SECRET` env var (set via `netlify env:set` by Claude). The page is
  at an unlisted path; the secret is the real gate.
- **Tests:** `intake` fn — secret gate (401 on bad/missing), book-mode delegates to
  processBooking, lead-mode writes a Priority row with routed installer + channel,
  bad-input handling.

## Cross-cutting

- **Deploy:** `ship` flow (build:seo only if SEO inputs change — none here except the new
  `intake.html` which is unlisted and excluded from the sitemap). `npm test` green,
  push master, confirm Netlify `ready`.
- **Secret:** Claude runs `netlify env:set INTAKE_SECRET <value>` and redeploys.
- **Optional Airtable niceity:** a `Source` single-line-text column on the Priority List
  — code tolerates its absence, so it is not required.

## Out of scope

- No installer-specific rebook emails (owner-only this round).
- No per-event custom start times (all events 9:00 AM → 7:00 AM day-of notice holds).
- No customer confirmation redesign; intake book-mode sends no auto-email at all.
