# Installer console — login persistence ("enter the passcode once, stay in forever")

**Date:** 2026-08-01 · **Approved by:** Aaron (approach A, Face ID off entirely)

## Problem

Aaron re-enters his 12-char installer passcode roughly every two hours. The saved
passcode (`localStorage.ty_installer_token`) never expires by design, so something is
evicting him. Two mechanisms can do that:

1. **Native biometric dead-end.** On app cold start (OS kills the app after ~1–2 h in
   background), `showApp()` calls `nativeLock()` → `BiometricAuth.authenticate()`
   immediately at page load. If that fails for any reason (plugin not ready yet,
   prompt cancelled, glance missed), `showApp()` returns early and leaves the
   **empty passcode gate** on screen even though the passcode is still saved.
   Re-typing the passcode "works" only because the second `showApp()` gives the
   biometric prompt time to succeed.
2. **Trigger-happy 401 wipe.** Ten call sites react to a single `401` with
   `localStorage.removeItem('ty_installer_token'); location.reload()` — one transient
   server-side auth hiccup logs the installer out and demands the passcode again.

## Goal

Enter the passcode once per device, ever. The gate reappears only when the passcode
is **genuinely rotated** in Netlify (`INSTALLER_TOKENS`), or after an explicit Log out.

## Design

### 1. Remove the biometric lock entirely (owner decision)

Delete `nativeLock()` and its call in `showApp()`. The installed app opens straight
into the console whenever a passcode is saved. The phone's own lock screen is the
security boundary. The `@aparajita/capacitor-biometric-auth` plugin stays in the app
unused (removal can ride along with a future app build — no rebuild required for this
feature, since the fix is pure web-console JS).

### 2. Confirm-before-wipe 401 handling

Replace all inline `401 → wipe → reload` handlers with one shared handler:

- `async function handle401()` — on any 401 from a data call:
  - Re-verify the saved token with **one cheap authenticated GET** (installer-prefs).
  - Second check **401 too** → genuine rotation: record gate reason, clear the token,
    reload. Gate shows *"Your passcode was changed — enter the new one."*
  - Second check succeeds / 5xx / network error → **transient**: keep the token, the
    calling action surfaces its normal "try again" error, session survives.
- Every current 401 call site delegates to the shared handler (single wipe path in
  the whole file).

### 3. "Logged in as …" indicator

Small muted line next to the existing Log out link, from `roster.installer` (the
roster response already returns `installer: key`). Admin view unchanged.

### 4. Gate breadcrumb

When the gate is shown on a device that previously had a token, one muted line says
why: `passcode-changed` (confirmed rotation) or `logged-out` (explicit logout).
Reason stored at wipe time (`localStorage.ty_gate_reason`, cleared on successful
unlock). Future recurrences become diagnosable instead of guesswork.

## Not changing

Passcode scheme / `INSTALLER_TOKENS` / admin roles / offline queue / the
password-manager-friendly gate form (stays as the safety net for new devices).

## Testing

Regex-style static tests in the existing pattern (`tests/installer-password-manager.test.js`):

- `showApp()` no longer references `nativeLock`/`BiometricAuth`.
- Exactly **one** `removeItem('ty_installer_token')` wipe path outside the explicit
  logout handler; no inline `401 → removeItem` remains at call sites.
- Gate breadcrumb element + "passcode was changed" copy present.
- "Logged in as" render present.

Full `npm test` must stay green. Deploy via the normal ship flow; live-verify
`/installer` 200 and an authenticated roster call.

## Delivery note

Browser console gets this on deploy. The installed native app bundles its own copy
(`app/www`, assembled by `app/scripts/sync-web.mjs`) — run sync-web so the next app
build picks it up; until that build, the browser console has the fix.
