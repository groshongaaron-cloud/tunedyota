# Event Booking Slots — Design

**Date:** 2026-06-17
**Status:** Approved, ready for implementation plan
**Page affected:** `site/find-your-exact-tune.html` (adds a booking step)
**New backend:** Netlify Functions + Airtable (first persistent shared state on the site)

## Goal
Let a customer who has finished the tune finder **book a real time slot** at their
city's upcoming event, with live availability. When a city's slots are full — or the
city has no event scheduled yet — the customer is added to a **Priority Event List**
instead.

## Decisions (from brainstorming)
- **True live booking.** A booked slot is removed for everyone in real time. Requires
  a server-side datastore.
- **Slots are keyed by `(city, event date)`.** The event date comes from the existing
  event Google Sheet. Setting a new date for a city opens a fresh set of slots
  automatically. A city with no date → Priority Event List.
- **Datastore: Airtable.** Bookings + Priority List live in an Airtable base so the
  business gets a real grid to view, cancel, export, and work the waitlist.
- **Confirmations: email + SMS text + `.ics` calendar invite** to the customer;
  email notification to the assigned installer + owner.
- **Slots:** 12 per `(city, event date)` — `9:00–12:40`, every 20 min (3/hour,
  9am–1pm). 20-minute windows.

## Slot model
```
SLOT_TIMES = 9:00 9:20 9:40 10:00 10:20 10:40 11:00 11:20 11:40 12:00 12:20 12:40
CAPACITY   = 12 per (city, eventDateISO)
```
A slot is "taken" when an Airtable Bookings record exists for that
`(City, Event Date, Slot)` with `Status != Cancelled`. Open slots = `SLOT_TIMES`
minus taken. `full` = 0 open.

## Event date source (prerequisite)
The booking functions read the **published event Google Sheet** (`EVENTS_SHEET_ID`,
the same one the event map uses) server-side via the gviz CSV endpoint, and build a
`city -> { dateISO, label, active }` map.

- The sheet's `Date` cell **must be a parseable calendar date** (e.g. `2026-07-12`
  or `Jul 12, 2026`). It is normalized to `dateISO` (`YYYY-MM-DD`), which is the
  stable booking key. The human label is still shown as entered.
- If a city's row is missing/`Active=no`/has an unparseable date → the city is
  treated as **no bookable event** → Priority List. Logged, never errors.
- `EVENTS_SHEET_ID` is currently blank. **Booking does nothing useful until it is set
  with at least one dated, active city.** This is a hard prerequisite.

## Customer flow (`find-your-exact-tune.html`)
After the funnel resolves vehicle + city + installer, the result gains a **Book step**:

1. On city selection, the page calls `availability(city)`.
2. **Event + open slots:** show the event date and a 12-button slot grid. Taken slots
   are disabled/greyed. Customer taps an open slot, confirms name / phone / email
   (prefilled from the funnel where available), and submits.
3. **Full (12/12) or no event:** show **"Join the Priority Event List"** — name /
   phone / email only — with copy explaining they'll be first to know when a slot
   opens / the city is scheduled.
4. On submit the page `POST`s to the `book` function and shows a tailored success
   state (booked vs. priority). If the slot was taken in the race window, the response
   is `conflict` and the grid refreshes for a repick.

Progressive enhancement: with JS disabled, the booking grid is not shown; the existing
call/text CTA remains the fallback.

## Backend

Follows the existing pattern: thin handlers + **pure logic functions with injected
deps** (`fetchImpl`, airtable client, `sendEmail`, `sendSms`, `now`), tested with
`node --test`. CommonJS.

### Functions
1. **`GET /.netlify/functions/availability?city=<city>`**
   Returns:
   ```
   { city, hasEvent, eventDateISO, eventLabel, capacity:12,
     openSlots:[...], takenSlots:[...], full }
   ```
   Logic: `getEventForCity(city)` from the sheet; if none → `{hasEvent:false}`.
   Else list Airtable Bookings for `(city, eventDateISO)` and compute open/taken.

2. **`POST /.netlify/functions/book`** — handles both real bookings and priority signups.
   Body: `{ city, slot?, name, phone, email, vehicle, goals, installer_key, utm_*, bot_field }`.
   Logic:
   - If `bot_field` non-empty → `{status:"ignored"}` (honeypot).
   - Validate `city` against `lib/markets.js`; validate name + (phone or email).
   - `getEventForCity(city)`:
     - **No event** → create **Priority List** record (`Reason: no-event`) → priority confirmations → `{status:"priority", reason:"no-event"}`.
     - **Event exists**:
       - Re-list bookings; if `full` → Priority List (`Reason: full`, with Event Date) → priority confirmations → `{status:"priority", reason:"full"}`.
       - If `slot` missing/invalid/taken → `{status:"conflict", openSlots}`.
       - Else create **Bookings** record → booking confirmations → `{status:"booked", eventDateISO, eventLabel, slot}`.

### Shared libs (new, under `netlify/functions/lib/`)
- `markets.js` — server source of truth: list of cities + `inst` key (mirrors
  `MARKETS` in the HTML). Validates city; resolves installer with existing
  `routing.js` `keyToInstaller`.
