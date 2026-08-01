# CRM capture at first touch — model year everywhere, client-record merge, one-flow close-out

Date: 2026-07-31 · Status: design approved in conversation (Aaron); spec awaiting review
Owner: funnel + installer console

## Context

Aaron's data-capture principle, from the process analysis this date: **capture each
fact at the earliest moment it's knowable without friction** — lead intake for what
the person knows, close-out at the truck for what the truck knows, derive everything
else. The client record (a Leads / Priority List row — the "single home" decision
from the client-notes design, same date) must begin forming at the very first touch
on **every** channel, records must be **mergeable** when two rows turn out to be the
same person, and the close-out must be **one fluid workflow** where the Certificate
of Calibration email ask and the OTT monthly-report mandatory fields are captured in
the same motion.

Three sub-projects, shipped separately, in order:

- **A — Model year at first touch** (smallest; immediate OTT-report data-quality win)
- **B — Client record at first touch + merge** (duplicates accrue daily from live channels)
- **C — One-flow close-out** (biggest build)

## Decisions (Aaron, 2026-07-31)

1. **Merge = suggest + one-tap confirm.** Never auto-merge two existing records; a
   human confirms. The duplicate strip must also offer **Review** (edit either
   record before merging) and a direct jump to the **notes** section.
2. **Merge mechanics = absorb + delete.** Older record survives; blanks fill from
   the duplicate; notes/activity append; booking links union; duplicate row is
   deleted after absorption; the merge is recorded in the survivor's Activity Log.
3. **Close-out gate = required for installers, admin can skip.** Report-mandatory
   fields block Complete for non-admin installers (cheap — prefills do most of the
   work); Aaron retains skip-anything (never-block-the-owner console rule).
4. **Close-out drafts.** An unfinished close-out saves everything entered so far
   and surfaces in a quick-access Drafts bucket on the Jobs tab; one tap resumes.
5. **The cert ask is the capture moment.** "Where should we send your Certificate
   of Calibration?" captures email + confirms phone + records preferred contact
   method — feeding the client record that powers the tailored-retail funnel
   (queued separately in memory).

---

## Sub-project A — Model year at first touch, every channel

`Model Year` already exists on Priority List and Bookings and flows lead → booking →
OTT report (col 6) / certificate / AMSOIL fluids. Today it is captured only when a
config is protocol-ambiguous (book.html, commit 8eea3f3) or when the tune-finder
happens to show its year select. A missing year makes the OTT report guess the
platform-range start year — a real mis-reporting risk. This closes every tap.

### Website tune-finder (`site/find-your-exact-tune.html`)

- The existing `#fYearGroup` exact-year select (currently `display:none` unless the
  config is ambiguous) becomes a **required step for every vehicle selection**,
  populated from the platform's year range. One tap; the `required` attribute is
  already on the select.
- The submitted `modelYear` already threads through `book.js` into
  `"Model Year"` on both Bookings and Priority List writes — no server change.

### AI channels (SMS, Messenger, Instagram, chat transfer)

- The chat agent's transfer tool (`lib/chat-agent.js`) **already requires
  `modelYear`** in its schema. Work here is verification, not construction:
  confirm the collected year lands in the lead's `Model Year` column (not only in
  the vehicle string) across the SMS and Meta DM ingest paths, and fix the write
  if it doesn't. Conversational ask only — a prospect who won't give a year still
  becomes a lead (limited barriers); close-out VIN decode recovers it.

### OTT email adapter (`gmail-lead-poll.js`)

- The parser already extracts vehicle/engine/transmission; it gains year
  extraction into `Model Year` when the email contains one. Best-effort, never
  blocks ingest.

### Walk-in (`installer-walkin.js` + console form)

- Optional `modelYear` field added to the walk-in form and written through.
  **Not** required — never slow an installer mid-event; close-out guarantees it.

### Backstop

- Sub-project C's VIN decode backfills `Model Year` on any booking that reached
  close-out without one, so the OTT report's guess-the-range fallback becomes
  dead code in practice (it stays in place as a safety net).

---

## Sub-project B — Client record at first touch + merge

### B1. Record forms at first touch, universally

Every channel except direct booking already mints a lead (web waitlist, SMS, Meta
DM, OTT email, calls, console intake). The gap: a straight web booking creates only
a Bookings row; the client record appears later, if ever.

- **New rule, enforced server-side in `book.js` at booking creation:** after the
  booking record is created, resolve the client record —
  1. existing lead matched by normalized phone (last-10), then email
     (`normalizePhone`/`normalizeEmail`, same signals as `bookingMatchesForLead`);
  2. else **mint** one from the booking identity (Name/Phone/Email/Vehicle/Model
     Year/City, market-routed Installer, Stage `Booked`) — the exact
     mint-from-booking pattern from the client-notes design.
  Either way the lead is linked to the booking (`Booking` linked field +
  `buildLinkPatch`, Stage → `Booked`, Activity Log line).
