# Completed-booking correction + certificate reissue — design

**Date:** 2026-08-02 · **Trigger:** Alexander Ellis booked a 2023 Tacoma as the
2.7L I4; the truck is the 3.5L V6. The installer needs (1) to correct the
vehicle/engine on a booking at ANY point in the process — including after
completion — and (2) to regenerate and re-send an accurate Certificate of
Calibration when one already went out with wrong data.

## What already exists (and shapes the design)

- The console's ✏️ Edit panel (name/vehicle free text → `installer-reschedule`)
  works on OPEN bookings only; the server returns `not-open` once a booking is
  Completed or Cancelled.
- Certificates are **rendered on demand from the booking record** everywhere
  they're viewed — the installer repository (`installer-certificate.js` →
  `lib/cert-render.js`) and the client portal (`client-certs.js`). Correcting
  the record therefore automatically corrects every future view. Only the
  **emailed HTML attachment** is a stale snapshot.
- The cert serial (`certSerial`) is deterministic from record id + calibration
  year — a reissue keeps the same certificate number, so the corrected copy
  cleanly supersedes the old one.
- One-off resends already happened via `scripts/resend-certs-backfill.js`
  (same build path as dispatch) — precedent for re-sending as a first-class op.

## Design

### 1. Corrections on Completed bookings (`installer-reschedule.js`)

Completed bookings accept **identity corrections only**: `name`, `vehicle`,
and (new) `modelYear`. Date, time, and address stay locked after completion —
`Event Date`/`Calibration Date` feed the monthly OTT commission report buckets
and must not move. Cancelled bookings stay fully locked. Ownership rules
unchanged (owner or admin).

`modelYear` (4-digit, `(19|20)\d{2}`) is accepted on open bookings too — the
exact year prints on the certificate, so it must be correctable wherever the
vehicle is.

### 2. Certificate reissue (`installer-closeout.js`, new action `resend-cert`)

- Gate: `confirmed: true` (same pattern as no-show), booking must be
  `Completed` with an `OTT Calibration` on record. Owner or admin.
- Renders from the **current** record (post-correction) with the same
  tracked-AMSOIL + referral-link treatment as the original send.
- Optional `customerEmail` — persisted to `Email` and used as the recipient.
  This also un-dead-ends `installer-fallback` certs (no email at closeout):
  add the email, resend, done. No email → installer fallback, as today.
- When the cert had already been sent, the subject gains `(corrected)` and the
  body says it supersedes the earlier copy (same certificate number).
- Writes (tolerant): `Certificate Sent: true`, `Certificate Issued` = today,
  `Certificate Recipient`, `Cert Delivery`, `Certificate Reissued` = ISO
  timestamp (audit trail; tolerant if the column doesn't exist yet).
- A send failure returns `send-failed` and writes nothing — the record keeps
  its previous delivery metadata.

### 3. Console UI (completed card in `site/installer.html`)

- **✏️ Correct details** panel: name / vehicle / model year → reschedule
  endpoint. Success toast states the stored certificate view is already
  corrected and points at Resend to email the new copy.
- **✉ Resend certificate** panel: customer-email input (prefilled) + Send now
  button → `resend-cert`. The old `installer-fallback` note now points here
  instead of "re-open the booking".

## Out of scope

- Structured engine pick-list / year→engine derivation — separate planned
  project (see `engine-picklist-plan` memory); vehicle stays free text here.
- Moving Event/Calibration dates on completed bookings (OTT report integrity).
- Auto-resend on edit — sending stays an explicit installer action.

## Data fix

Alexander Ellis's booking: Vehicle `2016-2023 Toyota Tacoma 2.7L I4` →
`2016-2023 Toyota Tacoma 3.5L V6` (goals suffix preserved), via Airtable API.
Note the 3.5L platform prices higher than the 2.7L ($500 vs $450 base tune) —
pricing/collection is Aaron's call, outside this change.
