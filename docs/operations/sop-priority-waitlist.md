# SOP 5 — Priority Waitlist Monitoring

**Owner:** Owner/Operator · **Cadence:** Weekly (Monday report) + per-event sweeps
**Goal:** Convert the waitlist into booked slots — no interested customer is forgotten between events.

The **Priority List** (Airtable) is the waitlist. People land on it three ways, tracked in the
`Reason` column:

| `Reason` (exact value stored + shown in the emails) | What it means |
|------------------------------------------------------|---------------|
| `Rebook — not completed` | Booked but not marked complete at the event — no-show or unfinished. Re-book them. (Added by the overnight +1-day sweep.) |
| `Event full` | Wanted a slot but the event's 12 were all taken — joined the waitlist. |
| `No event scheduled` | Interested in a city with no event on the calendar yet. |

This same **Reason key** legend now prints at the bottom of the rebook emails (Post-Event Summary + Weekly backlog) so installers/owner can decode it inline.

---

## 1. The automatic machinery

| Automation | When | What it does |
|-----------|------|--------------|
| **Waitlist sweep** (`event-reminders.js`) | +1 day after each event, 07:00 CT | Adds no-shows / not-completed bookings to the Priority List as rebooks (de-duped by email + date) |
| **Weekly rebook report** (`rebook-report.js`) | **Mondays ~8:00 AM Central** | Emails `info@` the full **outstanding** backlog (where `Notified` ≠ true), grouped by location + installer |
| **Post-Event Summary** (`event-reminders.js`) | +1 day after an event | Emails `info@` that event's rebook list, titled `Post-Event Summary — <City> (<date>)` |

The `Notified` column is the control: an outstanding lead is one that hasn't been worked yet.

---

## 2. Weekly monitoring routine (Owner)

Every Monday, when the rebook report arrives:

1. **Triage by city.** Any city with several waitlisted people is a signal to **schedule an event**
   there (SOP 7) or add a date/slots to an existing one.
2. **Work the list.** Contact each outstanding lead — offer the nearest upcoming event slot. Use
   `/intake.html` in **Book** mode to place them into a slot (routes + records source).
3. **Mark `Notified` = true** on Priority List rows you've actioned, so they drop off next week's report.
4. **Reassign `Unassigned`** rows (leads whose city didn't match a market) to the right installer.

---

## 3. When a new event opens in a waitlisted city

1. Schedule the event (SOP 7) so the city becomes bookable.
2. Pull that city's Priority List rows and reach out **first**, before public marketing — they
   asked first and fill slots fastest.
3. Convert them via `/intake.html` (Book) or by sending them to `/find-your-exact-tune`.

---

## 4. Health checks

- **Backlog trend:** the monthly executive summary (`submissions-report.js`, 1st of month) reports
  the Priority List count. A growing backlog in a region = demand outrunning scheduled events.
- **Sweep integrity:** if a Slack alert reports an *unknown event city* during the sweep, a booking
  references a city not in the event data — investigate so its rebooks aren't missed.

---

## 5. Definition of done (weekly)

- [ ] Rebook report reviewed and every outstanding lead contacted or scheduled.
- [ ] Actioned rows marked `Notified`.
- [ ] `Unassigned` rows reassigned.
- [ ] High-demand cities flagged for a new event date.

**Related:** [SOP 2 Lead Tracking](sop-lead-tracking.md) · [SOP 3 Booking](sop-event-booking.md) · [SOP 7 Event Scheduling](sop-event-scheduling.md)