- **Fail-open:** client-record resolution must never fail a booking. Errors are
  logged; the booking succeeds; the shipped console matcher surfaces the orphan
  later as a suggestion.
- Walk-in bookings get the same treatment via the shared helper (extracted into
  `lib/leads.js` so `book.js`, `installer-walkin.js`, and
  `installer-client-note.js`'s resolver all use one implementation).

Result: from the first moment TY hears from a person — any channel — exactly one
client record accumulates identity, vehicle, notes, bookings, and threads.

### B2. Merge

**Detection (server, pure helper in `lib/leads.js`):**
`duplicateLeadsFor(lead, leads)` → other lead records sharing a normalized phone
(last-10) or normalized email. Computed in `leads-list.js` alongside the existing
match enrichment; fail-open like the rest. Each lead in the response gains
`duplicates[]` (id, name, channel, stage, createdTime, summary line).

**Console UI (Leads tab, `site/installer.html`):** on any card with `duplicates`,
a **"Possible duplicate"** strip: "Same phone as **Text 619-417-6865** — sms ·
New · created Jul 30" with three actions:

- **[Merge]** — one tap; confirm dialog names both records; on success the
  duplicate card disappears and the surviving card jump-and-flashes (console rule).
- **[Review]** — expands both records' editable fields side-by-side (reusing the
  existing lead edit controls) so the installer can correct either before merging.
- **[📝 Notes]** — opens the survivor's notes section directly (Aaron's ask:
  notes are one tap from the duplicate strip).

**Mechanics (server, new `merge` action in `lead-update.js`):**
`{ id, action: "merge", duplicateId }`

- Ownership like link/convert: installer merges own leads; admin any. Both records
  must be visible to the caller.
- **Survivor** = the record with the earlier `Created Time` (holds the history);
  if the caller's `id` differs from the computed survivor, the server swaps —
  callers never need to know the rule.
