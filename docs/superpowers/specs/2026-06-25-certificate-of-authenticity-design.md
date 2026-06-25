# Certificate of Authenticity — Design

**Date:** 2026-06-25
**Status:** Approved (owner sign-off 2026-06-25)
**Scope:** Build-unit 2 of 2 (reporting bundle was build-unit 1).

## Goal

When a client is closed (booking marked `Completed`), automatically email the
**installer** a branded, editable **Certificate of Authenticity** pre-filled with
the booking data. The installer fills the post-calibration fields the booking
form never captured (VIN, Vehicle Year, Vehicle Type, Engine Size, Mileage, and
Date Applied if unset), then prints/saves to PDF and forwards it to the customer.

Low-tech by design: no web form, no data capture back into the system. The
certificate is an **editable HTML file** (the project keeps its zero-dependency
footprint — no PDF library).

## Flow

1. Owner marks a booking `Status = Completed` in Airtable (closed-loop status,
   shared with the reporting bundle's `Calibration Date`).
2. A **daily scheduled function** finds bookings where `Status = Completed` AND
   `Certificate Sent` is unchecked.
3. For each, it builds the certificate HTML, resolves the installer's email via
   `routing.keyToInstaller(Installer)`, and emails the cert (attached
   `certificate.html`) to the installer, CC the owner.
4. On success it ticks `Certificate Sent = true`. On failure it Slack-alerts and
   leaves the row unchecked so it retries the next day.

## Architecture

| File | Responsibility |
|---|---|
| `netlify/functions/lib/certificate.js` *(new, pure)* | `buildCertificate({ name, retailer, vehicle, calibrationDate })` → `{ subject, html }`. Branded certificate HTML: pre-filled Customer / OTT Retailer / Date Applied + booked-vehicle reference line; **`contenteditable` blanks** for VIN, Vehicle Year, Vehicle Type, Engine Size, Mileage. Print-friendly CSS. No I/O. |
| `netlify/functions/certificate-dispatch.js` *(new, scheduled daily)* | Query → build → email (installer, CC owner) → mark sent / alert on failure. |
| `netlify.toml` | daily schedule for `certificate-dispatch`. |
| `netlify/functions/lib/airtable.js` | uses `listRecords` (filterByFormula) + **`updateRecord`** (re-added identically on this branch). |
| `netlify/functions/lib/alert.js` | `notifyOwner` (re-added identically on this branch). |
| reuses unchanged | `resend.sendEmail`, `routing.keyToInstaller`, `airtable.cfg`. |

## Certificate content

Branded as **Tuned Yota — Certificate of Authenticity** (reuse the brand palette
from `templates.js`: `#3A2E26`, `#5B4B42`, `#7c8472`). Fields, in order:

| Field | Source |
|---|---|
| Date Calibration Applied | pre-filled from `Calibration Date`; editable (blank if unset) |
| OTT Retailer | pre-filled = installer name |
| Customer First Last Name | pre-filled = booking `Name` |
| VIN | blank (installer) |
| Vehicle Year | blank (installer) |
| Vehicle Type | blank (installer) |
| Engine Size | blank (installer) |
| Mileage | blank (installer) |

Plus a small "Booked as: `<Vehicle>`" reference line (the coarse vehicle string
from the funnel) to help the installer fill Year/Type/Engine accurately.

Blanks are `contenteditable="true"` spans with a visible underline so the
installer can click-and-type in a browser, then `Print → Save as PDF`. Print CSS
hides editing affordances and renders a clean certificate.

## Dispatch function

```
query: listRecords(Bookings, filterByFormula =
  AND({Status}="Completed", NOT({Certificate Sent})))
for each booking row:
  inst = keyToInstaller(row.fields.Installer)
  { subject, html } = buildCertificate({
     name: row.fields.Name, retailer: inst.name,
     vehicle: row.fields.Vehicle, calibrationDate: row.fields["Calibration Date"] })
  try:
    sendEmail(from FROM, to inst.email, cc OWNER (unless inst is owner),
              subject, text=<short instructions>,
              attachments=[{ filename:"certificate.html", content: base64(html) }])
    updateRecord(Bookings, row.id, { "Certificate Sent": true })
  catch e:
    notifyOwner(Slack, "⚠️ Certificate email FAILED — <name> · <installer> · <reason>")
    // leave Certificate Sent unchecked → retried next run
```

Email body (text): a short note — "Attached is the Certificate of Authenticity
for `<Customer>`. Open `certificate.html` in your browser, fill in VIN, Year,
Type, Engine Size, and Mileage, then Print → Save as PDF and send it to the
customer." FROM = `events@send.tunedyota.events`; CC = `info@tunedyota.com`
unless the installer already is owner.

## Failure behavior & DNS dependency

- Email rides the same Resend `send.tunedyota.events` domain. Until verified,
  sends throw → row stays unchecked → re-attempted on the next daily run, with a
  Slack heads-up. No certificate is lost while DNS settles.
- Every side effect (`updateRecord`, `notifyOwner`) is try/caught so one bad row
  never aborts the batch.

## Config / prerequisites

- **Airtable:** add a `Certificate Sent` checkbox column to **Bookings** (only
  new field). Relies on the closed-loop `Status`/`Calibration Date` from the
  reporting bundle.
- **Netlify env:** `SLACK_WEBHOOK_URL`, `RESEND_API_KEY`, `AIRTABLE_TOKEN`/
  `AIRTABLE_BASE_ID` (all already in flight).

## Testing (TDD, node:test)

- `tests/certificate.test.js` — `buildCertificate` pre-fills Customer / OTT
  Retailer / Date; emits `contenteditable` blanks for VIN/Year/Type/Engine/
  Mileage; subject names the customer; HTML-escapes inputs; blank `calibrationDate`
  renders an empty editable date.
- `tests/certificate-dispatch.test.js` — injected deps (fake list, spy send,
  spy update, spy notify): Completed+unsent → emails installer (CC owner) with a
  `certificate.html` attachment and marks `Certificate Sent`; already-sent rows
  skipped (filter formula); email failure → Slack alert AND row left unmarked;
  installer-is-owner → no CC.

## Out of scope

- No data capture of the installer-entered fields (VIN/mileage do not return to
  Airtable/reports) — deliberate per the chosen low-tech path.
- No customer-direct send (installer forwards) and no PDF library.
- No re-issue/versioning of certificates beyond the one-time send.
