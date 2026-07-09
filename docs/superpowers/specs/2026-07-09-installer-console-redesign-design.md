# Installer Console Redesign — Design Spec

**Date:** 2026-07-09
**Status:** Approved for planning (pending spec review)
**Owner ask:** The console (`/installer.html`) only shows *future* bookings in one flat
running list. Installers can't see or close out **prior open bookings**, and future work
isn't organized. Make it easier to work an event / monthly reporting cycle. Plus: no-shows
must be added to the priority waitlist, gated by an installer confirmation.

## Goal
An installer opens the console and immediately (1) sees anything still needing close-out
from **past** events, and (2) can browse the current reporting month's events, walk-ins, and
completed jobs in a manageable, phone-friendly structure — closing out any booking (past,
upcoming-day-of, or walk-in) with the existing flow.

## Root cause of today's gap
`installer-roster.js` filters `Event Date >= today`, so past events and their open bookings
are never returned. The frontend renders whatever comes back as one flat list.

---

## 1. UX & structure (mobile, accordion-based)

Rendered top-to-bottom in `/installer.html`:

**A. "Needs close-out" banner** — first, shown only when count > 0. Every booking on a
**past** event (`Event Date < today`) still open (Status not Completed/No-show/Cancelled),
across all time, grouped by event, each an inline close-out card. This is the previously
invisible work.

**B. Month browser** — `◀ July 2026 ▶`, default = current **calendar month** (aligns with the
monthly OTT report cycle). Prev/next arrows move the window. Inside the selected month,
collapsible rows:
- **One row per event**: `▸ Jul 12 · Twin Cities (4 open)` → expand → close-out cards.
- **`+ Walk-in`** → inline quick-add form (name, vehicle, phone, event picker of that month's
  events) → creates a booking scoped to the installer → appears under Walk-ins.
- **`Walk-ins this month (N)`** → close-out cards for walk-in-sourced bookings that month.
- **`Completed this month (N)`** → collapsed, read-only reference.

Accordion rows (not horizontal tabs) — better on a phone. All collapsibles remember nothing
across reloads (stateless; simplest).

**C. Close-out card** — unchanged capture (VIN, OTT Calibration, commission fields → cert
email). Now reachable for past + walk-in bookings identically.

**D. No-show confirmation** — the "No-show" action gains a required checkbox:
`☐ Customer didn't show — add to waitlist`. The No-show button stays disabled until it's
checked. On submit, the booking is marked No-show **and** the customer is added to the
priority waitlist for re-book.

---

## 2. Backend & API

### `installer-roster.js` (modified)
- Drop the `Event Date >= today` filter.
- Return the installer's **full non-cancelled history** as a flat array (frontend buckets it):
  ```
  { installer, today, bookings: [ { id, city, dateISO, slot, slotLabel, name, vehicle,
      phone, email, mods, status, isWalkin, calibration, vin, tuningPlatform,
      calibrationType, ecuId, gearSize, mileage } ] }
  ```
- `isWalkin` = `Source` starts with `intake:walk-in` or `installer:walk-in`.
- One fetch; month switching is instant client-side.

### `installer-walkin.js` (new)
- Installer-token authed (`resolveInstaller`).
- Body: `{ city, dateISO, name, vehicle, phone }`.
- **Ownership guard:** the chosen `city` must route to the authenticated installer
  (`getMarket(city)` → `keyToInstaller(market.inst).key === authedKey`); reject otherwise.
  The event `(city, dateISO)` should be a real scheduled event (validate via events lib);
  reject unknown events.
- Requires `name` + `phone` (walk-ins are present in person; phone is the re-contact path).
  Missing → error.
- Creates a Bookings record: `Installer`, `City`, `Event Date`, `Name`, `Vehicle`, `Phone`,
  `Status: "Booked"`, `Source: "installer:walk-in"`, no `Slot`. Uses `createTolerant` for
  optional columns.
- Returns the created record (shaped like a roster booking) so the console inserts it
  without a full reload.

### `installer-closeout.js` (modified — no-show path only)
- No-show action now **requires `confirmed: true`** in the body (server-enforced); missing →
  `{ status: "error", error: "unconfirmed" }` (400).
- **Idempotent:** if the booking is already `No-show`, return `{ status: "noshow",
  alreadyWaitlisted: true }` without a second waitlist write.
- On a fresh no-show: set `Status: "No-show"`, then create a **Priority** (waitlist) record
  from the booking — mirroring `intake.js` lead mode — with fields: `City`, `Name`, `Phone`,
  `Email`, `Vehicle`, `Modifications`, `Installer` (the owner key), `Reason: "No-show — {City}
  {dateISO}"`, `Source: "installer:no-show"`. Use `createTolerant(["Modifications","Source"])`.
- Waitlist add is **non-blocking**: the Status change is primary; if the Priority write fails,
  still return `{ status: "noshow", waitlisted: false }` and log. On success `waitlisted: true`.
- Complete path unchanged.

---

## 3. Testing

- `installer-roster.test.js` (update): past bookings now included; cancelled excluded;
  `isWalkin` true for `installer:walk-in`/`intake:walk-in` sources, false otherwise; flat shape.
- `installer-walkin.test.js` (new): 401 without token; creates a scoped booking with correct
  fields + `Source`; **rejects a city that routes to a different installer**; rejects unknown
  event; missing `name`/`phone` → error.
- `installer-closeout.test.js` (extend): no-show without `confirmed` → error; confirmed
  no-show sets Status + writes a Priority record with the mapped fields; re-submit on an
  already-No-show booking does not double-write; Priority-write failure still returns noshow.
- Complete-path tests stay green.

## 4. Scope / YAGNI
- Calendar-month cycle only (no custom cycle boundaries).
- No auto-no-show of stale bookings — they persist in "Needs close-out" until acted on.
- Return full history now (per-installer volume is small); add a windowing param only if it
  ever grows.
- No new Airtable columns required — reuses existing Bookings + Priority fields and `Source`.
- Walk-in quick-add reuses booking/Airtable libs; no new customer email is sent (parity with
  intake walk-ins).

## Files
- `netlify/functions/installer-roster.js` (modify)
- `netlify/functions/installer-walkin.js` (new)
- `netlify/functions/installer-closeout.js` (modify no-show path)
- `site/installer.html` (rewrite UI/JS)
- `tests/installer-roster.test.js`, `tests/installer-walkin.test.js` (new),
  `tests/installer-closeout.test.js`