- `events.js` — fetch + parse the event sheet CSV → `city -> {dateISO,label,active}`;
  date parsing/normalization. Injectable `fetchImpl`. Silent fallback on failure.
- `slots.js` — `SLOT_TIMES`, `CAPACITY`, `computeOpen(taken)`, display formatting
  (`"9:20"` → `"9:20 AM"`).
- `airtable.js` — minimal Airtable REST client (`listRecords`, `createRecord`) using
  `AIRTABLE_TOKEN` + `AIRTABLE_BASE_ID`. Injectable `fetchImpl`.
- `ics.js` — build a `.ics` VEVENT string for a booking (date, time, city, summary).
- `sms.js` — Twilio send via REST (injectable `fetchImpl`). **Feature-flagged**: if
  `TWILIO_*` env is unset, it is a no-op (so email + calendar ship before SMS is live).
- `templates.js` — extend with: `buildBookingCustomerEmail`, `buildBookingInstallerEmail`,
  `buildPriorityCustomerEmail`, `buildPriorityInstallerEmail`, and SMS body builders.
- `resend.js` — existing, reused for email.

## Data model (Airtable base)
**Table `Bookings`**
| Field | Type | Notes |
|---|---|---|
| City | single line | from `markets.js` |
| Event Date | date | `eventDateISO` |
| Slot | single select | one of the 12 times |
| Name / Phone / Email | text | |
| Vehicle / Goals | text | from funnel |
| Installer | single select | aaron / noah / cody |
| Status | single select | Booked (default) / Completed / No-show / Cancelled |
| Source | text | "find-your-exact-tune" |
| UTM Source/Medium/Campaign | text | optional |
| Created | created time | |

Uniqueness (`City + Event Date + Slot`, Status≠Cancelled) is enforced in code, not by
Airtable.

**Table `Priority List`**
| Field | Type | Notes |
|---|---|---|
| City | single line | |
| Name / Phone / Email | text | |
| Vehicle / Goals | text | |
| Installer | single select | |
| Reason | single select | No event scheduled / Event full |
| Event Date | date | set when Reason = full |
| Notified | checkbox | business workflow |
| Created | created time | |

## Confirmations
- **Customer email** (Resend): "You're booked — `<City>`, `<Label>` at `<Slot>`",
  what to bring, installer name + phone, **`.ics` attached**.
- **Customer SMS** (Twilio, when enabled): short confirmation with city/date/slot +
  installer phone.
- **Installer + owner email**: new-booking details (customer, vehicle, goals, slot,
  contact). Mirrors the current installer-notification style.
- **Priority path**: customer email/SMS "You're on the Priority Event List for
  `<City>`…"; installer + owner notified of the new priority lead.
- SMS failure is **non-fatal** (email/calendar still succeed; logged).

## Integrity, concurrency, abuse
- Airtable has no transactions. Volume is low (local events), so the race window is
  small. `book` re-lists availability immediately before insert; `availability`'s
  live read further shrinks it. Residual risk: two simultaneous bookings of the last
  slot could both insert. v1 accepts this; a later hardening step can reconcile
  duplicates (detect >1 Booked record for a slot, convert the later to conflict).
- Honeypot (`bot_field`, reuse existing convention) + server validation.
- Optional: reject a second active booking for the same email within one
  `(city, eventDate)`.

## Environment / setup (one-time, user)
- **Airtable:** free account → create base from this schema → Personal Access Token →
  set `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID` (+ optional `AIRTABLE_BOOKINGS_TABLE`,
  `AIRTABLE_PRIORITY_TABLE`) in Netlify env.
- **Event sheet:** set `EVENTS_SHEET_ID` with parseable, active dates (prerequisite).
- **Twilio (SMS only):** account + number + **A2P 10DLC** brand/campaign registration
  (slow, small fee) → `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`. Email
  + calendar work without this.
- Existing: `RESEND_API_KEY`.

## Error handling
- `availability` fetch fails (sheet/Airtable) → client degrades to the Priority List
  form + call/text CTA ("couldn't load live times").
- `book` failure → friendly "please call/text" message; nothing silently lost (owner
  notification attempted; errors logged).
- All external calls wrapped; a single failing channel never blocks the others.

## Testing
`node --test`, mirroring `tests/*.test.js`:
- `slots`: open/taken computation, formatting, capacity/full.
- `events`: CSV parse, date normalization, inactive/unparseable handling, fallback.
- `book` logic: no-event→priority, full→priority, conflict, happy-path booked,
  honeypot, validation — all with injected fakes (no network).
- `ics`: well-formed VEVENT.
- `sms`: no-op when unconfigured; correct payload when configured.

## Out of scope (v1)
- Customer self-service reschedule/cancel (managed in Airtable; customer calls/texts).
- Automated pre-event reminders (separate scheduled function — later).
- Multi-day events, per-installer sub-capacity, deposits/payments.
- Moving the event map off Google Sheets.

## Prerequisites summary
1. `EVENTS_SHEET_ID` set with at least one dated, active city.
2. Airtable base + token.
3. (For SMS) Twilio + A2P 10DLC.
Without #1, every city correctly falls back to the Priority List.
