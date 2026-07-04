---
name: tuned-yota-master-certificate
description: "The \"Tuned Yota Master Certificate\" — canonical certificate design; all future certificate work starts from this template"
metadata: 
  node_type: memory
  type: project
  originSessionId: 600aba31-9063-4c1b-ad58-6765170e353e
---

The owner designated `docs/brand/tuned-yota-master-certificate.html` as the
**Tuned Yota Master Certificate** (2026-06-27, committed dfc0c85). It is the
canonical certificate design: "Certificate of Calibration · Calibration Complete"
— fox lockup, doc-id header (CERT NO / ISSUED / STATUS), attestation, a
"Calibration Record" readout, embossed fox seal, fine print. Merge fields:
`{{customer_name}} {{vehicle}} {{calibration}} {{installer}} {{installer_region}}
{{date}} {{cert_no}}`.

**Why:** the owner wants one authoritative certificate template, not ad-hoc
redesigns.

**How to apply:** treat this file as the master template for ALL future
certificate improvements — evolve THIS file; never redesign from scratch or fork
the simpler `netlify/functions/lib/certificate.js` output. (The repo origin was a
file the owner authored at `C:\Users\grosh\Downloads\tunedyota-calibration-certificate_12.html`;
the repo copy under `docs/brand/` is now the source of truth.)

The **OTT Calibration** row is a choosable field with values Light / Mild /
Medium / Spicy / SS, plus adjacent combos (Light and Mild, Mild and Medium,
Medium and Spicy, Spicy and SS). See `docs/brand/README.md`.

WIRED LIVE 2026-06-27 (commit 1d0a5ed): `netlify/functions/lib/certificate.js`
now renders THIS master design, merged from booking data, and
`certificate-dispatch.js` emails it when a booking is marked Completed. Merge:
customer/vehicle, OTT Calibration (LOCKED as static non-editable text from the
Airtable field once dispatched — commit db398ca; the choosable dropdown lives
only in the docs/brand master), installer + `region` (added to
routing.js INSTALLERS), long-formatted calibration date, ISSUED date, and a
deterministic serial `TY-{year}-{record-id suffix}` via `certSerial()`. The old
VIN/Year/Type/Engine/Mileage fill-in fields were dropped. Delivery unchanged
(to installer, cc owner, installer forwards). HOLD GATE (commit 03c4ebc): a
Completed booking with an EMPTY OTT Calibration is NOT emailed — it's skipped and
left unmarked so a later daily run auto-sends it once the calibration is set; the
owner gets one Slack nudge per run listing held names. So a blank-calibration cert
never reaches a customer. The `docs/brand/` HTML remains the
canonical design source to evolve. Related: [[event-reminders-automation]].

**Fields added back since the "dropped" note above (that line is now stale):**
- **VIN** — re-added to the cert readout 2026-07-02 (captured at installer close-out).
- **Model year** — added 2026-07-04 (master @ ff05111). NOT a separate field: the exact
  year is **appended to the Vehicle line** as `vehicle (YYYY)` (e.g. "2016-2023 Toyota
  Tacoma 3.5L V6 (2019)"), in both the Vehicle readout value and the email subject; the
  parens are omitted when the year is blank (single-year vehicles). Owner chose append-to-
  vehicle over a separate labeled field. Rendered by `buildCertificate({..., modelYear})`;
  `certificate-dispatch.js` passes `f["Model Year"]` from the booking record; canonical
  `docs/brand` sample updated to match. Part of the [[booking-model-year-capture]] pipeline.