- Field fill: survivor's blank fields (`Name`*, Phone, Email, Vehicle, Model Year,
  City, Goals, Modifications, Preferred Contact) fill from the duplicate.
  *Placeholder names (`Text …`/`Caller …`, the adapters' convention) count as
  blank — a real name always beats a placeholder.
- Appends: `Client Notes` and `Activity Log` lines from the duplicate append under
  a stamped divider (`merged in recXXX — sms "Text 619-417-6865"`); duplicate's
  `Channel` recorded in that line so the multi-channel history is legible.
- Links: `Booking` linked-record arrays union; legacy `Converted Booking` text id
  kept if survivor's is blank. Follow-up fields keep the more urgent value
  (earlier `Next Follow-up`, later `Last Contact`).
- Stage: keep the more advanced stage (order: New < Contacted < Following up <
  Booked; `Not now` never overrides an active stage).
- Then **delete the duplicate row**. Nothing is lost — everything was absorbed
  first, and the audit line records what happened.
- Loud failures: `duplicate-not-found`, `not-your-lead`, `store-unavailable`.
  Ordering: the absorb-patch is written and verified **before** the delete, so a
  failed delete leaves a correct survivor plus a still-visible duplicate — the
  strip re-offers, and the retry detects the prior audit line and skips
  re-appending, retrying only the delete.
- Ingest-time dedupe (same phone → same active lead in `lead-ingest`) stays as
  the silent first line of defense; merge handles what slips past it.

---

## Sub-project C — One-flow close-out

One screen in the installer console, ordered so auto-fill does the work and the
installer touches only exceptions. The certificate email ask and the report fields
are the same motion.

### The flow

1. **VIN scan** (existing scanner). `vin-decode.js` (existing NHTSA proxy,
   advisory-only today) gains a **backfill role**: when the booking has no
   `Model Year`, the decoded year pre-fills it (installer-confirmable, and the
   existing vin-guard mismatch warnings still render). Decode stays fail-open —
   NHTSA down means manual entry, never a trapped close-out.
2. **Calibration applied** — the one real choice (existing `CAL_OPTIONS`).
3. **Prefilled trio** — `Tuning Platform` pre-selected from the booking's resolved
   PCM protocol (`lib/pcm-protocol.js` mapping → VFT/HPT/PCM/BB); `Calibration
   Type` defaulted from the calibration choice; `ECU ID` / `Gear Size` auto-filled
   from the existing rules (`lib/ecu-ids.js`, owner gear rule). All editable,
   rarely touched.
4. **Mileage** — the one true manual entry besides the scan.
5. **Certificate panel** — headline: *"Where should we send your Certificate of
   Calibration?"* Captures **Email** (prefilled if known), confirms **Phone**,
   asks **Preferred Contact** (new single-select: SMS / Email / Messenger /
   Instagram / Call). Prompted prominently, **never blocking** — a customer
   without email must not trap completion (cert falls back to installer delivery,
   as today).
6. **Signature + Notes**, then **Complete**.

### The gate (server-enforced, `installer-closeout.js`)

- On `action:"complete"` from a **non-admin** installer, these must be present
  (from the request or already on the booking): `VIN`, `OTT Calibration`
  (already required), `Tuning Platform`, `Calibration Type`, `ECU ID`,
  `Gear Size`, `Mileage`, `Model Year`. Missing → 400 `report-fields-missing`
  with the field list; the console highlights them. Admin (`isAdmin`) bypasses —
  the console shows a "complete anyway" affordance only to Aaron.
- Contact fields (Email / Preferred Contact) are **not** in the gate.
- The console gate is UX; the server check is truth.

### Drafts

- **Save draft** (explicit button + automatic on navigate-away): everything
  entered writes to the booking immediately (they are real fields, tolerant
  writes as today) plus a new `Closeout Draft` checkbox on Bookings. Status stays
  `Booked`; no cert, no report inclusion.
- Jobs tab gains a **Drafts chip** (count badge, like Stale/Waitlist) listing
  bookings with the flag; one tap reopens the close-out prefilled from the stored
  fields, exactly where they left off. Completing (or cancelling the job) clears
  the flag. A draft never loses data and never blocks.

### Client-record propagation

- On complete (and on draft save when contact fields were entered),
  `installer-closeout.js` resolves the linked client record (linked lead →
  phone match → mint; the shared B1 helper) and patches: `Email` (if blank),
  `Preferred Contact`, `Model Year` (if blank). One server-side write path — the
  close-out is the moment the client record becomes retail-funnel-complete.

### Downstream

- OTT monthly report: all 15 columns populated at close-out; commission
  auto-lookup + owner override on the review page unchanged.
- Certificate: dispatches to the customer email at the moment of maximum
  goodwill, exactly as today's `certificate-dispatch` flow.

---

## Schema changes (all via `scripts/airtable/ensure-field.mjs`)

| Field | Table | Type |
|---|---|---|
| `Preferred Contact` | Priority List | single select: SMS / Email / Messenger / Instagram / Call |
| `Closeout Draft` | Bookings | checkbox |

Everything else rides on existing columns. `Preferred Contact` is a new field, so
its options are set at creation via the meta API (the can't-edit-existing-select
quirk in airtable-base-schema-quirks doesn't apply).

## Error handling

- Repo norms hold: **loud named errors on actions** (`merge`, close-out gate),
  **fail-open on enrichment** (duplicate detection, VIN decode, client-record
  resolution at booking time), tolerant writes only for genuinely optional
  columns. Client-record propagation failures at close-out are logged, never
  block completion or cert dispatch.

## Testing (tests first, repo norm)

- **A:** tune-finder static wiring (year group always visible + required once a
  vehicle is chosen); book.js passthrough already covered; gmail-lead-poll year
  extraction unit tests; chat-path Model Year column write verified.
- **B:** heaviest coverage on merge — survivor selection (created-time, swap when
  caller passes newer id), placeholder-name-counts-as-blank fill, note/activity
  append with divider, booking-link union, stage precedence, follow-up field
  precedence, delete-after-verified-absorb, delete-failure retry path, ownership
  scoping, `duplicateLeadsFor` (phone variants, email case, no-contact leads,
  self-exclusion). B1: resolve-or-mint helper (match order, mint fields, market
  routing, fail-open on Airtable error).
- **C:** gate matrix (each missing field 400s for non-admin, admin bypass,
  fields-already-on-booking satisfy), draft flag set/clear, VIN-decode year
  backfill (only when blank), propagation patch shape (email only when blank),
  console static wiring for Drafts chip and cert panel.
- Full suite green → commit → push (repo rule).

## Rollout

1. **A** ships alone: tune-finder + adapters; live smoke = web lead with year
   lands in both tables.
2. **B** ships second: `ensure-field` run (`Preferred Contact`), shared
   resolve-or-mint helper wired into book.js/walk-in, merge action + console
   strip. Live smoke = merge the known Eli-style duplicate pair; verify absorb,
   link union, delete, flash.
3. **C** ships third: `Closeout Draft` field, close-out rebuild, gate, drafts
   chip, propagation. Live smoke = full close-out on a test booking (VIN scan →
   prefills → cert email → complete → cert received), then a deliberate
   half-entered draft resumed and completed.
4. Coordinate with parallel sessions before touching `site/installer.html`
   (standing memory rule: pull context first).

## Out of scope (named so they aren't lost)

- The tailored-retail marketing funnel itself (queued in memory; this spec builds
  its data spine — Preferred Contact + verified email + vehicle + year).
- Auto-merge of any kind, including exact-phone (decision 1).
- Client-facing surfacing of merge/notes (internal only).
- Undo-merge (absorb+delete is final; Review-before-merge is the safety).
- A2P/campaign consent capture at close-out (belongs to the funnel work and its
  opt-in language — deliberately not bolted on here).
