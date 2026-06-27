# Tuned Yota — Brand Templates

## Tuned Yota Master Certificate

**`tuned-yota-master-certificate.html` is THE master certificate template.**

This is the canonical, owner-approved certificate design ("Certificate of
Calibration · Calibration Complete" — fox lockup, doc-id header, Calibration
Record readout, embossed fox seal). **All future certificate improvements start
from this file** — do not redesign from scratch or fork the basic
`netlify/functions/lib/certificate.js` output; evolve this master instead.

Merge fields (replace with Airtable Bookings values when generating per-booking):
`{{customer_name}}` · `{{vehicle}}` · `{{calibration}}` · `{{installer}}` ·
`{{installer_region}}` · `{{date}}` · `{{cert_no}}`.

The **OTT Calibration** row is a choosable field: Light / Mild / Medium / Spicy /
SS, or the adjacent combos (Light and Mild, Mild and Medium, Medium and Spicy,
Spicy and SS). It prints as plain text (input chrome is hidden via `@media print`).

> Note: this is the *design master*. The live booking system currently emails the
> simpler `lib/certificate.js` certificate. Wiring this master into
> `certificate-dispatch.js` (data merge + delivery) is a separate, future step.
