# OTT Program — reference data & docs

> **Confidential.** OTT's pricing, commission, and calibration data. Keep this repo private.

Source of truth for the OTT commission-submission program (Track A) and the installer
calibration reference (Track B).

## Files

| File | What | Used by |
|------|------|---------|
| [`../../netlify/functions/lib/ott-commission-template.json`](../../netlify/functions/lib/ott-commission-template.json) | April 2026 OTT price sheet — every sellable config's **OTT Commission** (what Tuned Yota owes OTT), COBB excluded. Also `reporting_enums` (OTT submission picklists). | `lib/ott-commission.js` |
| [`master-reference-5.7L.json`](master-reference-5.7L.json) | 5.7L calibration-ID cross-reference (Tundra 130 rows + Sequoia/Land Cruiser/LX 46 rows) → resolves New Cal ID / TSB / CUW per vehicle config. | Track B installer reference |

## OTT commission submission format (Track A)

The submission is a **14-column** workbook, columns in this exact order (from the Master OTT
Tracker's "Blank- Formatted" / "Definitions" sheets):

`Date of Submission · Date Calibration Applied · OTT Retailer · Customer First Last Name · VIN ·
Vehicle Year · Vehicle Type · Engine Size · ECU ID · Gear Size · Mileage · Tuning Platform ·
Calibration Type · Commission`

- **Vehicle Type** (12): 4Runner, Camry, FJ Cruiser, GX460, GX470, Highlander, Land Cruiser, LX470, LX570, Sequoia, Tacoma, Tundra
- **Tuning Platform**: VFT, HPT, PCM, BB
- **Calibration Type**: Basic, MAF, Basic + MAF, Supercharger, CARB Update, 9.2 New, 9.2 Update, TCM Update, Custom, K-Line
- **Commission**: `$` owed to OTT — resolved by `lib/ott-commission.js` from the price sheet; the owner confirms each on the monthly draft.

**OTT-facing → Tuned Yota customer brand rules do NOT apply here** (Stage 0–3 / MAF terminology is
mandatory as OTT writes it). COBB / Accessport rows are excluded (Tuned Yota doesn't sell COBB).

## Data capture (installer close-out)

Derived from the booking's vehicle text: Vehicle Type, Vehicle Year, Engine Size.
Installer-entered at close-out (Airtable Bookings, not on the customer certificate):
**Tuning Platform, Calibration Type, ECU ID, Gear Size, Mileage** (+ VIN, already captured).
