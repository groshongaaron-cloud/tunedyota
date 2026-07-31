# Number-only booking → contact resolver — design

Date: 2026-07-31
Status: approved (owner ask, verbatim: apply the phone to an existing contact, or
create a new contact for future booking, or assign that new lead to a market)

Trigger case: booking `rec1aZiqJW8cBfK0b` named "Text 763-516-4782" — channel
adapters mint bookings/leads whose "name" is just the phone number.

## What ships (console-only; composes two existing endpoints)

On an **open booking card whose name is a placeholder** (blank, `Text …`/`Caller …`/
`Unknown …`, or the name's digits are the phone number), render a **"Who is this?"**
strip under the contact row:

1. **Apply an existing contact.** `knownIdentityFor(phone)` scans everything already
   loaded — roster bookings first (newest real-named match wins), then leads — for the
   same last-10-digit phone with a real name. Match → one button **"Use existing:
   <name>"** → POSTs the just-shipped `installer-reschedule {recordId, name}`, updates
   the card in place. The strip lazily kicks `loadLeads()` so lead matches surface.
2. **＋ New contact / lead.** Expands a mini-form: name (optional), vehicle (optional),
   **city/market** (knownCities datalist — this is the market assignment). Save →
   `ingestLead` (existing `lead-ingest` flow: dedupes active leads by phone, routes
   `city → market → installer` server-side). Blank name saves as
   `Caller (xxx) xxx-xxxx` — the adapters' placeholder convention, so the ingest
   name-backfill upgrades it automatically when the real name ever arrives.
   If a real name IS typed, it's also applied to **this booking** via the same
   reschedule call — one save fixes both records.

No new endpoints, no schema changes. Out of scope: attaching a new phone number to an
already-named contact (edit the lead directly), completed/no-show cards.

## Testing

Static wiring (`tests/installer-contact-resolver.test.js`): placeholder detector
present; strip markup gated on `isPlaceholderName`; "Use existing" posts to
installer-reschedule; mini-form saves through `ingestLead` with `city`; blank-name
fallback uses the `Caller (…)` convention. Full suite green.
