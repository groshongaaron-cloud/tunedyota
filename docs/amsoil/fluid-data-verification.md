# AMSOIL Garage — Fluid Data Verification Checklist

**Status: ALL ENTRIES ARE DRAFT — nothing below is authoritative until verified by an installer or the owner.**

Generated: 2026-07-10
Branch: `amsoil-fluid-data`

---

## How this works

Every generation in `site/amsoil-garage.json` carries `"verified": false`. The live AMSOIL Garage page hides unverified generations from customers — so nothing below is customer-facing until you sign off.

**To verify a generation:**
1. Check each row in the table against the OEM service manual (or a trusted source like ToyotaOwners.com, iATN, or the vehicle's actual service data).
2. Correct any wrong values directly in `site/amsoil-garage.json`.
3. Flip `"verified": true` on that generation object.
4. Run `node --test tests/amsoil-garage-data.test.js` to confirm no integrity errors.
5. Commit and push/deploy.

**Product prices** (marked `"priceVerifiedAt": "DRAFT"`) also need to be confirmed at amsoil.com before each generation goes live. The weekly price-sync agent (see Operations section) will handle ongoing price maintenance once set up.

---

## Platform tables

### Toyota Tacoma

#### 2024+ · 2.4L-T I4

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-0W20-QT — Signature Series 0W-20 | 4.8 qt | 10,000 mi | 7,500 mi | ☐ |
| Engine Oil Filter | EAO-116 — Ea Oil Filter | 1 ea | 10,000 mi | 7,500 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Rear Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 2.0 qt | severe: inspect | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 8.0 qt | severe service | 60,000 mi | ☐ |

#### 2016-2023 · 3.5L V6

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-0W20-QT — Signature Series 0W-20 | 6.4 qt | 10,000 mi | 7,500 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | 1 ea | 10,000 mi | 7,500 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Rear Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 2.0 qt | severe: inspect | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 8.5 qt | severe service | 60,000 mi | ☐ |

#### 2016-2023 · 2.7L I4

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | 6.0 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-116 — Ea Oil Filter | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Rear Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 2.0 qt | severe: inspect | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 8.5 qt | severe service | 60,000 mi | ☐ |

#### 2005-2015 · 4.0L V6

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | 5.5 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 2.0 qt | 30,000 mi | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 8.5 qt | severe service | 60,000 mi | ☐ |

#### 2005-2015 · 2.7L I4

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | 5.5 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-116 — Ea Oil Filter | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 2.0 qt | 30,000 mi | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 8.5 qt | severe service | 60,000 mi | ☐ |

---

### Toyota 4Runner

#### 2025+ · 2.4L-T I4

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-0W20-QT — Signature Series 0W-20 | 4.8 qt | 10,000 mi | 7,500 mi | ☐ |
| Engine Oil Filter | EAO-116 — Ea Oil Filter | 1 ea | 10,000 mi | 7,500 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Rear Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 2.0 qt | severe: inspect | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 8.0 qt | severe service | 60,000 mi | ☐ |

#### 2020-2024 · 4.0L V6

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | 5.5 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Rear Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 2.0 qt | severe: inspect | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 8.5 qt | severe service | 60,000 mi | ☐ |

#### 2010-2019 · 4.0L V6

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | 5.5 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Rear Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 2.0 qt | severe: inspect | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 8.5 qt | severe service | 60,000 mi | ☐ |

#### 2005-2009 · 4.0L V6 / 4.7L V8

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | 5.5 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 2.0 qt | 30,000 mi | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 8.5 qt | severe service | 60,000 mi | ☐ |

**Note:** This generation spans both the 4.0L V6 and 4.7L V8. Oil capacity shown (5.5 qt) is for the 4.0L V6. The 4.7L V8 takes approximately 6.1 qt. If the page will show a single row for this combined generation, the installer should confirm which engine the customer has.

---

### Toyota FJ Cruiser

#### 2010-2014 · 4.0L V6

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | 5.5 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | 2.0 qt | severe: inspect | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 8.5 qt | severe service | 60,000 mi | ☐ |

#### 2007-2009 · 4.0L V6

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | 5.5 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | 2.0 qt | 30,000 mi | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 8.5 qt | severe service | 60,000 mi | ☐ |

#### 2007-2008 · 4.0L V6

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | 5.5 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | 2.0 qt | 30,000 mi | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 8.5 qt | severe service | 60,000 mi | ☐ |

**Note:** The lineup shows three FJ Cruiser generations with overlapping year ranges (2007-2008, 2007-2009, 2010-2014). This mirrors the vehicle-pricing.js lineup exactly. The 2007-2008 and 2007-2009 data is essentially identical — confirm whether two separate rows are intended or if these should be collapsed.

---

### Toyota Tundra

#### 2022+ · 3.4L i-FORCE twin-turbo V6 *(seeded — reviewed 2026-07-09)*

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-0W20-QT — Signature Series 0W-20 | 7.9 qt | 10,000 mi | 7,500 mi | ☐ |
| Engine Oil Filter | EA15K34 — Ea Oil Filter EA15K34 | 1 ea | 10,000 mi | 7,500 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.9 qt | severe: inspect | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | 2.4 qt | severe: inspect | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 11.0 qt | severe service | 60,000 mi | ☐ |

**Note:** This generation does not include a separate transfer case entry (the 2022+ Tundra uses an electronically-controlled transfer case with a wet-clutch system; verify whether it shares ATF or uses a dedicated fluid). Factory interval for the 2022+ diffs shows "severe: inspect" — Toyota's maintenance guide lists no specific mileage replacement interval under normal conditions; the 30,000 mi tuned recommendation is conservative/severe-use guidance.

#### 2007-2021 · 5.7L V8

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | 7.4 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.9 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | 2.8 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 9.8 qt | severe service | 60,000 mi | ☐ |

**Note:** No transfer case entry — the 2007-2021 Tundra has a part-time 4WD transfer case (A750F/A760H/AB60F vary by year). Confirm if transfer case uses ATF (same ATL-QT) or dedicated gear lube and what capacity applies. This is a gap in the current data.

#### 2010-2019 · 4.6L V8

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | 6.4 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.9 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | 2.8 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 9.8 qt | severe service | 60,000 mi | ☐ |

**Note:** Same transfer case gap as the 5.7L V8 generation above.

#### 2000-2009 · 4.7L V8

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | 6.1 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.9 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | 2.8 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 9.8 qt | severe service | 60,000 mi | ☐ |

**Note:** Transfer case gap same as above. 1st-gen Tundra (2000-2006) used the A340E 4-speed; 2007+ used A750F 5-speed. The transmission capacity of 9.8 qt is a rough estimate for the A750F — the A340E is significantly different (~8 qt). VERIFY by subgeneration if possible.

#### 2005-2009 · 4.0L V6

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | 5.5 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.9 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 2.4 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 9.8 qt | severe service | 60,000 mi | ☐ |

**Note:** 1st-gen Tundra V6 uses a smaller rear axle than the V8 — rear diff fluid may be different capacity and may not require 75W-140 (used 75W-90 here). Confirm axle type (Toyota 8.4" vs 8") and whether 75W-140 or 75W-90 is appropriate.

---

### Toyota Sequoia

#### 2008-2022 · 5.7L V8

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | 7.4 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.9 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | 3.4 qt | 30,000 mi | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 9.8 qt | severe service | 60,000 mi | ☐ |

**Note:** Sequoia rear differential is a larger Toyota 9.5" ring gear unit — capacity of 3.4 qt is an estimate. The factory fill is Toyota Differential Gear Oil LT 75W-85 in later years; SEVERE GEAR 75W-140 is a conservative upgrade — confirm acceptability with installer/owner.

#### 2010-2019 · 4.6L V8

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | 6.4 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.9 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | 3.4 qt | 30,000 mi | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 9.8 qt | severe service | 60,000 mi | ☐ |

#### 2001-2009 · 4.7L V8

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | 6.1 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.9 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | 3.4 qt | 30,000 mi | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 9.8 qt | severe service | 60,000 mi | ☐ |

---

### Toyota Land Cruiser

#### 2025+ · 2.4L-T I4

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-0W20-QT — Signature Series 0W-20 | 4.8 qt | 10,000 mi | 7,500 mi | ☐ |
| Engine Oil Filter | EAO-116 — Ea Oil Filter | 1 ea | 10,000 mi | 7,500 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.9 qt | severe: inspect | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | 2.4 qt | severe: inspect | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 8.0 qt | severe service | 60,000 mi | ☐ |

**Note:** 250 Series Land Cruiser — full specs not yet published as of early 2026. All capacity figures are provisional pending service manual data.

#### 2016-2021 · 5.7L V8

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | 7.4 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.9 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | 2.4 qt | 30,000 mi | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 9.8 qt | severe service | 60,000 mi | ☐ |

#### 2008-2015 · 5.7L V8

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | 7.4 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.9 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | 2.4 qt | 30,000 mi | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 9.8 qt | severe service | 60,000 mi | ☐ |

#### 2006-2007 · 4.7L V8

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | 6.1 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.9 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | 2.4 qt | 30,000 mi | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 9.8 qt | severe service | 60,000 mi | ☐ |

---

### Toyota RAV4

#### 2006-2012 · 3.5L V6

FWD/AWD transverse platform. Drivetrain systems limited to engine, filter, and transmission. AWD variants have a rear differential (open, electronically-engaged) — not included here because the lineup does not distinguish AWD vs FWD trim.

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-5W20-QT — Signature Series 5W-20 | 6.4 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 7.4 qt | severe service | 60,000 mi | ☐ |

**Note:** RAV4 V6 oil capacity is approximately 6.4 qt — confirm. Toyota spec'd 5W-20 for this engine in most North American applications. AWD RAV4 adds a rear torque coupling/differential — if this platform is offered with AWD-specific guidance, a rear differential system (SVG-75W90-QT, ~0.5–0.8 qt) should be added.

---

### Toyota Highlander

#### 2017-2019 · 3.5L V6

FWD/AWD transverse platform. Used newer 2GR-FKS (direct + port injection), Toyota spec'd 0W-20.

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-0W20-QT — Signature Series 0W-20 | 6.4 qt | 10,000 mi | 7,500 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | 1 ea | 10,000 mi | 7,500 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 7.4 qt | severe service | 60,000 mi | ☐ |

#### 2008-2016 · 3.5L V6

FWD/AWD transverse platform. Toyota spec'd 5W-20 for 2GR-FE in most North American applications.

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-5W20-QT — Signature Series 5W-20 | 6.4 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 7.4 qt | severe service | 60,000 mi | ☐ |

**Note:** AWD Highlander adds a rear differential/power transfer unit — same caveat as RAV4 above.

---

### Toyota Camry

#### 2018-2024 · 3.5L V6

FWD only (V6 Camry). Toyota spec'd 0W-20 for 2GR-FKS.

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-0W20-QT — Signature Series 0W-20 | 6.4 qt | 10,000 mi | 7,500 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | 1 ea | 10,000 mi | 7,500 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 7.4 qt | severe service | 60,000 mi | ☐ |

#### 2007-2017 · 3.5L V6

FWD only. Toyota spec'd 5W-30 for 2GR-FE in early applications, later revised to 0W-20 in some markets. Used 5W-30 here as conservative.

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | 6.4 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 7.4 qt | severe service | 60,000 mi | ☐ |

**Note:** Camry V6 2007-2017 factory oil spec may be 5W-20 in some years/trim levels. Confirm against the door jamb label or service manual for the specific MY. Tuned interval is listed as 5,000 mi (same as factory) — AMSOIL's extended drain approval requires owner to confirm their specific driving pattern.

---

### Lexus GX

#### 2019+ · 4.6L V8

GX 460 (body-on-frame, 4WD). Toyota spec'd 0W-20 starting with the 2019 facelift.

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-5W20-QT — Signature Series 5W-20 | 6.9 qt | 10,000 mi | 7,500 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | 1 ea | 10,000 mi | 7,500 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | 2.0 qt | severe: inspect | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | severe: inspect | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 9.8 qt | severe service | 60,000 mi | ☐ |

**Note:** Oil viscosity listed as 5W-20 — the 1UR-FE in the GX 460 (2019+) was factory-spec 0W-20 per the revised Toyota recommendation. Confirm whether 0W-20 or 5W-20 is the correct AMSOIL match for this application. The product SKU here (SS-5W20-QT) should be changed to SS-0W20-QT if 0W-20 is confirmed.

#### 2010-2018 · 4.6L V8

GX 460 (same 1UR-FE engine as 2019+ but earlier calibration). Toyota factory spec was 5W-20 in North America.

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-5W20-QT — Signature Series 5W-20 | 6.9 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | 2.0 qt | 30,000 mi | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 9.8 qt | severe service | 60,000 mi | ☐ |

#### 2005-2009 · 4.7L V8

GX 470 (UZJ120 platform, 2UZ-FE engine).

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | 6.1 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | 2.0 qt | 30,000 mi | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 9.8 qt | severe service | 60,000 mi | ☐ |

---

### Lexus RX350

#### 2015-2022 · 3.5L V6

FWD/AWD transverse platform (2GR-FKS or 2GR-FE depending on MY). Toyota spec'd 0W-20 for 2015+ in North America.

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-0W20-QT — Signature Series 0W-20 | 6.4 qt | 10,000 mi | 7,500 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | 1 ea | 10,000 mi | 7,500 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 7.4 qt | severe service | 60,000 mi | ☐ |

#### 2006-2012 · 3.5L V6

FWD/AWD transverse platform (2GR-FE). Toyota spec'd 5W-30 in early years, later revised to 5W-20 in some markets.

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | 6.4 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 7.4 qt | severe service | 60,000 mi | ☐ |

**Note:** AWD RX350 has a rear differential/power transfer — not included (same rationale as RAV4/Highlander). Confirm if AWD coverage is wanted.

---

### Lexus LS460

#### 2007-2017 · 4.6L V8

RWD platform (1UR-FSE engine, D-4S direct injection). No transfer case, no front diff. Rear diff is standard.

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-0W20-QT — Signature Series 0W-20 | 8.5 qt | 10,000 mi | 7,500 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | 1 ea | 10,000 mi | 7,500 mi | ☐ |
| Rear Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.9 qt | severe: inspect | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 9.8 qt | severe service | 60,000 mi | ☐ |

**Note:** LS460 AWD variant exists (2007-2012 LS 460 AWD) — this entry assumes RWD. If AWD coverage is desired, add a front differential and/or transfer case entry. LS460 oil capacity is approximately 8.5 qt — this is a HIGHLY uncertain value; the 1UR-FSE has a larger oil sump than the GX's 1UR-FE. VERIFY against owner's manual. Transmission capacity (9.8 qt) for the AA80E 8-speed is also uncertain.

---

### Lexus LX570

#### 2008-2021 · 5.7L V8

Body-on-frame, 4WD (same 3UR-FE as Tundra/Sequoia 5.7L V8). Uses Toyota 9.5" rear axle.

| System | AMSOIL Product | Capacity | Factory Interval | Proposed Tuned Interval | Verify |
|--------|---------------|----------|-----------------|------------------------|--------|
| Engine Oil | SS-5W30-QT — Signature Series 5W-30 | 7.4 qt | 5,000 mi | 5,000 mi | ☐ |
| Engine Oil Filter | EAO-57 — Ea Oil Filter | 1 ea | 5,000 mi | 5,000 mi | ☐ |
| Front Differential | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.9 qt | 30,000 mi | 30,000 mi | ☐ |
| Rear Differential | SVG-75W140-QT — SEVERE GEAR 75W-140 | 2.4 qt | 30,000 mi | 30,000 mi | ☐ |
| Transfer Case | SVG-75W90-QT — SEVERE GEAR 75W-90 | 1.5 qt | 30,000 mi | 30,000 mi | ☐ |
| Transmission | ATL-QT — Signature Series Multi-Vehicle ATF | 9.8 qt | severe service | 60,000 mi | ☐ |

**Note:** LX570 rear diff capacity listed as 2.4 qt — the 9.5" ring gear axle used in the LX/Sequoia has a larger sump than the 8" axle on Tundra. Cross-check against LX570 service manual; 3.0–3.4 qt may be more accurate.

---

## Notes / Assumptions (prioritized by uncertainty)

The following values are the weakest links in this dataset. Verify these FIRST before enabling any generation.

### Highest priority — verify before enabling

1. **All Ea oil filter SKUs (EAO-116, EAO-57) — product paths and prices are DRAFT.** The SKUs themselves are real AMSOIL part numbers, but the `/p/` URL slugs and retail prices ($12.50) were set to best-effort placeholders and MUST be confirmed at amsoil.com before launch. The filter SKU cross-references to specific Toyota applications also need to be checked (AMSOIL's product guide at amsoil.com/myVehicle can confirm fitment).

2. **SS-5W30-QT and SS-5W20-QT prices and product paths are DRAFT.** Same situation — real product names, placeholder prices and URLs. Confirm current retail at amsoil.com.

3. **Tundra 2007-2021 and 2000-2009 transfer cases are MISSING from the data.** The 2007-2021 Tundra has a part-time 4WD transfer case. Whether it uses ATF (ATL-QT), a dedicated gear lube, or is "no-drain/sealed" needs to be confirmed. Same applies to the 2000-2009 4.7L. This is a structural gap — if the vehicle has a serviceable transfer case, it should be added.

4. **LS460 oil capacity (8.5 qt).** The 1UR-FSE has a larger oil pan than other 1UR variants. The actual capacity may be 8.0–9.5 qt range. CHECK THE OWNER'S MANUAL — this is the single highest-risk capacity figure in the whole dataset.

5. **Sequoia and LX570 rear differential capacity (3.4 qt / 2.4 qt).** The 9.5" ring gear rear axle on these platforms holds more fluid than the Tundra's 8" unit. Both figures are estimates. VERIFY against service manual drain/fill procedure.

6. **4Runner / Tacoma 2024+ and 2025+ transfer case capacity (1.5 qt).** The new GR platform (T24A-FTS engine) uses a different transfer case than the 1GR era. Confirm fluid type (ATF or gear lube) and capacity.

### Medium priority

7. **Tundra 1st-gen (2000-2009) transmission — two different transmissions in range.** 2000-2006 Tundra used A340E 4-speed (≈8 qt). 2007-2009 used A750F 5-speed (≈9.8 qt). The capacity of 9.8 qt in the current data only applies to 2007-2009 trucks. If the garage shows this as a single generation, the capacity listed may be wrong for early trucks.

8. **4Runner 2005-2009 combined V6/V8 generation.** Oil capacity (5.5 qt) is for the 4.0L V6. The 4.7L V8 in this generation takes approximately 6.1 qt. The data cannot represent both simultaneously — installer should confirm engine at close-out.

9. **FJ Cruiser 2007-2008 vs 2007-2009 generation overlap.** The lineup has three FJ Cruiser generations with overlapping years (2007-2008, 2007-2009, 2010-2014). This is mirrored exactly from vehicles.json — but it may represent a data artifact from the pricing config. Confirm whether both early-year rows should exist or be collapsed into one.

10. **Camry 2007-2017 oil viscosity.** Toyota revised the 2GR-FE spec over its long production run. Some model years within 2007-2017 carry a door-jamb label calling for 5W-20, others 5W-30. Used 5W-30 as the conservative choice. Confirm per MY.

11. **RAV4, Highlander, and RX350 AWD rear differential.** All three are FWD/AWD platforms. The current data only includes engine + trans because the lineup doesn't distinguish AWD vs FWD trim. If AWD-specific fluid guidance is wanted, a rear differential system (SVG-75W90-QT, approximately 0.5–0.9 qt) should be added. Decision is owner's.

12. **Lexus GX 460 2019+ oil viscosity.** Listed as SS-5W20-QT but Toyota's revised recommendation for the 2019+ facelift 1UR-FE is 0W-20. If 0W-20 is confirmed, change the SKU to SS-0W20-QT. The 2010-2018 GX 460 is 5W-20 with higher confidence.

### Lower priority (likely correct but confirm anyway)

13. **All 4.0L V6 (1GR-FE) platforms using EAO-57.** This filter was standard for the 1GR-FE across Tacoma/4Runner/FJ/Land Cruiser. Confirm AMSOIL fitment via their catalog for each specific application.
14. **All 2.4L-T I4 (T24A-FTS) platforms using EAO-116.** New platform — confirm the correct Ea filter part number for the GR platform engine.
15. **Transfer case fluid type across all platforms.** The data uses SVG-75W90 (gear lube) for all transfer cases. Some Toyota transfer cases are ATF-filled (e.g., the electric/clutch-based units on newer AWD cars). Confirm on a case-by-case basis. For the traditional part-time 4WD units (older Tacoma, 4Runner, FJ), gear lube is generally correct.

---

## Product catalog — items to verify at amsoil.com

| SKU | Name | Draft Price | Draft Product Path | Status |
|-----|------|------------|-------------------|--------|
| SS-0W20-QT | Signature Series 0W-20 | $16.15 | /p/signature-series-0w-20-synthetic-motor-oil-asm/ | Verified 2026-07-09 |
| EA15K34 | Ea Oil Filter EA15K34 | $18.99 | /p/ea-oil-filters-ea15k34/ | Verified 2026-07-09 |
| SVG-75W90-QT | SEVERE GEAR 75W-90 | $23.60 | /p/severe-gear-synthetic-gear-lube-75w-90/ | Verified 2026-07-09 |
| SVG-75W140-QT | SEVERE GEAR 75W-140 | $25.50 | /p/severe-gear-synthetic-gear-lube-75w-140/ | Verified 2026-07-09 |
| ATL-QT | Signature Series Multi-Vehicle ATF | $19.20 | /p/signature-series-multi-vehicle-synthetic-automatic-transmission-fluid-atl/ | Verified 2026-07-09 |
| SS-5W30-QT | Signature Series 5W-30 | $15.30 | /p/signature-series-5w-30-synthetic-motor-oil-asl/ | DRAFT — verify price + URL |
| SS-5W20-QT | Signature Series 5W-20 | $15.30 | /p/signature-series-5w-20-synthetic-motor-oil-asm/ | DRAFT — verify price + URL |
| EAO-116 | Ea Oil Filter EAO-116 | $12.50 | /p/ea-oil-filters-eao116/ | DRAFT — verify price + URL + fitment |
| EAO-57 | Ea Oil Filter EAO-57 | $12.50 | /p/ea-oil-filters-eao57/ | DRAFT — verify price + URL + fitment |

---

## Operations

### Weekly price-sync agent

The weekly price-sync agent is responsible for keeping `retailPrice` and `salePrice` current in `site/amsoil-garage.json` by scraping the live amsoil.com product pages.

**Architecture decision (owner-confirmed):** amsoil.com is behind Cloudflare anti-bot protection, which blocks headless browser requests from server environments (Netlify functions, cloud agents). The price-sync will therefore run **locally** using a headed or stealth Puppeteer/Playwright instance that has access to a real browser profile. This approach bypasses Cloudflare by using a genuine browser session.

**How to run manually:**
```
node scripts/amsoil/price-sync.mjs
```

**Scheduled run:** A Windows Task Scheduler entry runs the sync weekly. The script is called as:
```
node scripts/amsoil/price-sync.mjs --commit
```
The `--commit` flag causes the script to automatically commit any price changes to the `amsoil-garage` branch (or master, depending on configuration). Slack notification is sent on completion or error via the existing `SLACK_WEBHOOK_URL` environment variable.

**Status:** The price-sync script architecture is defined; the Puppeteer/Playwright implementation is not yet built. This is a planned follow-on task after the fluid data is verified and the garage page is live.

### Signing off a generation

Once an installer or the owner has confirmed a generation's fluid data:

1. Open `site/amsoil-garage.json`
2. Find the generation by make → model → year/engine
3. Change `"verified": false` to `"verified": true`
4. Run `node --test tests/amsoil-garage-data.test.js` (should stay green)
5. Commit to `amsoil-fluid-data` branch and push/merge to master to go live

The garage page filters by `gen.verified === true` before displaying any vehicle data — so unverified generations remain hidden from customers until explicitly signed off.
