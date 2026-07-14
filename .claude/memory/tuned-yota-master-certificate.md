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

**DESIGN UPDATE 2026-07-10 (master @ dd8b9c8, screenshot-verified):** (1) **Title** dropped "Complete" — now a uniform "Certificate of Calibration" (thin steel "Certificate of" + bold ink "Calibration") + an ember brand rule (`.title-rule`) beneath; the old `.eyebrow` "Certificate of" kicker was removed. (2) Attest text + header brand-sub now say **"Overland Tailor Tuning"** (was "Overland Tailor Tune"). (3) **Installer row = NAME ONLY** (no cities/region); `installerRegion` param still accepted but not displayed. (4) **Model year now REPLACES the platform range** in the Vehicle line (formatVehicle → "2021 Toyota Tacoma 2.7L I4"), NOT appended as "(YYYY)" — the append note below is STALE (changed 2026-07-10 @ a8ab5d0; also drops the "what are you after?" goals). ⚠ **FOLLOW-UP (deferred by owner 2026-07-10):** add a **QR code** to the vehicle-specific AMSOIL page (`/amsoil-<make>-<model>.html`, per-vehicle pages exist for all 13 platforms) so the client sees products tailored to their model/year — to be done in a later revision. Both `certificate.js` + `docs/brand/tuned-yota-master-certificate.html` kept in sync.

**CERTIFICATE v2 SHIPPED LIVE 2026-07-13 (master @ ebc9cb2, merge c795a07; subagent-driven on worktree `certificate-v2`, 485 tests green, independently reviewed).** The cert is now a **two-page document**: page 1 unchanged; **page 2 = "AMSOIL Maintenance Reference"** for the exact vehicle — per-vehicle fluids table (System · AMSOIL product · **official stock number** e.g. ASMQT/SVLQT/ATLQT/EA15K09, shown as "Stock No." under the description in AMSOIL red · capacity · tuned-vs-factory interval) + an order **QR** (real, from a vendored MIT Nayuki encoder `netlify/functions/lib/qr.js`) that deep-links to the pre-filtered garage `tunedyota.com/amsoil-garage?make=&model=&year=`. This **RESOLVES the deferred QR follow-up** noted above (owner chose the pre-filtered TY garage page over amsoil.com direct). Fluids come from `netlify/functions/lib/amsoil-fluids.js` (`resolveFluids(vehicle, modelYear)` → catalog lookup); page 2 degrades to a compact QR-only version for unsupported vehicles (never fabricates rows). **Official AMSOIL logo** used unaltered on a white chip per the AMSOIL Brand Style Guide (`site/images/amsoil/amsoil-logo.png`, processed from the dealer-kit source in gitignored `assets-source/Amsoil/`; brand colors PMS 485 `#ed1c24` / PMS 286 `#005baa`). **DELIVERY CHANGED: cert now emails STRAIGHT TO THE CUSTOMER** (was: to installer, cc owner, installer forwards) — customer email captured at walk-in + close-out; **installer-fallback** when no email (flagged in the console); **no more inbox cc's** — instead a **searchable certificate repository**: `netlify/functions/installer-certificate.js` (auth-gated, ownership-checked) re-renders any completed cert on demand, surfaced as "View / download certificate" on the console's Completed rows. Backstop `certificate-dispatch.js` aligned (tolerant metadata write so idempotency survives if columns lag). Both `certificate.js` + `docs/brand/tuned-yota-master-certificate.html` carry page 2. See [[amsoil-garage-program]], [[certificate-v2-dashboard-program]]. **OWNER SETUP DONE 2026-07-13:** the 3 Airtable Bookings columns (`Certificate Issued`, `Certificate Recipient`, `Cert Delivery`) were added + write-test CONFIRMED (exact names accepted); stock numbers accepted as-is. Garage `?year=` prefill + landing gate fixed/relaxed 2026-07-13 (@ 4e3598a). **Sub-project A fully closed out** — see [[certificate-v2-dashboard-program]].

**Fields added back since the "dropped" note above (that line is now stale):**
- **VIN** — re-added to the cert readout 2026-07-02 (captured at installer close-out).
- **Model year** — added 2026-07-04 (master @ ff05111). NOT a separate field: the exact
  year is **appended to the Vehicle line** as `vehicle (YYYY)` (e.g. "2016-2023 Toyota
  Tacoma 3.5L V6 (2019)"), in both the Vehicle readout value and the email subject; the
  parens are omitted when the year is blank (single-year vehicles). Owner chose append-to-
  vehicle over a separate labeled field. Rendered by `buildCertificate({..., modelYear})`;
  `certificate-dispatch.js` passes `f["Model Year"]` from the booking record; canonical
  `docs/brand` sample updated to match. Part of the [[booking-model-year-capture]] pipeline.
