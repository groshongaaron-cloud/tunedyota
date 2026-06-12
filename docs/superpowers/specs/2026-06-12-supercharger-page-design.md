# Supercharger Page (Design)

**Date:** 2026-06-12
**Status:** Approved, built & verified
**New file:** `site/supercharger.html` → canonical `/supercharger`

## Goal
A single comprehensive page that sells, explains, and supports Magnuson supercharger
builds — reflecting that Tuned Yota is the Midwest's Magnuson dealer, drop-ships kits
across the lower 48, and installs + calibrates in-house.

## Verified facts used (no fabrication)
- Authorized **Magnuson** retailer, installer, servicer, calibrator; also supports
  **Harrop** and **ProCharger**. (from faq.html)
- **Midwest Magnuson dealer; drop-ships kits anywhere in the lower 48; listed on
  Magnuson's official dealer locator.** (from the owner)
- Emissions fully intact, **5-gas verified, EPA-compliant**, no CEL defeat, no
  off-road-only tuning. (site-wide compliance positioning)
- Calibrations built by a **licensed VFTuner PRO Tuner**; "no one has calibrated more
  forced-induction Toyota applications than OTT." (find-your-exact-tune.html)
- Supercharger-capable platforms + calibration starting prices pulled from the
  `VEHICLES` data: Tacoma 3.5/4.0 V6 (from $550), 4Runner 4.0 V6 (from $650), FJ
  Cruiser 4.0 V6 (from $600), Tundra/Sequoia/Land Cruiser 5.7 V8 (from $850).

## Sections (sell → explain → support)
1. Hero — dealer positioning + CTAs (Find Your Exact Tune, Call/Text).
2. Trust line — link to Magnuson dealer locator.
3. Why add a supercharger — benefit bullets.
4. How a supercharged build works — 4 steps (choose system, get hardware/drop-ship,
   calibrate, verify).
5. Supercharger-ready vehicles — table linking to each vehicle page; hardware quoted
   separately from calibration.
6. Ownership & Support — qualitative (per decision): fuel/octane, break-in,
   maintenance, warranty, ongoing support → call/text for build-specific specifics.
   No invented numbers.
7. Supercharger FAQ — 7 Q&As with `FAQPage` schema.
8. CTA band + explore links + disclaimer.

## Decisions
- **Audience:** all three (sell + explain + support) on one page.
- **Support specifics:** qualitative + CTA, no fabricated numbers.
- **Nav:** "Supercharger" added to the top nav **and** footer across all 19 pages.
- Vehicle pages' "Supercharger Support" link repointed from the tune finder to
  `/supercharger` (6 pages).

## Schema & SEO
`Service` + `FAQPage` + `BreadcrumbList`, plus title / meta description / canonical —
matching the vehicle-page pattern.

## Verification (done)
- 3/3 JSON-LD blocks parse; site-wide 48/48 parse clean.
- No duplicate chrome links; 0 broken internal links; Supercharger present on 19/19 pages.

## Out of scope / follow-ups
- Real ownership specs (octane, service intervals, warranty terms) to replace the
  qualitative section when provided.
- Optional supercharger hardware pricing table.
