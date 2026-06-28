# Tuned Yota — Booking Pipeline (`book.js`)

A deeper zoom into stage ③ of the [end-to-end workflow](tuned-yota-workflow.md): exactly
what `netlify/functions/book.js` does between a form submit and a booked, emailed slot —
including every fallback that keeps a booking from being lost. Regenerate the PNG with
`node docs/architecture/render-workflow.js`.

![Tuned Yota booking pipeline](booking-pipeline.png)

```mermaid
flowchart TD
  REQ["Customer submits Find Your Exact Tune"] --> VAL{"Valid payload?<br/>vehicle · year · engine · contact"}
  VAL -- no --> E400["Return 400 · error shown to customer"]
  VAL -- yes --> INT{"Booking an event slot?"}
  INT -- "no event yet" --> PRI["airtable.js → Priority List (waitlist)"]
  INT -- "yes" --> MKT["getMarket(city) · routing.js → installer"]
  MKT --> SLOT{"Slot open?<br/>availability.js / slots.js"}
  SLOT -- "full" --> WAIT["Add to Priority List + waitlist email"]
  SLOT -- "open" --> WRITE["createTolerant → Airtable Bookings<br/>(retry without optional field on 422)"]
  WRITE --> MAIL["resend.js → installer + customer email + .ics"]
  MAIL --> OK{"Email sent?"}
  OK -- "yes" --> DONE["Return 200 · emailFailed:false"]
  OK -- "no" --> FAIL["Email Status = FAILED · alert.js → Slack"]
  FAIL --> DONE2["Return 200 · emailFailed:true"]
  PRI --> DONE
  WAIT --> DONE
  REQ -. parallel client beacon .-> TRACK["track.js → Funnel Events"]
```

## Design notes
- **Best-effort, never lose a booking.** `createTolerant` retries the Airtable write without
  an optional field if the column is missing (422), so a schema gap never drops a booking.
- **Email failure is non-fatal.** A failed send still returns 200, flags `Email Status=FAILED`,
  and alerts Slack — so the booking persists and the owner is told to follow up manually.
- **No event yet → waitlist.** Leads for cities without a scheduled event land on the Priority
  List and are swept into the next event (and into `event-reminders.js`).
- **Tracking is a separate path.** `track.js` beacons fire client-side into Funnel Events,
  independent of the booking write — so analytics never block or break a booking.
