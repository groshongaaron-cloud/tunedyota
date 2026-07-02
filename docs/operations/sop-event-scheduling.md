# SOP 7 — Event Scheduling

**Owner:** Owner/Operator · **Cadence:** As events are added / moved / retired
**Goal:** The booking flow always shows the correct set of live events, with accurate dates and
venues, and the SEO/schema stays in sync.

---

## 1. Always use the `schedule-event` skill

Adding, rescheduling, or removing an event touches several files at once (event data, the booking
flow's schema, the sitemap, SEO assets). **Use the [`schedule-event`](../../.claude/skills/schedule-event/SKILL.md)
skill** — it performs the multi-file sync, regenerates SEO, and deploys correctly. Do **not**
hand-edit `events-data.js` alone; the schema/sitemap will drift and tests will fail.

Event record shape (`site/.../events-data.js`):

```js
{ dateISO: "2026-07-16", label: "July 16, 2026", active: true,
  event: "…", details: "…", address: "…" }
```

- **`active: true`** = the city is bookable and shows in the flow.
- **`active: false`** = hidden from booking (past or cancelled) but retained for history.

---

## 2. Adding an event

1. Run `schedule-event` with city, `dateISO`, label, and venue address.
2. If the venue isn't finalized, address may be **"To Be Released"** — but resolve it **before
   T−2 weeks** (customer reminder emails include the address). *Currently open: Rapid City, Green Bay.*
3. Confirm the market routes to the right installer (`update-routing` if not).
4. Verify: `GET /.netlify/functions/availability?city=<city>` returns the event with 12 open slots.
5. Kick off the marketing cycle (SOP 1, T−6 weeks).

---

## 3. Rescheduling

1. Update the date via `schedule-event` (keeps schema/sitemap in sync).
2. Notify already-booked customers of the new date (they're in Bookings for that city).
3. Reminders (`event-reminders.js`) recompute automatically off the new `dateISO`.

---

## 4. Retiring a past / cancelled event

1. Set `active: false` via `schedule-event` (don't delete — keeps history + certificates coherent).
2. The city stops showing as bookable; new interest becomes Priority List leads.

> The **Event Schedule Freshness** cloud routine auto-detects past-dated events still marked active
> and opens a PR to deactivate them — but schedule intentional changes yourself; don't rely on it.

---

## 5. After any change — ship correctly

Because event data feeds SEO schema, follow the [`ship`](../../.claude/skills/ship/SKILL.md) sequence:
**`npm run build:seo` → `npm test` (green) → push `master` → confirm Netlify `ready` → curl live.**
`tests/seo.test.js` fails on schema/sitemap drift, which catches a forgotten regenerate.

---

## 6. Definition of done

- [ ] Event data correct (`active`, date, label, venue).
- [ ] Routing correct for the city.
- [ ] Availability endpoint reflects the change.
- [ ] SEO regenerated, tests green, deploy `ready`, live-verified.
- [ ] Venue "To Be Released" resolved before T−2 weeks.

**Related:** [SOP 3 Booking](sop-event-booking.md) · [SOP 5 Priority Waitlist](sop-priority-waitlist.md) · [SOP 1 Marketing](sop-client-marketing.md)
</content>
