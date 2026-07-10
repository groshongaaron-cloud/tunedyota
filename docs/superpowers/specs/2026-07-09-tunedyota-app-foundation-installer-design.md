# Tuned Yota App — Foundation + Installer (Phase 0+1) Design Spec

**Date:** 2026-07-09
**Status:** Approved for planning (pending spec review)
**Program context:** First sub-project of the native "Tuned Yota" app program (App Store +
Google Play). Later phases — client accounts, certificate viewing, commerce — are separate
spec → plan → build cycles and are **out of scope here**.

## Goal
Ship a native **Tuned Yota** app to both stores that runs the installer console we built,
elevated with native camera VIN scanning, biometric app lock, and push notifications.
Approach = **Capacitor wrap** of the existing web app (chosen over rebuilding native — reuses
100% of what's built, one codebase). The app is designed so client features slot in later
without restructuring.

## 1. Architecture
- **Capacitor project in `app/`** (new dir) beside the existing site. `capacitor.config.ts`:
  appId `com.tunedyota.app`, appName "Tuned Yota", `webDir: "app/www"`.
- **Bundled web + OTA updates.** A small build step (`app/scripts/sync-web.mjs`) assembles
  `app/www` from the existing console assets (`site/installer.html` + `site.css` + favicon/
  manifest + `vendor/zxing.min.js`) — **no fork of the console**; it's copied at build time so
  the web source of truth stays in `site/`. The bundled console still calls the live Netlify
  functions for all data. **Over-the-air updates via Capgo** (`@capgo/capacitor-updater`) push
  web-layer changes to installed apps without a store resubmission; only native-shell changes
  need re-review.
- **One app, growth-ready:** v1 opens directly into the installer console; the shell is
  structured so a future client "home" and installer/client routing can be added later.

## 2. Installer features (v1)
- **The console** (roster / close-out / walk-in / month browser) full-screen, no browser chrome.
- **Native VIN scanning:** `installer.html` detects `window.Capacitor?.isNativePlatform?.()` →
  uses a native barcode plugin (`@capacitor-mlkit/barcode-scanning`, ML Kit) for the VIN scan;
  **falls back to the existing web scanner** (BarcodeDetector/ZXing) when run as a plain website.
  One codebase, both runtimes. `normalizeScannedVin` is reused unchanged.
- **Biometric/passcode app lock:** on launch/resume, require Face ID / Touch ID / device
  passcode (`capacitor-native-biometric` or equivalent) before showing the console; wraps — does
  not replace — the existing installer passcode/token auth.
- **Push notifications:** see §3.

## 3. Push notifications (new)
- **App side:** `@capacitor/push-notifications` registers on login → obtains a device token →
  POSTs it to a new function.
- **`netlify/functions/push-register.js`** — installer-token authed (`resolveInstaller`); upserts
  `{ installer, token, platform }` into a new Airtable **"Push Devices"** table.
- **`netlify/functions/lib/push.js`** — `sendPush(installerKey, { title, body, data }, deps)`:
  looks up that installer's device tokens and sends via **Firebase Cloud Messaging (FCM) HTTP v1**
  (covers Android + iOS-via-APNs in one integration). Auth via a Firebase service-account key in
  a Netlify env secret. Pure/deps-injected so the FCM call + token lookup are mockable in tests.
- **Triggers (additive; email/Slack unchanged):** `event-reminders` — when it builds an
  installer's roster for the day, also `sendPush` "Your {city} roster is ready"; the walk-in /
  booking path — push "New walk-in / booking assigned." Failures are non-blocking (logged).

## 4. Build pipeline & division of labor
- **`codemagic.yaml`** — cloud CI on a Mac runner: `npm ci`, sync `app/www`, `npx cap sync`,
  `cap add ios/android` (as needed), build + sign iOS (.ipa) and Android (.aab), publish to
  TestFlight / Play internal testing. No Mac required on the owner's side.
- **I (Claude) deliver:** the full Capacitor project + config, native-integration code, push
  backend (+ unit tests), OTA config, brand icons/splash generated from the existing SVG mark,
  the Codemagic config, and an **owner runbook** (`docs/app/RUNBOOK.md`).
- **Owner-only (runbook, step-by-step):** create Apple Developer ($99/yr) + Google Play ($25)
  accounts; create a **Firebase project** + upload the **APNs auth key**; connect accounts +
  signing to Codemagic; add the Airtable "Push Devices" table columns (metadata API unusable →
  manual); set Netlify env `FCM_SERVICE_ACCOUNT`; fill store listing metadata; **Submit for
  review**.
- **Honest environment limit:** this repo/agent cannot compile, sign, or submit the app (no
  Mac/Xcode, no Android SDK, no store accounts here). The deliverable is a repo the cloud CI
  turns into real apps, plus the runbook — not a signed binary produced by me.

## 5. Testing
- **Automated (here):** `push-register.js` and `lib/push.js` get `node:test` unit tests
  (auth required; token upsert shape; `sendPush` selects the installer's tokens and posts the
  right FCM payload; no-tokens is a no-op; FCM failure is non-blocking). The console's existing
  suite is unchanged. The `sync-web.mjs` copy step gets a test asserting `app/www` contains the
  console + its assets.
- **Native (owner, on-device):** first successful Codemagic build proves the native config;
  camera scan, Face ID, and push delivery are verified on real Android + iPhone (as with the VIN
  scan).

## 6. Out of scope (later cycles)
Client accounts/login, certificate viewing, commerce/Stripe, any client-facing screens.

## 7. Files (indicative)
- `app/` — Capacitor project: `capacitor.config.ts`, `package.json`, `scripts/sync-web.mjs`,
  `www/` (generated), native integration shims.
- `netlify/functions/push-register.js`, `netlify/functions/lib/push.js` — push backend.
- `tests/push-register.test.js`, `tests/push-send.test.js`, `tests/app-sync-web.test.js`.
- `site/installer.html` — add the native-vs-web scan branch + biometric-lock hook (guarded so
  the plain website is unaffected).
- `codemagic.yaml`, `docs/app/RUNBOOK.md`.
- `netlify/functions/event-reminders.js` + the walk-in/booking path — add `sendPush` triggers.
