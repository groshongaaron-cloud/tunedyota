# Client Notes — notes that travel with the client record

**Date:** 2026-07-31 · **Approved by:** Aaron (design conversation, this date)

## Problem

At an event an installer learns something about a client — "has an aFe cold air
intake" — after the booking was made. Today there is nowhere to put that fact.
Aaron's rule: **the note travels with the client record**, not the booking. If
the client books a second or third time (or hasn't booked yet), the notes are
simply there, because the client record (a Leads / Priority List row) is the
single home for what we know about a person.

## Decisions (from design conversation)

1. **Timestamped append-only log** — every save appends a stamped line; nothing
   is silently overwritten; you can tell who wrote what and when.
2. **Visible on the booking card** — not buried in the Edit panel. A note like
   "cold air intake" is exactly what the installer needs at a glance.
3. **Notes always allowed** — including on Completed/Cancelled bookings. The
   report-critical-field lock does not apply because notes never touch the
   booking record at all.
4. **One home: the Lead record.** Never stored on Bookings, so there is no
   sync/copy problem. Conversion "carries notes over" by doing nothing.

## Data

- New long-text column **`Client Notes`** on the Leads (Priority List) table,
  created with the existing `scripts/airtable/ensure-field.mjs` meta-API helper.
- Format: one line per note via the existing `logLine`/`appendActivity` helpers
  in `lib/leads.js`: `2026-07-31 14:03 — cody: has aFe cold air intake`.
- Deliberately **not** `Activity Log`: that is the system audit trail (stage
  changes, link events). `Client Notes` = what we know; `Activity Log` = what
  happened.

## Server

New function `netlify/functions/installer-client-note.js`, POST, installer
token auth, mirroring the deps-injection shape of `installer-reschedule.js`.

Body: `{ leadId, note }` **or** `{ bookingId, note }`.

- Note text: trimmed, required non-empty, max 500 chars. No other validation
  (owner rule: never block the owner).
- Stamp is built **server-side** (installer key + timestamp) so clients cannot
  forge or clobber history.
- **Lead path** (`leadId`): ownership like `lead-update` — own leads, admin
  any. Appends to `Client Notes`. Does **not** bump `Last Contact` (a note is
  not a contact; Last Contact drives stale/nurture logic).
- **Booking path** (`bookingId`): ownership = booking ownership (own bookings,
  admin any); booking Status is irrelevant. Client resolution order:
  1. Lead already linked to this booking (`Booking` linked field / legacy
     `Converted Booking` id).
  2. Phone match (normalized last-10) against leads; email as secondary.
  3. **Mint** a lead from the booking identity (Name/Phone/Email/Vehicle/City,
     market-routed installer, Stage `Booked`, linked back to the booking with
     the `buildLinkPatch` fields + an Activity Log line `minted from booking …`)
     — reusing the contact-resolver pattern.
- The notes write uses a plain `updateRecord` — NOT `updateTolerant`, which
  would silently drop the one field that matters if the column were missing.
  The `Client Notes` column is created at ship time via `ensure-field.mjs`;
  if it's somehow absent the caller gets a loud `store-unavailable`.
- Response: `{ status:"ok", leadId, notes }` (full updated `Client Notes`).

## Console UI (`site/installer.html`)

- **Booking cards** (open, completed, and no-show): a 📝 notes strip rendering
  the client's `Client Notes` lines, joined client-side from already-loaded
  leads (linked-booking id first, then the same phone-keyed match
  `knownIdentityFor` uses). Below it a collapsed `📝 Add note` details element
  with one input + Save.
- **Lead cards** (Leads tab): same strip + same Add note control.
- On save: update local STATE (lead's notes), re-render, success line
  `✓ Note saved to <name>'s record`, and jump-and-flash the card (console
  rule: every action ends with the booking visibly highlighted).
- If the booking's client isn't in the locally loaded leads (other-installer
  lead), the Add note control still works (server resolves); the strip fills
  in from the save response / next load. Customer 360 always shows the full
  notes regardless.

## Customer 360

`toLeadView` gains `clientNotes` (from `Client Notes`), so `customer-view.js`
responses include it and the 360 overlay shows the notes with the lead.

## Testing

Deps-injected unit tests matching the suite's existing pattern:

- Lead path: appends stamped line, preserves existing lines, no `Last Contact`
  change, ownership enforced, admin override, empty/oversize note rejected.
- Booking path: linked-lead resolution, phone-match resolution, mint-new-lead
  resolution (fields + link + market routing), completed booking allowed,
  not-your-booking rejected.
- Stamp format is `YYYY-MM-DD HH:MM — <key>: <text>`.
- `toLeadView` exposes `clientNotes`.

## Out of scope

- Editing/deleting individual note lines (append-only by design).
- Surfacing notes to the customer-facing app (internal only).
- The vehicle-aware marketing funnel (queued separately in memory) — though
  notes recorded here become targeting signals for it later.
