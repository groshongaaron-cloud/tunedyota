# Lead connections: booking links, stale bucket, waitlist visibility, booking chat

Date: 2026-07-30 · Status: awaiting Aaron's review · Owner: installer console

## Context

The Airtable **Priority List** table is the single store behind two ideas that grew
together: the event **waitlist** (its original schema — Reason, Requested Slot,
Event Date, Notified) and the multi-channel **leads pipeline** (Stage, Channel,
Activity Log) that the console's Leads tab reads via `leads-list.js`. Everything in
that table already appears in the console — as leads. What's missing is connective
tissue, in four places:

1. **A lead that duplicates an existing booking stays disconnected.** Real case:
   lead `recEOyhZmWkQy28yL` ("Text 619-417-6865", SMS) is Eli Soetenga, who already
   holds booking `recLBhEKXFytNfzp0` — Madison, Sat 2026-08-01, 10:20, installer
   aaron. Same phone after `normalizePhone()`.
   Nothing surfaces that; his lead sits in the New queue.
2. **Stale leads have no home.** Leads nobody has touched in weeks are invisible
   unless someone scrolls for them; Aaron wants a focused, monitorable bucket that
   future automations can trigger from.
3. **Waitlist context is not rendered.** Waitlist-born rows (Reason = "Event full" /
   "No event scheduled", Requested Slot, Event Date) display as generic leads, so
   the waitlist appears to be missing from the console entirely.
4. **Booking cards have no chat affordance.** The "text through the TY line" button
   exists on lead cards and the Calls tab (`site/installer.html:1836` pattern) but
   not on Jobs-tab booking cards.

## Decisions already made (Aaron, 2026-07-30)

- Linking a lead to a booking marks the lead **Booked** and shows the booking on the
  lead card permanently. (Not "keep stage", not "merge and delete".)
- Leads also connect to **Clients** portal accounts (matched by email; shows garage).
- Storage for the link is a **real Airtable linked-record field**, not a text id —
  the world-class-bar call. Existing `Converted Booking` text ids get backfilled.
- Stale leads become **their own bucket** designed so future notifications and
  interactions can key off it.

## Access model (unchanged, stated for the record)

Scoping is enforced server-side by `resolveInstaller()` / `isAdmin()` and
`scopeLeads()`: a regular installer sees only leads whose `Installer` field is
theirs; Aaron (admin) sees every lead, including unassigned ones. Ingest
auto-assigns `Installer` from the lead's city via `getMarket()`, which is what makes
installer visibility regional. Unknown-city leads land in the admin-only unassigned
bucket for Aaron to reassign. All four features below inherit this model untouched.

## Feature 1 — Link leads to existing bookings

### Storage

- New field on Priority List: **`Booking`**, type `multipleRecordLinks` →
  Bookings, `prefersSingleRecordLink: true`. Airtable auto-creates the mirror
  field on Bookings; rename the mirror to **`Leads`**.
- `scripts/airtable/ensure-field.mjs` gains support for an options JSON argument
  (needed for `linkedTableId`, resolved from the meta API by table name).
- New one-time script `scripts/airtable/backfill-booking-links.mjs`: for every
  Priority List record with a `Converted Booking` text id, write `Booking:[id]`.
  Skips dangling ids (booking since purged) and already-linked rows; `--dry-run`
  flag prints the plan without writing. Idempotent.
- `Converted Booking` (text) stays in place, dormant, as history. Read path prefers
  the linked field and falls back to the text field until backfill has run.

### Matching (server)

- `leads-list.js` loads Bookings and Clients in parallel with Priority List.
  **Fail-open:** if either extra read throws, leads still render — suggestions and
  client info are enhancements, never a reason to 502 the tab.
- Pure helpers in `lib/leads.js` (unit-tested):
  - `toBookingSummary(rec)` → `{ id, name, city, dateISO, slot, scheduledTime,
    status, installer }`.
  - `bookingMatchesForLead(lead, summaries)` → non-Cancelled bookings sharing a
    normalized phone **or** email with the lead; only computed for leads with no
    linked booking; sorted upcoming-first. Completed bookings match too (repeat
    customers texting in) and carry their status into the suggestion.
  - `clientForLead(lead, linkedBooking, clients)` → `{ email, vehicles[] }` matched
    by `normalizeEmail(lead.email || linkedBooking.email)`; `Vehicles` JSON parsed
    defensively (bad JSON → empty garage, never a crash).
- Each lead in the response gains: `matches[]` (suggestions), `booking` (resolved
  summary when linked), `client` (or null).

### Actions (server, `lead-update.js`)

- **`link`** `{ id, action: "link", bookingId }`: reads the booking from Bookings
  (miss → 400 `booking-not-found`); patches the lead `Booking:[bookingId]`,
  `Stage:"Booked"`, activity line
  `linked → existing booking <id> (<city> <date> <time>)`; responds with the
  booking payload in roster shape so the console can jump-and-flash — the same
  contract `convert` already honors. Ownership checks unchanged (installer links
  own leads; admin links any).
- **`unlink`** `{ id, action: "unlink" }`: clears `Booking` (and the legacy text
  field), logs the unlink, leaves Stage for the installer to correct with the
  existing stage buttons. Mislink recovery must exist before mislinks do.
- **`convert`** now also writes `Booking:[newId]` alongside the legacy text field.

