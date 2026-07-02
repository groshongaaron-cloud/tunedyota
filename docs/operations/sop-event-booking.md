# SOP 3 — Event Booking

**Owner:** Owner/Operator (system) · Installer (day-of roster) · **Cadence:** Continuous per event
**Goal:** Turn interest into a confirmed, routed, reminded slot — and never lose a booking to a
technical failure.

Full technical diagram: [`docs/architecture/booking-pipeline.md`](../architecture/booking-pipeline.md).

---

## 1. How a booking is made

A customer at `/find-your-exact-tune` picks their vehicle → sees an instant price → picks a city
and an open time slot → submits. `book.js` then:

1. **Validates** the payload (vehicle, contact). Missing contact → error shown to the customer.
2. **Routes** the city to its installer (`routing.js`).
3. **Checks the slot** against `availability.js` / `slots.js`.
4. **Writes** the Bookings record (tolerant retry on a missing optional column).
5. **Queues** notifications to `book-background.js` (runs async so a cold start can't drop them).

`book-background.js` then sends the **installer email** (CC `info@`) + **customer email** with a
**calendar `.ics`** attachment, and pings the bookings Slack via n8n. If email fails, the booking
still succeeds (HTTP 200), the row is flagged `Email Status = FAILED`, and Slack is alerted — so
the Owner follows up manually. **A booking is never lost to an email failure.**

---

## 2. Slots & capacity

- **12 slots per event**, 20-minute increments: **9:00, 9:20 … 12:40** (`slots.js`).
- A city shows as bookable only when it has an **active** event (see [SOP 7](sop-event-scheduling.md)).
- Live availability: `GET /.netlify/functions/availability?city=<city>` returns open/taken slots and `full`.

---

## 3. What happens when a slot can't be booked

| Situation | System behavior | Result |
|-----------|-----------------|--------|
| No event scheduled for the city | `book.js` files a **Priority List** lead (`Reason: no-event`) + waitlist email | Lead captured for the next event |
| All 12 slots taken | Files a **Priority List** lead (`Reason: full`) + waitlist email | First in line when a slot frees or a new date is set |
| Chosen slot just got taken | Returns `409` with the current open slots | Customer re-picks |

Waitlist handling is [SOP 5](sop-priority-waitlist.md).

---

## 4. Reminders (automatic — `event-reminders.js`, 07:00 Central daily)

| Audience | Fires at | Content |
|----------|----------|---------|
| **Installer roster** | 30, 15, 10, 2, 0 days before | Full booking list + that city's waitlist |
| **Customer** | 10, 2, 0 days before | Venue address, parking, directions, contact, their slot time |
| **Waitlist sweep** | +1 day (day after) | No-shows / not-completed → Priority List rebook |

De-duped by email + event date, so re-runs never double-send. The Owner does nothing here unless
Slack reports an **unknown event city** (means an event exists in data but the venue/roster lookup
failed — investigate).

---

## 5. Owner checklist per event

- [ ] Event is **active** with a correct date + venue address (SOP 7). "To Be Released" venues
      resolved before T−2 weeks (currently open: Rapid City, Green Bay).
- [ ] Correct installer is routed to the city (`update-routing` skill).
- [ ] Availability endpoint returns the event and open slots.
- [ ] Marketing campaign for the city is running (SOP 1).
- [ ] Day-of: the installer has console access and the roster (SOP 4 / 6).

---

## 6. Definition of done (per booking)

- [ ] Bookings row created, routed to an installer.
- [ ] Customer received confirmation + `.ics` (or `Email Status = FAILED` was actioned).
- [ ] Reminders will fire on schedule.

**Related:** [SOP 2 Lead Tracking](sop-lead-tracking.md) · [SOP 4 Close-Out](sop-event-closeout.md) · [SOP 5 Priority Waitlist](sop-priority-waitlist.md) · [SOP 7 Event Scheduling](sop-event-scheduling.md)
</content>
