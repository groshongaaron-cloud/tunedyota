# SOP 2 — Client Lead Tracking

**Owner:** Owner/Operator · **Cadence:** Daily review + weekly backlog sweep
**Goal:** Every inbound contact is captured, routed to the right installer, and followed up —
nothing falls through the cracks.

A "lead" is any interested person who is **not yet booked into an event slot**. Leads live on
the Airtable **Priority List** (the waitlist). A "booking" is a confirmed slot at a scheduled
event and lives in **Bookings**. This SOP covers capture and routing; conversion of the
waitlist is [SOP 5](sop-priority-waitlist.md).

---

## 1. Where leads come from

| Source | Path | Lands in |
|--------|------|----------|
| Website booking flow, no event in their city | `/find-your-exact-tune` → `book.js` | Priority List (`Reason: no-event`) |
| Website booking flow, event full | same | Priority List (`Reason: full`) |
| Website "Free OTT Update" / tune-finder form | Netlify form → `submission-created.js` | Installer email + auto-reply |
| **Walk-in / phone / DM / email** | **`/intake.html`** (staff) → `intake.js` | Bookings *or* Priority List |
| Post-event no-show / not completed | `event-reminders.js` sweep | Priority List (`Reason: Rebook — not completed`) |

---

## 2. Staff intake form — `/intake.html`

Use this for **any lead that doesn't come through the website** (phone call, walk-in at an event,
Instagram DM, forwarded email).

1. Open `/intake.html`, enter the intake passcode (once; stored on the device).
2. Choose **Book** (they want a specific event slot) or **Lead** (no event yet / just interested).
3. Pick the **channel** (phone / walk-in / Instagram / Facebook / email / text / other) — this
   becomes the `Source` column so we can see which channels produce.
4. Fill name + phone/email + vehicle + goals + mods. Submit.

Behind the scenes (`intake.js`):
- **Book** → writes a **Bookings** record, `Status: Booked`, `Source: intake:<channel>`. Routed to the market's installer. **No customer email is sent** (staff-entered), so confirm details verbally.
- **Lead** → writes a **Priority List** record. If the city has no market match it's filed under **`Unassigned`** (no installer) so it's never lost — reassign later.

The form is **passcode-gated** and fails closed — a missing/wrong passcode returns 401.

---

## 3. Routing — market → installer

`routing.js` + `markets.js` map every city to an installer key (`aaron` / `noah` / `cody`);
unknown cities fall back to `aaron`. To change coverage, **use the [`update-routing`](../../.claude/skills/update-routing/SKILL.md)
skill** — it keeps the public booking page and the server-side routing in sync. Never edit one side only.

---

## 4. What's stored (Airtable)

**Bookings** columns: City, Event Date, Slot, Name, Phone, Email, Vehicle, Goals, Modifications,
Installer, Status, Source, UTM Source/Medium/Campaign, OTT Calibration, Calibration Date, VIN,
Certificate Sent, Email Status.

**Priority List** columns: City, Name, Phone, Email, Vehicle, Goals, Modifications, Installer,
Reason, Event Date, Requested Slot, Notified, Source.

**Funnel Events** (analytics): Session, Step, Step Name, UTM fields — written by `track.js`
beacons, independent of the booking write (analytics never block a booking).

> **Resilience:** writes are *tolerant* — if an optional column is missing, the record still
> saves without that field (`createTolerant` / `updateTolerant`). A schema gap never drops a lead.

---

## 5. Daily / weekly routine

- **Daily:** scan new Bookings + Priority List rows. Reassign any `Unassigned` leads to an installer.
  Action any `Email Status = FAILED` booking (email didn't reach the customer — follow up manually).
- **Weekly (auto):** `rebook-report.js` emails `info@` every **Monday ~8:00 AM Central** the full
  outstanding Priority List backlog, grouped by location + installer. Work that list (SOP 5).
- **Monthly (auto):** `submissions-report.js` emails the executive summary + `contacts.csv` on the
  **1st**, and posts a Slack summary.

---

## 6. Definition of done

- [ ] Every lead has a source/channel recorded.
- [ ] No lead sits in `Unassigned` past the daily review.
- [ ] `Email Status = FAILED` rows are followed up.
- [ ] Weekly rebook report is actioned, not just received.

**Related:** [SOP 1 Marketing](sop-client-marketing.md) · [SOP 3 Booking](sop-event-booking.md) · [SOP 5 Priority Waitlist](sop-priority-waitlist.md)
</content>