### Console UI (Leads tab, `site/installer.html`)

- **Suggestion strip** on unlinked leads with matches: "Looks booked already:
  **Eli Soetenga** — Madison · Sat Aug 1 · 10:20 · Aaron **[Link]**". Multiple
  matches list vertically; linking any one dismisses the strip.
- **Manual picker**: "Link to existing booking…" beside Convert in the expanded
  card — filterable list built from the roster bookings already loaded (admin sees
  all installers' bookings, installers their own).
- **Linked line** on Booked-and-linked leads: "📅 Madison · Sat Aug 1 · 10:20" —
  tapping switches to Jobs and flashes the booking (existing jump-and-flash
  motion; a linked lead never dead-ends).
- **Client line** when a portal account matches: "👤 tunedyota.com account ·
  garage: 2019 Tacoma". Quiet styling; informational.

## Feature 2 — Stale-lead bucket

- **Definition (single source of truth):** a lead is stale when its stage is in
  `ACTIVE_STAGES` **and** days since (`Last Contact`, else `Created Time`) ≥ 30
  **and** no future `Next Follow-up` is set. A scheduled follow-up means it's
  being worked; an overdue one already surfaces in the due queue — stale is the
  fell-through-the-cracks bucket.
- Pure helper `staleLeads(leads, todayISO)` in `lib/leads.js`, shaped like the
  existing `dueLeads()`. The threshold is a named constant (`STALE_AFTER_DAYS = 30`).
- `leads-list.js` summary gains a `stale` count; each stale lead carries
  `staleDays`.
- **UI:** a "Stale" filter chip on the Leads tab with a count badge; the filtered
  view sorts oldest-contact-first and shows "42d since contact" on each card.
  Installers see their own stale leads; Aaron sees all.
- **Future hook (designed-for, not built now):** any scheduled function or n8n
  routine reuses `staleLeads()` for notifications/re-engagement — the definition
  lives in exactly one place so console and automation can never disagree.

## Feature 3 — Waitlist visibility

- `toLeadView()` additionally exposes `eventDate`, `requestedSlot`, `notified`
  (fields already in the table since the original waitlist schema).
- Lead cards with a `Reason` render a waitlist badge:
  "⏳ Waitlist — Event full · Omaha 7/26 · wanted 10:20".
- A "Waitlist" filter chip on the Leads tab focuses these rows.
- Converting or linking a waitlist entry uses the existing motions — no new flow.
- Regional scoping is already correct per the access model above; no change.

## Feature 4 — Chat with clients from booking records

- Jobs-tab booking cards gain the same two contact buttons lead cards have:
  **Call** (`tel:`) and **Text via TY line** — the latter reusing the
  open-or-create-thread call at `site/installer.html:1836` and jumping to the
  Chats tab with the thread open. No server change; the chat-admin endpoint
  already does this for leads and calls.
- Applies to Booked and Completed bookings (texting a past client is a valid
  motion); hidden when the booking has no phone.

## Error handling

- Matching/client enrichment: fail-open, logged, never blocks the Leads tab.
- `link`/`unlink`: loud failures — 400 with a named error the card surfaces
  (`booking-not-found`, `not-your-market`), 502 `store-unavailable` on Airtable
  errors. No silent outcomes (console UX rule).
- Backfill: idempotent, dry-run first, prints every write and every skip.

## Testing (tests first, repo norm)

- `lib/leads.js`: `bookingMatchesForLead` (phone format variants incl. `+1`,
  email case-insensitivity, lead with no contact info → no matches, Cancelled
  excluded, already-linked skipped, upcoming-first order); `staleLeads`
  (29d/30d boundary, future vs overdue follow-up, non-active stages excluded);
  `toLeadView` linked-array-first fallback to text field; `clientForLead`
  (email via lead vs via booking, bad Vehicles JSON).
- `lead-update.js`: link happy path (patch + response shape), booking-not-found,
  scope enforcement for non-admin, unlink clears both fields, convert writes the
  linked field.
- `leads-list.js`: response carries `matches`/`booking`/`client`, fail-open when
  the Bookings read throws, stale count in summary.
- Console HTML is exercised by live smoke (below), per repo practice.

## Rollout

1. Extend `ensure-field.mjs`; create the `Booking` field via meta API (token has
   schema scope); rename the Bookings mirror to `Leads`.
2. Run `backfill-booking-links.mjs --dry-run`, review, then run live.
3. Ship functions + console changes: tests green → commit → push (repo rule).
4. Live smoke: link Eli's lead (`recEOyhZmWkQy28yL`) to his booking
   (`recLBhEKXFytNfzp0`) from the console; confirm stage flips to Booked, the
   card shows "Madison · Sat Aug 1 · 10:20", jump-and-flash lands on the booking,
   and the booking's `Leads` field in Airtable points back at the lead.

## Out of scope (named so they aren't lost)

- Stale-lead notifications (Slack/SMS routine reusing `staleLeads()`).
- Booking card rendering the linked lead's activity/SMS history inline.
- Clients-table-as-CRM-hub consolidation.
- Waitlist slot-offer automation (texting waitlisted people when a slot opens).

## Correction of record

The 30-day purge (`purge-cancelled.js`) applies **only** to bookings explicitly
cancelled/deleted in the console — soft-deleted first, recoverable for 30 days,
then hard-deleted. Completed and historical bookings are never purged.
