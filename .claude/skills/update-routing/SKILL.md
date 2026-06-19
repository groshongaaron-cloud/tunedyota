---
name: update-routing
description: Use when adding or removing a Tuned Yota installer, or reassigning which installer covers a market/city — keeps the client booking page and the server lead/booking email routing in sync.
---

# Updating Installer / Market Routing

## Overview

Installer identity lives in **two** files and market→installer assignment in **two more**. The server decides who gets the **booking** email; the client decides who gets the **legacy lead** email and which installer card the customer sees. If they disagree, a market's bookings and leads go to **different people** — and an unknown installer key **silently falls back to Aaron**. Keep all four in sync.

## Sources of truth

| File | Role | Shape |
|---|---|---|
| `netlify/functions/lib/routing.js` → `INSTALLERS` | **Server installer registry.** `keyToInstaller()` resolves the key to route **booking** emails. An unknown key **silently falls back to `FALLBACK_KEY` (aaron)**. | `key:{ key, name, email, phone }` |
| `netlify/functions/lib/markets.js` → `MARKETS[].inst` | **Server market→installer.** `getMarket(city).inst` drives **booking** email routing. | `{ city, state, inst }` |
| `site/find-your-exact-tune.html` → `INSTALLERS` | **Client installer card** ("Meet your installer") + needs a photo asset. | `key:{ name, phone, email, region, photo:"images/<name>.jpg", bio }` |
| `site/find-your-exact-tune.html` → `MARKETS[].inst` | **Client market→installer.** Shows the card AND sets the `installer_key` that routes legacy **lead** emails. | `{ city, state, lat, lng, inst, … }` |

Installer **keys** (`aaron` / `noah` / `cody` / …) must be identical across all four.

## Steps

**Add an installer:**
1. `routing.js` `INSTALLERS`: add `<key>: { key: "<key>", name, email, phone }`. **Required** — without it, any market assigned to the key routes bookings to Aaron.
2. `find-your-exact-tune.html` `INSTALLERS`: add `<key>: { name, phone, email, region, photo: "images/<key-or-name>.jpg", bio }`, and drop the photo at `site/images/`.
3. (Optional) `site/team.html` — add the bio card; it also carries `Person` schema for the team.

**Reassign a market:**
4. `markets.js`: set that market's `inst` to the key (server → **booking** email).
5. `find-your-exact-tune.html` `MARKETS`: set the **same** market's `inst` to the **same** key (client → card + **lead** email).

**Then:**
6. `npm test` — `tests/routing.test.js` sanity-checks `keyToInstaller`, but it does **not** verify client/server parity, so a green run does NOT prove the four files agree. Eyeball them.
7. **Deploy:** push to `master`. Verify by booking a slot in that market (or curl the booking flow) and confirming the email reaches the new installer, and that the booking page shows their card.

## The mismatch trap

- **`markets.js` changed but client `MARKETS` not** → bookings go to the new installer, but the page shows the old one and legacy leads still route to the old one.
- **New key used in a `MARKETS` but missing from `routing.js`** → `keyToInstaller` silently falls back to **Aaron**; that market's bookings never reach the intended installer. Always add to `routing.js` first.
- **Photo missing** at `site/images/<name>.jpg` → broken installer card image.

## Quick reference

add installer: `routing.js` + client `INSTALLERS` (+ photo). reassign market: `markets.js` `.inst` **and** client `MARKETS` `.inst` (same key). → `npm test` → push `master` → verify booking email + card.

Related: event scheduling sets a market's `inst` too — see the `schedule-event` skill.
