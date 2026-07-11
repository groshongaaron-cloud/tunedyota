---
name: ott-vft-calibration-ids
description: "Where OTT VFT + PCM calibration/ECU IDs live (Dropbox), the file/folder-name conventions, the 3rd Gen Tacoma 3.5L VFT map, and how to read PCM ECU IDs from Aaron's job files"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 0741a17e-4afe-4675-bb7c-0ae97cd004a2
---

Source: `C:\Users\grosh\Dropbox\OTT VFT Calibrations\` (owner-authorized, 2026-07-10). One folder per model (4Runner, Camry, CUW, ES350, FJ Cruiser, GX460, GX470, Highlander, Land Cruiser, LS460, LX470, LX570, RAV4, Sequoia, Sienna, Tacoma, Tundra).

**Folder convention:** `<Model> VFT Calibrations` → `<Gen> <Engine> VFT Calibrations` → **`OTT 9.2 Calibration Files`** → `<Year(s)> <CalID> (<Transmission>)`. The **CalID in the folder name is the ECU / Calibration ID** (same format as the OTT report ECU ID column, e.g. `04C22`, `04B06`). Inside each folder: the stock file (`8966<xxx>.vfc`), CUW/AGM subfolders, and the tune `.vfc`s named `OTT<CalID><tier><gear>.vfc` — tier = LM (Light-Mild) / MM / MS (Mild-Spicy) / SS (Spicy-SS) etc.; gear = 390/488/529 → 3.90/4.88/5.29 axle ratios.
Each 3.5L model also has `OTT CE-CARB Files and 9.01 Files` and `TRUE Stock VFT Files` folders — **per owner, for 3rd Gen Tacoma 3.5L use ONLY the `OTT 9.2 Calibration Files`.** A `Mexican Market` subfolder holds non-US IDs — **EXCLUDE Mexican market for now (owner, 2026-07-10); US only.**

**3rd Gen Tacoma 3.5L VFT (OTT 9.2) — CalID / ECU ID by model year (US):**
| Model Year | Auto | Manual |
|---|---|---|
| 2016–2017 | 04B06 | 04B15 |
| 2018 | 04A63 | 04A73 |
| 2019 | 04B34 | 04B43 |
| 2020 | 04B83 | 04B92 |
| 2021–2023 | 04C22 | 04C31 |
(Mexican-market IDs EXCLUDED per owner — US only.)

**Why it matters:** model year (+ transmission) → the OTT calibration ID = the **ECU ID** for the OTT commission report (Policy 0012 column), and it's the cal-ID cross-reference data the Track B calibration reference needs for its pending non-5.7L combos (see [[monthly-ott-calibration-report]] Track B — the 23 pending combos include 3rd Gen Tacoma 3.5L). Only the 3rd Gen Tacoma 3.5L VFT map is coded so far (`lib/ecu-ids.js`); owner is walking through models one at a time. See [[ott-policy-standards]].

## PCM ECU IDs (owner-authorized 2026-07-11)
Source: **Aaron's job folder** `C:\Users\grosh\Dropbox\Overland Tailor 3rd Party Calibrators\Ind. 3rd Party Calibrators\Aaron - Tuned Yota, MN\` — this is a **per-customer WORKING folder** (one folder per job: `Lastname, First - <year> <model> <notes> [<VIN>]`), NOT a clean year→ID table like the VFT folder. You read the ECU ID off the calibration **filenames**:
- **PCM** (`.pcm`, HPTuners): `46D06888_<PCM ECU ID> OTT_<tune>_(<tier>)…pcm`. **`46D06888` is Aaron's HPTuners device serial (constant across ALL his PCM jobs) — NOT the vehicle.** The **PCM ECU ID is the token AFTER the underscore.** Examples found: **30C47100** (2006 Tundra 4.7 Harrop), **30CU60** (2021 Tundra TVS1900), **335D30** (2019 & 2021 4Runner 4.0 Magnuson), **3YWF95** (2013 Tundra). From the June reconciliation data, more 4Runner PCM IDs: **35D70** (2020), **35F51** (2018), **35G30 / 335G3000** (2023); FJ 4.0 = **35C30**; Sequoia 4.7 = **30C65100**; Tundra 5.7 = **OCU80**. PCM IDs are Toyota-part-style (start with `3…`/`30C…`/`335…`), longer than VFT `04xxx`.
- **VFT** (`.vfc`): `<VFT ID> OTT_<tune>_(<tier>)_<gear>GS-<VIN>.vfc` (e.g. `04B82` 2020 Tacoma, `04C31` 2023 Tacoma manual, `89663-35G30` 2024 4Runner — `89663` = Toyota ECU part prefix). `.cuw` = Calibration Update Worksheet; `MAG/MAG90/HAR/TVS1900/1320` in the name = supercharger (Magnuson/Harrop/TVS pulley).
- **No clean PCM year→ID table exists** — PCM ECU ID is per-vehicle; determine it from the vehicle's actual PCM read or Aaron's matching job file. So PCM ECU auto-fill can't be table-driven the way 3rd Gen Tacoma 3.5L VFT is.
