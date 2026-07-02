# Installer Calibration Reference (Track B)

> **Confidential.** Toyota/OTT calibration IDs + TSBs. Keep this repo private.

An installer-facing lookup that resolves a specific vehicle configuration to its
**calibration ID (Old → New), governing TSB, and CUW flag** — used at events to pin
the correct calibration file for a booking or an OTT commission submission.

## Surfaces
| Surface | What |
|---------|------|
| `/calibration.html` | Installer console page (noindex, passcode-gated by the installer token). Filter by Model → Year → optional Drivetrain / Fuel Tank / Tow / Flex; shows New Cal ID, Old Cal ID(s), TSB, and a **CUW required** flag. Linked from `/installer.html`. |
| `netlify/functions/calibration-reference.js` | Gated endpoint (installer token) that serves the rows + coverage report to the page. |
| `netlify/functions/lib/calibration-reference.js` | Pure lookup + `coverage()`. |
| `netlify/functions/lib/calibration-reference-5.7L.json` | The data (code copy). Human source: [`master-reference-5.7L.json`](master-reference-5.7L.json). |

## Coverage — known vs. pending

**Known today (built):** the **5.7L** cross-reference — Tundra, Sequoia, Land Cruiser
(with **LX570** cal IDs folded into the Land Cruiser rows). Years 2007–2021.

**Pending owner-provided data:** every other platform/engine the business tunes (per the
OTT price sheet) — e.g. 2.4L-T, 2.7L, 3.5L, 4.0L, 4.6L, 4.7L across Tacoma / 4Runner / FJ
Cruiser / GX / Highlander / Camry / RAV4 / RX350 / LS460 / LC250, etc. The live
`coverage()` computes the exact pending list and the page shows it under **"Coverage"**.
When the owner provides a platform's cross-reference, add it and the coverage list shrinks.

## Extending it (when new platform data arrives)
1. Add the platform's rows to a JSON in the same shape as `master-reference-5.7L.json`
   (`tabs[<name>].rows[]` with Year, Model, Trans, Engine Size, Drivetrain, Fuel Tank, Tow,
   Flex, Old Cal ID, New Cal ID, TSB, and CUW where applicable).
2. Merge into `netlify/functions/lib/calibration-reference-5.7L.json` (or add a new file and
   `require` it in `lib/calibration-reference.js`), keep `docs/ott/` in sync.
3. `coverage()` recomputes automatically; the page picks it up. Add a lookup test for a
   known row of the new platform.

## Lookup key (from the source sheet)
A vehicle resolves on **Year + Model + Drivetrain + Fuel Tank + Tow + Flex** (+ Key/Push where
present). `Old Cal ID` is a `/`-separated set of factory variants; `New Cal ID` is the value to
apply; carry the matching `TSB`. Many rows share a `New Cal ID` across years (superseded cals).
