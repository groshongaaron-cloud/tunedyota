# Installer console — switchable theme layouts (Night Shift · Field Day · Heritage Garage)

**Date:** 2026-07-17 · **Source design:** `design/installer-console.html` (static mockup, three
complete visual themes + bottom-sheet switcher, demo data)

## What ships

The mockup's three themes become switchable skins on the LIVE console (`site/installer.html`),
bound to real roster data. One functional implementation (close-outs, VIN scan, offline queue,
leads, walk-ins, share links are untouched); three visual layers on top of it.

Each theme = `body[data-theme="…"]` + CSS variables + a theme-specific **dashboard summary**
rendered above the feed:

- **night** (Night Shift): dark mission-control. Next-event hero (city, date, open/booked
  counts), needs-close-out alert card, 3 KPI tiles (done · open · est. payout this month),
  lifetime strip.
- **field** (Field Day): light agenda. Date + greeting head, month progress meter
  (done vs booked — no invented "goal"), duo tiles (est. this month / lifetime).
- **heritage** (Heritage Garage): brand classic. Big est.-payout figure, lifetime tally row,
  needs-close-out "ledger" card with OPEN stamp. Default theme — it is the closest evolution
  of the console's existing warm palette, so installers who never pick see a polish, not a
  redesign.

All numbers come from data the console already loads: `visibleBookings()`, `buildEvents()`,
`commissionTally()`. Mockup-only fictions (monthly goal of 24, "cal files staged", "AMSOIL
stocked", "#2 on the crew", lead-conversion %) are **dropped, not faked**.

A bottom action bar (shared markup, themed per skin) gives the mockups' thumb-reach actions:
🔍 focus search · ＋ open the any-day walk-in form · 🔗 open the share-link widget.

## Switcher + persistence

- 🎨 button in the console header opens the mockup's bottom sheet (veil + 3 options + toast).
- Choice applies instantly, saves to `localStorage` (`ty_theme`) for zero-flash boot, and
  POSTs to a new function so it follows the installer across devices (server value wins on
  next load).
- **`netlify/functions/installer-prefs.js`** — `x-installer-token` authed (same
  `resolveInstaller` fail-closed flow as roster). GET → `{status:"ok", theme}`;
  POST `{theme}` → validates against the theme whitelist, upserts `{Installer, Theme}` into
  Airtable table **"Installer Prefs"** (`AIRTABLE_INSTALLER_PREFS_TABLE` override), deduped by
  `{Installer}` — mirror of the push-subscribe upsert pattern. Fail-soft: a missing table or
  Airtable outage never breaks the console; the theme still applies locally.

## Owner setup (one-time)

Airtable base needs a table **Installer Prefs** with fields `Installer` (single line text) and
`Theme` (single line text). Until it exists the endpoint returns `store-unavailable` and the
console silently falls back to per-device persistence.

## Tests

- `tests/installer-prefs.test.js` — node:test on the pure `processGetPrefs`/`processSetPrefs`
  (whitelist, upsert-no-duplicate, formula-escape, fail-soft).
- `tests/installer-theme.test.mjs` — Playwright (skips without a browser): switcher applies
  `data-theme`, POSTs the choice, server pref wins on boot, themed summary renders real
  roster numbers.
