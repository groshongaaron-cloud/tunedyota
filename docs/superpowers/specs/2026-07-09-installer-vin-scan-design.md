# Installer VIN Barcode Scan — Design Spec

**Date:** 2026-07-09
**Status:** Approved for planning (pending spec review)
**Owner ask:** Let installers capture the VIN by camera instead of hand-typing 17 characters
during close-out on `/installer.html`. Decided against a native app — the console is already
a home-screen PWA and the camera is fully usable from the web.

## Goal
On the close-out card, a **📷 Scan** button reads the vehicle's VIN barcode with the phone
camera and auto-fills the existing 17-character VIN field. Manual typing stays as a fallback.
Nothing is stored (scan-to-fill only); mileage stays typed.

## 1. UX
- In each open close-out card (`rowCard` in `site/installer.html`), add a **📷 Scan** button
  immediately after the `vin_<id>` input.
- Tapping it opens a lightweight full-card camera overlay: a live rear-camera `<video>`, a
  short hint ("Point at the VIN barcode — driver's door jamb or windshield"), and a **Cancel**
  button.
- On a successful decode → fill `vin_<id>` with the normalized VIN, stop the camera, remove the
  overlay. The installer proceeds to Mark complete as normal.
- On a failed/ambiguous read → keep scanning; the installer can Cancel and type. If a decoded
  value isn't a valid 17-char VIN, show an inline "couldn't read it — try again or type it."
- **Graceful degradation:** if `getUserMedia` is unavailable or permission is denied, the Scan
  button is hidden (or removed) so the card falls back to plain typing. No feature regression.

## 2. Technology
- **Primary reader — native `BarcodeDetector`** (Chrome/Android): construct with formats
  `["code_39", "data_matrix"]` (Code 39 is the VIN barcode standard; some newer vehicles use a
  Data Matrix on the door label). Poll frames from the video via `requestAnimationFrame` /
  `detect(videoEl)`.
- **Fallback — vendored ZXing** (iPhones lack `BarcodeDetector`): `@zxing/library` UMD build
  self-hosted at `site/vendor/zxing.min.js` (exposes global `ZXing` with
  `BrowserMultiFormatReader`). **Lazy-loaded**: the `<script>` is injected only when
  `BarcodeDetector` is absent and only the first time Scan is tapped — Android never fetches it.
  Vendored (not CDN) to avoid an external runtime dependency, matching how this repo ships its
  other libs.
- **VIN normalization (pure, shared):** `normalizeScannedVin(raw)` → uppercase, strip anything
  outside the VIN alphabet, return the value only if it matches `^[A-HJ-NPR-Z0-9]{17}$` (17
  chars, excluding I/O/Q), else return `""`. Code-39 start/stop (`*`) are already stripped by
  the decoders. This mirrors the 17-char rule `complete()` already enforces before submit.
- **Camera:** `navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })`;
  the site is HTTPS (required). Stop all tracks on close/cancel to release the camera.

## 3. Scope / YAGNI
- Scan-to-fill only — **no photo stored, no upload endpoint, no odometer OCR**.
- Mileage and all commission fields unchanged.
- One page changes (`site/installer.html`) plus one vendored asset (`site/vendor/zxing.min.js`).
- No new Netlify function, no Airtable change, no new env.

## 4. Testing
- **Unit-testable:** `normalizeScannedVin` is pure. Extract it so it can be exercised without a
  browser (valid VIN passes; lowercase/`*`-wrapped input normalizes; I/O/Q or wrong-length
  input → `""`). Since `installer.html` has no JS test harness today, host this function where a
  `node:test` file can import it — a tiny `netlify/functions/lib/vin.js` (`module.exports =
  { normalizeScannedVin }`) that the page also inlines a copy of, OR keep it inline and add a
  focused `tests/vin.test.js` that requires a small extracted module. **Decision:** create
  `netlify/functions/lib/vin.js` with `normalizeScannedVin`, unit-test it, and inline an
  identical copy in `installer.html` (the page can't `require` node modules). The test guards the
  canonical logic; the inline copy is a 6-line mirror.
- **Browser-verified (no harness):** the camera/scan flow — verified live on one Android and one
  iPhone during the ship step.

## 5. Caveat to verify live
On **iPhone**, `getUserMedia` from a *home-screen-installed* (standalone) PWA works only on
**iOS 16.4+**. Reliable in the Safari browser tab regardless. Confirm on the installers' actual
iPhones in standalone mode during the live check; Android is unaffected. If a specific installer's
iPhone can't grant camera in standalone, the graceful-degradation path (hide button → type) keeps
them working.

## Files
- `site/installer.html` — add Scan button + camera overlay + scan logic + inline
  `normalizeScannedVin` mirror.
- `site/vendor/zxing.min.js` — vendored ZXing UMD build (new; lazy-loaded on iOS only).
- `netlify/functions/lib/vin.js` — new: canonical `normalizeScannedVin`.
- `tests/vin.test.js` — new: unit tests for `normalizeScannedVin`.
